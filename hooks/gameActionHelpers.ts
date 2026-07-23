import { Character, Message } from '../types';
import { mcpServer } from '../services/mcpService';
import { getAllFeats } from '../services/featsService';
import { getClassDef, getSubclassDef, getMod, getProficiencyBonus } from '../services/classEngine';
import { SPELLS_BY_ID } from '../utils/spells';
/**
 * Function signature for triggering a dice roll animation/overlay in the UI.
 * @param data - The roll data including character name, roll type, result, modifier, and outcome details.
 */
export type DiceRollFn = (data: { characterName: string; skillName?: string; rollType?: string; label?: string; rollResult: number; modifier: number; skillRank?: number; sides?: number; difficulty?: number; success?: boolean; xpGained?: number; isCritical?: boolean; isFumble?: boolean }) => Promise<void>;
/** Strips markdown bold (**) and bracketed annotations from a string for TTS. */
export const cleanSpeak = (t: string) => t.replace(/\*\*/g, '').replace(/\[.*?\]/g, '').trim();
/** Returns true if the narration text is too short, generic, or trivial to use as-is. */
export function isLazyNarration(text: string): boolean {
    if (!text) return true;
    const t = text.trim();
    if (t.length < 50 || /^The adventure continues[\s.!?,]*$/i.test(t) || /^(Done|OK|Continuing|Yes|No|Maybe|Sure|Understood|Continue)[\s.!?,]*$/i.test(t) || /^[\s.!?,]+$/.test(t) || /^(You continue|You persist|You carry on|You press on)[\s.!?,]*$/i.test(t)) return true;
    return false;
}
/** Builds a deterministic fallback narration from the last few tool results when the LLM-generated narration is lazy. */
export function buildDeterministicNarration(toolSummary: { toolName: string; message: string }[]): string {
    const ct = ['roll_dice', 'player_attack', 'inflict_damage', 'next_turn'];
    const st: Record<string, string> = { start_combat: 'Combat begins.', end_combat: 'Combat ends.' };
    const moves = toolSummary.map(t => st[t.toolName] ?? (ct.includes(t.toolName) ? t.message : null)).filter((m): m is string => !!m && m.length > 5);
    return moves.length > 0 ? moves.slice(-3).join(' ') : 'The scene unfolds.';
}
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
/** Extracts the last 10 tool messages into a summary of tool name and truncated message. */
export function buildToolSummary(toolMessages: Message[]) {
    return toolMessages.filter(m => m.text.startsWith('[System:')).slice(-10).map(m => ({
        toolName: m.text.match(/\[System:(\w+)\]/)?.[1] || 'tool', message: m.text.replace(/\[System:\w+\]\s*/, '').slice(0, 400),
    }));
}
/** Builds a full context string for the LLM including character state, party, combat, world, quests, and lore. */
export function buildContextString(myCharacterId: string | null): string {
    let ac = "Unknown Player (No Character Selected)", af = '', acf = '', ar = '', as = '';
    if (myCharacterId) {
        const mc = mcpServer.getTarget(myCharacterId);
        if (mc) {
            ac = JSON.stringify({ ...mc, progression: mcpServer.getCharacterProgression(myCharacterId) });
            const cd = getClassDef(mc.class), sd = mc.subclassId ? getSubclassDef(mc.class, mc.subclassId) : undefined;
            const feats = [...(cd?.features || []), ...(sd?.features || [])].filter(f => f.level <= mc.level);
            if (feats.length > 0) acf = `ACTIVE CLASS FEATURES [${feats.map(f => `${f.name} (L${f.level}): ${f.description}`).join(' | ')}]`;
            const res = (mc.resources || []).filter(r => r.max > 0);
            if (res.length > 0) ar = `ACTIVE RESOURCES [${res.map(r => `${r.name}: ${r.current}/${r.max} (resets on ${r.resetOn} rest)`).join(' | ')}]`;
            if (cd?.spellcasting) {
                const sl = (mc.resources || []).filter(r => r.id.startsWith('spell-slot-'));
                const ss = sl.length > 0 ? `Slots: ${sl.map(s => `L${s.id.slice(-1)}=${s.current}/${s.max}`).join(', ')}` : '';
                const pm = cd.spellcasting.prepMode;
                const ids = pm === 'prepared' ? (mc.preparedSpells || []) : (mc.knownSpells || []);
                const sp = ids.map(id => { const s = SPELLS_BY_ID[id]; if (!s) return id; const p = [`${s.name} (L${s.level}`]; if (s.damage) p.push(`${s.damage.dice} ${s.damage.type}`); if (s.healing) p.push('heal'); if (s.attackRoll) p.push('attack roll'); if (s.save) p.push(`${s.save.stat} save`); if (s.aoe) p.push(`${s.aoe.size}ft ${s.aoe.shape}`); if (s.requiresConcentration) p.push('conc'); if (s.castingTime === 'reaction') p.push('reaction'); if (s.castingTime === 'bonus') p.push('bonus'); if (s.shortDescription) p.push(s.shortDescription); return p.join(', ') + ')'; });
                const st2 = sp.length > 0 ? `Spells (${pm}): ${sp.join(' | ')}` : '';
                const conc = mc.concentrationSpellId ? SPELLS_BY_ID[mc.concentrationSpellId] : undefined;
                const cs = conc ? `Concentrating: ${conc.name}` : '';
                as = [ss, st2, cs].filter(Boolean).join(' | ');
                if (as) as = `SPELLS [${as}]`;
            }
            const allF = getAllFeats(mc);
            if (allF.length > 0) af = `ACTIVE FEATS [${allF.map(f => `${f.name}: ${f.mechanicalEffect}`).join(' | ')}]`;
        }
    }
    const pc = JSON.stringify(mcpServer.getFullState().party);
    const wd = JSON.stringify(mcpServer.getResource('campaign://world/current_location'));
    const td = JSON.stringify(mcpServer.getResource('campaign://world/time'));
    const qd = JSON.stringify(mcpServer.getResource('campaign://journal/quests'));
    const ld = JSON.stringify(mcpServer.getResource('campaign://journal/lore'));
    const cdt = JSON.stringify(mcpServer.getFullState().combat);
    return `YOU ARE NARRATING FOR ACTIVE PLAYER: ${ac}.${[acf, ar, as, af].filter(Boolean).map(s => `\n\n${s}`).join('')} \n\nFULL PARTY STATE: ${pc}. \n\nCombat State: ${cdt}. \n\nWorld: ${wd}. Active Quests: ${qd}. Lore: ${ld}\n\nTime: ${td}`;
}
function parseDamageRollDetails(details?: string): { sides: number; count: number; results: number[] } | null {
  if (!details) return null;
  const regex = /(\d+)d(\d+)\s*\[(.+?)\]/g;
  let match;
  let sides = 20;
  let count = 0;
  const results: number[] = [];

  while ((match = regex.exec(details)) !== null) {
    sides = parseInt(match[2], 10);
    const rolls = match[3].split('+').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
    count += rolls.length;
    results.push(...rolls);
  }

  if (results.length === 0) return null;
  return { sides, count, results };
}

/** Dispatches dice roll animations for the UI based on tool execution results (roll_dice, player_attack, check_skill, etc.). */
export async function dispatchToolRolls(toolName: string, args: Record<string, unknown>, toolResult: { success: boolean; data: Record<string, unknown> }, onTriggerDiceRoll: DiceRollFn | undefined, currentState: ReturnType<typeof mcpServer.getFullState>, myCharacterId: string | null) {
    if (!onTriggerDiceRoll || !toolResult.success || !toolResult.data) return;
    const d = toolResult.data;
    if (toolName === 'roll_dice') {
        const ac = currentState.party.find(c => c.id === myCharacterId || c.id === currentState.party[0]?.id);
        const wn = ac ? getWeaponInfo(ac).weaponName : 'Weapon';
        await onTriggerDiceRoll({ characterName: d.character || ac?.name || 'Character', rollType: d.sides === 20 ? 'attack' : d.sides >= 4 ? 'damage' : 'check', label: d.target_name ? `${wn} vs ${d.target_name}` : wn, rollResult: d.results?.reduce((a: number, b: number) => a + b, 0) || 0, modifier: d.modifier || 0, sides: d.sides || 20, difficulty: d.target_ac, success: d.success, isCritical: d.isCritical, isFumble: d.isFumble, count: d.count || d.results?.length || 1, results: d.results || [] });
    } else if (toolName === 'player_attack') {
        const attackerName = d.attacker as string | undefined
          || currentState.party.find(c => c.id === myCharacterId || c.id === currentState.party[0]?.id)?.name
          || 'Player';
        const targetName = (d.enemy as string | undefined) || (d.target as string | undefined) || (d.targetName as string | undefined) || 'Enemy';
        const rollNum = (d.roll as number | undefined) || 0;
        const attackRollNum = (d.attackRoll as number | undefined) || 0;
        const targetAc = (d.targetAc as number | undefined) || 0;
        setTimeout(() => onTriggerDiceRoll({ characterName: attackerName, rollType: 'attack', label: `${attackerName}'s Attack vs ${targetName}`, rollResult: rollNum, modifier: attackRollNum - rollNum, sides: 20, difficulty: targetAc, success: d.isHit as boolean | undefined, isCritical: d.isCritical as boolean | undefined, isFumble: d.isFumble as boolean | undefined }), 0);
    } else if (toolName === 'check_skill') {
        await onTriggerDiceRoll({ characterName: d.character || 'Character', skillName: args.skill_name as string, rollResult: d.roll, modifier: d.modifier, skillRank: d.skillRank, difficulty: d.difficulty, success: d.success, xpGained: d.xpGained });
    } else if (toolName === 'make_save') {
        await onTriggerDiceRoll({ characterName: d.character, rollType: 'save', label: `${d.stat} Save`, rollResult: d.roll, modifier: d.modifier, difficulty: d.dc, success: d.success, sides: 20, isCritical: d.nat20, isFumble: d.nat1 });
    } else if (toolName === 'roll_death_save') {
        await onTriggerDiceRoll({ characterName: 'Unknown', rollType: 'save', label: 'Death Save', rollResult: d.roll, modifier: 0, sides: 20, success: d.roll >= 10 });
    } else if (toolName === 'cast_spell') {
        if (d.attackRoll) await onTriggerDiceRoll({ characterName: d.casterName || 'Unknown', rollType: 'attack', label: 'Spell Attack', rollResult: d.attackRoll.d20, modifier: d.attackRoll.total - d.attackRoll.d20, difficulty: d.saveRoll?.dc, success: d.attackRoll.total >= (d.saveRoll?.dc || 0), sides: 20, isCritical: d.attackRoll.isCrit, isFumble: d.attackRoll.isFumble });
        if (d.damage?.total > 0) {
            const lbl = d.perBeam?.length > 1 ? (d.perBeam as Array<{ isHit: boolean; damage: number }>).map((b: { isHit: boolean; damage: number }, i: number) => `Ray ${i+1}: ${b.isHit ? `${b.damage} dmg` : 'miss'}`).join(', ') : 'Spell Damage';
            const parsed = parseDamageRollDetails(d.damageRollDetails);
            const sides = parsed ? parsed.sides : 20;
            const rollResult = parsed ? parsed.results.reduce((a, b) => a + b, 0) : d.damage.total;
            const modifier = d.damage.total - rollResult;
            setTimeout(() => onTriggerDiceRoll({ characterName: d.casterName || 'Unknown', rollType: 'damage', label: lbl, rollResult, modifier, sides, success: true, count: parsed ? parsed.count : 1, results: parsed ? parsed.results : [d.damage.total] }), 3400);
        }
    } else if (toolName === 'use_resource') {
        if (d.healed) await onTriggerDiceRoll({ characterName: 'Unknown', rollType: 'damage', label: 'Second Wind', rollResult: d.healed, modifier: 0, sides: 10, success: true });
    } else if (toolName === 'inflict_damage') {
        if (d.concentrationSave) setTimeout(() => onTriggerDiceRoll({ characterName: d.character || 'Character', rollType: 'save', label: 'CON Save (Concentration)', rollResult: d.concentrationSave.d20Roll, modifier: d.concentrationSave.modifier, sides: 20, difficulty: d.concentrationSave.dc, success: d.concentrationSave.success }), 0);
    } else if (toolName === 'start_combat') {
        for (const e of (d.combat as Record<string, unknown>).initiative.filter((e: { type: string }) => e.type === 'player')) await onTriggerDiceRoll({ characterName: e.name, rollType: 'initiative', label: 'Initiative', rollResult: e.rawRoll, modifier: e.modifier, difficulty: undefined, success: true, sides: 20, isCritical: e.rawRoll === 20, isFumble: e.rawRoll === 1 });
    }
}

