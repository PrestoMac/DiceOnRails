import { SPELLS_CATALOG } from '../utils/spells';

const attackNoDamage = SPELLS_CATALOG.filter(s => s.attackRoll && !s.damage);
console.log('\n=== attackRoll:true BUT no damage field ===');
if (attackNoDamage.length === 0) console.log('  (none)');
else attackNoDamage.forEach(s => console.log(`  [L${s.level}] ${s.id} — ${s.name}`));

const saveNoEffect = SPELLS_CATALOG.filter(
  s => s.save && !s.damage && !s.healing && !s.condition && !s.hpPoolDice
);
console.log('\n=== save: specified BUT no damage/healing/condition/hpPool ===');
if (saveNoEffect.length === 0) console.log('  (none)');
else saveNoEffect.forEach(s => console.log(`  [L${s.level}] ${s.id} — ${s.name}  (save.onSuccess=${s.save!.onSuccess})`));

function parseDice(dice: string): { count: number; sides: number; flatBonus: number } | null {
  const sanitized = dice.replace(/\s+/g, '').replace(/([+-])(?!\d).*$/, '');
  const m = /^(\d+)d(\d+)([+-]\d+)?/.exec(sanitized);
  if (!m) return null;
  return { count: +m[1], sides: +m[2], flatBonus: m[3] ? parseInt(m[3]) : 0 };
}

const badDamageDice: string[] = [];
for (const s of SPELLS_CATALOG) {
  if (s.damage?.dice) {
    const r = parseDice(s.damage.dice);
    if (!r || r.count === 0 || r.sides === 0) {
      badDamageDice.push(`  [L${s.level}] ${s.id} — damage.dice="${s.damage.dice}"`);
    }
  }
  if (s.healing) {
    const r = parseDice(s.healing);
    if (!r || r.count === 0 || r.sides === 0) {
      badDamageDice.push(`  [L${s.level}] ${s.id} — healing="${s.healing}"`);
    }
  }
  for (const sc of s.scaling ?? []) {
    for (const key of ['damageDice', 'bonusDice'] as const) {
      const val = sc[key];
      if (val) {
        const r = parseDice(val);
        if (!r || r.count === 0 || r.sides === 0) {
          badDamageDice.push(`  [L${s.level}] ${s.id} — scaling.${key}="${val}"`);
        }
      }
    }
  }
  for (const sd of s.secondaryDamage ?? []) {
    const r = parseDice(sd.dice);
    if (!r || r.count === 0 || r.sides === 0) {
      badDamageDice.push(`  [L${s.level}] ${s.id} — secondaryDamage.dice="${sd.dice}"`);
    }
  }
}
console.log('\n=== Unparseable dice strings ===');
if (badDamageDice.length === 0) console.log('  (none)');
else badDamageDice.forEach(l => console.log(l));

console.log('\n=== Damage dice with count=0 or sides=0 ===');
let zeroFound = false;
for (const s of SPELLS_CATALOG) {
  if (s.damage?.dice) {
    const r = parseDice(s.damage.dice);
    if (r && (r.count === 0 || r.sides === 0)) {
      console.log(`  [L${s.level}] ${s.id} — count=${r.count} sides=${r.sides}`);
      zeroFound = true;
    }
  }
}
if (!zeroFound) console.log('  (none)');

console.log('\n=== Scaling bonusDice NOT monotonically increasing (possible data error) ===');
let scalingBad = false;
for (const s of SPELLS_CATALOG) {
  if (!s.scaling) continue;
  let prevCount = 0;
  for (const sc of s.scaling) {
    const key = sc.bonusDice ? 'bonusDice' : sc.damageDice ? 'damageDice' : null;
    if (!key) continue;
    const r = parseDice(sc[key]!);
    if (!r) continue;
    if (r.count < prevCount) {
      console.log(`  [L${s.level}] ${s.id} — ${key} drops from ${prevCount} to ${r.count} at atSlotLevel=${sc.atSlotLevel}`);
      scalingBad = true;
    }
    prevCount = r.count;
  }
}
if (!scalingBad) console.log('  (none)');

console.log(`\nTotal spells audited: ${SPELLS_CATALOG.length}`);
