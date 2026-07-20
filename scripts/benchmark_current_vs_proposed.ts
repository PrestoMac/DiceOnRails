import 'dotenv/config';

(globalThis as any).import = { meta: { env: process.env } };

import { MockMCPServer } from '../services/mcpService';
import { Character, MCPResponse } from '../types';
import { tools as CURRENT_TOOLS, TOOL_MODE_INSTRUCTION } from '../services/llm/toolDefinitions';
import { SYSTEM_INSTRUCTION, PROGRESSION_SYSTEM_PROMPT } from '../constants';


const API_KEY = process.env.API_KEY || process.env.VITE_LLM_API_KEY || '';
const API_BASE = (process.env.API_BASE || process.env.VITE_LLM_API_BASE || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '');
const RAW_MODEL = process.env.MODEL || process.env.VITE_LLM_MODEL || 'deepseek/deepseek-v4-flash';

const MODEL = API_BASE.includes('openrouter.ai') ? RAW_MODEL : (RAW_MODEL.split('/').pop() || RAW_MODEL);
const MAX_ITERS_CURRENT = 20;
const MAX_ITERS_PROPOSED = 8;

if (!API_KEY) { console.error('❌ Set API_KEY or VITE_LLM_API_KEY'); process.exit(1); }

function compact(msg: string, max = 80): string {
  return msg.length <= max ? msg : msg.substring(0, max - 3) + '...';
}


function makeCharacter(overrides: Partial<Character> = {}): Character {
  const c: Character = {
    id: 'player-1', name: 'Valerius', class: 'Paladin', race: 'Human', level: 3,
    hp: { current: 25, max: 25 },
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
    inventory: [
      { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8', damageType: 'slashing', properties: ['versatile (1d10)'] }, equipped: true },
      { name: 'Shield', quantity: 1, type: 'shield', stats: { acBonus: 2 }, equipped: true },
      { name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' }, equipped: true },
    ],
    currency: { gp: 15, sp: 5, cp: 0 },
    location: 'The Rusty Tankard', experience: 0, experienceToNextLevel: 300,
    unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 3, max: 3 },
    skills: { religion: 1, persuasion: 1 }, unusedSkillPoints: 0,
    resources: [],
    knownSpells: [], preparedSpells: [],
    ...overrides,
  };
  return c;
}

function makeWizard(): Character {
  return makeCharacter({
    name: 'Merlin', class: 'Wizard', level: 5,
    hp: { current: 22, max: 22 },
    stats: { str: 8, dex: 12, con: 12, int: 18, wis: 12, cha: 10 },
    inventory: [
      { name: 'Quarterstaff', quantity: 1, type: 'weapon', stats: { damage: '1d6', damageType: 'bludgeoning', properties: ['versatile (1d8)'] }, equipped: true },
    ],
    resources: [
      { id: 'spell-slot-1', name: 'L1 Slots', current: 4, max: 4, resetOn: 'long' as const },
      { id: 'spell-slot-2', name: 'L2 Slots', current: 3, max: 3, resetOn: 'long' as const },
      { id: 'spell-slot-3', name: 'L3 Slots', current: 2, max: 2, resetOn: 'long' as const },
    ],
    knownSpells: ['fireball', 'magic-missile', 'shield', 'detect-magic', 'mage-armor'],
    preparedSpells: ['fireball', 'magic-missile', 'shield', 'detect-magic'],
  });
}

function makeInjuredCharacter(): Character {
  return makeCharacter({
    hp: { current: 4, max: 25 },
    inventory: [
      { name: 'Healing Potion', quantity: 1, type: 'potion', stats: { healing: '2d4+2' } },
      { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8', damageType: 'slashing', properties: ['versatile (1d10)'] }, equipped: true },
      { name: 'Shield', quantity: 1, type: 'shield', stats: { acBonus: 2 }, equipped: true },
      { name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' }, equipped: true },
    ],
  });
}


interface Scenario {
  name: string;
  input: string;
  setup: (s: MockMCPServer) => void;
  expected: string[];
  optional: string[];
  validate: (s: MockMCPServer) => { pass: boolean; detail: string };
}

const SCENARIOS: Scenario[] = [
  {
    name: '1. Attack goblin',
    input: 'I draw my sword and attack the goblin!',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = 'A dark cave. A goblin (AC 15, 7 HP) stands ready, scimitar drawn.';
    },
    expected: ['player_attack'],
    optional: ['start_combat', 'add_enemy', 'next_turn', 'narrate_turn'],
    validate: (s) => {
      const c = (s as any).state.combat;
      return { pass: true, detail: c ? `${c.enemies.length} enemies` : 'no combat' };
    },
  },
  {
    name: '2. Cast fireball',
    input: 'I cast Fireball at the group of goblins!',
    setup: (s) => {
      s.setCharacter(makeWizard());
      s.add_enemy('Goblin', 15, 7);
      s.add_enemy('Goblin', 15, 7);
      s.add_enemy('Hobgoblin', 18, 18);
      (s as any).state.worldDescription = 'A cave opening. Three goblinoids stand together.';
    },
    expected: ['cast_spell'],
    optional: ['start_combat', 'next_turn', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '3. Search bodies',
    input: 'I search the fallen goblins for anything useful.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = 'Cave floor littered with goblin corpses.';
    },
    expected: ['check_skill'],
    optional: ['update_inventory', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '4. End combat + loot',
    input: 'Combat is over. I loot the bodies and catch my breath.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      s.add_enemy('Goblin', 15, 7);
      (s as any).state.combat = {
        isActive: true, enemies: [{ name: 'Goblin', hp: { current: 0, max: 7 }, ac: 15, isDead: true }],
        initiative: [{ name: 'Valerius', type: 'player', initiative: 18 }, { name: 'Goblin', type: 'enemy', initiative: 10 }],
        turnIndex: 0, round: 1,
      };
    },
    expected: ['end_combat'],
    optional: ['award_experience', 'update_inventory', 'narrate_turn', 'adjust_currency', 'roll_dice', 'check_skill'],
    validate: (s) => {
      const combat = (s as any).state.combat;
      return { pass: !combat?.isActive, detail: combat?.isActive ? 'combat still active' : 'combat ended' };
    },
  },
  {
    name: '5. Move to location',
    input: 'I go to the ancient library to the north.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = "Entrance of a vast complex. 'Archives — Library' to the north.";
    },
    expected: ['move_to'],
    optional: ['narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '6. Move + search',
    input: 'I carefully enter the library and look around for traps.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = "Entrance of a vast complex. 'Archives — Library' to the north.";
    },
    expected: ['move_to', 'check_skill'],
    optional: ['narrate_turn', 'award_experience', 'log_lore'],
    validate: (s) => {
      const c = s.getTarget('player-1')!;
      return { pass: !!c.location && c.location.toLowerCase().includes('library'), detail: c.location };
    },
  },
  {
    name: '7. Persuade guard',
    input: 'I try to persuade the city guard to let me pass into the restricted district.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = "City gate. A stern guard blocks the entrance to the upper district.";
    },
    expected: ['check_skill'],
    optional: ['narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '8. Buy potion',
    input: 'I buy a healing potion for 5 gold pieces.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = "A potion shop. '5 gold each,' says the shopkeeper.";
    },
    expected: ['update_inventory'],
    optional: ['adjust_currency', 'narrate_turn'],
    validate: (s) => {
      const c = s.getTarget('player-1')!;
      const has = c.inventory.some(i => i.name.toLowerCase().includes('potion'));
      return { pass: has, detail: `potion:${has} gp:${c.currency.gp}` };
    },
  },
  {
    name: '9. Sell item',
    input: 'I want to sell my old shortsword to the blacksmith.',
    setup: (s) => {
      s.setCharacter(makeCharacter({
        inventory: [
          ...makeCharacter().inventory,
          { name: 'Shortsword', quantity: 1, type: 'weapon', stats: { damage: '1d6', damageType: 'piercing' } },
        ],
      }));
      (s as any).state.worldDescription = 'A bustling blacksmith shop. Anvils ring with hammer strikes.';
    },
    expected: ['update_inventory'],
    optional: ['adjust_currency', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '10. Loot gold',
    input: 'I take the gold coins from the trapped chest.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = 'A dusty chamber. An ornate chest sits against the far wall.';
    },
    expected: ['update_inventory'],
    optional: ['adjust_currency', 'check_skill', 'narrate_turn', 'inflict_damage', 'make_save', 'roll_dice'],
    validate: (s) => {
      
      const c = s.getTarget('player-1')!;
      const hasLongsword = c.inventory.some(i => i.name.toLowerCase().includes('longsword'));
      return { pass: true, detail: `inv:${c.inventory.length} items` };
    },
  },
  {
    name: '11. Accept quest',
    input: 'I accept the quest to clear out the ruins of Thornwall Keep.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = "The village elder's cottage. A map of the region is spread on the table.";
    },
    expected: ['upsert_quest'],
    optional: ['narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '12. Recall lore',
    input: 'I try to recall what I know about the ancient dragon cult.',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = 'A library filled with ancient tomes and scrolls.';
    },
    expected: ['check_skill'],
    optional: ['log_lore', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '13. Short rest',
    input: 'I take a short rest to catch my breath and recover.',
    setup: (s) => {
      s.setCharacter(makeInjuredCharacter());
      (s as any).state.worldDescription = 'A safe alcove within the dungeon.';
    },
    expected: ['short_rest'],
    optional: ['take_rest', 'long_rest', 'narrate_turn'],
    validate: (s) => {
      const c = s.getTarget('player-1')!;
      return { pass: true, detail: c.hp.current > 4 ? `healed to ${c.hp.current}` : `no heal (${c.hp.current}/25)` };
    },
  },
  {
    name: '14. Drink potion',
    input: 'I drink my healing potion to recover from my wounds.',
    setup: (s) => {
      s.setCharacter(makeInjuredCharacter());
      (s as any).state.worldDescription = 'Blood drips from your wounds after battle.';
    },
    expected: ['update_inventory'],
    optional: ['narrate_turn', 'roll_dice'],
    validate: (s) => {
      const c = s.getTarget('player-1')!;
      const still = c.inventory.some(i => i.name.toLowerCase().includes('potion'));
      return { pass: !still, detail: still ? `potion still present (${c.hp.current}/25)` : `potion consumed (${c.hp.current}/25)` };
    },
  },
  {
    name: '15. Level up',
    input: 'I feel stronger after that battle! I want to level up and invest in my abilities.',
    setup: (s) => {
      const char = makeCharacter();
      char.experience = 1000;
      char.experienceToNextLevel = 900;
      char.unusedStatPoints = 2;
      char.unusedSkillPoints = 2;
      
      char.knownSpells = ['bless', 'cure-wounds'];
      char.preparedSpells = ['bless'];
      s.setCharacter(char);
      (s as any).state.worldDescription = 'After the battle, a moment of peace.';
    },
    expected: ['level_up'],
    optional: ['manage_spellbook', 'narrate_turn', 'award_experience'],
    validate: (s) => {
      const c = s.getTarget('player-1')!;
      return { pass: c.unusedStatPoints === 0, detail: c.unusedStatPoints > 0 ? `stats unspent:${c.unusedStatPoints}` : 'levelled up' };
    },
  },
  {
    name: '16. Ritual cast',
    input: 'I cast Detect Magic as a ritual to check the entire room for enchantments.',
    setup: (s) => {
      s.setCharacter(makeWizard());
      (s as any).state.worldDescription = 'A chamber filled with mysterious artifacts.';
    },
    expected: [],
    optional: ['cast_spell', 'cast_ritual', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '17. Death save',
    input: 'I failed my save and I feel the darkness closing in... making a death save.',
    setup: (s) => {
      const char = makeCharacter();
      char.hp.current = 0;
      s.setCharacter(char);
      (s as any).state.worldDescription = 'Everything goes dark...';
    },
    expected: ['roll_death_save'],
    optional: ['make_save', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '18. Counterspell',
    input: 'The enemy mage starts casting Fireball! I quickly cast Counterspell!',
    setup: (s) => {
      s.setCharacter(makeWizard());
      s.add_enemy('Evil Mage', 15, 40);
      (s as any).state.combat = {
        isActive: true,
        enemies: [{ name: 'Evil Mage', hp: { current: 40, max: 40 }, ac: 15, isDead: false }],
        initiative: [{ name: 'Evil Mage', type: 'enemy', initiative: 20 }, { name: 'Merlin', type: 'player', initiative: 12 }],
        turnIndex: 0, round: 1,
      };
      (s as any).state.worldDescription = 'A magical duel in the heart of the ruined temple.';
    },
    expected: ['cast_spell'],
    optional: ['spell_effect', 'next_turn', 'narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
  {
    name: '19. Award XP',
    input: 'We finally defeated the hobgoblin chieftain! That was a hard fight.',
    setup: (s) => {
      const char = makeCharacter();
      char.experience = 100;
      s.setCharacter(char);
      (s as any).state.worldDescription = 'The hobgoblin chieftain lies dead at your feet.';
    },
    expected: ['award_experience'],
    optional: ['end_combat', 'narrate_turn', 'adjust_currency', 'update_inventory'],
    validate: (s) => {
      const c = s.getTarget('player-1')!;
      return { pass: c.experience > 100, detail: `XP: ${c.experience}` };
    },
  },
  {
    name: '20. Simple greeting',
    input: 'Hello there, tavern keeper! How are you doing today?',
    setup: (s) => {
      s.setCharacter(makeCharacter());
      (s as any).state.worldDescription = 'The Rusty Tankard tavern. Warm fire, good ale.';
    },
    expected: [],
    optional: ['narrate_turn'],
    validate: (s) => ({ pass: true, detail: '' }),
  },
];


const CURRENT_INSTRUCTION = `${SYSTEM_INSTRUCTION}\n\n${PROGRESSION_SYSTEM_PROMPT}\n\n=== TOOL MODE ===\n${TOOL_MODE_INSTRUCTION}`;

function currentExecTool(s: MockMCPServer, name: string, args: Record<string, any>): Promise<MCPResponse> {
  switch (name) {
    case 'roll_dice': return s.roll_dice(Number(args.sides) || 20, Number(args.count) || 1, Number(args.modifier) || 0, args.target_ac !== undefined ? Number(args.target_ac) : undefined, args.target_name as string, args.roll_label as string, args.isDamageRoll as boolean, args.isOffHand as boolean, args.weaponName as string, args.attackerId as string);
    case 'add_enemy': return s.add_enemy(String(args.name || ''), args.ac !== undefined ? Number(args.ac) : undefined, args.hp !== undefined ? Number(args.hp) : undefined, undefined, args.cr !== undefined ? Number(args.cr) : undefined, args.xp !== undefined ? Number(args.xp) : undefined);
    case 'start_combat': return s.start_combat(args.targetId as string, args.enemies as any);
    case 'next_turn': return s.next_turn();
    case 'end_combat': return s.end_combat();
    case 'player_attack': return s.player_attack(String(args.attackerId || ''), String(args.weaponName || ''), String(args.targetId || ''), args.isOffHand as boolean, args.isSneakAttack as boolean, args.sharpshooter as boolean, args.greatWeaponMaster as boolean);
    case 'cast_spell': {
      let targets = (args.targets as string[]) || [];
      if (targets.length === 0 && args.targetId) targets = [String(args.targetId)];
      return s.cast_spell(String(args.casterId || args.characterId || ''), String(args.spellId || ''), Number(args.slotLevel || 0), targets, undefined, args.reaction as boolean);
    }
    case 'cast_ritual': return s.cast_ritual(String(args.casterId || args.characterId || ''), String(args.spellId || ''));
    case 'spell_effect': return s.spell_effect(String(args.mode || 'counter') as 'counter' | 'dispel', String(args.casterId || ''), Number(args.targetSpellLevel || 3), args.targetId as string);
    case 'make_save': return s.make_save(String(args.targetId || ''), String(args.stat || 'dex'), Number(args.dc || 10));
    case 'roll_death_save': return s.roll_death_save(String(args.targetId || ''));
    case 'check_skill': return s.check_skill(String(args.skill_name || ''), Number(args.difficulty || 10), args.targetId as string, args.onSuccess as any);
    case 'update_inventory': return s.update_inventory(String(args.item_name || ''), String(args.action || 'add') as any, Number(args.quantity || 1), args.new_name as string, args.targetId as string, args.type as any, args.rarity as any, args.description as string, args.stats as any, args.equipped as boolean, args.cost_gp as number, args.cost_sp as number, args.cost_cp as number, args.autoDeductMarketPrice as boolean, args.craft as boolean);
    case 'adjust_currency': return s.adjust_currency(Number(args.gp || 0), Number(args.sp || 0), Number(args.cp || 0), args.targetId as string);
    case 'inflict_damage': return s.inflict_damage(Number(args.amount || 0), (args.targetId || args.target_name) as string, args.damageType as string);
    case 'move_to': return s.move_to(String(args.location_name || 'Unknown'), String(args.description || ''), args.targetId as string, args.skillCheck as any, args.route as string, args.pace as string);
    case 'upsert_quest': return s.upsert_quest(String(args.title || ''), String(args.description || ''), String(args.status || 'active') as any, args.reputationChanges as Array<{ faction: string; delta: number }> | undefined);
    case 'log_lore': return s.log_lore(String(args.title || ''), String(args.content || ''), String(args.category || 'History') as any);
    case 'award_experience': return s.awardExperience(Number(args.amount || 0), args.targetId as string);
    case 'short_rest': return s.short_rest(args.targetId as string, args.narration as string, args.autoAdvanceTime as boolean);
    case 'long_rest': return s.long_rest(args.narration as string, args.autoAdvanceTime as boolean);
    case 'level_up': return Promise.resolve(s.allocateStatPoints((args.stats || {}) as any, args.targetId as string, (args.skills || {}) as Record<string, number>, Number(args.hpDeviation || 0)));
    case 'use_resource': return s.use_resource(String(args.characterId || args.targetId || ''), String(args.resourceId || ''), args.targetId as string, args.amount as number);
    case 'manage_spellbook': return s.manage_spellbook(String(args.characterId || args.targetId || ''), String(args.action || 'learn') as any, String(args.spellId || ''));
    case 'summon_creature': return s.summon_creature(String(args.casterId || ''), String(args.creatureName || args.template || ''), Number(args.count || 1));
    case 'teleport_creature': return s.teleport_creature(String(args.characterId || args.targetId || ''), String(args.destination || ''), Number(args.range || 30));
    case 'polymorph_creature': return s.polymorph_creature(String(args.characterId || args.targetId || ''), String(args.newForm || args.beastForm || 'wolf'), Number(args.duration || 60));
    case 'narrate_turn': return s.narrate_turn(String(args.narration || ''), Number(args.timePassed || 0));
    default: return Promise.resolve({ success: false, data: {}, message: `Unknown: ${name}` });
  }
}


const PROPOSED_TOOLS = [
  { type: "function", function: { name: 'roll_dice', description: 'Roll dice for saving throws, ability checks, or generic checks. NEVER for weapon attacks (use player_attack) or spells (use cast_spell).', parameters: { type: 'object', properties: { sides: { type: 'integer', description: 'Number of sides' }, count: { type: 'integer' }, modifier: { type: 'integer' } }, required: ['sides'] } } },
  { type: "function", function: { name: 'start_combat', description: 'COMBAT. Registers enemies AND begins combat in ONE call. Always pass enemies[] array. Do NOT call add_enemy separately.', parameters: { type: 'object', properties: { enemies: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, ac: { type: 'integer' }, hp: { type: 'integer' }, cr: { type: 'number' } }, required: ['name'] }, description: 'All enemies to fight.' } }, required: ['enemies'] } } },
  { type: "function", function: { name: 'next_turn', description: 'COMBAT. Advances initiative. Enemy turns are auto-resolved. Call after each combatant acts.', parameters: { type: 'object', properties: {} } } },
  { type: "function", function: { name: 'end_combat', description: 'COMBAT. Ends combat. Optionally award XP and narrate outcome in one call.', parameters: { type: 'object', properties: { narration: { type: 'string', description: 'Vivid 2-3 sentence narration of the battle end.' }, xpAward: { type: 'object', description: 'Optional: Award XP immediately.', properties: { amount: { type: 'integer' } } }, timePassed: { type: 'integer', description: 'Minutes elapsed.' } }, required: ['narration'] } } },
  { type: "function", function: { name: 'player_attack', description: 'COMBAT. Player weapon attack. Rolls d20+hit and damage, applies automatically. Handles feats and bonus actions.', parameters: { type: 'object', properties: { attackerId: { type: 'string' }, weaponName: { type: 'string' }, targetId: { type: 'string' }, isOffHand: { type: 'boolean', description: 'Off-hand bonus attack.' }, isSneakAttack: { type: 'boolean' }, sharpshooter: { type: 'boolean' }, greatWeaponMaster: { type: 'boolean' }, advanceTurn: { type: 'boolean', description: 'Auto-advance initiative (call next_turn internally) after attack resolves.' }, narration: { type: 'string', description: '2-3 vivid sentences. Providing narration ends your turn.' }, timePassed: { type: 'integer' }, onKill: { type: 'object', description: 'Auto-fire when target dies.', properties: { awardExperience: { type: 'object', properties: { amount: { type: 'integer' } } }, logLore: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, category: { type: 'string', enum: ['NPC', 'Location', 'History', 'Item'] } } } } } }, required: ['attackerId', 'weaponName', 'targetId'] } } },
  { type: "function", function: { name: 'cast_spell', description: 'SPELLCASTING. Casts any spell by ID. Handles saves, attack rolls, concentration, and rituals. For Counterspell use mode="counter", for ritual use ritual=true. If you provide narration, this ends your turn.', parameters: { type: 'object', properties: { casterId: { type: 'string' }, spellId: { type: 'string' }, slotLevel: { type: 'integer' }, targets: { type: 'array', items: { type: 'string' }, description: 'Target names/IDs.' }, mode: { type: 'string', enum: ['normal', 'counter', 'dispel'], description: 'normal=standard casting, counter=Counterspell (reaction), dispel=Dispel Magic (action).' }, targetSpellLevel: { type: 'integer', description: 'For counter/dispel: the level of target spell (1-9).' }, ritual: { type: 'boolean', description: 'Ritual casting (10 min, no slot consumed). Provide narration to end turn.' }, reaction: { type: 'boolean' }, narration: { type: 'string', description: '2-3 vivid sentences. REQUIRED to end your turn if not calling narrate_turn separately.' }, timePassed: { type: 'integer', default: 0 } }, required: ['casterId', 'spellId'] } } },
  { type: "function", function: { name: 'make_save', description: 'SAVING THROWS vs traps, spells, poison, or death saves (saveType="death").', parameters: { type: 'object', properties: { targetId: { type: 'string' }, stat: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] }, dc: { type: 'integer' }, saveType: { type: 'string', enum: ['normal', 'death'], description: 'normal=standard save, death=death saving throw (d20, no stat, DC 10).', default: 'normal' } }, required: ['targetId'] } } },
  { type: "function", function: { name: 'check_skill', description: 'SKILL CHECKS. Use for persuasion, stealth, investigation, perception, lockpicking, knowledge recall (history/arcana/religion), searching, and looking for traps. Never use roll_dice for skills.', parameters: { type: 'object', properties: { skill_name: { type: 'string', enum: ['athletics', 'acrobatics', 'stealth', 'sleight of hand', 'arcana', 'history', 'investigation', 'nature', 'religion', 'animal handling', 'insight', 'medicine', 'perception', 'survival', 'deception', 'intimidation', 'performance', 'persuasion'] }, difficulty: { type: 'integer', description: 'DC 10=easy, 15=medium, 20=hard, 25=very hard' }, targetId: { type: 'string' }, onSuccess: { type: 'object', description: 'Bundle follow-up actions into one call: awardCurrency, logLore, upsertQuest, updateInventory.', properties: { awardCurrency: { type: 'object', properties: { gp: { type: 'integer' }, sp: { type: 'integer' }, cp: { type: 'integer' } } }, logLore: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, category: { type: 'string', enum: ['NPC', 'Location', 'History', 'Item'] } }, required: ['title', 'content', 'category'] }, upsertQuest: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['active', 'completed', 'failed'] } }, required: ['title', 'status'] }, updateInventory: { type: 'object', properties: { item_name: { type: 'string' }, quantity: { type: 'integer' } } } } } }, required: ['skill_name', 'difficulty'] } } },
  { type: "function", function: { name: 'update_inventory', description: 'INVENTORY. Buy/sell/drink/loot/drop items. For purchases, use cost_gp/cost_sp/cost_cp to auto-deduct currency — do NOT also call adjust_currency.', parameters: { type: 'object', properties: { item_name: { type: 'string' }, action: { type: 'string', enum: ['add', 'remove', 'edit'] }, quantity: { type: 'integer' }, type: { type: 'string', enum: ['weapon', 'armor', 'potion', 'shield', 'gear', 'other'] }, rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'very rare', 'legendary'] }, description: { type: 'string' }, stats: { type: 'object', description: 'Mechanical stats: damage, healing, acBonus, properties, etc.' }, equipped: { type: 'boolean' }, cost_gp: { type: 'integer', description: 'Gold to auto-deduct (handles purchase in one call).' }, cost_sp: { type: 'integer' }, cost_cp: { type: 'integer' } }, required: ['item_name', 'action'] } } },
  { type: "function", function: { name: 'adjust_currency', description: 'MANAGE MONEY standalone. For finding money, bribes, taxes. For item purchases, use update_inventory with cost_gp — it auto-deducts currency.', parameters: { type: 'object', properties: { gp: { type: 'integer' }, sp: { type: 'integer' }, cp: { type: 'integer' }, targetId: { type: 'string' } }, required: ['targetId'] } } },
  { type: "function", function: { name: 'inflict_damage', description: 'DAMAGE. Use for traps and environment only. NOT for weapon attacks (use player_attack) or spells (use cast_spell).', parameters: { type: 'object', properties: { amount: { type: 'integer' }, targetId: { type: 'string' }, damageType: { type: 'string', enum: ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'] } }, required: ['amount', 'targetId'] } } },
  { type: "function", function: { name: 'move_to', description: 'MOVEMENT. Move to a new location. COMBINE movement + search in one call by adding skillCheck to auto-search on arrival. Supports route travel with routes. Provide narration to end turn.', parameters: { type: 'object', properties: { location_name: { type: 'string', description: 'Destination location name.' }, description: { type: 'string' }, skillCheck: { type: 'object', description: 'COMBINE: Auto-search on arrival — eliminates a separate check_skill call.', properties: { skill_name: { type: 'string', enum: ['perception', 'investigation', 'stealth', 'survival'] }, difficulty: { type: 'integer' }, onSuccess: { type: 'object', description: 'Bundle follow-up actions on check success.', properties: { awardCurrency: { type: 'object', properties: { gp: { type: 'integer' }, sp: { type: 'integer' }, cp: { type: 'integer' } } }, logLore: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, category: { type: 'string', enum: ['NPC', 'Location', 'History', 'Item'] } }, required: ['title', 'content', 'category'] }, updateInventory: { type: 'object', properties: { item_name: { type: 'string' }, quantity: { type: 'integer' } } } } } }, required: ['skill_name', 'difficulty'] }, route: { type: 'string' }, pace: { type: 'string', enum: ['slow', 'normal', 'fast'] }, narration: { type: 'string', description: '2-3 vivid sentences. Providing narration ends your turn.' } }, required: ['location_name'] } } },
  { type: "function", function: { name: 'take_rest', description: 'REST. Short rest (60 min, spend Hit Dice to heal) or long rest (8 hours, full HP restore + half Hit Dice recovery). Always provide targetId and narration — this heals and ends your turn.', parameters: { type: 'object', properties: { targetId: { type: 'string', description: 'Character to rest. Use the party member name.' }, duration: { type: 'string', enum: ['short', 'long'], description: 'short=60min (spend 1+ HD to heal), long=480min (full heal + half max HD back)' }, narration: { type: 'string', description: 'Vivid narration of the rest. REQUIRED to advance time.' } }, required: ['duration', 'targetId', 'narration'] } } },
  { type: "function", function: { name: 'level_up', description: 'LEVEL UP. Allocate stats, skills, HP, and learn/prepare new spells in one call. Example: level_up(targetId="Valerius", stats={str:2,con:1}, skills={athletics:1}, learnSpells=["bless"]).', parameters: { type: 'object', properties: { targetId: { type: 'string', description: 'Character name or ID to level up.' }, stats: { type: 'object', description: 'Stat increases: e.g. {"str":2,"con":1}. Increase the stat directly — do NOT call adjust_currency or other tools.', properties: { str: { type: 'integer' }, dex: { type: 'integer' }, con: { type: 'integer' }, int: { type: 'integer' }, wis: { type: 'integer' }, cha: { type: 'integer' } } }, skills: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Skill proficiency increases: e.g. {"athletics":1,"perception":1}.' }, hpDeviation: { type: 'integer', description: 'HP roll adjustment from class hit die (0=average).' }, learnSpells: { type: 'array', items: { type: 'string' }, description: 'Spell IDs to learn (for known casters like Bard/Sorcerer/Warlock/Ranger). Example: ["bless","cure-wounds"].' }, prepareSpells: { type: 'array', items: { type: 'string' }, description: 'Spell IDs to prepare (for prepared casters like Cleric/Druid/Wizard).' } }, required: ['targetId'] } } },
  { type: "function", function: { name: 'use_resource', description: 'Use limited class resources: Rage, Ki, Second Wind, Action Surge, etc.', parameters: { type: 'object', properties: { targetId: { type: 'string' }, resourceId: { type: 'string' }, action: { type: 'string' } }, required: ['targetId', 'resourceId'] } } },
  { type: "function", function: { name: 'upsert_quest', description: 'Add or update a quest in the journal. Supports faction reputation changes.', parameters: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['active', 'completed', 'failed'] }, reputationChanges: { type: 'array', items: { type: 'object', properties: { faction: { type: 'string' }, delta: { type: 'integer' } }, required: ['faction', 'delta'] } } }, required: ['title', 'status'] } } },
  { type: "function", function: { name: 'log_lore', description: 'Record discovered lore: NPC, Location, History, or Item.', parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, category: { type: 'string', enum: ['NPC', 'Location', 'History', 'Item'] } }, required: ['title', 'content', 'category'] } } },
  { type: "function", function: { name: 'award_experience', description: 'Award XP when a challenge is overcome. Omit targetId to split among party.', parameters: { type: 'object', properties: { amount: { type: 'integer' }, targetId: { type: 'string' } }, required: ['amount'] } } },
  { type: "function", function: { name: 'summon_creature', description: 'Summon a creature to fight alongside the party. For non-spell summoning.', parameters: { type: 'object', properties: { casterId: { type: 'string' }, creatureName: { type: 'string' }, count: { type: 'integer' } }, required: ['casterId', 'creatureName'] } } },
  { type: "function", function: { name: 'teleport_creature', description: 'Teleport a creature to a new location.', parameters: { type: 'object', properties: { targetId: { type: 'string' }, destination: { type: 'string' } }, required: ['targetId', 'destination'] } } },
  { type: "function", function: { name: 'polymorph_creature', description: 'Polymorph a creature into a different form.', parameters: { type: 'object', properties: { targetId: { type: 'string' }, newForm: { type: 'string' }, duration: { type: 'integer' } }, required: ['targetId', 'newForm'] } } },
  { type: "function", function: { name: 'narrate_turn', description: 'END OF TURN. Narration + advance time. Use timePassed for how many minutes pass.', parameters: { type: 'object', properties: { narration: { type: 'string', description: '2-4 vivid, present-tense sentences.' }, timePassed: { type: 'integer', description: 'Minutes this action takes.' } }, required: ['narration'] } } },
];

const PROPOSED_INSTRUCTION = `You are a Game Engine for a fantasy RPG. Translate player intent into tool calls.

⛔ NEVER DO THESE (top 5 hallucinations to avoid):
1. NEVER call roll_dice for attacks → use player_attack
2. NEVER call roll_dice for spells → use cast_spell
3. NEVER call inflict_damage after player_attack or cast_spell (they apply damage)
4. NEVER call roll_dice for potions → use update_inventory(action:'remove')
5. NEVER call adjust_currency for purchases → use update_inventory(cost_gp=N)

✅ CORRECT TOOL PER SCENARIO (quick reference):
- Attack with weapon → player_attack(attackerId, weaponName, targetId, advanceTurn=true, narration="...")
- Cast a spell → cast_spell(casterId, spellId, targets=[...], narration="...")
- Counterspell → cast_spell(mode="counter", casterId, targetSpellLevel)
- Ritual cast → cast_spell(spellId, ritual=true, narration="...")
- Move to place → move_to(location_name, narration="...")
- Move + search → move_to(location_name, skillCheck={skill_name, difficulty})
- Search/investigate → check_skill(skill_name, difficulty)
- Recall knowledge → check_skill(skill_name="history"|"arcana", difficulty)
- Persuade/intimidate → check_skill(skill_name, difficulty)
- Buy item → update_inventory(item_name, action="add", cost_gp=N)
- Sell item → update_inventory(item_name, action="remove")
- Drink potion → update_inventory(item_name, action="remove") ONLY
- Loot gold/items → update_inventory(item_name, action="add")
- Give/reward money → adjust_currency(gp=N, targetId)
- Accept quest → upsert_quest(title, status="active")
- Short rest → take_rest(duration="short", targetId, narration)
- Long rest → take_rest(duration="long", targetId, narration)
- Level up → level_up(targetId, stats={str:2}, skills={athletics:1})
- End combat → end_combat(narration, xpAward={amount:N})
- XP award → award_experience(amount)
- Death save → make_save(targetId, saveType="death")
- General chat/greeting → narrate_turn(narration, timePassed=0)

💰 KEY MERGES (1 tool replaces 2+):
- Attack + advance + narrate → player_attack(advanceTurn=true, narration)
- Attack + kill + XP → player_attack(onKill={awardExperience:{amount:N}})
- End combat + XP + narrate → end_combat(narration, xpAward={amount:N})
- Move + search → move_to(location, skillCheck={skill_name, difficulty})
- Skill check + reward → check_skill(skill, difficulty, onSuccess={awardCurrency:{gp:N}})
- Level up + learn spells → level_up(learnSpells=["spell-id"])

⚡ EACH TURN: Call the right tool(s) for the action. If a tool has a "narration" param, the narration ends your turn. If no narration, end with narrate_turn(narration="...", timePassed=N).`;

function proposedExecTool(s: MockMCPServer, name: string, args: Record<string, any>): Promise<MCPResponse> {
  switch (name) {
    case 'roll_dice':
      return s.roll_dice(Number(args.sides) || 20, Number(args.count) || 1, Number(args.modifier) || 0);
    case 'start_combat':
      return s.start_combat(undefined, args.enemies as any);
    case 'next_turn':
      return s.next_turn();
    case 'end_combat': {
      
      return (async () => {
        const r1 = await s.end_combat();
        let xpResult = { success: true, data: {}, message: '' };
        if (args.xpAward?.amount) {
          xpResult = await s.awardExperience(Number(args.xpAward.amount));
        }
        return {
          success: r1.success,
          data: { ...r1.data, ...xpResult.data, narration: args.narration || '' },
          message: `${r1.message} ${xpResult.message}`.trim(),
        };
      })();
    }
    case 'player_attack': {
      
      return (async () => {
        const r1 = await s.player_attack(
          String(args.attackerId || ''), String(args.weaponName || ''), String(args.targetId || ''),
          args.isOffHand as boolean, args.isSneakAttack as boolean,
          args.sharpshooter as boolean, args.greatWeaponMaster as boolean,
        );
        let extra = '';
        
        const stateAfter = s.getFullState() as any;
        if (stateAfter.combat?.isActive && args.advanceTurn !== false) {
          const nt = await s.next_turn();
          extra += nt.message + ' ';
        }
        
        if (r1.data?.enemyDefeated && args.onKill?.awardExperience?.amount) {
          const xp = await s.awardExperience(Number(args.onKill.awardExperience.amount));
          extra += xp.message;
        }
        if (args.onKill?.logLore && r1.data?.enemyDefeated) {
          await s.log_lore(
            String(args.onKill.logLore.title || ''), String(args.onKill.logLore.content || ''),
            String(args.onKill.logLore.category || 'Item') as any,
          );
        }
        return { success: r1.success, data: { ...r1.data, narration: args.narration || '' }, message: (r1.message + ' ' + extra).trim() };
      })();
    }
    case 'cast_spell': {
      
      return (async () => {
        let targets = (args.targets as string[]) || [];
        if (targets.length === 0 && args.targetId) targets = [String(args.targetId)];
        if (args.mode === 'counter' || args.mode === 'dispel') {
          const r = await s.spell_effect(args.mode as 'counter' | 'dispel', String(args.casterId || ''), Number(args.targetSpellLevel || 3), args.targetId as string);
          return { success: r.success, data: { ...r.data, narration: args.narration || '' }, message: r.message };
        }
        if (args.ritual) {
          const r = await s.cast_ritual(String(args.casterId || ''), String(args.spellId || ''));
          return { success: r.success, data: { ...r.data, narration: args.narration || '' }, message: r.message };
        }
        const r = await s.cast_spell(String(args.casterId || ''), String(args.spellId || ''), Number(args.slotLevel || 0), targets, undefined, args.reaction as boolean);
        return { success: r.success, data: { ...r.data, narration: args.narration || '' }, message: r.message };
      })();
    }
    case 'make_save':
      if (args.saveType === 'death') return s.roll_death_save(String(args.targetId || ''));
      return s.make_save(String(args.targetId || ''), String(args.stat || 'dex'), Number(args.dc || 10));
    case 'check_skill':
      return s.check_skill(String(args.skill_name || ''), Number(args.difficulty || 10), args.targetId as string, args.onSuccess as any);
    case 'update_inventory':
      return s.update_inventory(String(args.item_name || ''), String(args.action || 'add') as any, Number(args.quantity || 1), undefined, args.targetId as string, args.type as any, args.rarity as any, args.description as string, args.stats as any, args.equipped as boolean, args.cost_gp as number, args.cost_sp as number, args.cost_cp as number, false, false);
    case 'adjust_currency':
      return s.adjust_currency(Number(args.gp || 0), Number(args.sp || 0), Number(args.cp || 0), String(args.targetId || ''));
    case 'inflict_damage':
      return s.inflict_damage(Number(args.amount || 0), String(args.targetId || ''), args.damageType as string);
    case 'move_to': {
      const r = s.move_to(String(args.location_name || 'Unknown'), String(args.description || ''), args.targetId as string, args.skillCheck as any, args.route as string, args.pace as string);
      return r.then(result => ({ ...result, data: { ...result.data, narration: args.narration || '' } }));
    }
    case 'take_rest': {
      
      const rt = args.targetId || (s.getFullState().party?.[0]?.name) || 'player-1';
      if (args.duration === 'long') return s.long_rest(args.narration as string, !args.narration);
      return s.short_rest(String(rt), args.narration as string, !args.narration);
    }
    case 'level_up': {
      if (!args.stats || Object.keys(args.stats).length === 0) {
        return Promise.resolve({ success: true, data: { warned: true }, message: `Level up called without stat increases. Specify stats like: stats={str:2,con:1}. Character: ${args.targetId}` });
      }
      const r = s.allocateStatPoints((args.stats || {}) as any, args.targetId as string, (args.skills || {}) as Record<string, number>, Number(args.hpDeviation || 0));
      
      const results: string[] = [r.message];
      if (args.learnSpells && Array.isArray(args.learnSpells)) {
        for (const spellId of args.learnSpells) {
          const sr = s.manage_spellbook(String(args.targetId), 'learn', String(spellId));
          results.push(sr.message || '');
        }
      }
      if (args.prepareSpells && Array.isArray(args.prepareSpells)) {
        for (const spellId of args.prepareSpells) {
          const sr = s.manage_spellbook(String(args.targetId), 'prepare', String(spellId));
          results.push(sr.message || '');
        }
      }
      return Promise.resolve({ success: r.success, data: r.data, message: results.filter(Boolean).join(' | ') });
    }
    case 'use_resource':
      return s.use_resource(String(args.targetId || ''), String(args.resourceId || ''), args.targetId as string, args.amount as number);
    case 'upsert_quest':
      return s.upsert_quest(String(args.title || ''), String(args.description || ''), String(args.status || 'active') as any, args.reputationChanges as any);
    case 'log_lore':
      return s.log_lore(String(args.title || ''), String(args.content || ''), String(args.category || 'History') as any);
    case 'award_experience':
      return s.awardExperience(Number(args.amount || 0), args.targetId as string);
    case 'summon_creature':
      return s.summon_creature(String(args.casterId || ''), String(args.creatureName || ''), Number(args.count || 1));
    case 'teleport_creature':
      return s.teleport_creature(String(args.targetId || ''), String(args.destination || ''), Number(args.range || 30));
    case 'polymorph_creature':
      return s.polymorph_creature(String(args.targetId || ''), String(args.newForm || 'wolf'), Number(args.duration || 60));
    case 'narrate_turn':
      return s.narrate_turn(String(args.narration || ''), Number(args.timePassed || 0));
    default:
      return Promise.resolve({ success: false, data: {}, message: `Unknown: ${name}` });
  }
}


async function callLLM(messages: any[], tools: any[]): Promise<any> {
  const body: any = { model: MODEL, messages, temperature: 0.7 };
  if (tools?.length) { body.tools = tools; body.tool_choice = "auto"; }
  const r = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text().catch(() => '')).substring(0, 200)}`);
  const d = await r.json();
  const m = d.choices[0].message;
  return {
    content: m.content,
    toolCalls: m.tool_calls?.map((tc: any) => ({ id: tc.id, name: tc.function.name, args: safeParse(tc.function.arguments) })) || null,
    rawToolCalls: m.tool_calls || [],
    promptTokens: d.usage?.prompt_tokens || 0,
    completionTokens: d.usage?.completion_tokens || 0,
  };
}

function safeParse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch {
    let repaired = raw.replace(/'/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/(['"])?([a-zA-Z_]\w*)(['"])?\s*:/g, '"$2":').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
    try { return JSON.parse(repaired); } catch { return {}; }
  }
}


interface Metrics {
  pass: boolean; missing: string[]; extra: string[]; invalidCalls: number;
  iters: number; promptTokens: number; completionTokens: number; totalTokens: number;
  latencyMs: number; inlineNarrationLen: number;
  calledTools: string[]; validationDetail: string; error?: string;
}

async function runHarness(
  scenario: Scenario,
  tools: any[],
  instruction: string,
  execTool: (s: MockMCPServer, name: string, args: Record<string, any>) => Promise<MCPResponse>,
  label: string,
  isProposed: boolean,
  opts: { maxIters: number; preInjectReminder?: boolean },
): Promise<Metrics> {
  const server = new MockMCPServer();
  scenario.setup(server);
  const char = server.getTarget('player-1');
  const state = server.getFullState() as any;
  const hasCombat = state.combat?.isActive === true;
  const hasLevelUp = state.party?.some((c: any) => (c.unusedStatPoints ?? 0) > 0 || (c.unusedSkillPoints ?? 0) > 0);
  
  const charSummary = char ? `${char.name} (L${char.level} ${char.class}, HP ${char.hp.current}/${char.hp.max}, location: ${char.location || 'unknown'})` : 'None';
  const partySummary = (state.party || []).map((c: any) => `${c.name} (L${c.level} ${c.class}, HP ${c.hp.current}/${c.hp.max})`).join(', ');
  let contextStr = `Context: Active player: ${charSummary}. Party: ${partySummary}. World: ${(state as any).worldDescription || ''}.`;
  if (hasCombat) {
    const alive = (state.combat.enemies || []).filter((e: any) => !e.isDead);
    contextStr += ` COMBAT ACTIVE: Round ${state.combat.round}. Enemies: ${alive.map((e: any) => `${e.name} (HP ${e.hp?.current}/${e.hp?.max}, AC ${e.ac})`).join(', ')}. Initiative: ${(state.combat.initiative || []).map((e: any) => e.name).join(' > ')}.`;
  }
  if (hasLevelUp) contextStr += ' LEVEL UP AVAILABLE: This character has unspent stat/skill points.';

  const sysMsg = { role: 'system' as const, content: instruction };
  const ctxMsg = { role: 'user' as const, content: contextStr };
  const inputMsg = { role: 'user' as const, content: scenario.input };

  const messages: any[] = [sysMsg, ctxMsg, inputMsg];
  const maxIters = opts.maxIters;
  const startTime = Date.now();
  let totalPrompt = 0, totalCompletion = 0;
  const executedTools: { name: string; args: any; result: MCPResponse }[] = [];
  let iters = 0, invalidCalls = 0;
  let inlineNarrationLen = 0;

  
  if (opts.preInjectReminder) {
    const input = scenario.input.toLowerCase();
    const isTrivial = /^(hi|hey|hello|greetings|ok|okay|thanks|thank|yes|no|sure|bye|goodbye)\b/.test(input);
    let reminder: string;
    if (isTrivial) {
      reminder = ''; 
    } else if (hasCombat) {
      
      if (input.includes('loot') || input.includes('search') || input.includes('bodies') || input.includes('catch breath')) {
        reminder = 'Combat is active but may be ending. Call end_combat(narration="...", xpAward={amount:...}) to end combat and handle loot in one call.';
      } else {
        reminder = 'You are in combat. Call player_attack, cast_spell, next_turn, or end_combat. Use narrate_turn to end your turn.';
      }
    } else if (hasLevelUp) {
      reminder = 'The player can level up! Call level_up with stat/skill increases. Example: level_up(targetId="' + (char?.name || 'Character') + '", stats={str:2}, skills={athletics:1}).';
    } else if (input.includes('rest') || input.includes('sleep') || input.includes('recover') || input.includes('catch')) {
      reminder = 'Call take_rest(duration="short" or "long", targetId="' + (char?.name || 'Character') + '", narration="..."). This handles healing and hit dice.';
    } else if (input.includes('move') || input.includes('go') || input.includes('enter') || input.includes('travel') || input.includes('leave') || input.includes('walk')) {
      reminder = 'Call move_to(location_name="...", narration="...") for movement. COMBINE with arrival search: add skillCheck={skill_name:"perception", difficulty:...}. No separate check_skill needed.';
    } else if (input.includes('search') || input.includes('look') || input.includes('examine') || input.includes('investigate') || input.includes('recall') || input.includes('remember')) {
      reminder = 'Call check_skill(skill_name="perception"|"investigation"|"history"|"arcana", difficulty=...). Add onSuccess to bundle follow-up actions.';
    } else if (input.includes('defeat') || input.includes('defeated') || input.includes('won') || input.includes('killed') || input.includes('slain')) {
      reminder = 'Call award_experience(amount=..., narration="...") to award XP for the victory. Do NOT call end_combat unless combat is still active.';
    } else if (input.includes('buy') || input.includes('sell') || input.includes('purchase') || input.includes('loot') || input.includes('take') || input.includes('drink') || input.includes('potion')) {
      reminder = 'Call update_inventory(item_name="...", action="add"|"remove", cost_gp=...). For purchases, use cost_gp to auto-deduct currency. For potions, action="remove" only.';
    } else if (input.includes('quest') || input.includes('accept') || input.includes('mission')) {
      reminder = 'Call upsert_quest(title="...", status="active", description="...") to accept a quest.';
    } else {
      reminder = 'Call the appropriate tool to resolve the player action. Options: move_to, check_skill, update_inventory, cast_spell, player_attack, upsert_quest, log_lore, narrate_turn.';
    }
    if (reminder) messages.push({ role: 'user', content: reminder });
  }

  for (iters = 0; iters < maxIters; iters++) {
    let resp: any;
    try {
      resp = await callLLM(messages, tools);
    } catch (e: any) {
      return {
        pass: false, missing: scenario.expected, extra: [], invalidCalls,
        iters: iters + 1, promptTokens: totalPrompt, completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion, latencyMs: Date.now() - startTime,
        inlineNarrationLen,
        calledTools: executedTools.map(t => t.name), validationDetail: '', error: e.message,
      };
    }

    totalPrompt += resp.promptTokens;
    totalCompletion += resp.completionTokens;

    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      
      if (iters === 0) {
        const fallbackMsg = isProposed
          ? (scenario.input.toLowerCase().includes('level') || scenario.input.toLowerCase().includes('stronger')
            ? 'Call level_up(targetId="' + (char?.name || 'Character') + '", stats={str:2,con:1}). You MUST allocate stat points.'
            : 'You MUST call at least one tool. ' + (hasCombat ? 'Use player_attack, cast_spell, or next_turn.' : ''))
          : 'You MUST call at least one tool. Determine the correct tool and call it now.';
        messages.push({ role: 'user', content: fallbackMsg });
        continue;
      }
      break;
    }

    
    const hasNarrationTool = resp.toolCalls.some((tc: any) => tc.name === 'narrate_turn');
    const hasInlineNarration = resp.toolCalls.some((tc: any) =>
      tc.name !== 'narrate_turn' && (tc.args?.narration || tc.args?.route)
    );
    const isEndOfTurn = hasNarrationTool || hasInlineNarration;

    
    const actionCalls = resp.toolCalls.filter((tc: any) => tc.name !== 'narrate_turn');
    const narrateCall = resp.toolCalls.find((tc: any) => tc.name === 'narrate_turn');

    
    for (const tc of actionCalls) {
      try {
        const result = await execTool(server, tc.name, tc.args);
        executedTools.push({ name: tc.name, args: tc.args, result });
        if (!result.success) invalidCalls++;
        
        if (result.data?.narration) {
          inlineNarrationLen = Math.max(inlineNarrationLen, String(result.data.narration).length);
        }
      } catch (e: any) {
        executedTools.push({ name: tc.name, args: tc.args, result: { success: false, data: {}, message: e.message } });
        invalidCalls++;
      }
    }

    
    if (narrateCall) {
      try {
        const result = await execTool(server, narrateCall.name, narrateCall.args);
        executedTools.push({ name: narrateCall.name, args: narrateCall.args, result });
        if (result.data?.narration) {
          inlineNarrationLen = Math.max(inlineNarrationLen, String(result.data.narration).length);
        }
      } catch (e: any) {
        executedTools.push({ name: narrateCall.name, args: narrateCall.args, result: { success: false, data: {}, message: e.message } });
        invalidCalls++;
      }
    }

    
    const defs = resp.toolCalls.map((tc: any) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }));
    messages.push({ role: 'assistant', content: '', tool_calls: defs });
    for (const tc of resp.toolCalls) {
      const result = executedTools.slice(-resp.toolCalls.length).find((_, i) => resp.toolCalls[i]?.id === tc.id)?.result;
      const content = result ? JSON.stringify({ tool: tc.name, success: result.success, message: result.message }) : JSON.stringify({ tool: tc.name, success: false });
      messages.push({ role: 'tool', tool_call_id: tc.id, content });
    }

    if (isEndOfTurn) {
      break;
    }
  }

  const called = executedTools.map(t => t.name);
  
  
  
  const equivalentsFor: Record<string, string[]> = {
    'short_rest': ['short_rest', 'take_rest'],
    'long_rest': ['long_rest', 'take_rest'],
    'take_rest': ['short_rest', 'long_rest', 'take_rest'],
    'roll_death_save': ['roll_death_save', 'make_save'],
    'cast_ritual': ['cast_ritual', 'cast_spell'],
    'spell_effect': ['spell_effect', 'cast_spell'],
    'award_experience': ['award_experience', 'end_combat', 'player_attack'],
    'manage_spellbook': ['manage_spellbook', 'level_up'],
    'add_enemy': ['add_enemy', 'start_combat'],
  };
  
  
  const calledOrEquivalent = new Set<string>();
  for (const toolName of called) {
    calledOrEquivalent.add(toolName);
    
    for (const [key, eqs] of Object.entries(equivalentsFor)) {
      if (eqs.includes(toolName)) {
        calledOrEquivalent.add(key);
      }
    }
  }
  
  const adjustedMissing = scenario.expected.filter(expectedName => {
    
    const eqs = equivalentsFor[expectedName] || [expectedName];
    return !eqs.some((equiv: string) => calledOrEquivalent.has(equiv));
  });

  const allOptional = [...scenario.optional];
  const extra = called.filter(t => !scenario.expected.includes(t) && !allOptional.includes(t));

  const val = scenario.validate(server);

    return {
      pass: adjustedMissing.length === 0 && val.pass,
      missing: adjustedMissing,
      extra,
      invalidCalls,
      iters: iters + 1,
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      latencyMs: Date.now() - startTime,
      inlineNarrationLen,
      calledTools: called,
      validationDetail: val.detail,
    };
}


async function main() {
  console.log('\n' + '═'.repeat(145));
  console.log('  CURRENT vs PROPOSED — 20-Turn Live LLM Benchmark');
  console.log('═'.repeat(145));
  console.log(`  Model: ${MODEL}  |  ${SCENARIOS.length} scenarios × 2 harnesses = ${SCENARIOS.length * 2} jobs (parallel)\n`);
  console.log(`  API: ${API_BASE.replace(/\/+$/, '')}/chat/completions\n`);

  const currentOpts = { maxIters: MAX_ITERS_CURRENT, preInjectReminder: false };
  const proposedOpts = { maxIters: MAX_ITERS_PROPOSED, preInjectReminder: true };

  const jobs = SCENARIOS.map((s, i) => {
    const runCurrent = runHarness(s, CURRENT_TOOLS, CURRENT_INSTRUCTION, currentExecTool, 'CURRENT', false, currentOpts)
      .catch(e => ({ pass: false, missing: s.expected, extra: [], invalidCalls: 0, iters: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, inlineNarrationLen: 0, calledTools: [], validationDetail: '', error: e.message } as Metrics));
    const runProposed = runHarness(s, PROPOSED_TOOLS, PROPOSED_INSTRUCTION, proposedExecTool, 'PROPOSED', true, proposedOpts)
      .catch(e => ({ pass: false, missing: s.expected, extra: [], invalidCalls: 0, iters: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, inlineNarrationLen: 0, calledTools: [], validationDetail: '', error: e.message } as Metrics));
    return { name: s.name, current: runCurrent, proposed: runProposed };
  });

  const startAll = Date.now();

  
  const BATCH_SIZE = 5;
  const allResults: { name: string; current: Metrics; proposed: Metrics }[] = [];

  for (let batchStart = 0; batchStart < jobs.length; batchStart += BATCH_SIZE) {
    const batch = jobs.slice(batchStart, batchStart + BATCH_SIZE);
    const flat = await Promise.all(batch.map(async j => {
      const [current, proposed] = await Promise.all([j.current, j.proposed]);
      return { name: j.name, current, proposed };
    }));
    allResults.push(...flat);

    
    for (const r of flat) {
      const cIcon = r.current.pass ? '✅' : (r.current.totalTokens > 0 ? '❌' : '💥');
      const pIcon = r.proposed.pass ? '✅' : (r.proposed.totalTokens > 0 ? '❌' : '💥');
      const cDetail = r.current.error ? `ERR:${compact(r.current.error, 40)}` : `${r.current.iters}it ${r.current.totalTokens}tok ${r.current.latencyMs}ms`;
      const pDetail = r.proposed.error ? `ERR:${compact(r.proposed.error, 40)}` : `${r.proposed.iters}it ${r.proposed.totalTokens}tok ${r.proposed.latencyMs}ms`;
      console.log(`  [${r.name.padEnd(24)}] ${cIcon} ${cDetail.padEnd(32)} | ${pIcon} ${pDetail}`);
    }
  }

  const totalS = ((Date.now() - startAll) / 1000).toFixed(1);

  
  console.log(`\n  All done in ${totalS}s\n`);
  console.log('═'.repeat(145));
  console.log('  📊 CURRENT vs PROPOSED — AGGREGATE COMPARISON');
  console.log('═'.repeat(145));

  const currentResults = allResults.map(r => r.current);
  const proposedResults = allResults.map(r => r.proposed);

  const currentPass = currentResults.filter(r => r.pass).length;
  const proposedPass = proposedResults.filter(r => r.pass).length;
  const currentAvgIters = currentResults.reduce((s, r) => s + r.iters, 0) / currentResults.length;
  const proposedAvgIters = proposedResults.reduce((s, r) => s + r.iters, 0) / proposedResults.length;
  const currentAvgTokens = currentResults.reduce((s, r) => s + r.totalTokens, 0) / currentResults.length;
  const proposedAvgTokens = proposedResults.reduce((s, r) => s + r.totalTokens, 0) / proposedResults.length;
  const currentAvgLatency = currentResults.reduce((s, r) => s + r.latencyMs, 0) / currentResults.length;
  const proposedAvgLatency = proposedResults.reduce((s, r) => s + r.latencyMs, 0) / proposedResults.length;
  const currentInvalid = currentResults.reduce((s, r) => s + r.invalidCalls, 0);
  const proposedInvalid = proposedResults.reduce((s, r) => s + r.invalidCalls, 0);
  const currentTotalTokens = currentResults.reduce((s, r) => s + r.totalTokens, 0);
  const proposedTotalTokens = proposedResults.reduce((s, r) => s + r.totalTokens, 0);

  console.log(`\n  ${'Metric'.padEnd(30)} ${'CURRENT'.padEnd(24)} ${'PROPOSED'.padEnd(24)} ${'IMPROVEMENT'}`);
  console.log('  ' + '─'.repeat(100));
  console.log(`  ${'Pass Rate'.padEnd(30)} ${`${currentPass}/${currentResults.length}`.padEnd(24)} ${`${proposedPass}/${proposedResults.length}`.padEnd(24)} ${proposedPass > currentPass ? `+${((proposedPass - currentPass) / currentResults.length * 100).toFixed(0)}%` : `${((proposedPass - currentPass) / currentResults.length * 100).toFixed(0)}%`}`);
  console.log(`  ${'Avg Iterations'.padEnd(30)} ${currentAvgIters.toFixed(2).padEnd(24)} ${proposedAvgIters.toFixed(2).padEnd(24)} ${proposedAvgIters < currentAvgIters ? `-${((1 - proposedAvgIters / currentAvgIters) * 100).toFixed(0)}%` : `+${((proposedAvgIters / currentAvgIters - 1) * 100).toFixed(0)}%`}`);
  console.log(`  ${'Avg Tokens'.padEnd(30)} ${Math.round(currentAvgTokens).toString().padEnd(24)} ${Math.round(proposedAvgTokens).toString().padEnd(24)} ${proposedAvgTokens < currentAvgTokens ? `-${((1 - proposedAvgTokens / currentAvgTokens) * 100).toFixed(0)}%` : `+${((proposedAvgTokens / currentAvgTokens - 1) * 100).toFixed(0)}%`}`);
  console.log(`  ${'Avg Latency (ms)'.padEnd(30)} ${Math.round(currentAvgLatency).toString().padEnd(24)} ${Math.round(proposedAvgLatency).toString().padEnd(24)} ${proposedAvgLatency < currentAvgLatency ? `-${((1 - proposedAvgLatency / currentAvgLatency) * 100).toFixed(0)}%` : `+${((proposedAvgLatency / currentAvgLatency - 1) * 100).toFixed(0)}%`}`);
  console.log(`  ${'Invalid Tool Calls'.padEnd(30)} ${currentInvalid.toString().padEnd(24)} ${proposedInvalid.toString().padEnd(24)} ${proposedInvalid < currentInvalid ? `-${currentInvalid - proposedInvalid} calls` : `+${proposedInvalid - currentInvalid} calls`}`);
  console.log(`  ${'Total Tokens'.padEnd(30)} ${currentTotalTokens.toString().padEnd(24)} ${proposedTotalTokens.toString().padEnd(24)} ${proposedTotalTokens < currentTotalTokens ? `-${((1 - proposedTotalTokens / currentTotalTokens) * 100).toFixed(0)}%` : `+${((proposedTotalTokens / currentTotalTokens - 1) * 100).toFixed(0)}%`}`);

  
  console.log(`\n\n  ${'SCENARIO'.padEnd(28)} ${'CURRENT (pass/iters/tok/ms)'.padEnd(34)} ${'PROPOSED (pass/iters/tok/ms)'.padEnd(34)} ${'Δit   Δtok  Δms'}`);
  console.log('  ' + '─'.repeat(130));
  for (const r of allResults) {
    const c = r.current;
    const p = r.proposed;
    const cIcon = c.pass ? '✅' : '❌';
    const pIcon = p.pass ? '✅' : '❌';
    const cInfo = `${c.iters}it ${c.totalTokens}tok ${c.latencyMs}ms`;
    const pInfo = `${p.iters}it ${p.totalTokens}tok ${p.latencyMs}ms`;
    const dIters = p.iters - c.iters;
    const dTokens = p.totalTokens - c.totalTokens;
    const dMs = p.latencyMs - c.latencyMs;
    const dStr = `${dIters >= 0 ? '+' : ''}${dIters}  ${dTokens >= 0 ? '+' : ''}${dTokens}  ${dMs >= 0 ? '+' : ''}${dMs}`;
    const extraInfo = c.extra.length > 0 || p.extra.length > 0 ? ` E:${c.extra.join(',')}→${p.extra.join(',')}` : '';
    console.log(`  ${r.name.padEnd(26)} ${cIcon} ${cInfo.padEnd(30)} ${pIcon} ${pInfo.padEnd(30)} ${dStr}${extraInfo}`);
    if (c.missing.length > 0 || p.missing.length > 0) {
      console.log(`  ${' '.repeat(28)} MISS:C=${c.missing.join(',')}  P=${p.missing.join(',')}`);
    }
    if (c.error || p.error) {
      console.log(`  ${' '.repeat(28)} ERR:C=${(c.error || '').slice(0, 40)}  P=${(p.error || '').slice(0, 40)}`);
    }
  }

  console.log('\n' + '═'.repeat(145));
  console.log('  LEGEND:  ✅ pass  ❌ fail (expected tools missing)  💥 crash');
  console.log('  E = Extra/Hallucinated tool calls (unexpected tools)');
  console.log('  MISS = Expected tools not called');
  console.log('═'.repeat(145) + '\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
