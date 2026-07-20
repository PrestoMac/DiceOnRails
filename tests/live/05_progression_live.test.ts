import { runLiveTest, createLiveContext, assert } from './helpers/liveRunner';
import { makeCharacter, makeBarbarian } from '../helpers/characters';
import { expect } from 'vitest';

runLiveTest('Award experience increases XP', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter();
  server.joinParty(hero);
  const xpBefore = hero.experience;

  const result = server.awardExperience(300, 'hero-1');
  assert(result.success, `awardExperience failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.experience != null && charAfter.experience > xpBefore, `XP should increase (${xpBefore} -> ${charAfter?.experience})`);
});

runLiveTest('Level up increases character level', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter({ experience: 900, experienceToNextLevel: 1200, level: 3, hitDice: { current: 3, max: 3 } });
  server.joinParty(hero);
  const levelBefore = hero.level;

  const xpResult = server.awardExperience(2000, 'hero-1');
  assert(xpResult.success, `awardExperience failed: ${xpResult.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.level != null && charAfter.level > levelBefore, `Character level should increase (${levelBefore} -> ${charAfter?.level})`);
  assert(charAfter?.unusedStatPoints != null && charAfter.unusedStatPoints > 0, 'Character should have stat points after level up');
});

runLiveTest('Barbarian rage sets raging flag and decrements resource', async (ctx) => {
  const { server } = ctx;
  const barb = makeBarbarian();
  server.joinParty(barb);
  const rageResource = barb.resources.find(r => r.id === 'rage');
  expect(rageResource).toBeDefined();
  const rageResourceBefore = rageResource?.current;

  const result = await server.use_resource('barb-1', 'rage');
  assert(result.success, `use_resource rage failed: ${result.message}`);

  const charAfter = server.getTarget('barb-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.raging === true, 'Barbarian should have raging=true');
  const rageAfter = charAfter?.resources.find(r => r.id === 'rage');
  expect(rageAfter).toBeDefined();
  assert(rageAfter?.current != null && rageAfter.current < rageResourceBefore, 'Rage resource should be decremented');
});

runLiveTest('Short rest restores short-rest resources', async (ctx) => {
  const { server } = ctx;
  const cleric = makeCharacter({
    id: 'cleric-short',
    name: 'Aria',
    class: 'cleric',
    resources: [
      { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'cleric' },
      { id: 'channel-divinity', name: 'Channel Divinity', current: 0, max: 1, resetOn: 'short', source: 'class', sourceId: 'cleric' },
    ],
  });
  server.joinParty(cleric);

  const result = await server.short_rest();
  assert(result.success, `short_rest failed: ${result.message}`);

  const charAfter = server.getTarget('cleric-short');
  expect(charAfter).toBeDefined();
  const cdAfter = charAfter?.resources.find(r => r.id === 'channel-divinity');
  expect(cdAfter).toBeDefined();
  assert(cdAfter?.current === cdAfter?.max, 'Channel Divinity should restore to max after short rest');
});

runLiveTest('Long rest fully recovers character', async (ctx) => {
  const { server } = ctx;
  const hero = makeCharacter({ hp: { current: 1, max: 12 } });
  server.joinParty(hero);

  const result = await server.long_rest();
  assert(result.success, `long_rest failed: ${result.message}`);

  const charAfter = server.getTarget('hero-1');
  expect(charAfter).toBeDefined();
  assert(charAfter?.hp.current === charAfter?.hp.max, 'HP should be fully restored after long rest');
});
