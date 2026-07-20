import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeWizard, makeCleric } from '../../helpers/characters';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../../utils/random');

describe('07_buff_durations', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    server = new MockMCPServer();
  });

  it('mage armor: cast, partial-tick, expires on long rest, recast does not stack AC', async () => {
    const wizard = makeWizard({
      id: 'wiz-1',
      name: 'Magus',
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
    });
    server.joinParty(wizard);

    const castResult = await server.executeToolCall('cast_spell', {
      characterId: 'wiz-1',
      spellId: 'mage-armor',
      slotLevel: 1,
      targets: ['wiz-1'],
    });
    expect(castResult.success).toBe(true);

    const afterCast = server.getTarget('wiz-1');
    const condAfterCast = afterCast?.conditions?.find(c => c.id === 'mage-armor-ac');
    expect(condAfterCast).toBeDefined();
    expect(condAfterCast?.duration).toBe(480);
    expect(condAfterCast?.durationUnit).toBe('minute');
    expect(afterCast?.acBonus).toBe(3);

    const travelResult = await server.executeToolCall('narrate_turn', {
      narration: 'The party travels for 4 hours.',
      timePassed: 240,
    });
    expect(travelResult.success).toBe(true);

    const afterTravel = server.getTarget('wiz-1');
    const condAfterTravel = afterTravel?.conditions?.find(c => c.id === 'mage-armor-ac');
    expect(condAfterTravel).toBeDefined();
    expect(condAfterTravel?.duration).toBe(240);
    expect(afterTravel?.acBonus).toBe(3);

    const restResult = await server.executeToolCall('long_rest', {
      narration: 'The party sleeps.',
      autoAdvanceTime: true,
    });
    expect(restResult.success).toBe(true);

    const afterRest = server.getTarget('wiz-1');
    const condAfterRest = afterRest?.conditions?.find(c => c.id === 'mage-armor-ac');
    expect(condAfterRest).toBeUndefined();
    expect(afterRest?.acBonus).toBe(0);

    const recastResult = await server.executeToolCall('cast_spell', {
      characterId: 'wiz-1',
      spellId: 'mage-armor',
      slotLevel: 1,
      targets: ['wiz-1'],
    });
    expect(recastResult.success).toBe(true);

    const afterRecast = server.getTarget('wiz-1');
    expect(afterRecast?.acBonus).toBe(3);
    const matchingConds = afterRecast?.conditions?.filter(c => c.id === 'mage-armor-ac') ?? [];
    expect(matchingConds).toHaveLength(1);
    expect(matchingConds[0]?.duration).toBe(480);
  });

  it('shield of faith: cast, expires after 10 minutes via narrate_turn', async () => {
    const cleric = makeCleric({
      id: 'clr-1',
      name: 'Aria',
      preparedSpells: ['shield-of-faith'],
      knownSpells: ['shield-of-faith'],
      inventory: [],
    });
    server.joinParty(cleric);
    const ally = server.getTarget('clr-1');

    const castResult = await server.executeToolCall('cast_spell', {
      characterId: 'clr-1',
      spellId: 'shield-of-faith',
      slotLevel: 1,
      targets: ['clr-1'],
    });
    expect(castResult.success).toBe(true);

    const afterCast = server.getTarget('clr-1');
    const cond = afterCast?.conditions?.find(c => c.id === 'shield-of-faith-ac');
    expect(cond).toBeDefined();
    expect(cond?.duration).toBe(10);
    expect(afterCast?.acBonus).toBe(2);
    expect(ally?.concentrationSpellId).toBe('shield-of-faith');

    await server.executeToolCall('narrate_turn', {
      narration: 'A short wait.',
      timePassed: 10,
    });

    const afterWait = server.getTarget('clr-1');
    const expiredCond = afterWait?.conditions?.find(c => c.id === 'shield-of-faith-ac');
    expect(expiredCond).toBeUndefined();
    expect(afterWait?.acBonus).toBe(0);
  });

  it('exhaustion: permanent duration survives a save/load round-trip via JSON clone', async () => {
    const wizard = makeWizard({
      id: 'wiz-1',
      name: 'Magus',
      preparedSpells: ['mage-armor'],
      knownSpells: ['mage-armor'],
      inventory: [],
    });
    server.joinParty(wizard);

    const castRes = await server.executeToolCall('cast_spell', {
      characterId: 'wiz-1',
      spellId: 'mage-armor',
      slotLevel: 1,
      targets: ['wiz-1'],
    });
    expect(castRes.success).toBe(true);

    const { applyCondition } = await import('../../../services/conditionEngine');
    const target = server.getTarget('wiz-1');
    if (!target) throw new Error('Target missing');
    applyCondition(target, {
      id: 'exhaustion-2',
      source: 'fatigue',
      duration: -1,
      durationUnit: 'permanent',
    });

    const beforeSnap = server.getTarget('wiz-1');
    const beforeIds = beforeSnap?.conditions?.map(c => c.id) ?? [];
    expect(beforeIds).toContain('mage-armor-ac');
    expect(beforeIds).toContain('exhaustion-2');

    const serialized = JSON.parse(JSON.stringify(server.getFullState()));
    const newServer = new MockMCPServer();
    newServer.loadState(serialized as ReturnType<typeof server.getFullState>);

    const afterLoad = newServer.getTarget('wiz-1');
    const afterIds = afterLoad?.conditions?.map(c => c.id) ?? [];
    expect(afterIds).toContain('mage-armor-ac');
    expect(afterIds).toContain('exhaustion-2');

    const exhaustion = afterLoad?.conditions?.find(c => c.id === 'exhaustion-2');
    expect(exhaustion).toBeDefined();
    expect(exhaustion?.duration).toBe(-1);
    expect(exhaustion?.durationUnit).toBe('permanent');

    const mageArmor = afterLoad?.conditions?.find(c => c.id === 'mage-armor-ac');
    expect(mageArmor).toBeDefined();
    expect(mageArmor?.duration).toBe(480);
  });
});
