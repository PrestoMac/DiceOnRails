import { runLiveTest, createLiveContext, assert } from './helpers/liveRunner';
import { makeCharacter } from '../helpers/characters';
import { expect } from 'vitest';

runLiveTest('Move to new location', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);

  const result = await server.move_to('Ancient Library', 'A dusty library filled with old tomes.', 'hero-1');
  assert(result.success, `move_to failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.location === 'Ancient Library', `Location should be Ancient Library (got: ${charAfter?.location})`);
});

runLiveTest('Search area resolves skill check', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);

  const result = await server.move_to('Treasure Vault', 'A locked vault with a glittering chest.', 'hero-1', { skill_name: 'perception', difficulty: 12 });
  assert(result.success, `move_to with skill check failed: ${result.message}`);
  assert(result.data.locationChanged !== false, 'Movement should succeed or fail gracefully');
});

runLiveTest('Persuade guard resolves skill check', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);

  const result = await server.move_to('Keep Gates', 'The guard blocks your path.', 'hero-1', { skill_name: 'persuasion', difficulty: 15 });
  assert(result.success, `move_to with persuasion failed: ${result.message}`);
});

runLiveTest('Move and search in sequence', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);

  const moveResult = await server.move_to('Library', 'Rows of bookshelves stretch before you.', 'hero-1');
  assert(moveResult.success, `first move_to failed: ${moveResult.message}`);
  let charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.location === 'Library', 'Location should be Library after first move');

  const searchResult = await server.move_to('Library', 'You search the shelves for hidden passages.', 'hero-1', { skill_name: 'investigation', difficulty: 12 });
  assert(searchResult.success, `search move_to failed: ${searchResult.message}`);
  charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.location === 'Library', 'Location should remain Library after search');
});
