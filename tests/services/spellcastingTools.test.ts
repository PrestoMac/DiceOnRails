import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter, makeWizard, makeCleric, makeBarbarian } from '../helpers/characters';
import { applyCondition, hasCondition } from '../../services/conditionEngine';
import { extractRollData } from '../../services/llm/narration';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../utils/random');

describe('cast_spell', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    server = new MockMCPServer();
  });

  it('damage spell reduces enemy HP and consumes slot', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.start_combat();
    const state0 = server.getFullState();
    expect(state0.combat).toBeDefined();
    const combat0 = state0.combat;
    if (!combat0) throw new Error('Expected combat to be defined');
    const enemyId = combat0.enemies[0].id;
    const slot3 = wizard.resources.find(r => r.id === 'spell-slot-3');
    expect(slot3).toBeDefined();
    if (!slot3) throw new Error('Expected spell-slot-3 to exist');
    const slotBefore = slot3.current;

    const result = await server.cast_spell('wizard-1', 'fireball', 3, [enemyId]);

    expect(result.success).toBe(true);
    const slotAfter = wizard.resources.find(r => r.id === 'spell-slot-3');
    expect(slotAfter).toBeDefined();
    if (!slotAfter) throw new Error('Expected spell-slot-3 to exist');
    expect(slotAfter.current).toBe(slotBefore - 1);
    const state1 = server.getFullState();
    expect(state1.combat).toBeDefined();
    const combat1 = state1.combat;
    if (!combat1) throw new Error('Expected combat to be defined');
    const enemy = combat1.enemies[0];
    expect(enemy.hp.current).toBeLessThan(enemy.hp.max);
  });

  it('healing spell increases target HP and consumes slot', async () => {
    const cleric = makeCleric();
    const ally = makeCharacter({ id: 'ally-1', name: 'Ally', hp: { current: 5, max: 20 } });
    server.joinParty(cleric);
    server.joinParty(ally);
    const slot1 = cleric.resources.find(r => r.id === 'spell-slot-1');
    expect(slot1).toBeDefined();
    if (!slot1) throw new Error('Expected spell-slot-1 to exist');
    const slotBefore = slot1.current;

    const result = await server.cast_spell('cleric-1', 'cure-wounds', 1, ['ally-1']);

    expect(result.success).toBe(true);
    expect(ally.hp.current).toBeGreaterThan(5);
    const slotAfter = cleric.resources.find(r => r.id === 'spell-slot-1');
    expect(slotAfter).toBeDefined();
    if (!slotAfter) throw new Error('Expected spell-slot-1 to exist');
    expect(slotAfter.current).toBe(slotBefore - 1);
  });

  it('healing from 0 HP clears deathSaves (B5 fix)', async () => {
    const cleric = makeCleric();
    const ally = makeCharacter({
      id: 'ally-1', name: 'Ally', hp: { current: 0, max: 20 },
      deathSaves: { successes: 1, failures: 1, isStable: false },
    });
    server.joinParty(cleric);
    server.joinParty(ally);

    const result = await server.cast_spell('cleric-1', 'cure-wounds', 2, ['ally-1']);

    expect(result.success).toBe(true);
    expect(ally.hp.current).toBeGreaterThan(0);
    expect(ally.deathSaves).toBeUndefined();
  });

  it('cantrip deals damage without consuming a slot', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.start_combat();
    const state0 = server.getFullState();
    expect(state0.combat).toBeDefined();
    const combat0 = state0.combat;
    if (!combat0) throw new Error('Expected combat to be defined');
    const enemyId = combat0.enemies[0].id;
    const slot1 = wizard.resources.find(r => r.id === 'spell-slot-1');
    expect(slot1).toBeDefined();
    if (!slot1) throw new Error('Expected spell-slot-1 to exist');
    const slotBefore = slot1.current;

    const result = await server.cast_spell('wizard-1', 'fire-bolt', 0, [enemyId]);

    expect(result.success).toBe(true);
    const slotAfter = wizard.resources.find(r => r.id === 'spell-slot-1');
    expect(slotAfter).toBeDefined();
    if (!slotAfter) throw new Error('Expected spell-slot-1 to exist');
    expect(slotAfter.current).toBe(slotBefore);
  });

  it('extractRollData(fire-bolt) returns [attack, damage] cards on a spell-attack hit', async () => {
    vi.mocked(cryptoRoll).mockReturnValue(20); // nat 20 → guaranteed hit + crit
    const wizard = makeWizard();
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.start_combat();
    const state0 = server.getFullState();
    expect(state0.combat).toBeDefined();
    const combat0 = state0.combat;
    if (!combat0) throw new Error('Expected combat to be defined');
    const enemyId = combat0.enemies[0].id;

    const result = await server.cast_spell('wizard-1', 'fire-bolt', 0, [enemyId]);

    expect(result.success).toBe(true);
    const rollData = extractRollData('cast_spell', result);
    expect(Array.isArray(rollData)).toBe(true);
    const cards = rollData as import('../../types').RollData[];
    const attackCard = cards.find(c => c.dieFace === 'd20');
    expect(attackCard).toBeDefined();
    const damageCard = cards.find(c => c.dieFace === 'dmg');
    expect(damageCard).toBeDefined();
    expect(damageCard?.total).toBeGreaterThan(0);
  });

  it('unknown spell returns fail', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'not-a-real-spell', 1);

    expect(result.success).toBe(false);
  });

  it('insufficient slots returns fail', async () => {
    const wizard = makeWizard();
    wizard.resources = wizard.resources.map(r => ({ ...r, current: 0 }));
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'magic-missile', 1);

    expect(result.success).toBe(false);
  });

  it('concentration spell sets concentrationSpellId', async () => {
    const cleric = makeCleric();
    server.joinParty(cleric);

    const result = await server.cast_spell('cleric-1', 'bless', 1, []);

    expect(result.success).toBe(true);
    expect(cleric.concentrationSpellId).toBe('bless');
  });

  it('AoE multi-target affects multiple enemies', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.add_enemy('Orc');
    await server.start_combat();
    const state0 = server.getFullState();
    expect(state0.combat).toBeDefined();
    const combat0 = state0.combat;
    if (!combat0) throw new Error('Expected combat to be defined');
    const enemies = combat0.enemies;
    const enemyIds = enemies.map(e => e.id);

    const result = await server.cast_spell('wizard-1', 'fireball', 3, enemyIds);

    expect(result.success).toBe(true);
    for (const enemy of enemies) {
      expect(enemy.hp.current).toBeLessThan(enemy.hp.max);
    }
  });

  it('upcasting casts at higher level', async () => {
    const wizard = makeWizard();
    wizard.resources.push({ id: 'spell-slot-4', name: 'Level 4 Spell Slot', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' });
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.start_combat();
    const state0 = server.getFullState();
    expect(state0.combat).toBeDefined();
    const combat0 = state0.combat;
    if (!combat0) throw new Error('Expected combat to be defined');
    const enemyId = combat0.enemies[0].id;

    const result = await server.cast_spell('wizard-1', 'fireball', 4, [enemyId]);

    expect(result.success).toBe(true);
    const slot4 = wizard.resources.find(r => r.id === 'spell-slot-4');
    expect(slot4).toBeDefined();
    if (!slot4) throw new Error('Expected spell-slot-4 to exist');
    expect(slot4.current).toBe(0);
  });

  it('greater-restoration reduces exhaustion by 1 level', async () => {
    const char = makeCleric({ level: 10, preparedSpells: ['cure-wounds', 'bless', 'healing-word', 'shield-of-faith', 'greater-restoration'], resources: [
      { id: 'spell-slot-5', name: 'Level 5 Spell Slot', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'cleric' }
    ]});
    server.joinParty(char);
    applyCondition(char, { id: 'exhaustion-3', source: 'fatigue', duration: Infinity, durationUnit: 'minute' });
    applyCondition(char, { id: 'exhaustion-1', source: 'fatigue', duration: Infinity, durationUnit: 'minute' });

    const result = await server.executeToolCall('cast_spell', {
      characterId: 'cleric-1',
      spellId: 'greater-restoration',
      slotLevel: 5,
      targets: ['cleric-1']
    });

    expect(result.success).toBe(true);
    const updated = server.getTarget('cleric-1') as Character;
    expect(updated).toBeDefined();
    expect(hasCondition(updated, 'exhaustion-3')).toBe(false);
    expect(hasCondition(updated, 'exhaustion-1')).toBe(true);
    const state = server.getFullState();
    expect(state.sessionLogs.some(l => l.includes('exhaustion'))).toBe(true);
  });
});

describe('spell_effect', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('counterspell auto-succeeds for level 3 or lower', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.spell_effect('counter', 'wizard-1', 3);

    expect(result.success).toBe(true);
    expect(result.data?.autoSuccess).toBe(true);
  });

  it('counterspell above level 3 requires ability check', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    vi.mocked(cryptoRoll).mockReturnValue(15);

    const result = await server.spell_effect('counter', 'wizard-1', 5);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBeDefined();
  });

  it('dispel magic auto-succeeds for level 3', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.spell_effect('dispel', 'wizard-1', 3);

    expect(result.success).toBe(true);
    expect(result.data?.autoSuccess).toBe(true);
  });

  it('non-spellcaster returns fail', async () => {
    const barbarian = makeBarbarian();
    server.joinParty(barbarian);

    const result = await server.spell_effect('counter', 'barb-1', 3);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/cannot cast spells/i);
  });
});

describe('manage_spellbook', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('learns a new spell', async () => {
    const wizard = makeWizard();
    wizard.knownSpells = ['shield', 'fireball'];
    server.joinParty(wizard);

    const result = await server.manage_spellbook('wizard-1', 'learn', 'magic-missile');

    expect(result.success).toBe(true);
    expect(wizard.knownSpells).toContain('magic-missile');
  });

  it('forgets a known spell', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.manage_spellbook('wizard-1', 'forget', 'shield');

    expect(result.success).toBe(true);
    expect(wizard.knownSpells).not.toContain('shield');
  });

  it('prepares a spell', async () => {
    const cleric = makeCleric();
    cleric.knownSpells = ['cure-wounds', 'bless'];
    cleric.preparedSpells = ['bless'];
    server.joinParty(cleric);

    const result = await server.manage_spellbook('cleric-1', 'prepare', 'cure-wounds');

    expect(result.success).toBe(true);
    expect(cleric.preparedSpells).toContain('cure-wounds');
  });

  it('unprepares a spell', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.manage_spellbook('wizard-1', 'unprepare', 'fireball');

    expect(result.success).toBe(true);
    expect(wizard.preparedSpells).not.toContain('fireball');
  });

  it('learn already known returns success (no-op)', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.manage_spellbook('wizard-1', 'learn', 'magic-missile');

    expect(result.success).toBe(true);
    expect(wizard.knownSpells.filter(s => s === 'magic-missile').length).toBe(1);
  });

  it('forget not known returns fail (B8 fix)', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.manage_spellbook('wizard-1', 'forget', 'haste');

    expect(result.success).toBe(false);
  });

  it('max prepared cap reached returns fail', async () => {
    const wizard = makeWizard();
    const manySpells: string[] = [];
    for (let i = 0; i < 25; i++) manySpells.push(`test-spell-${i}`);
    wizard.knownSpells = [...manySpells];
    wizard.preparedSpells = [...manySpells];
    server.joinParty(wizard);

    const result = await server.manage_spellbook('wizard-1', 'prepare', 'test-spell-0');

    expect(result.success).toBe(false);
  });
});

describe('summon_creature', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('valid template summons creature (B3 fix)', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.summon_creature('wizard-1', 'dire-wolf', 1);

    expect(result.success).toBe(true);
    const state = server.getFullState();
    const creature = state.combat?.enemies?.find(e => e.name === 'Dire Wolf');
    expect(creature).toBeDefined();
  });

  it('invalid template returns fail', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.summon_creature('wizard-1', 'tyrannosaurus-mcgee', 1);

    expect(result.success).toBe(false);
  });

  it('summons in combat adds creature to initiative', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.start_combat();

    const result = await server.summon_creature('wizard-1', 'dire-wolf', 1);

    expect(result.success).toBe(true);
    const state = server.getFullState();
    expect(state.combat).toBeDefined();
    const combat = state.combat;
    if (!combat) throw new Error('Expected combat to be defined');
    const summoned = combat.enemies.find(e => e.name === 'Dire Wolf');
    expect(summoned).toBeDefined();
  });

  it('summons out of combat still registers creature', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.summon_creature('wizard-1', 'dire-wolf', 1);

    expect(result.success).toBe(true);
    const state = server.getFullState();
    const creature = state.combat?.enemies?.find(e => e.name === 'Dire Wolf');
    expect(creature).toBeDefined();
  });
});

describe('polymorph_creature', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('valid form applies polymorph (B2 fix)', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.polymorph_creature('wizard-1', 'wolf', 60);

    expect(result.success).toBe(true);
    expect(wizard.hp.max).toBe(11);
  });

  it('invalid form returns fail', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.polymorph_creature('wizard-1', 'squid-monster', 60);

    expect(result.success).toBe(false);
  });

  it('duration expires reverts form', async () => {
    const wizard = makeWizard();
    const originalHp = wizard.hp.max;
    server.joinParty(wizard);

    await server.polymorph_creature('wizard-1', 'wolf', 60);

    await server.narrate_turn('Time passes', 61);
    expect(wizard.hp.max).toBe(originalHp);
  });

  it('double-polymorph overwrites previous form', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    await server.polymorph_creature('wizard-1', 'wolf', 60);
    await server.polymorph_creature('wizard-1', 'brown-bear', 60);

    expect(wizard.hp.max).toBe(34);
  });

  it('concentration is retained during polymorph', async () => {
    const cleric = makeCleric();
    server.joinParty(cleric);
    vi.mocked(cryptoRoll).mockReturnValue(10);

    await server.cast_spell('cleric-1', 'bless', 1, []);
    const result = await server.polymorph_creature('cleric-1', 'wolf', 60);

    expect(result.success).toBe(true);
    expect(cleric.concentrationSpellId).toBe('bless');
  });
});

describe('teleport_creature', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('teleports character to destination (B1 fix)', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.teleport_creature('wizard-1', 'The Tower', 30);

    expect(result.success).toBe(true);
    expect(wizard.location).toBe('The Tower');
  });

  it('teleports to known location', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.teleport_creature('wizard-1', 'Waterdeep', 60);

    expect(result.success).toBe(true);
    expect(wizard.location).toBe('Waterdeep');
  });

  it('invalid target character returns fail', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.teleport_creature('nobody', 'Somewhere', 30);

    expect(result.success).toBe(false);
  });
});

describe('cast_ritual', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('casts a valid spell as ritual without consuming spell slots', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    const slot = wizard.resources?.find(r => r.id === 'spell-slot-1');
    const initialSlots = slot?.current ?? 0;

    const result = await server.cast_ritual('wizard-1', 'detect-magic');

    expect(result.success).toBe(true);
    expect(result.data?.ritual).toBe(true);
    expect(slot?.current).toBe(initialSlots);
  });

  it('casts a ritual spell even when 0 spell slots remain', async () => {
    const wizard = makeWizard();
    const slot = wizard.resources?.find(r => r.id === 'spell-slot-1');
    if (slot) slot.current = 0;
    server.joinParty(wizard);

    const result = await server.cast_ritual('wizard-1', 'detect-magic');

    expect(result.success).toBe(true);
    expect(result.data?.ritual).toBe(true);
    expect(slot?.current).toBe(0);
  });

  it('invalid spell returns fail', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);

    const result = await server.cast_ritual('wizard-1', 'made-up-spell');

    expect(result.success).toBe(false);
  });
});

describe('buff spell durations', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    server = new MockMCPServer();
  });

  it('mage armor applies with 480-minute duration', async () => {
    const wizard = makeWizard({
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
    });
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'mage-armor', 1, ['wizard-1']);
    expect(result.success).toBe(true);

    const target = server.getTarget('wizard-1');
    const cond = target?.conditions?.find(c => c.id === 'mage-armor-ac');
    expect(cond).toBeDefined();
    expect(cond?.duration).toBe(480);
    expect(cond?.durationUnit).toBe('minute');
    expect(target?.acBonus).toBe(3);
  });

  it('mage armor does not stack AC bonus on recast', async () => {
    const wizard = makeWizard({
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
      resources: [
        { id: 'spell-slot-1', name: 'L1', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ],
    });
    server.joinParty(wizard);

    await server.cast_spell('wizard-1', 'mage-armor', 1, ['wizard-1']);
    await server.cast_spell('wizard-1', 'mage-armor', 1, ['wizard-1']);

    const target = server.getTarget('wizard-1');
    expect(target?.acBonus).toBe(3);
    const matchingConds = target?.conditions?.filter(c => c.id === 'mage-armor-ac') ?? [];
    expect(matchingConds).toHaveLength(1);
    expect(matchingConds[0]?.duration).toBe(480);
  });

  it('shield of faith applies with 10-minute duration', async () => {
    const cleric = makeCleric({
      preparedSpells: ['shield-of-faith'],
      knownSpells: ['shield-of-faith'],
      inventory: [],
    });
    server.joinParty(cleric);
    const ally = makeCharacter({ id: 'ally-1', name: 'Ally', hp: { current: 10, max: 10 } });
    server.joinParty(ally);

    const result = await server.cast_spell('cleric-1', 'shield-of-faith', 1, ['ally-1']);
    expect(result.success).toBe(true);

    const target = server.getTarget('ally-1');
    const cond = target?.conditions?.find(c => c.id === 'shield-of-faith-ac');
    expect(cond).toBeDefined();
    expect(cond?.duration).toBe(10);
    expect(cond?.durationUnit).toBe('minute');
  });

  it('mage armor expires after 480 minutes of tickConditionsByTime', async () => {
    const wizard = makeWizard({
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
    });
    server.joinParty(wizard);

    await server.cast_spell('wizard-1', 'mage-armor', 1, ['wizard-1']);
    const target1 = server.getTarget('wizard-1');
    expect(target1?.conditions?.some(c => c.id === 'mage-armor-ac')).toBe(true);

    const { tickConditionsByTime } = await import('../../services/conditionEngine');
    const updatedTarget = server.getTarget('wizard-1');
    if (!updatedTarget) throw new Error('Target missing');
    tickConditionsByTime(updatedTarget, 480);

    const target2 = server.getTarget('wizard-1');
    expect(target2?.conditions?.some(c => c.id === 'mage-armor-ac')).toBe(false);
    expect(target2?.acBonus).toBe(0);
  });

  it('magic weapon applies with 60-minute duration on self-cast', async () => {
    const wizard = makeWizard({
      preparedSpells: ['magic-weapon'],
      knownSpells: ['magic-weapon'],
      inventory: [],
    });
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'magic-weapon', 1, ['wizard-1']);
    expect(result.success).toBe(true);

    const target = server.getTarget('wizard-1');
    const cond = target?.conditions?.find(c => c.id === 'magic-weapon');
    expect(cond).toBeDefined();
    expect(cond?.duration).toBe(60);
    expect(cond?.durationUnit).toBe('minute');
  });

  it('self-buff fallback applies mage-armor when no targets are passed', async () => {
    const wizard = makeWizard({
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
    });
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'mage-armor', 1, []);
    expect(result.success).toBe(true);

    const target = server.getTarget('wizard-1');
    const cond = target?.conditions?.find(c => c.id === 'mage-armor-ac');
    expect(cond).toBeDefined();
    expect(target?.acBonus).toBe(3);
  });

  it('self-buff fallback applies shield when no targets are passed', async () => {
    const wizard = makeWizard({
      preparedSpells: ['shield'],
      knownSpells: ['shield'],
      inventory: [],
      reactionAvailable: true,
    });
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'shield', 1, [], undefined, true);
    expect(result.success).toBe(true);

    const target = server.getTarget('wizard-1');
    const cond = target?.conditions?.find(c => c.id === 'shield-ac');
    expect(cond).toBeDefined();
    expect(target?.acBonus).toBe(5);
  });

  it('self-buff fallback does not break explicit caster target', async () => {
    const wizard = makeWizard({
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
    });
    server.joinParty(wizard);

    const result = await server.cast_spell('wizard-1', 'mage-armor', 1, ['wizard-1']);
    expect(result.success).toBe(true);

    const target = server.getTarget('wizard-1');
    expect(target?.conditions?.some(c => c.id === 'mage-armor-ac')).toBe(true);
    expect(target?.acBonus).toBe(3);
  });

  it('non-self spell does NOT auto-target the caster when no targets are passed', async () => {
    const wizard = makeWizard({
      preparedSpells: ['fireball'],
      knownSpells: ['fireball'],
      inventory: [],
      hp: { current: 20, max: 20 },
    });
    server.joinParty(wizard);
    await server.add_enemy('Goblin');
    await server.start_combat();

    const hpBefore = server.getTarget('wizard-1')?.hp.current;
    const result = await server.cast_spell('wizard-1', 'fireball', 3, []);
    expect(result.success).toBe(true);

    const hpAfter = server.getTarget('wizard-1')?.hp.current;
    expect(hpAfter).toBe(hpBefore);
  });
});

describe('spell_effect dispel (C1)', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    server = new MockMCPServer();
  });

  it('removes spell-sourced conditions, breaks concentration, keeps non-spell conditions', async () => {
    const wizard = makeWizard();
    wizard.conditions = [
      { id: 'blinded', source: 'faerie-fire', duration: 5 },
      { id: 'exhaustion-1', source: 'fatigue', duration: -1, durationUnit: 'permanent' },
    ];
    wizard.concentrationSpellId = 'bless';
    server.joinParty(wizard);

    const result = await server.spell_effect('dispel', 'wizard-1', 3, 'wizard-1');
    expect(result.success).toBe(true);

    const after = server.getFullState().party[0];
    const ids = (after.conditions ?? []).map(c => c.id);
    expect(ids).not.toContain('blinded');
    expect(ids).toContain('exhaustion-1');
    expect(after.concentrationSpellId).toBeUndefined();
  });

  it('counter mode performs no target cleanup', async () => {
    const wizard = makeWizard();
    wizard.conditions = [{ id: 'blinded', source: 'faerie-fire', duration: 5 }];
    server.joinParty(wizard);

    const result = await server.spell_effect('counter', 'wizard-1', 3, 'wizard-1');
    expect(result.success).toBe(true);
    const ids = (server.getFullState().party[0].conditions ?? []).map(c => c.id);
    expect(ids).toContain('blinded');
  });
});

describe('spell correctness fixes (S3/S6/S7 + Fey Ancestry)', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    server = new MockMCPServer();
  });

  const firstEnemyId = (s: MockMCPServer): string => {
    const combat = s.getFullState().combat;
    if (!combat) throw new Error('Expected combat to be defined');
    return combat.enemies[0].id;
  };
  const firstEnemy = (s: MockMCPServer) => {
    const combat = s.getFullState().combat;
    if (!combat) throw new Error('Expected combat to be defined');
    return combat.enemies[0];
  };

  it('S3: onSuccess:"none" spell negates all damage on a successful save (disintegrate)', async () => {
    const wizard = makeWizard({
      level: 11,
      resources: [{ id: 'spell-slot-6', name: 'L6', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' }],
      knownSpells: ['fireball'],
      preparedSpells: ['fireball', 'disintegrate'],
    });
    server.joinParty(wizard);
    await server.add_enemy('Giant', 15, 200);
    await server.start_combat();
    const enemyId = firstEnemyId(server);

    // Force the save to SUCCEED via the LLM override -> 0 damage on a 'none' spell.
    const r = await server.cast_spell('wizard-1', 'disintegrate', 6, [enemyId], { [enemyId]: true });
    expect(r.success).toBe(true);
    expect(firstEnemy(server).hp.current).toBe(200);
  });

  it('S3: onSuccess:"none" spell deals full damage on a failed save (disintegrate)', async () => {
    const wizard = makeWizard({
      level: 11,
      resources: [{ id: 'spell-slot-6', name: 'L6', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' }],
      knownSpells: ['fireball'],
      preparedSpells: ['fireball', 'disintegrate'],
    });
    server.joinParty(wizard);
    await server.add_enemy('Giant', 15, 200);
    await server.start_combat();
    const enemyId = firstEnemyId(server);

    const r = await server.cast_spell('wizard-1', 'disintegrate', 6, [enemyId], { [enemyId]: false });
    expect(r.success).toBe(true);
    expect(firstEnemy(server).hp.current).toBeLessThan(200);
  });

  it('S6: False Life grants temp HP without healing real HP', async () => {
    const wizard = makeWizard({
      hp: { current: 10, max: 32 },
      knownSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'false-life'],
      preparedSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'false-life'],
    });
    server.joinParty(wizard);
    vi.mocked(cryptoRoll).mockReturnValue(3); // 1d4 = 3 -> 3 + 4 = 7 temp HP

    const r = await server.cast_spell('wizard-1', 'false-life', 1, []);
    expect(r.success).toBe(true);
    const updated = server.getTarget('wizard-1') as Character;
    expect(updated.tempHp).toBe(7);
    expect(updated.hp.current).toBe(10); // real HP unchanged
  });

  it('S7: hold-person is negated when the target saves on cast', async () => {
    const cleric = makeCleric({ preparedSpells: ['cure-wounds', 'bless', 'healing-word', 'shield-of-faith', 'hold-person'] });
    server.joinParty(cleric);
    await server.add_enemy('Goblin');
    await server.start_combat();
    const enemyId = firstEnemyId(server);

    vi.mocked(cryptoRoll).mockReturnValue(20); // save succeeds
    const r = await server.cast_spell('cleric-1', 'hold-person', 2, [enemyId]);
    expect(r.success).toBe(true);
    expect((firstEnemy(server).conditions || []).some(c => c.id === 'paralyzed')).toBe(false);
  });

  it('S7: hold-person applies when the target fails the save on cast', async () => {
    const cleric = makeCleric({ preparedSpells: ['cure-wounds', 'bless', 'healing-word', 'shield-of-faith', 'hold-person'] });
    server.joinParty(cleric);
    await server.add_enemy('Goblin');
    await server.start_combat();
    const enemyId = firstEnemyId(server);

    vi.mocked(cryptoRoll).mockReturnValue(1); // save fails
    const r = await server.cast_spell('cleric-1', 'hold-person', 2, [enemyId]);
    expect(r.success).toBe(true);
    expect((firstEnemy(server).conditions || []).some(c => c.id === 'paralyzed')).toBe(true);
  });

  it('R4: Fey Ancestry rolls twice (advantage) on a charm save', async () => {
    const wizard = makeWizard(); // elf -> racialTraits includes 'fey-ancestry'
    server.joinParty(wizard);
    vi.mocked(cryptoRoll).mockReturnValueOnce(5).mockReturnValueOnce(15).mockReturnValue(10);

    const r = await server.make_save('wizard-1', 'wis', 14, true);
    expect(r.data?.success).toBe(true); // advantage kept 15; +WIS(1) = 16 >= 14
    expect(r.message).toContain('Fey Ancestry advantage');
  });

  it('R4: advantage is NOT applied to a non-charm save', async () => {
    const wizard = makeWizard();
    server.joinParty(wizard);
    vi.mocked(cryptoRoll).mockReturnValueOnce(5).mockReturnValue(10);

    const r = await server.make_save('wizard-1', 'wis', 14, false);
    expect(r.data?.success).toBe(false); // single roll 5 + WIS(1) = 6 < 14
    expect(r.message).not.toContain('Fey Ancestry');
  });
});
