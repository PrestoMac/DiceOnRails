import { runLiveTest, createLiveContext, assert } from './helpers/liveRunner';
import { makeCharacter, makeWizard, makeCleric } from '../helpers/characters';
import { expect } from 'vitest';

runLiveTest('Cast fireball at 3rd level', async (ctx) => {
  const { server } = ctx;
  const wizard = makeWizard();
  server.joinParty(wizard);
  await server.add_enemy('Goblin');
  await server.start_combat();

  const goblinId = server.getFullState().combat?.enemies[0]?.id;
  assert(!!goblinId, 'Goblin should be in combat');
  const goblinHpBefore = server.getFullState().combat?.enemies[0]?.hp?.current;
  const wizardTarget = server.getTarget('wizard-1');
  expect(wizardTarget).toBeDefined();
  const slot3 = wizardTarget?.resources.find(r => r.id === 'spell-slot-3');
  expect(slot3).toBeDefined();
  const slot3Before = slot3?.current;

  const result = await server.cast_spell('wizard-1', 'fireball', 3, [goblinId]);
  assert(result.success, `cast_spell fireball failed: ${result.message}`);

  const wizardAfter = server.getTarget('wizard-1');
  expect(wizardAfter).toBeDefined();
  const slot3After = wizardAfter?.resources.find(r => r.id === 'spell-slot-3');
  expect(slot3After).toBeDefined();
  assert(slot3After?.current === slot3Before - 1, 'Level 3 slot should be consumed');

  const goblinAfter = server.getFullState().combat?.enemies[0];
  if (goblinAfter) {
    assert(goblinAfter.hp.current < goblinHpBefore, 'Goblin HP should be reduced by fireball');
  }
});

runLiveTest('Cure Wounds heals', async (ctx) => {
  const { server } = ctx;
  const cleric = makeCleric();
  cleric.hp.current = 10;
  server.joinParty(cleric);

  const slot1 = cleric.resources.find(r => r.id === 'spell-slot-1');
  expect(slot1).toBeDefined();
  const slot1Before = slot1?.current;

  const result = await server.cast_spell('cleric-1', 'cure-wounds', 1, ['cleric-1']);
  assert(result.success, `cast_spell cure-wounds failed: ${result.message}`);

  const clericAfter = server.getTarget('cleric-1');
  expect(clericAfter).toBeDefined();
  const slot1After = clericAfter?.resources.find(r => r.id === 'spell-slot-1');
  expect(slot1After).toBeDefined();
  assert(slot1After?.current === slot1Before - 1, 'Level 1 slot should be decremented');
  assert(clericAfter?.hp.current > 10, 'HP should increase after cure wounds');
});

runLiveTest('Counterspell consumes reaction and slot', async (ctx) => {
  const { server } = ctx;
  const wizard = makeWizard({
    reactionAvailable: true,
    reactionUsedThisTurn: false,
    knownSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'counterspell'],
    preparedSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'counterspell'],
  });

  const slot3 = wizard.resources.find(r => r.id === 'spell-slot-3');
  expect(slot3).toBeDefined();
  const slot3Before = slot3?.current;

  server.joinParty(wizard);

  const result = await server.cast_spell('wizard-1', 'counterspell', 3, [], undefined, true);
  assert(result.success, `cast_spell counterspell failed: ${result.message}`);

  const wizardAfter = server.getTarget('wizard-1');
  expect(wizardAfter).toBeDefined();
  const slot3After = wizardAfter?.resources.find(r => r.id === 'spell-slot-3');
  expect(slot3After).toBeDefined();
  assert(slot3After?.current === slot3Before - 1, 'Level 3 slot should be consumed by counterspell');
});

runLiveTest('Cantrip does not consume slot', async (ctx) => {
  const { server } = ctx;
  const wizard = makeWizard();
  server.joinParty(wizard);
  await server.add_enemy('Goblin');
  await server.start_combat();

  const goblinId = server.getFullState().combat?.enemies[0]?.id;
  assert(!!goblinId, 'Goblin should be in combat');

  const wizardBefore = server.getTarget('wizard-1');
  expect(wizardBefore).toBeDefined();
  const slot1 = wizardBefore?.resources.find(r => r.id === 'spell-slot-1');
  expect(slot1).toBeDefined();
  const slot1Before = slot1?.current;

  const result = await server.cast_spell('wizard-1', 'fire-bolt', 0, [goblinId]);
  assert(result.success, `cast_spell fire-bolt failed: ${result.message}`);

  const wizardAfter = server.getTarget('wizard-1');
  expect(wizardAfter).toBeDefined();
  const slot1After = wizardAfter?.resources.find(r => r.id === 'spell-slot-1');
  expect(slot1After).toBeDefined();
  assert(slot1After?.current === slot1Before, 'Spell slot should not change after cantrip');
});
