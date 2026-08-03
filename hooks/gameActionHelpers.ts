import { Character } from '../types';
import { mcpServer } from '../services/mcpService';
import { getAllFeats } from '../services/featsService';
import { getClassDef, getSubclassDef, getMod, getProficiencyBonus } from '../services/classEngine';
import { SPELLS_BY_ID } from '../utils/spells';
import { getAlignmentName, getBackgroundName } from '../utils/backgrounds';
import { INVOCATIONS_BY_ID } from '../data/invocations';

/**
 * Returns a shallow copy of a character with the private `notes`/`gmNotes` fields
 * removed, so they are never serialized into LLM context (issue 10 privacy).
 * JSON.stringify omits `undefined` values, so setting them to undefined strips them.
 */
function withoutPrivateNotes(c: Character): Character {
    return { ...c, notes: undefined, gmNotes: undefined };
}

/** Strips markdown bold (**) and bracketed annotations from a string for TTS. */
export const cleanSpeak = (t: string) => t.replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
/** Extracts equipped weapon details, ability modifiers, and proficiency bonus for a character. */
export function getWeaponInfo(c: Character) {
    const eq = c.inventory.find(i => i.type === 'weapon' && i.equipped);
    const wn = eq?.name || 'Unarmed Strike';
    const sM = getMod(c.stats.str || 10), dM = getMod(c.stats.dex || 10);
    let mod = sM, sides = 4, count = 1;
    if (eq) {
        const p = eq.stats?.properties || [], fi = p.some((s: string) => s.toLowerCase().includes('finesse')), ra = p.some((s: string) => s.toLowerCase().includes('range')) || eq.name.toLowerCase().includes('bow');
        mod = ra ? dM : fi ? Math.max(sM, dM) : sM;
        const dm = eq.stats?.damage?.match(/(\d+)d(\d+)/);
        if (dm) { count = parseInt(dm[1], 10); sides = parseInt(dm[2], 10); }
    }
    return { equippedWeapon: eq, weaponName: wn, strMod: sM, dexMod: dM, weaponMod: mod, weaponSides: sides, weaponCount: count, profBonus: getProficiencyBonus(c as unknown as Character) };
}
/**
 * Builds the enriched per-character annotation block (ACTIVE CLASS FEATURES,
 * ACTIVE RESOURCES, SPELLS, ACTIVE FEATS) for a single character. Extracted from
 * buildContextString so the batch path can enrich EVERY party member, not just the
 * locally-active one. Returns an empty string when the character has nothing to
 * annotate (matching the solo path's filter(Boolean) behavior).
 */
export function buildCharacterEnrichment(mc: Character): string {
    if (!mc) return '';
    const cd = getClassDef(mc.class), sd = mc.subclassId ? getSubclassDef(mc.class, mc.subclassId) : undefined;
    const parts: string[] = [];
    const feats = [...(cd?.features || []), ...(sd?.features || [])].filter(f => f.level <= mc.level);
    if (feats.length > 0) parts.push(`ACTIVE CLASS FEATURES [${feats.map(f => `${f.name} (L${f.level}): ${f.description}`).join(' | ')}]`);
    const res = (mc.resources || []).filter(r => r.max > 0);
    if (res.length > 0) parts.push(`ACTIVE RESOURCES [${res.map(r => `${r.name}: ${r.current}/${r.max} (resets on ${r.resetOn} rest)`).join(' | ')}]`);
    if (cd?.spellcasting) {
        const sl = (mc.resources || []).filter(r => r.id.startsWith('spell-slot-'));
        const ss = sl.length > 0 ? `Slots: ${sl.map(s => `L${s.id.slice(-1)}=${s.current}/${s.max}`).join(', ')}` : '';
        const pm = cd.spellcasting.prepMode;
        const ids = pm === 'prepared' ? (mc.preparedSpells || []) : (mc.knownSpells || []);
        const sp = ids.map(id => { const s = SPELLS_BY_ID[id]; if (!s) return id; const p = [`${s.name} (L${s.level}`]; if (s.damage) p.push(`${s.damage.dice} ${s.damage.type}`); if (s.healing) p.push('heal'); if (s.attackRoll) p.push('attack roll'); if (s.save) p.push(`${s.save.stat} save`); if (s.aoe) p.push(`${s.aoe.size}ft ${s.aoe.shape}`); if (s.requiresConcentration) p.push('conc'); if (s.castingTime === 'reaction') p.push('reaction'); if (s.castingTime === 'bonus') p.push('bonus'); if (s.shortDescription) p.push(s.shortDescription); return p.join(', ') + ')'; });
        const st2 = sp.length > 0 ? `Spells (${pm}): ${sp.join(' | ')}` : '';
        const conc = mc.concentrationSpellId ? SPELLS_BY_ID[mc.concentrationSpellId] : undefined;
        const cs = conc ? `Concentrating: ${conc.name}` : '';
        const as = [ss, st2, cs].filter(Boolean).join(' | ');
        if (as) parts.push(`SPELLS [${as}]`);
    }
    const allF = getAllFeats(mc);
    if (allF.length > 0) parts.push(`ACTIVE FEATS [${allF.map(f => `${f.name}: ${f.mechanicalEffect}`).join(' | ')}]`);
    // Fighting Style
    if (mc.fightingStyle) {
        const styleName = mc.fightingStyle.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        parts.push(`FIGHTING STYLE [${styleName}]`);
    }
    // Eldritch Invocations
    const invocations = mc.invocations || [];
    if (invocations.length > 0) {
        const invNames = invocations.map(id => INVOCATIONS_BY_ID[id]?.name ?? id);
        parts.push(`ELDRITCH INVOCATIONS [${invNames.join(' | ')}]`);
    }
    // Subrace Traits
    if (mc.subraceId) {
        const subraceName = mc.subraceId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        parts.push(`SUBRACE [${subraceName}]`);
    }
    // PERSONA block — surfaces the SRD 5.1 background/alignment/trait fields as a
    // single first-class labeled block instead of dense JSON ids/arrays. Gated on
    // at least one non-empty field so existing characters with no persona add zero
    // tokens. All persona fields are public (never stripped by withoutPrivateNotes).
    const personaLines: string[] = [];
    const alignName = getAlignmentName(mc.alignment);
    const bgName = getBackgroundName(mc.background);
    const headerBits: string[] = [];
    if (alignName) headerBits.push(`Alignment: ${alignName}`);
    if (bgName) headerBits.push(`Background: ${bgName}`);
    if (headerBits.length) personaLines.push(headerBits.join(' | '));
    const traits = (mc.personalityTraits || []).filter(t => t && t.trim());
    const idealList = (mc.ideals || []).filter(t => t && t.trim());
    const bondList = (mc.bonds || []).filter(t => t && t.trim());
    const flawList = (mc.flaws || []).filter(t => t && t.trim());
    if (traits.length) personaLines.push(`Personality: ${traits.map(t => `"${t}"`).join(' | ')}`);
    if (idealList.length) personaLines.push(`Ideals: ${idealList.map(t => `"${t}"`).join(' | ')}`);
    if (bondList.length) personaLines.push(`Bonds: ${bondList.map(t => `"${t}"`).join(' | ')}`);
    if (flawList.length) personaLines.push(`Flaws: ${flawList.map(t => `"${t}"`).join(' | ')}`);
    if (mc.backstory && mc.backstory.trim()) personaLines.push(`Backstory: ${mc.backstory.trim()}`);
    if (personaLines.length) parts.push(`PERSONA [${personaLines.join('; ')}]`);
    return parts.map(s => `\n\n${s}`).join('');
}

/** Builds a full context string for the LLM including character state, party, combat, world, quests, and lore. */
export function buildContextString(myCharacterId: string | null): string {
    let ac = "Unknown Player (No Character Selected)";
    let activeEnrichment = '';
    if (myCharacterId) {
        const mc = mcpServer.getTarget(myCharacterId);
        if (mc) {
            ac = JSON.stringify({ ...withoutPrivateNotes(mc), progression: mcpServer.getCharacterProgression(myCharacterId) });
            activeEnrichment = buildCharacterEnrichment(mc);
        }
    }
    const pc = JSON.stringify(mcpServer.getFullState().party.map(withoutPrivateNotes));
    const wd = JSON.stringify(mcpServer.getResource('campaign://world/current_location'));
    const td = JSON.stringify(mcpServer.getResource('campaign://world/time'));
    const qd = JSON.stringify(mcpServer.getResource('campaign://journal/quests'));
    const ld = JSON.stringify(mcpServer.getResource('campaign://journal/lore'));
    const cdt = JSON.stringify(mcpServer.getFullState().combat);
    return `YOU ARE NARRATING FOR ACTIVE PLAYER: ${ac}.${activeEnrichment} \n\nFULL PARTY STATE: ${pc}. \n\nCombat State: ${cdt}. \n\nWorld: ${wd}. Active Quests: ${qd}. Lore: ${ld}\n\nTime: ${td}`;
}

/**
 * Builds a context string for a collaborative (batch) turn. Unlike the solo
 * buildContextString which enriches only the locally-active character, this
 * enriches EVERY party member's class features / resources / spells / feats so
 * the LLM can correctly attribute spells and resources to the right character in
 * multiplayer. Includes the same world/time/quest/lore/combat blocks as solo.
 */
export function buildBatchContextString(): string {
    const fullState = mcpServer.getFullState();
    const memberBlocks = fullState.party.map(mc => {
        const enriched = buildCharacterEnrichment(mc);
        return `CHARACTER ${mc.name} (id: ${mc.id}): ${JSON.stringify(withoutPrivateNotes(mc))}.${enriched}`;
    }).join('\n\n');
    const pc = JSON.stringify(fullState.party.map(withoutPrivateNotes));
    const wd = JSON.stringify(mcpServer.getResource('campaign://world/current_location'));
    const td = JSON.stringify(mcpServer.getResource('campaign://world/time'));
    const qd = JSON.stringify(mcpServer.getResource('campaign://journal/quests'));
    const ld = JSON.stringify(mcpServer.getResource('campaign://journal/lore'));
    const cdt = JSON.stringify(fullState.combat);
    return `YOU ARE NARRATING FOR A FULL PARTY. Process ALL actions in the user message. \n\n${memberBlocks}\n\nFULL PARTY STATE: ${pc}. \n\nCombat State: ${cdt}. \n\nWorld: ${wd}. Active Quests: ${qd}. Lore: ${ld}\n\nTime: ${td}`;
}



