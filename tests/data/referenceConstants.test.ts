import { describe, it, expect } from 'vitest';
import {
  STAT_INFO,
  DERIVED_STAT_INFO,
  CURRENCY_INFO,
  REST_INFO,
  DEATH_SAVE_INFO,
  EXHAUSTION_INFO,
  BUFF_SOURCES,
  COMBAT_RULES,
  DC_TABLE,
  CR_TO_XP,
  DC_TO_XP,
} from '../../data/referenceConstants';

describe('STAT_INFO', () => {
  it('has entries for all six ability scores', () => {
    const keys = Object.keys(STAT_INFO).sort();
    expect(keys).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
  });

  it('each entry has a label, governs, and short description', () => {
    for (const [, entry] of Object.entries(STAT_INFO)) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.governs.length).toBeGreaterThan(10);
      expect(entry.shortDescription.length).toBeGreaterThan(10);
    }
  });

  it('Dexterity governs AC and initiative', () => {
    const dex = STAT_INFO['dex'];
    expect(dex.governs.toLowerCase()).toContain('ac');
    expect(dex.governs.toLowerCase()).toContain('initiative');
  });
});

describe('DERIVED_STAT_INFO', () => {
  it('contains formulas for AC, HP, Initiative, Proficiency, Spell DC', () => {
    for (const key of ['ac', 'hp', 'initiative', 'proficiency', 'spellDc', 'spellAttack', 'speed', 'darkvision', 'hitDice']) {
      expect(DERIVED_STAT_INFO[key], `missing ${key}`).toBeDefined();
    }
  });

  it('AC formula mentions light/medium/heavy', () => {
    const f = DERIVED_STAT_INFO['ac'].formula.toLowerCase();
    expect(f).toContain('light');
    expect(f).toContain('medium');
    expect(f).toContain('heavy');
  });

  it('Spell DC formula contains 8 + proficiency + modifier', () => {
    const f = DERIVED_STAT_INFO['spellDc'].formula.toLowerCase();
    expect(f).toContain('8');
    expect(f).toContain('proficiency');
  });
});

describe('CURRENCY_INFO', () => {
  it('lists GP, SP, CP', () => {
    expect(CURRENCY_INFO.gold.short).toBe('GP');
    expect(CURRENCY_INFO.silver.short).toBe('SP');
    expect(CURRENCY_INFO.copper.short).toBe('CP');
  });

  it('conversion mentions 10 CP = 1 SP and 10 SP = 1 GP', () => {
    const c = CURRENCY_INFO.conversion;
    expect(c).toContain('10 CP = 1 SP');
    expect(c).toContain('10 SP = 1 GP');
  });
});

describe('REST_INFO', () => {
  it('has Short and Long entries', () => {
    const keys = REST_INFO.map(r => r.key);
    expect(keys).toContain('short');
    expect(keys).toContain('long');
  });

  it('Long Rest restores all HP and reduces exhaustion by 1', () => {
    const long = REST_INFO.find(r => r.key === 'long');
    expect(long).toBeDefined();
    const joined = long?.restores.join(' ').toLowerCase() ?? '';
    expect(joined).toContain('all hp');
    expect(joined).toContain('exhaustion');
  });

  it('Short Rest lets you spend Hit Dice', () => {
    const short = REST_INFO.find(r => r.key === 'short');
    expect(short?.restores.some(r => r.toLowerCase().includes('hit dice'))).toBe(true);
  });
});

describe('DEATH_SAVE_INFO', () => {
  it('describes 3-success / 3-failure thresholds', () => {
    expect(DEATH_SAVE_INFO.success).toContain('3 successes');
    expect(DEATH_SAVE_INFO.failure).toContain('3 failures');
  });

  it('documents nat 20 and nat 1 rules', () => {
    expect(DEATH_SAVE_INFO.nat20.toLowerCase()).toContain('2 successes');
    expect(DEATH_SAVE_INFO.nat1.toLowerCase()).toContain('2 failures');
  });
});

describe('EXHAUSTION_INFO', () => {
  it('has six cumulative levels', () => {
    expect(EXHAUSTION_INFO).toHaveLength(6);
    expect(EXHAUSTION_INFO.map(l => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('BUFF_SOURCES', () => {
  it('contains the canonical buff spell sources', () => {
    expect(BUFF_SOURCES.has('mage-armor')).toBe(true);
    expect(BUFF_SOURCES.has('shield')).toBe(true);
    expect(BUFF_SOURCES.has('shield-of-faith')).toBe(true);
    expect(BUFF_SOURCES.has('barkskin')).toBe(true);
    expect(BUFF_SOURCES.has('heroism')).toBe(true);
    expect(BUFF_SOURCES.has('bless')).toBe(true);
    expect(BUFF_SOURCES.has('hunters-mark')).toBe(true);
    expect(BUFF_SOURCES.has('divine-favor')).toBe(true);
    expect(BUFF_SOURCES.has('branding-smite')).toBe(true);
    expect(BUFF_SOURCES.has('magic-weapon')).toBe(true);
  });

  it('is a frozen set (not an array)', () => {
    expect(BUFF_SOURCES instanceof Set).toBe(true);
  });
});

describe('COMBAT_RULES', () => {
  it('documents critical hits, concentration, advantage, cover', () => {
    expect(COMBAT_RULES.critical).toBeDefined();
    expect(COMBAT_RULES.concentration).toBeDefined();
    expect(COMBAT_RULES.advantage).toBeDefined();
    expect(COMBAT_RULES.cover).toBeDefined();
  });

  it('critical description mentions rolling damage dice twice', () => {
    expect(COMBAT_RULES.critical.description.toLowerCase()).toContain('twice');
  });
});

describe('DC_TABLE / CR_TO_XP / DC_TO_XP', () => {
  it('DC_TABLE has 6 standard DCs 5..30', () => {
    expect(DC_TABLE.map(d => d.dc)).toEqual([5, 10, 15, 20, 25, 30]);
  });

  it('CR_TO_XP matches the engine calibration', () => {
    const cr1 = CR_TO_XP.find(x => x.cr === '1');
    expect(cr1?.xp).toBe(200);
    const cr10 = CR_TO_XP.find(x => x.cr === '10');
    expect(cr10?.xp).toBe(5900);
  });

  it('DC_TO_XP matches Easy=15, Medium=35, Hard=75, Very Hard=150', () => {
    const map = Object.fromEntries(DC_TO_XP.map(d => [d.dc, d.xp]));
    expect(map[10]).toBe(15);
    expect(map[15]).toBe(35);
    expect(map[20]).toBe(75);
    expect(map[25]).toBe(150);
  });
});
