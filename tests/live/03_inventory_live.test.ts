import { runLiveTest, createLiveContext, assert } from './helpers/liveRunner';
import { makeCharacter } from '../helpers/characters';
import { expect } from 'vitest';

runLiveTest('Buy potion deducts gold and adds item', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);
  const gpBefore = hero.currency.gp;

  const result = await server.update_inventory('Potion of Healing', 'add', 1, undefined, 'hero-1', 'potion', undefined, undefined, undefined, undefined, 5);
  assert(result.success, `buy potion failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.currency.gp === gpBefore - 5, `GP should decrease by 5 (${gpBefore} -> ${charAfter?.currency.gp})`);
  const potion = charAfter?.inventory.find(i => i.name.toLowerCase().includes('potion'));
  assert(!!potion, 'Potion should be in inventory');
});

runLiveTest('Drink potion removes it from inventory', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  hero.inventory.push({ name: 'Potion of Healing', quantity: 1, type: 'potion' });
  server.joinParty(hero);

  const result = await server.update_inventory('Potion of Healing', 'remove', 1, undefined, 'hero-1');
  assert(result.success, `drink potion failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  const potion = charAfter?.inventory.find(i => i.name.toLowerCase().includes('potion'));
  assert(!potion, 'Potion should be removed from inventory');
});

runLiveTest('Sell item grants gold and removes item', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);
  const gpBefore = hero.currency.gp;
  const hasLongsword = hero.inventory.some(i => i.name === 'Longsword');
  assert(hasLongsword, 'Character should start with a Longsword');

  const result = await server.update_inventory('Longsword', 'remove', 1, undefined, 'hero-1', undefined, undefined, undefined, undefined, undefined, 10);
  assert(result.success, `sell longsword failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.currency.gp === gpBefore + 10, `GP should increase by 10 (${gpBefore} -> ${charAfter?.currency.gp})`);
  const sword = charAfter?.inventory.find(i => i.name === 'Longsword');
  assert(!sword, 'Longsword should be removed from inventory');
});

runLiveTest('Find treasure increases GP', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);
  const gpBefore = hero.currency.gp;

  const result = await server.adjust_currency(50, 0, 0, 'hero-1');
  assert(result.success, `adjust_currency failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.currency.gp === gpBefore + 50, `GP should increase by 50 (${gpBefore} -> ${charAfter?.currency.gp})`);
});
