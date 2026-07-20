import { Character } from '../types';

export type FeatEffectType = 'flag' | 'resource' | 'modifier' | 'rest-hook' | 'flavor';

export type FeatCategory = 'combat' | 'magic' | 'general' | 'armor' | 'saving-throw' | 'flavor';

export interface FeatPrerequisites {
  stat?: Partial<Record<keyof Character['stats'], number>>;
  armorProf?: ('light' | 'medium' | 'heavy' | 'shield')[];
  otherFeats?: string[];
  level?: number;
}

export interface FeatDefinition {
  id: string;
  name: string;
  category: FeatCategory;
  shortName: string;
  icon: string;
  description: string;
  mechanicalEffect: string;
  effectType: FeatEffectType;
  effectPayload?: Record<string, any>;
  prerequisites?: FeatPrerequisites;
}

export const FEATS_CATALOG: FeatDefinition[] = [
  {
    id: 'two-weapon-fighting',
    name: 'Two-Weapon Fighting',
    category: 'combat',
    shortName: 'TWF',
    icon: 'fa-swords',
    description: 'When you engage in two-weapon fighting, you can add your ability modifier to the damage of the bonus attack.',
    mechanicalEffect: 'Add ability modifier to off-hand attack damage (no longer just ability mod-less damage).',
    effectType: 'flag',
    effectPayload: { kind: 'offhand-modifier' }
  },
  {
    id: 'great-weapon-fighting',
    name: 'Great Weapon Fighting',
    category: 'combat',
    shortName: 'GWF',
    icon: 'fa-helmet-battle',
    description: 'When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die. You must use the new roll.',
    mechanicalEffect: 'Reroll damage dice of 1 or 2 on heavy melee attacks (must use the new roll).',
    effectType: 'flag',
    effectPayload: { kind: 'gwf-reroll' }
  },
  {
    id: 'crossbow-expert',
    name: 'Crossbow Expert',
    category: 'combat',
    shortName: 'Crossbow Exp.',
    icon: 'fa-crosshairs',
    description: 'Thanks to extensive practice with the crossbow, you ignore the loading quality of crossbows with which you are proficient. Being within 5 feet of an enemy doesn\'t impose disadvantage on your ranged attack rolls.',
    mechanicalEffect: 'No disadvantage on ranged attacks when an enemy is within 5 feet.',
    effectType: 'flag',
    effectPayload: { kind: 'ignore-ranged-penalty' }
  },
  {
    id: 'dual-wielder',
    name: 'Dual Wielder',
    category: 'combat',
    shortName: 'Dual Wielder',
    icon: 'fa-sword',
    description: 'You gain a +1 bonus to AC while you are wielding a separate melee weapon in each hand. You can use two-weapon fighting even when the one-handed melee weapons you are wielding aren\'t light.',
    mechanicalEffect: '+1 AC when dual-wielding; can TWF with non-light one-handed melee weapons.',
    effectType: 'modifier',
    effectPayload: { kind: 'dual-wielder-ac', bonus: 1 }
  },
  {
    id: 'shield-master',
    name: 'Shield Master',
    category: 'combat',
    shortName: 'Shield Master',
    icon: 'fa-shield-halved',
    description: 'If you take the Attack action on your turn, you can use a bonus action to try to shove a creature within 5 feet of you with your shield. You add your shield\'s AC bonus to any Dexterity saving throw you make against a spell or other harmful effect.',
    mechanicalEffect: 'Add shield AC bonus (+2) to Dexterity saving throws.',
    effectType: 'modifier',
    effectPayload: { kind: 'shield-bonus-to-save', saveStat: 'dex', bonus: 2 }
  },
  {
    id: 'defensive-duelist',
    name: 'Defensive Duelist',
    category: 'combat',
    shortName: 'Def. Duelist',
    icon: 'fa-shield',
    description: 'When you are wielding a finesse weapon with which you are proficient and another creature hits you with a melee attack, you can use your reaction to add your proficiency bonus to your AC for that attack, potentially causing it to miss.',
    mechanicalEffect: 'Add proficiency bonus to AC against one melee attack per round (reaction).',
    effectType: 'modifier',
    effectPayload: { kind: 'reaction-ac-bonus', bonusType: 'proficiency' },
    prerequisites: { stat: { dex: 13 } }
  },
  {
    id: 'mobile',
    name: 'Mobile',
    category: 'combat',
    shortName: 'Mobile',
    icon: 'fa-person-running',
    description: 'Your speed increases by 10 feet. When you use the Dash action, difficult terrain doesn\'t cost you extra movement. When you make a melee attack against a creature, you don\'t provoke opportunity attacks from that creature for the rest of the turn.',
    mechanicalEffect: '+10 ft speed. The opportunity-attack immunity is recorded but the engine ignores it (no AOOs in the current combat system).',
    effectType: 'modifier',
    effectPayload: { kind: 'speed-bonus', bonus: 10 }
  },
  {
    id: 'charger',
    name: 'Charger',
    category: 'combat',
    shortName: 'Charger',
    icon: 'fa-bolt',
    description: 'When you use your action to Dash, you can use a bonus action to make one melee weapon attack or to shove a creature. If you move at least 10 feet in a straight line immediately before taking this bonus action, you either gain a +5 bonus to the attack\'s damage roll (if you chose to attack) or push the target up to 10 feet away (if you chose to shove).',
    mechanicalEffect: 'After a Dash bonus action, gain +5 damage on a single melee attack. Narratively tracked.',
    effectType: 'flavor',
    effectPayload: { kind: 'charge-damage', bonus: 5 }
  },
  {
    id: 'grappler',
    name: 'Grappler',
    category: 'combat',
    shortName: 'Grappler',
    icon: 'fa-hand-fist',
    description: 'You\'ve developed the skills necessary to hold your own in close-quarters grappling. You have advantage on attack rolls against a creature you are grappling. You can use your action to try to pin a creature grappled by you.',
    mechanicalEffect: 'Advantage on attack rolls against grappled targets. Narratively tracked.',
    effectType: 'flavor',
    effectPayload: { kind: 'grapple-advantage' }
  },
  {
    id: 'elemental-adept',
    name: 'Elemental Adept',
    category: 'magic',
    shortName: 'Elem. Adept',
    icon: 'fa-fire',
    description: 'When you gain this feat, choose one of the following damage types: acid, cold, fire, lightning, or thunder. Spells you cast ignore resistance to that damage type. When you roll damage for a spell that deals damage of that type, you can treat any 1 on a damage die as a 2.',
    mechanicalEffect: 'Ignore resistance to a chosen element; treat 1s as 2s on that damage type. (Recorded; engine does not yet model spell damage.)',
    effectType: 'flavor',
    effectPayload: { kind: 'elemental-adept' }
  },
  {
    id: 'resilient',
    name: 'Resilient',
    category: 'saving-throw',
    shortName: 'Resilient',
    icon: 'fa-hand-fist',
    description: 'Choose one ability score. You gain the following benefits: the chosen ability score increases by 1, to a maximum of 20. You gain proficiency in saving throws using the chosen ability.',
    mechanicalEffect: 'Add proficiency bonus to one chosen save. The +1 ASI is applied separately by the level-up modal.',
    effectType: 'modifier',
    effectPayload: { kind: 'save-proficiency' }
  },
  {
    id: 'alert',
    name: 'Alert',
    category: 'general',
    shortName: 'Alert',
    icon: 'fa-eye',
    description: 'Always on the lookout for danger, you gain the following benefits: you gain a +5 bonus to Initiative. You can\'t be surprised. Creatures within 5 feet of you that you can\'t see don\'t gain advantage on attack rolls against you.',
    mechanicalEffect: '+5 to initiative rolls.',
    effectType: 'modifier',
    effectPayload: { kind: 'initiative-bonus', bonus: 5 }
  },
  {
    id: 'tough',
    name: 'Tough',
    category: 'general',
    shortName: 'Tough',
    icon: 'fa-heart',
    description: 'Your hit point maximum increases by an amount equal to twice your level when you gain this feat. Whenever you gain a level thereafter, your hit point maximum increases by an additional 2 hit points.',
    mechanicalEffect: '+2 HP per character level (current and future).',
    effectType: 'modifier',
    effectPayload: { kind: 'hp-per-level', amount: 2 }
  },
  {
    id: 'heavy-armor-master',
    name: 'Heavy Armor Master',
    category: 'armor',
    shortName: 'HAM',
    icon: 'fa-shield',
    description: 'You can use your armor to deflect strikes that would kill others. You gain the following benefits: increase your Strength score by 1, to a maximum of 20. While you are wearing heavy armor, bludgeoning, piercing, and slashing damage from nonmagical attacks against you is reduced by 3.',
    mechanicalEffect: 'Reduce non-magical B/P/S damage by 3 while wearing heavy armor. The +1 ASI is applied separately.',
    effectType: 'modifier',
    effectPayload: { kind: 'damage-reduction', amount: 3, types: ['bludgeoning', 'piercing', 'slashing'] },
    prerequisites: { armorProf: ['heavy'] }
  },
  {
    id: 'durable',
    name: 'Durable',
    category: 'saving-throw',
    shortName: 'Durable',
    icon: 'fa-shield-heart',
    description: 'When you roll a Hit Die to regain hit points, the minimum number of hit points you regain equals twice your Constitution modifier (minimum of 2).',
    mechanicalEffect: 'Minimum hit die roll equals 2 × CON modifier. (Death-save inspired flavor: advantage on death saves; engine gives a +1 bonus to death save roll.)',
    effectType: 'modifier',
    effectPayload: { kind: 'death-save-bonus', bonus: 1 }
  },
  {
    id: 'skilled',
    name: 'Skilled',
    category: 'general',
    shortName: 'Skilled',
    icon: 'fa-graduation-cap',
    description: 'You gain proficiency in any combination of three skills or tools of your choice.',
    mechanicalEffect: 'Pick 3 skills to add +1 rank each. Engine-applied via the level-up modal.',
    effectType: 'modifier',
    effectPayload: { kind: 'extra-skill-profs', count: 3 }
  },
  {
    id: 'observant',
    name: 'Observant',
    category: 'general',
    shortName: 'Observant',
    icon: 'fa-binoculars',
    description: 'Quick to notice details, you have a +5 bonus to passive Perception (Wisdom) and passive Investigation (Intelligence).',
    mechanicalEffect: '+5 to passive Perception and passive Investigation. (Engine tracks; surfaced in skill display.)',
    effectType: 'modifier',
    effectPayload: { kind: 'passive-skill-bonus', skills: ['perception', 'investigation'], bonus: 5 }
  },
  {
    id: 'magic-initiate',
    name: 'Magic Initiate',
    category: 'magic',
    shortName: 'Magic Init.',
    icon: 'fa-hat-wizard',
    description: 'Choose a class: bard, cleric, druid, sorcerer, warlock, or wizard. You learn two cantrips of your choice from that class\'s spell list. You also learn one 1st-level spell of your choice from that spell list.',
    mechanicalEffect: 'Recorded as a flavor feat — the engine has no spell system yet. LLM narrates the chosen cantrips and 1st-level spell.',
    effectType: 'flavor',
    effectPayload: { kind: 'magic-initiate' }
  },
  {
    id: 'ritual-caster',
    name: 'Ritual Caster',
    category: 'magic',
    shortName: 'Ritual Caster',
    icon: 'fa-book',
    description: 'You have learned a number of rituals that you can cast as rituals. Choose a class: bard, cleric, druid, sorcerer, warlock, or wizard. You acquire a ritual book holding two 1st-level spells of your choice that have the ritual tag from that class\'s spell list.',
    mechanicalEffect: 'Recorded as a flavor feat — the engine has no spell system yet. LLM narrates the chosen rituals.',
    effectType: 'flavor',
    effectPayload: { kind: 'ritual-caster' }
  },
  {
    id: 'spell-sniper',
    name: 'Spell Sniper',
    category: 'magic',
    shortName: 'Spell Sniper',
    icon: 'fa-bullseye',
    description: 'You have learned techniques to enhance your attacks with certain kinds of spells, granting the following benefits: when you cast a spell that requires a ranged attack roll, the spell\'s range is doubled. Your ranged spell attacks ignore half cover and three-quarters cover.',
    mechanicalEffect: 'Recorded as a flavor feat — the engine has no spell or cover system yet.',
    effectType: 'flavor',
    effectPayload: { kind: 'spell-sniper' }
  },
  {
    id: 'lightly-armored',
    name: 'Lightly Armored',
    category: 'armor',
    shortName: 'Light Armor',
    icon: 'fa-vest',
    description: 'You have trained to master the use of light armor, gaining the following benefits: increase your Strength or Dexterity score by 1, to a maximum of 20. You gain proficiency with light armor.',
    mechanicalEffect: 'Gain light armor proficiency. The +1 ASI is applied separately.',
    effectType: 'flag',
    effectPayload: { kind: 'armor-proficiency', prof: 'light' }
  },
  {
    id: 'moderately-armored',
    name: 'Moderately Armored',
    category: 'armor',
    shortName: 'Med. Armor',
    icon: 'fa-vest-patches',
    description: 'You have trained to master the use of medium armor and shields, gaining the following benefits: increase your Strength or Dexterity score by 1, to a maximum of 20. You gain proficiency with medium armor and shields.',
    mechanicalEffect: 'Gain medium armor and shield proficiency. The +1 ASI is applied separately.',
    effectType: 'flag',
    effectPayload: { kind: 'armor-proficiency', prof: 'medium' },
    prerequisites: { armorProf: ['light'] }
  },
  {
    id: 'heavily-armored',
    name: 'Heavily Armored',
    category: 'armor',
    shortName: 'Heavy Armor',
    icon: 'fa-shield',
    description: 'You have trained to master the use of heavy armor, gaining the following benefits: increase your Strength score by 1, to a maximum of 20. You gain proficiency with heavy armor.',
    mechanicalEffect: 'Gain heavy armor proficiency. The +1 ASI is applied separately.',
    effectType: 'flag',
    effectPayload: { kind: 'armor-proficiency', prof: 'heavy' },
    prerequisites: { armorProf: ['medium'] }
  },
  {
    id: 'actor',
    name: 'Actor',
    category: 'flavor',
    shortName: 'Actor',
    icon: 'fa-masks-theater',
    description: 'Skilled at mimicry and dramatics, you gain the following benefits: increase your Charisma score by 1, to a maximum of 20. You have advantage on Charisma (Deception) and Charisma (Performance) checks when trying to pass yourself off as a different person.',
    mechanicalEffect: 'Flavor feat — purely narrative. LLM applies advantage on Deception/Performance.',
    effectType: 'flavor'
  },
  {
    id: 'athlete',
    name: 'Athlete',
    category: 'flavor',
    shortName: 'Athlete',
    icon: 'fa-medal',
    description: 'You have undergone extensive physical training, gaining the following benefits: increase your Strength or Dexterity score by 1, to a maximum of 20. Your walking speed increases by 10 feet.',
    mechanicalEffect: 'Flavor feat — the speed bonus is recorded; the LLM narrates Athletics/Acrobatics benefits.',
    effectType: 'flavor',
    effectPayload: { kind: 'speed-bonus', bonus: 10 }
  },
  {
    id: 'tavern-brawler',
    name: 'Tavern Brawler',
    category: 'flavor',
    shortName: 'Tavern Brawler',
    icon: 'fa-beer-mug-empty',
    description: 'Accustomed to rough-and-tumble fighting using whatever you can get your hands on, you gain the following benefits: increase your Strength or Constitution score by 1, to a maximum of 20. You are proficient with improvised weapons. Your unarmed strike deals 1d4 + your Strength modifier damage.',
    mechanicalEffect: 'Flavor feat — the LLM narrates improvised weapon proficiency and 1d4 unarmed strike damage.',
    effectType: 'flavor'
  },
  {
    id: 'inspiring-leader',
    name: 'Inspiring Leader',
    category: 'flavor',
    shortName: 'Inspiring Leader',
    icon: 'fa-flag',
    description: 'You can spend 10 minutes inspiring your companions, shoring up their resolve to fight. Once you have used this ability, you can\'t use it again until you finish a short or long rest. Choose up to six friendly creatures within 30 feet who can see or hear you, and who can understand you. Each gains temporary hit points equal to your level + your Charisma modifier.',
    mechanicalEffect: 'Flavor feat — the LLM narrates the temporary HP grant on a 10-minute speech.',
    effectType: 'flavor',
    effectPayload: { kind: 'temp-hp-from-level-and-cha' }
  },
  {
    id: 'linguist',
    name: 'Linguist',
    category: 'flavor',
    shortName: 'Linguist',
    icon: 'fa-language',
    description: 'You have studied languages, gaining the following benefits: increase your Intelligence score by 1, to a maximum of 20. You learn three languages of your choice. You have advantage on Intelligence (History) checks to recall lore about the origin of documents you read.',
    mechanicalEffect: 'Flavor feat — LLM applies advantage on History checks for document lore.',
    effectType: 'flavor'
  },
  {
    id: 'keen-mind',
    name: 'Keen Mind',
    category: 'flavor',
    shortName: 'Keen Mind',
    icon: 'fa-brain',
    description: 'You have a mind that can track time, direction, and detail with uncanny precision, gaining the following benefits: increase your Intelligence score by 1, to a maximum of 20. You always know which way is north. You always know the number of hours left before the next sunrise or sunset. You can accurately recall anything you have seen or heard within the past month.',
    mechanicalEffect: 'Flavor feat — purely narrative. LLM applies the directional/time benefits.',
    effectType: 'flavor'
  },
  {
    id: 'healer',
    name: 'Healer',
    category: 'flavor',
    shortName: 'Healer',
    icon: 'fa-briefcase-medical',
    description: 'You are an able physician, allowing you to mend wounds quickly and get your allies back in the fight. You gain the following benefits: when you use a healer\'s kit to stabilize a dying creature, that creature also regains 1 hit point. As an action, you can spend one use of a healer\'s kit to tend to a creature and restore 1d6 + 4 hit points to that creature.',
    mechanicalEffect: 'Flavor feat — the LLM narrates healer\'s kit bonuses.',
    effectType: 'flavor'
  }
];

export const FEAT_CATEGORIES: { key: FeatCategory; label: string; icon: string }[] = [
  { key: 'combat', label: 'Combat', icon: 'fa-swords' },
  { key: 'armor', label: 'Armor', icon: 'fa-shield-halved' },
  { key: 'saving-throw', label: 'Saves & Defense', icon: 'fa-shield' },
  { key: 'magic', label: 'Magic', icon: 'fa-hat-wizard' },
  { key: 'general', label: 'General', icon: 'fa-star' },
  { key: 'flavor', label: 'Roleplay', icon: 'fa-masks-theater' }
];
