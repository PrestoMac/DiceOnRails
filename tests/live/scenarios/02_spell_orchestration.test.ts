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

describe('02_spell_orchestration', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('cast fireball: mock returns cast_spell → slot consumed, damage applied', async () => {
    const wizard = makeWizard({ id: 'wiz-1', name: 'Magus' });
    wizard.resources.push({ id: 'spell-slot-3', name: 'Level 3 Spell Slot', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' });
    server.joinParty(wizard);
    await server.add_enemy('Goblin', 15, 7);
    await server.start_combat();
    const combatState = server.getFullState().combat;
    expect(combatState).toBeDefined();
    const enemy = combatState?.enemies[0];
    const beforeHp = enemy.hp.current;
    vi.mocked(cryptoRoll).mockReturnValue(8);
    const result = await server.executeToolCall('cast_spell', {
      characterId: 'wiz-1',
      spellId: 'fireball',
      slotLevel: 3,
      targets: [enemy.id],
    });
    expect(result.success).toBe(true);
    const slot3 = wizard.resources.find(r => r.id === 'spell-slot-3');
    expect(slot3).toBeDefined();
    expect(slot3?.current).toBe(1);
    expect(enemy.hp.current).toBeLessThan(beforeHp);
  });

  it('concentration + heal: cast bless then cure-wounds → concentration not broken by non-concentration heal', async () => {
    const cleric = makeCleric({ id: 'clr-1', name: 'Aria' });
    server.joinParty(cleric);
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const blessResult = await server.executeToolCall('cast_spell', {
      characterId: 'clr-1',
      spellId: 'bless',
      slotLevel: 1,
      targets: ['clr-1'],
    });
    expect(blessResult.success).toBe(true);
    expect(cleric.concentrationSpellId).toBe('bless');
    vi.mocked(cryptoRoll).mockReturnValue(5);
    const cureResult = await server.executeToolCall('cast_spell', {
      characterId: 'clr-1',
      spellId: 'cure-wounds',
      slotLevel: 1,
      targets: ['clr-1'],
    });
    expect(cureResult.success).toBe(true);
    expect(cleric.concentrationSpellId).toBe('bless');
  });

  it('heal from 0 HP: inflict_damage to 0, cast cure-wounds → deathSaves cleared, HP restored', async () => {
    const cleric = makeCleric({ id: 'clr-1', name: 'Aria' });
    server.joinParty(cleric);
    vi.mocked(cryptoRoll).mockReturnValue(5);
    const damageResult = await server.executeToolCall('inflict_damage', { amount: 99, targetId: 'clr-1' });
    expect(damageResult.success).toBe(true);
    expect(cleric.hp.current).toBe(0);
    expect(cleric.deathSaves).toBeDefined();
    vi.mocked(cryptoRoll).mockReturnValue(5);
    const healResult = await server.executeToolCall('cast_spell', {
      characterId: 'clr-1',
      spellId: 'cure-wounds',
      slotLevel: 1,
      targets: ['clr-1'],
    });
    expect(healResult.success).toBe(true);
    expect(cleric.hp.current).toBeGreaterThan(0);
    expect(cleric.deathSaves).toBeUndefined();
  });

  it('insufficient slots: cast fireball with all L3 slots at 0 → tool fails', async () => {
    const wizard = makeWizard({ id: 'wiz-1', name: 'Magus' });
    wizard.resources = wizard.resources.map(r =>
      r.id === 'spell-slot-3' ? { ...r, current: 0 } : r
    );
    server.joinParty(wizard);
    await server.add_enemy('Goblin', 15, 7);
    await server.start_combat();
    const combatState = server.getFullState().combat;
    expect(combatState).toBeDefined();
    const enemy = combatState?.enemies[0];
    const result = await server.executeToolCall('cast_spell', {
      characterId: 'wiz-1',
      spellId: 'fireball',
      slotLevel: 3,
      targets: [enemy.id],
    });
    expect(result.success).toBe(false);
  });
});
