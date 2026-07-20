import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter } from '../helpers/characters';

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

describe('update_inventory', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('adds an item to inventory', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.update_inventory('Potion of Healing', 'add', 1);

    expect(result.success).toBe(true);
    const item = char.inventory.find(i => i.name === 'Potion of Healing');
    expect(item).toBeDefined();
    expect(item?.quantity).toBe(1);
  });

  it('removes an item from inventory', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.update_inventory('Longsword', 'remove', 1);

    expect(result.success).toBe(true);
    expect(char.inventory.find(i => i.name === 'Longsword')).toBeUndefined();
  });

  it('edits quantity of existing item', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.update_inventory('Longsword', 'edit', 5);

    expect(result.success).toBe(true);
    const item = char.inventory.find(i => i.name === 'Longsword');
    expect(item).toBeDefined();
    expect(item?.quantity).toBe(5);
  });

  it('unknown item triggers SRD lookup', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.update_inventory('Healing Potion', 'add', 1);

    expect(result.success).toBe(true);
    const item = char.inventory.find(i => i.name === 'Healing Potion');
    expect(item).toBeDefined();
    expect(item?.type).toBeDefined();
  });

  it('auto-deducts currency when cost_gp is specified', async () => {
    const char = makeCharacter();
    const prevGp = char.currency.gp;
    server.joinParty(char);

    const result = await server.update_inventory('Potion of Healing', 'add', 1, undefined, 'hero-1', 'potion', 'common', 'A potion', undefined, undefined, 5);

    expect(result.success).toBe(true);
    expect(char.currency.gp).toBe(prevGp - 5);
  });

  it('crafts an item from recipe ingredients', async () => {
    const char = makeCharacter({
      inventory: [
        { name: 'Herbalism kit', quantity: 1, type: 'gear' },
        { name: 'Alchemist supplies', quantity: 1, type: 'gear' },
      ],
    });
    server.joinParty(char);

    const result = await server.update_inventory('Potion of Healing', 'add', 1, undefined, 'hero-1', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/missing ingredient|no recipe/i);
  });

  it('equips and unequips an item', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    await server.update_inventory('Helmet', 'add', 1, undefined, 'hero-1', 'armor', 'common', 'A helmet', undefined, true);
    const helmet = char.inventory.find(i => i.name === 'Helmet');
    expect(helmet).toBeDefined();
    expect(helmet?.equipped).toBe(true);

    const result = await server.update_inventory('Helmet', 'edit', 1, undefined, 'hero-1', undefined, undefined, undefined, undefined, false);
    expect(result.success).toBe(true);
    const helmetAfter = char.inventory.find(i => i.name === 'Helmet');
    expect(helmetAfter).toBeDefined();
    expect(helmetAfter?.equipped).toBe(false);
  });

  it('insufficient funds fails and inventory unchanged', async () => {
    const char = makeCharacter({ currency: { gp: 1, sp: 0, cp: 0 } });
    const invBefore = [...char.inventory];
    server.joinParty(char);

    const result = await server.update_inventory('Expensive Item', 'add', 1, undefined, 'hero-1', 'gear', 'common', 'An expensive item', undefined, undefined, 999);

    expect(result.success).toBe(false);
    expect(char.inventory).toEqual(invBefore);
  });
});

describe('adjust_currency', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    vi.useFakeTimers();
    server = new MockMCPServer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds GP to character', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const prev = char.currency.gp;

    const result = await server.adjust_currency(100, 0, 0);

    expect(result.success).toBe(true);
    expect(char.currency.gp).toBe(prev + 100);
  });

  it('subtracts GP from character', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const prev = char.currency.gp;

    const result = await server.adjust_currency(-5, 0, 0);

    expect(result.success).toBe(true);
    expect(char.currency.gp).toBe(prev - 5);
  });

  it('insufficient funds returns fail', async () => {
    const char = makeCharacter({ currency: { gp: 5, sp: 0, cp: 0 } });
    server.joinParty(char);

    const result = await server.adjust_currency(-999, 0, 0);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/insufficient funds/i);
  });

  it('dedup window blocks same adjustment within 500ms', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    await server.adjust_currency(50, 0, 0);
    const result = await server.adjust_currency(50, 0, 0);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/duplicate/i);
  });

  it('negative clamp prevents going below 0', async () => {
    const char = makeCharacter({ currency: { gp: 0, sp: 0, cp: 0 } });
    server.joinParty(char);

    const result = await server.adjust_currency(-10, 0, 0);

    expect(result.success).toBe(false);
  });

  it('zero operation is a no-op', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const prev = { ...char.currency };

    const result = await server.adjust_currency(0, 0, 0);

    expect(result.success).toBe(true);
    expect(char.currency).toEqual(prev);
  });
});
