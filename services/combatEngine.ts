import { Character, Enemy, EnemyAttack, InitiativeEntry, CombatState } from '../types';
import { cryptoRoll } from '../utils/random';
import { lookupMonster } from '../utils/monsters';
import { getConditionEffects, isUnconscious, isIncapacitated, removeCondition, tickConditions, rollSaveAgainstCondition, getExhaustionPenalty } from './conditionEngine';
import { calculateAc, getMod } from './classEngine';
import { getAlertInitiativeBonus, getResilientSaveBonus, getShieldMasterSaveBonus } from './featsService';
function ensureDeathSaves(c: Character) { if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0, isStable: false }; }

export function addEnemyToCombat(args: {
  name: string; ac?: number; hp?: number; attacks?: EnemyAttack[];
  cr?: number; xp?: number; size?: string; type?: string;
  damageResistances?: string[]; damageImmunities?: string[]; damageVulnerabilities?: string[];
}, combatState: CombatState): { enemy: Enemy; sourceInfo: string } {
  const clean = args.name.trim();
  const t = lookupMonster(clean);
  const enemy: Enemy = {
    id: `enemy-${crypto.randomUUID()}`, name: clean,
    ac: args.ac ?? t?.ac ?? 10,
    hp: { current: args.hp ?? t?.hp?.max ?? 1, max: args.hp ?? t?.hp?.max ?? 1 },
    attacks: args.attacks ?? t?.attacks ?? [{ name: 'Strike', toHit: 2, damageDice: '1d4', damageType: 'bludgeoning' }],
    cr: args.cr ?? t?.cr ?? 0, xp: args.xp ?? t?.xp ?? 10,
    size: args.size ?? t?.size ?? 'Medium', type: args.type ?? t?.type ?? 'humanoid',
    stats: t?.stats,
    isDead: false,
    damageResistances: args.damageResistances ?? t?.damageResistances,
    damageImmunities: args.damageImmunities ?? t?.damageImmunities,
    damageVulnerabilities: args.damageVulnerabilities ?? t?.damageVulnerabilities,
  };
  const sourceInfo = t ? ` (auto-filled from SRD: ${t.name})` : ' (custom)';
  combatState.enemies.push(enemy);
  if (combatState.isActive) {
    const roll = cryptoRoll(20);
    const mod = enemy.stats ? getMod(enemy.stats.dex) : 0;
    const curId = combatState.initiative[combatState.turnIndex]?.id;
    combatState.initiative.push({ id: enemy.id, name: enemy.name, initiative: roll + mod, type: 'enemy', isDead: false, hasActedThisTurn: false });
    combatState.initiative.sort((a, b) => b.initiative - a.initiative);
    const idx = combatState.initiative.findIndex(e => e.id === curId);
    if (idx >= 0) combatState.turnIndex = idx;
  }
  return { enemy, sourceInfo };
}

export function initializeCombat(party: Character[], enemies: Enemy[]): { combatState: CombatState; initiativeOrder: InitiativeEntry[] } {
  const init: InitiativeEntry[] = [];
  for (const ch of party) {
    if (ch.deathSaves?.isStable) continue;
    const r = cryptoRoll(20); const m = getMod(ch.stats.dex) + getAlertInitiativeBonus(ch);
    init.push({ id: ch.id, name: ch.name, initiative: r + m, type: 'player', isDead: ch.hp.current <= 0 && (ch.deathSaves?.failures ?? 0) >= 3, hasActedThisTurn: false, rawRoll: r, modifier: m });
  }
  for (const e of enemies) {
    if (e.isDead) continue;
    const r = cryptoRoll(20); const m = e.stats ? getMod(e.stats.dex) : 0;
    init.push({ id: e.id, name: e.name, initiative: r + m, type: 'enemy', isDead: false, hasActedThisTurn: false, rawRoll: r, modifier: m });
  }
  init.sort((a, b) => b.initiative - a.initiative);
  return { combatState: { isActive: true, round: 1, turnIndex: 0, initiative: init, enemies }, initiativeOrder: init };
}

export function advanceToNextTurn(cs: CombatState, party: Character[], enemies: Enemy[]): {
  nextEntry: InitiativeEntry | null; roundChanged: boolean; saveMessages: string[]; expiryMessages: string[];
} {
  const cur = cs.initiative[cs.turnIndex];
  const saveMsgs: string[] = []; const expiryMsgs: string[] = [];
  if (cur) {
    cur.hasActedThisTurn = true;
    const c = cur.type === 'player' ? party.find(p => p.id === cur.id) : enemies.find(e => e.id === cur.id);
    if (c?.conditions && c.conditions.length > 0) {
      const rm: Array<{ id: string; source: string }> = [];
      for (const cond of [...c.conditions]) {
        if (cond.saveEnd && cond.saveDC) {
          const res = rollSaveAgainstCondition(c, cond, cond.saveDC);
          saveMsgs.push(`**${c.name}** rolled ${res.total} (${res.roll} + modifier) vs DC ${cond.saveDC} ${cond.saveEnd.toUpperCase()} save — ${res.succeeded ? '**passed!** ' + cond.id + ' ends.' : 'failed.'}`);
          if (res.succeeded) rm.push({ id: cond.id, source: cond.source });
        }
      }
      for (const { id, source } of rm) removeCondition(c, id, source);
    }
  }
  let nextIdx = -1; const total = cs.initiative.length; let idx = cs.turnIndex; let checked = 0;
  while (checked < total) {
    idx = (idx + 1) % total; checked++;
    const e = cs.initiative[idx];
    if (!e.isDead && !e.hasActedThisTurn) {
      const skip = e.type === 'player' ? party.find(p => p.id === e.id) : enemies.find(en => en.id === e.id);
      if (skip && (isIncapacitated(skip) || isUnconscious(skip))) { e.hasActedThisTurn = true; continue; }
      nextIdx = idx; break;
    }
  }
  let roundChanged = false;
  if (nextIdx === -1) {
    roundChanged = true; cs.round++;
    for (const e of cs.initiative) e.hasActedThisTurn = false;
    for (const e of cs.initiative) {
      if (e.isDead) continue;
      const c = e.type === 'player' ? party.find(p => p.id === e.id) : enemies.find(en => en.id === e.id);
      if (c) for (const cid of tickConditions(c)) expiryMsgs.push(`**${c.name}**'s ${cid} condition wore off.`);
    }
    cs.turnIndex = 0; nextIdx = 0;
  } else { cs.turnIndex = nextIdx; }
  return { nextEntry: cs.initiative[nextIdx] ?? null, roundChanged, saveMessages: saveMsgs, expiryMessages: expiryMsgs };
}

export function selectBestTarget(party: Character[]): Character | undefined {
  const alive = party.filter(c => c.hp.current > 0 && !(c.deathSaves?.isStable));
  if (!alive.length) return undefined;
  return alive.reduce((b, c) => (c.hp.current / c.hp.max) < (b.hp.current / b.hp.max) ? c : b);
}

export function resolveEnemySingleAttack(enemy: Enemy, atkIdx: number, target: Character): {
  message: string; isHit: boolean; isCrit: boolean; damage: number; fumble: boolean;
} {
  const atk = enemy.attacks[atkIdx];
  if (!atk) return { message: `${enemy.name} has no attack #${atkIdx + 1}.`, isHit: false, isCrit: false, damage: 0, fumble: false };
  const armor = target.inventory.find(i => i.equipped && i.type === 'armor') || null;
  const tAc = calculateAc(target, armor);
  let roll = cryptoRoll(20); let adv = false; let dis = false;
  const ae = getConditionEffects(enemy);
  if (ae.advantageOnAttacks) adv = true; if (ae.disadvantageOnAttacks) dis = true;
  if (getConditionEffects(target).attacksAgainstHaveAdvantage) adv = true;
  if (adv && dis) { adv = false; dis = false; }
  if (adv || dis) { const s = cryptoRoll(20); roll = adv ? Math.max(roll, s) : Math.min(roll, s); }
  const aRoll = roll + atk.toHit - getExhaustionPenalty(enemy); const crit = roll === 20; const fumble = roll === 1;
  const hit = crit || (!fumble && aRoll >= tAc);
  if (fumble) return { message: `${enemy.name} attacks ${target.name} with ${atk.name}... **Critical Miss! (1)**`, isHit: false, isCrit: false, damage: 0, fumble: true };
  if (!hit) return { message: `${enemy.name} attacks ${target.name}: **MISS** (${aRoll} vs AC ${tAc})`, isHit: false, isCrit: false, damage: 0, fumble: false };
  const m = atk.damageDice.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!m) return { message: `Invalid damage dice: ${atk.damageDice}`, isHit: false, isCrit: false, damage: 0, fumble: false };
  const cnt = crit ? parseInt(m[1]) * 2 : parseInt(m[1]); const sides = parseInt(m[2]); const flat = parseInt(m[3] || '0');
  let dmg = 0; for (let i = 0; i < cnt; i++) dmg += cryptoRoll(sides); dmg += flat;
  const prev = target.hp.current; target.hp.current = Math.max(0, prev - dmg);
  if (target.hp.current === 0 && prev > 0) {
    ensureDeathSaves(target);
  }
  if (target.hp.current === 0 && target.deathSaves && prev === 0) {
    target.deathSaves.failures += 1;
  }
  return { message: `${enemy.name} attacks ${target.name} with ${atk.name}: **HIT${crit ? ' **CRITICAL HIT!**' : ''}** (${aRoll} vs AC ${tAc}) dealing **${dmg}** ${atk.damageType}! ${target.name}: ${target.hp.current}/${target.hp.max} HP.`, isHit: true, isCrit: crit, damage: dmg, fumble: false };
}

export function resolveEnemySingleTurn(enemy: Enemy, party: Character[]): { messages: string[] } {
  const t = selectBestTarget(party);
  if (!t) return { messages: [`${enemy.name} has no valid targets.`] };
  const msgs: string[] = [];
  for (let i = 0; i < enemy.attacks.length; i++) msgs.push(resolveEnemySingleAttack(enemy, i, t).message);
  return { messages: msgs };
}

export function resolveAllEnemyTurns(party: Character[], cs: CombatState): {
  messages: string[]; combatEnded: boolean; victory?: boolean;
} {
  const msgs: string[] = []; let safe = 0;
  while (safe < 20) {
    if (!cs.isActive) break;
    const e = cs.initiative[cs.turnIndex];
    if (!e || e.type !== 'enemy') break;
    const ec = checkVictoryConditions(cs, party);
    if (ec.ended) { cs.isActive = false; msgs.push(ec.victory ? `🏆 Victory in ${cs.round} rounds!` : `💀 Total Party Kill in ${cs.round} rounds.`); return { messages: msgs, combatEnded: true, victory: ec.victory }; }
    if (e.isDead || e.hasActedThisTurn) { e.hasActedThisTurn = true; advanceToNextTurn(cs, party, cs.enemies); safe++; continue; }
    const en = cs.enemies.find(x => x.id === e.id);
    if (!en || en.isDead) { e.hasActedThisTurn = true; advanceToNextTurn(cs, party, cs.enemies); safe++; continue; }
    msgs.push(...resolveEnemySingleTurn(en, party).messages);
    e.hasActedThisTurn = true; advanceToNextTurn(cs, party, cs.enemies); safe++;
  }
  return { messages: msgs, combatEnded: !cs.isActive };
}

export function checkVictoryConditions(cs: CombatState, party: Character[]): { ended: boolean; reason?: string; victory?: boolean } {
  if (!cs.isActive) return { ended: false };
  if (cs.enemies.length > 0 && cs.enemies.every(e => e.isDead)) return { ended: true, reason: 'victory', victory: true };
  if (party.length > 0 && party.every(c => c.hp.current <= 0 && !c.deathSaves?.isStable)) return { ended: true, reason: 'total_party_kill', victory: false };
  return { ended: false };
}

export function useCharacterReaction(ch: Character): { success: boolean; message: string } {
  if (!ch.reactionAvailable || ch.reactionUsedThisTurn) return { success: false, message: `${ch.name} has already used their reaction this round.` };
  ch.reactionAvailable = false; ch.reactionUsedThisTurn = true;
  return { success: true, message: `${ch.name}'s reaction spent.` };
}

export function updateCombatantDeathStatus(cs: CombatState, id: string, isDead: boolean): CombatState {
  const e = cs.initiative.find(x => x.id === id); if (e) e.isDead = isDead;
  if (isDead) { const en = cs.enemies.find(x => x.id === id); if (en) en.isDead = true; }
  return cs;
}

export function getCurrentCombatActor(cs: CombatState): { name: string; type: 'player' | 'enemy'; id: string } | null {
  if (!cs.isActive) return null;
  const e = cs.initiative[cs.turnIndex];
  return e ? { name: e.name, type: e.type, id: e.id } : null;
}

export function rollDeathSave(ch: Character, cs: CombatState): {
  message: string; roll: number; total: number; successes: number; failures: number; isStable: boolean; revived: boolean; died: boolean;
} {
  ensureDeathSaves(ch); const s = ch.deathSaves!;
  if (s.isStable) return { message: `${ch.name} is stable.`, roll: 0, total: 0, successes: s.successes, failures: s.failures, isStable: true, revived: false, died: false };
  const rawRoll = cryptoRoll(20);
  const total = rawRoll - getExhaustionPenalty(ch);
  if (rawRoll === 20) { ch.hp.current = 1; ch.deathSaves = { successes: 0, failures: 0, isStable: false }; updateCombatantDeathStatus(cs, ch.id, false); return { message: `${ch.name} rolls DEATH SAVE: **Natural 20!** Revived with 1 HP!`, roll: rawRoll, total, successes: 0, failures: 0, isStable: false, revived: true, died: false }; }
  if (total >= 10) { s.successes++; if (s.successes >= 3) s.isStable = true; return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${s.successes >= 3 ? '3 successes! Stabilized.' : `Success (${s.successes}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: s.isStable, revived: false, died: false }; }
  s.failures++; const dead = s.failures >= 3;
  if (dead) updateCombatantDeathStatus(cs, ch.id, true);
  return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${dead ? `3 failures! **${ch.name} has died.**` : `Failure (${s.failures}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: false, revived: false, died: dead };
}

export function makeSavingThrow(target: Character, stat: string, dc: number): {
  success: boolean; roll: number; total: number; modifier: number; nat20: boolean; nat1: boolean; message: string;
} {
  const vs = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const ms = vs.find(s => stat.toLowerCase().includes(s) || s.includes(stat.toLowerCase().trim())) || 'dex';
  const sv = (target.stats as any)[ms] || 10; const bm = getMod(sv);
  const rb = getResilientSaveBonus(target, ms as any); const smb = getShieldMasterSaveBonus(target, ms as any);
  const tm = bm + rb + smb; const roll = cryptoRoll(20); const total = roll + tm - getExhaustionPenalty(target);
  const success = total >= dc; const n20 = roll === 20; const n1 = roll === 1;
  const bp: string[] = []; if (rb > 0) bp.push(`Resilient +${rb}`); if (smb > 0) bp.push(`Shield Master +${smb}`);
  return { success, roll, total, modifier: tm, nat20: n20, nat1: n1, message: `${target.name} ${ms.toUpperCase()} save: ${success ? 'SUCCESS' : 'FAILURE'} (Rolled ${roll} + ${tm}${bp.length ? ' [' + bp.join(', ') + ']' : ''} = ${total} vs DC ${dc})${n20 ? ' [Natural 20!]' : ''}${n1 ? ' [Natural 1!]' : ''}` };
}
