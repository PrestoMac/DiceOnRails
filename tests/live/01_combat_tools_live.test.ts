import { runLiveTest, assert } from './helpers/liveRunner';
import { makeCharacter } from '../helpers/characters';
import { expect } from 'vitest';

runLiveTest('Start combat', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);

  const addResult = await server.add_enemy('Goblin');
  assert(addResult.success, `add_enemy failed: ${addResult.message}`);

  const startResult = await server.start_combat();
  assert(startResult.success, `start_combat failed: ${startResult.message}`);
  assert(server.getFullState().combat?.isActive === true, 'Combat should be active');
});

runLiveTest('End combat', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);
  await server.add_enemy('Goblin');
  await server.start_combat();
  assert(server.getFullState().combat?.isActive === true, 'Combat should be active before ending');

  const endResult = await server.end_combat();
  assert(endResult.success, `end_combat failed: ${endResult.message}`);
  assert(server.getFullState().combat === undefined, 'Combat should be cleared after ending');
});

runLiveTest('Save vs trap', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);

  const saveResult = await server.make_save('hero-1', 'dexterity', 14);
  assert(saveResult.success, `make_save failed: ${saveResult.message}`);
  assert(saveResult.data.stat === 'DEX', 'Save stat should be DEX');
  assert(saveResult.data.dc === 14, 'Save DC should be 14');
});

runLiveTest('Death save', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter({ hp: { current: 0, max: 12 } });
  server.joinParty(hero);

  const dsResult = await server.roll_death_save('hero-1');
  assert(dsResult.success, `roll_death_save failed: ${dsResult.message}`);
  assert(dsResult.data.deathSaves !== undefined, 'Death save result should include deathSaves');
});

runLiveTest('Damage trap', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);
  const hpBefore = hero.hp.current;

  const dmgResult = await server.inflict_damage(5, 'hero-1', 'piercing');
  assert(dmgResult.success, `inflict_damage failed: ${dmgResult.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.hp.current != null && charAfter.hp.current < hpBefore, 'HP should be reduced after damage');
  assert(charAfter?.hp.current != null && charAfter.hp.current === hpBefore - 5, 'HP should be reduced by exactly 5');
});
