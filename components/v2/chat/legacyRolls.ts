/**
 * Legacy regex roll parsing (ported from the old ChatLog). Messages persisted
 * before structured `rollData` existed encode rolls in prose — three formats:
 *  1. Skill result:  "<Skill>: SUCCESS (Total 18 vs DC 15)" + "[Roll: 12, Stat Mod: +2, Skill Rank: +4]"
 *  2. Attack roll:   "(1d20 Roll: 12 + Mod: +3)" (optionally preceded by HIT/MISS markers, "vs AC N")
 *  3. Enemy attack:  "(Rolled 12 vs AC 15)"
 */

export interface LegacyRoll {
  kind: 'success' | 'failure' | 'neutral';
  label: string;
  detail: string;
}

interface RawRoll extends LegacyRoll {
  raw: string;
}

const ATTACK_ROLL_RE = /\((\d+)d(\d+)\s+Roll:\s*(\d+)\s*\+\s*Mod:\s*([+-]?\d+)\)/g;
const ENEMY_ATTACK_RE = /\(Rolled\s*(\d+)\s*vs\s*AC\s*(\d+)\)/g;
const SKILL_ROLL_RE = /\[Roll:\s*(\d+),\s*Stat Mod:\s*([+-]?\d+),\s*Skill Rank:\s*\+(\d+)\]/;
const SKILL_RESULT_RE = /(.+?):\s*(SUCCESS|FAILURE)\s*\(Total\s*(\d+)\s*vs\s*DC\s*(\d+)\)/;

const signedMod = (value: number): string => (value > 0 ? ` + ${value}` : value < 0 ? ` - ${Math.abs(value)}` : '');

/** Parses the three legacy roll formats out of a plain message text. */
export function parseLegacyRolls(text: string): { rolls: LegacyRoll[]; strippedText: string } {
  const raws: RawRoll[] = [];

  const skillMatch = text.match(SKILL_RESULT_RE);
  const skillBracket = text.match(SKILL_ROLL_RE);
  if (skillMatch && skillBracket) {
    const [, label, result, total, dc] = skillMatch;
    const [, roll, mod, rank] = skillBracket;
    raws.push({
      kind: result === 'SUCCESS' ? 'success' : 'failure',
      label: label.trim(),
      detail: `d20 ${roll}${signedMod(parseInt(mod))} + ${rank} = ${total} vs DC ${dc}`,
      raw: skillMatch[0],
    });
  }

  let attackMatch: RegExpExecArray | null;
  ATTACK_ROLL_RE.lastIndex = 0;
  while ((attackMatch = ATTACK_ROLL_RE.exec(text)) !== null) {
    const [, , sides, roll, mod] = attackMatch;
    const dieRoll = parseInt(roll);
    const modifier = parseInt(mod);
    const total = dieRoll + modifier;
    const textBefore = text.substring(0, attackMatch.index);
    const lastHit = textBefore.lastIndexOf('**HIT**');
    const lastMiss = textBefore.lastIndexOf('**MISS**');
    const hit = lastHit > lastMiss;
    const miss = lastMiss > lastHit;
    const isNat20 = dieRoll === 20;
    const isNat1 = dieRoll === 1;
    const acMatch = text.match(/vs\s*AC\s*(\d+)/);
    const dc = acMatch ? parseInt(acMatch[1]) : undefined;
    const success = isNat20 || isNat1 ? !isNat1 : hit ? true : miss ? false : undefined;
    raws.push({
      kind: success === true ? 'success' : success === false ? 'failure' : 'neutral',
      label: `d${sides} roll`,
      detail: `${dieRoll}${signedMod(modifier)} = ${total}${dc !== undefined ? ` vs AC ${dc}` : ''}`,
      raw: attackMatch[0],
    });
  }

  let enemyMatch: RegExpExecArray | null;
  ENEMY_ATTACK_RE.lastIndex = 0;
  while ((enemyMatch = ENEMY_ATTACK_RE.exec(text)) !== null) {
    const [, rollStr, acStr] = enemyMatch;
    const dieRoll = parseInt(rollStr);
    const dc = parseInt(acStr);
    const textBefore = text.substring(0, enemyMatch.index);
    const lastHit = textBefore.lastIndexOf('**HIT**');
    const lastMiss = textBefore.lastIndexOf('**MISS**');
    const hit = lastHit > lastMiss;
    const miss = lastMiss > lastHit;
    const isNat20 = dieRoll === 20;
    const isNat1 = dieRoll === 1;
    const success = isNat20 || isNat1 ? !isNat1 : hit ? true : miss ? false : undefined;
    raws.push({
      kind: success === true ? 'success' : success === false ? 'failure' : 'neutral',
      label: 'Enemy attack',
      detail: `${dieRoll} vs AC ${dc}`,
      raw: enemyMatch[0],
    });
  }

  if (raws.length === 0) return { rolls: [], strippedText: text };

  let strippedText = text;
  for (const r of raws) {
    strippedText = strippedText.replace(r.raw, '').replace(/\s+/g, ' ').trim();
  }
  strippedText = strippedText.replace(/\s*,?\s*\(\s*\)/g, '').trim();

  return { rolls: raws.map(({ kind, label, detail }) => ({ kind, label, detail })), strippedText };
}
