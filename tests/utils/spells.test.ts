import { describe, it, expect } from 'vitest';
import { SPELLS_CATALOG, SPELLS_BY_ID, getSpellsForClass } from '../../utils/spells';

describe('spells catalog', () => {
  it('has at least 280 spells (full SRD 5.1)', () => {
    expect(SPELLS_CATALOG.length).toBeGreaterThanOrEqual(280);
  });

  it('every spell has required fields', () => {
    for (const s of SPELLS_CATALOG) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.school).toMatch(/^(abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation)$/);
      expect(s.range).toBeTruthy();
      expect(s.components).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.classes.length).toBeGreaterThan(0);
    }
  });

  it('SPELLS_BY_ID has all spells', () => {
    for (const s of SPELLS_CATALOG) {
      expect(SPELLS_BY_ID[s.id]).toBeDefined();
      expect(SPELLS_BY_ID[s.id].name).toBe(s.name);
    }
  });

  it('no duplicate ids', () => {
    const ids = SPELLS_CATALOG.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has spells at every level (0-9)', () => {
    for (let level = 0; level <= 9; level++) {
      const spellsAtLevel = SPELLS_CATALOG.filter(s => s.level === level);
      expect(spellsAtLevel.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('every class has at least 20 spells', () => {
    const classes = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];
    for (const cls of classes) {
      const spells = getSpellsForClass(cls);
      expect(spells.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('fireball has correct properties', () => {
    const fb = SPELLS_BY_ID['fireball'];
    expect(fb).toBeDefined();
    expect(fb.level).toBe(3);
    expect(fb.school).toBe('evocation');
    expect(fb.damage?.dice).toBe('8d6');
    expect(fb.damage?.type).toBe('fire');
    expect(fb.save?.stat).toBe('dex');
    expect(fb.save?.onSuccess).toBe('half');
    expect(fb.requiresConcentration).toBe(false);
    expect(fb.scaling).toBeDefined();
    expect(fb.scaling?.length).toBeGreaterThan(0);
    expect(fb.classes).toContain('sorcerer');
    expect(fb.classes).toContain('wizard');
  });

  it('firebolt is a cantrip with attack roll', () => {
    const fb = SPELLS_BY_ID['fire-bolt'];
    expect(fb).toBeDefined();
    expect(fb.level).toBe(0);
    expect(fb.attackRoll).toBe(true);
  });

  it('cure-wounds has healing', () => {
    const cw = SPELLS_BY_ID['cure-wounds'];
    expect(cw).toBeDefined();
    expect(cw.healing).toBeTruthy();
    expect(cw.level).toBe(1);
  });

  it('eldritch-blast is exclusive to warlock', () => {
    const eb = SPELLS_BY_ID['eldritch-blast'];
    expect(eb).toBeDefined();
    expect(eb.classes).toEqual(['warlock']);
    expect(eb.attackRoll).toBe(true);
  });

  it('magic-missile is force damage with no save', () => {
    const mm = SPELLS_BY_ID['magic-missile'];
    expect(mm).toBeDefined();
    expect(mm.damage?.type).toBe('force');
    expect(mm.save).toBeUndefined();
    expect(mm.attackRoll).toBeUndefined();
  });

  it('bless is a concentration buff spell', () => {
    const b = SPELLS_BY_ID['bless'];
    expect(b).toBeDefined();
    expect(b.level).toBe(1);
    expect(b.requiresConcentration).toBe(true);
    expect(b.classes).toContain('cleric');
    expect(b.classes).toContain('paladin');
  });

  it('shield is a reaction defensive spell', () => {
    const s = SPELLS_BY_ID['shield'];
    expect(s).toBeDefined();
    expect(s.level).toBe(1);
    expect(s.castingTime).toBe('reaction');
    expect(s.classes).toContain('sorcerer');
    expect(s.classes).toContain('wizard');
  });

  it('spirit-guardians is a concentration spell for cleric', () => {
    const sg = SPELLS_BY_ID['spirit-guardians'];
    expect(sg).toBeDefined();
    expect(sg.level).toBe(3);
    expect(sg.requiresConcentration).toBe(true);
    expect(sg.classes).toContain('cleric');
  });

  it('counterspell has no damage or healing', () => {
    const cs = SPELLS_BY_ID['counterspell'];
    expect(cs).toBeDefined();
    expect(cs.level).toBe(3);
    expect(cs.damage).toBeUndefined();
    expect(cs.healing).toBeUndefined();
    expect(cs.classes).toContain('wizard');
  });

  it('getSpellsForClass returns spells for wizard', () => {
    const wizardSpells = getSpellsForClass('wizard');
    expect(wizardSpells.length).toBeGreaterThanOrEqual(70);
    expect(wizardSpells.some(s => s.id === 'fireball')).toBe(true);
  });

  it('getSpellsForClass returns spells for cleric', () => {
    const clericSpells = getSpellsForClass('cleric');
    expect(clericSpells.length).toBeGreaterThanOrEqual(40);
    expect(clericSpells.some(s => s.id === 'cure-wounds')).toBe(true);
  });

  it('getSpellsForClass returns spells for bard', () => {
    const bardSpells = getSpellsForClass('bard');
    expect(bardSpells.length).toBeGreaterThanOrEqual(25);
    expect(bardSpells.some(s => s.id === 'vicious-mockery')).toBe(true);
  });

  it('getSpellsForClass returns empty for non-caster class', () => {
    const fighterSpells = getSpellsForClass('fighter');
    expect(fighterSpells.length).toBe(0);
  });

  it('concentration flag matches duration text', () => {
    const concentrationSpells = SPELLS_CATALOG.filter(s => s.requiresConcentration);
    for (const s of concentrationSpells) {
      const dur = s.duration.toLowerCase();
      expect(dur.includes('concentration') || dur.includes('up to')).toBe(true);
    }
  });
});
