import { Character } from '../types';
import { RacialTrait } from '../types';

/** A subrace variant that modifies the base race's ASI, traits, speed, or darkvision. */
export interface SubraceDefinition {
  id: string;
  name: string;
  description: string;
  /** Full racial ASI package (REPLACE semantics: when set, it replaces the base race's ASI entirely — the base race ASI already includes the subrace-specific bonus, so both are never summed). */
  asi?: Partial<Record<keyof Character['stats'], number>>;
  /** Override the base race's darkvision (when set, this value wins). */
  darkvision?: number;
  /** Speed bonus on top of the base race's speed. */
  speedBonus?: number;
  /** Additional racial traits granted by the subrace. */
  traits?: RacialTrait[];
}

export interface RaceDefinition {
  id: string;
  name: string;
  description: string;
  asi: Record<keyof Character['stats'], number> | 'flexible-2';
  asiChoice?: 1;
  speed: number;
  size: 'small' | 'medium';
  darkvision?: number;
  traits: RacialTrait[];
  languages: string[];
  icon: string;
  /** Custom icon URL (overrides Font Awesome icon when set). */
  iconUrl?: string;
  flavor: string;
  subraces?: SubraceDefinition[];
}

export const RACES_CATALOG: RaceDefinition[] = [
  {
    id: 'human',
    name: 'Human',
    description: 'Humans are the most adaptable and ambitious people among the common races.',
    asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    speed: 30,
    size: 'medium',
    traits: [],
    languages: ['common', 'one-of-choice'],
    icon: 'fa-user',
    iconUrl: '/icons/races/human.webp',

    flavor: 'Humans are the most adaptable race, with a diverse range of cultures and backgrounds.',
    subraces: [
      { id: 'standard', name: 'Standard Human', description: 'Versatile and ambitious, with +1 to all ability scores.', asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } },
      { id: 'variant', name: 'Variant Human', description: 'Slightly less broadly gifted than a standard human. The two +1 ability-score choices are not yet selectable in the wizard — use your level-1 ASI/feat slot to allocate them.', asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, traits: [{ id: 'variant-human-feat', name: 'Bonus Feat', description: 'You gain one feat of your choice at level 1 (use your ASI/feat slot).', kind: 'passive' , icon: 'fa-trophy'}, { id: 'variant-human-skill', name: 'Bonus Skill', description: 'You gain proficiency in one skill of your choice (choose it via your skill points at level 1; not auto-applied).', kind: 'passive' , icon: 'fa-star'}] },
    ],
  },
  {
    id: 'elf',
    name: 'Elf',
    description: 'Elves are a magical people of otherworldly grace, living in the world but not entirely part of it.',
    asi: { str: 0, dex: 2, con: 0, int: 1, wis: 0, cha: 0 },
    speed: 30,
    size: 'medium',
    darkvision: 60,
    traits: [
      { id: 'keen-senses', name: 'Keen Senses', description: 'You have proficiency in the Perception skill.', kind: 'passive', effect: { kind: 'skill-proficiency', payload: { skills: ['perception'] } }, icon: 'fa-eye' },
      { id: 'fey-ancestry', name: 'Fey Ancestry', description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'charmed' } }, icon: 'fa-leaf' },
      { id: 'trance', name: 'Trance', description: 'Elves don\'t need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day.', kind: 'passive', icon: 'fa-moon' },
    ],
    languages: ['common', 'elvish'],
    icon: 'fa-leaf',
    iconUrl: '/icons/races/elf.webp',

    flavor: 'Elves are graceful and long-lived, with a deep connection to nature and magic.',
    subraces: [
      { id: 'high-elf', name: 'High Elf', description: 'High elves are graceful warriors and wizards, educated in magic and lore.', asi: { dex: 2, int: 1 }, traits: [{ id: 'elf-cantrip', name: 'Elf Cantrip', description: 'You know one cantrip of your choice from the wizard spell list.', kind: 'passive' , icon: 'fa-wand-magic-sparkles'}, { id: 'elf-weapon-training', name: 'Elf Weapon Training', description: 'You have proficiency with the longsword, shortsword, shortbow, and longbow.', kind: 'passive' , icon: 'fa-sword'}] },
      { id: 'wood-elf', name: 'Wood Elf', description: 'Wood elves are stealthy recluses, at home in the deepest forests.', asi: { dex: 2, wis: 1 }, speedBonus: 5, traits: [{ id: 'elf-weapon-training', name: 'Elf Weapon Training', description: 'You have proficiency with the longsword, shortsword, shortbow, and longbow.', kind: 'passive' , icon: 'fa-sword'}, { id: 'mask-of-the-wild', name: 'Mask of the Wild', description: 'You can hide even when lightly obscured by foliage, rain, snow, or other natural phenomena.', kind: 'passive' , icon: 'fa-user-secret'}] },
      { id: 'drow', name: 'Dark Elf (Drow)', iconUrl: '/icons/races/drow.webp', description: 'Drow elves dwell in the Underdark, adapted to its perpetual twilight.', asi: { dex: 2, cha: 1 }, darkvision: 120, traits: [{ id: 'drow-magic', name: 'Drow Magic', description: 'You know the dancing lights cantrip. At L3, you can cast faerie fire once per day. At L5, you can cast darkness once per day.', kind: 'passive' , icon: 'fa-wand-magic-sparkles'}, { id: 'drow-weapon-training', name: 'Drow Weapon Training', description: 'You have proficiency with rapiers, shortswords, and hand crossbows.', kind: 'passive' , icon: 'fa-sword'}] },
    ],
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    description: 'Bold and hardy, dwarves are known as skilled warriors, miners, and craftsmen.',
    asi: { str: 0, dex: 0, con: 2, int: 0, wis: 1, cha: 0 },
    speed: 25,
    size: 'medium',
    darkvision: 60,
    traits: [
      { id: 'dwarven-resilience', name: 'Dwarven Resilience', description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'poison' } }, icon: 'fa-shield-halved' },

      { id: 'dwarven-resilience-saves', name: 'Dwarven Resilience (Poison Saves)', description: 'Advantage on saving throws against poison.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'poison' } } },
      { id: 'stonecunning', name: 'Stonecunning', description: 'Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus.', kind: 'passive', effect: { kind: 'skill-proficiency', payload: { skills: ['history'] } }, icon: 'fa-mountain' },

      { id: 'dwarven-combat-training', name: 'Dwarven Combat Training', description: 'You have proficiency with the battleaxe, handaxe, throwing hammer, and warhammer.', kind: 'passive' , icon: 'fa-sword'},

    ],
    languages: ['common', 'dwarvish'],
    icon: 'fa-mountain',
    iconUrl: '/icons/races/dwarf.webp',

    flavor: 'Dwarves are stout and resilient, born of mountain stone and steel.',
    subraces: [
      { id: 'hill-dwarf', name: 'Hill Dwarf', description: 'Hill dwarfs are wise and tough, with deep roots in mountain communities.', asi: { con: 2, wis: 1 }, traits: [{ id: 'dwarven-toughness', name: 'Dwarven Toughness', description: 'Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.', kind: 'passive', effect: { kind: 'hp-per-level', payload: { amount: 1 } }, icon: 'fa-heart-pulse' }] },

      { id: 'mountain-dwarf', name: 'Mountain Dwarf', description: 'Mountain dwarfs are strong and hardy, trained in heavy armor from youth.', asi: { con: 2, str: 2 }, traits: [{ id: 'dwarven-armor-training', name: 'Dwarven Armor Training', description: 'You have proficiency with light and medium armor.', kind: 'passive' , icon: 'fa-shirt'}] },

    ],
  },
  {
    id: 'halfling',
    name: 'Halfling',
    description: 'The diminutive halflings survive in a world full of larger creatures by avoiding notice or, when necessary, evading trouble.',
    asi: { str: 0, dex: 2, con: 0, int: 0, wis: 0, cha: 1 },
    speed: 25,
    size: 'small',
    traits: [
      { id: 'lucky', name: 'Lucky', description: 'When you roll a 1 on an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.', kind: 'passive', effect: { kind: 'reroll-ones', payload: { scope: 'all' } }, icon: 'fa-dice' },

      { id: 'brave', name: 'Brave', description: 'You have advantage on saving throws against being frightened.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'frightened' } }, icon: 'fa-shield-halved' },

      { id: 'halfling-nimbleness', name: 'Halfling Nimbleness', description: 'You can move through the space of any creature that is of a size larger than yours.', kind: 'passive' , icon: 'fa-person-walking'},

    ],
    languages: ['common', 'halfling'],
    icon: 'fa-person-walking',
    iconUrl: '/icons/races/halfling.webp',

    flavor: 'Halflings are nimble and lucky, finding comfort in the smallest places.',
    subraces: [
      { id: 'lightfoot', name: 'Lightfoot', description: 'Lightfoot halflings are stealthy and charming, able to hide behind larger creatures.', asi: { dex: 2, cha: 1 }, traits: [{ id: 'naturally-stealthy', name: 'Naturally Stealthy', description: 'You can attempt to hide even when obscured only by a creature larger than you.', kind: 'passive' , icon: 'fa-user-secret'}] },
      { id: 'stout', name: 'Stout', description: 'Stout halflings are hardier than average, with dwarven resilience in their bloodline.', asi: { dex: 2, con: 1 }, traits: [{ id: 'stout-resilience', name: 'Stout Resilience', description: 'You have advantage on saving throws against poison, and resistance against poison damage.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'poison' } }, icon: 'fa-shield-halved' }, { id: 'stout-resistance', name: 'Stout Resistance', description: 'You have resistance to poison damage.', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'poison' } } }] },
    ],
  },
  {
    id: 'dragonborn',
    name: 'Dragonborn',
    description: 'Born of dragons, dragonborn walk the world with a purpose.',
    asi: { str: 2, dex: 0, con: 0, int: 0, wis: 0, cha: 1 },
    speed: 30,
    size: 'medium',
    traits: [
      { id: 'draconic-ancestry', name: 'Draconic Ancestry', description: 'You choose one dragon type (Black, Blue, Brass, Bronze, Copper, Gold, Green, Red, Silver, White). Your breath weapon and damage resistance use this type.', kind: 'passive' },
      { id: 'breath-weapon', name: 'Breath Weapon', description: 'Action: exhale destructive energy. Blue and Bronze breathe a 30-ft line; Brass, Copper, Gold, Green, Red, Silver, White breathe a 30-ft cone. Each creature in the area makes a DEX save (DC 8 + CON mod + prof). On fail, take 2d6 damage (3d6 at L6, 4d6 at L11, 5d6 at L16). 1 use per short rest.', kind: 'resource', grantsResource: 'breath-weapon',

        effect: { kind: 'breath-weapon', payload: { saveDC: '8 + CON + prof', damage: '2d6', scaling: { 6: '3d6', 11: '4d6', 16: '5d6' } } }, icon: 'fa-fire' },
      { id: 'damage-resistance-dragonborn', name: 'Damage Resistance', description: 'You have resistance to the damage type associated with your draconic ancestry.', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'from-draconic-ancestry' } } },
    ],
    languages: ['common', 'draconic'],
    icon: 'fa-dragon',
    iconUrl: '/icons/races/dragonborn.webp',

    flavor: 'Dragonborn are proud, draconic humanoids with ancient lineage and elemental breath weapons.',
  },
  {
    id: 'gnome',
    name: 'Gnome',
    description: 'A gnome\'s energy and enthusiasm for living shines through every inch of their tiny body.',
    asi: { str: 0, dex: 0, con: 0, int: 2, wis: 0, cha: 0 },
    speed: 25,
    size: 'small',
    darkvision: 60,
    traits: [
      { id: 'gnome-cunning', name: 'Gnome Cunning', description: 'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'magic', stats: ['int', 'wis', 'cha'] } }, icon: 'fa-brain' },

    ],
    languages: ['common', 'gnomish'],
    icon: 'fa-gear',
    iconUrl: '/icons/races/gnome.webp',

    flavor: 'Gnomes are tinkerers and inventors, bursting with curiosity and magical energy.',
    subraces: [
      { id: 'rock-gnome', name: 'Rock Gnome', description: 'Rock gnomes are inventive and sturdy, known for their tinkering and artificing.', asi: { int: 2, con: 1 }, traits: [{ id: 'artificers-lore', name: 'Artificer\'s Lore', description: 'Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus.', kind: 'passive' }, { id: 'tinker', name: 'Tinker', description: 'You can spend 1 hour and 10 gp worth of materials to construct a tiny clockwork device.', kind: 'passive' }] },

      { id: 'forest-gnome', name: 'Forest Gnome', description: 'Forest gnomes are secretive and quick, at home in the deepest woodland.', asi: { int: 2, dex: 1 }, traits: [{ id: 'natural-illusionist', name: 'Natural Illusionist', description: 'You know the minor illusion cantrip. Intelligence is your spellcasting ability for it.', kind: 'passive' }, { id: 'speak-with-small-beasts', name: 'Speak with Small Beasts', description: 'You can communicate simple ideas with Small or smaller beasts.', kind: 'passive' }] },

    ],
  },
  {
    id: 'half-elf',
    name: 'Half-Elf', iconUrl: '/icons/races/half-elf.webp',
    description: 'Walking in two worlds but truly belonging to neither, half-elves combine what some say are the best qualities of their elf and human parents.',
    asi: 'flexible-2',
    asiChoice: 1,
    speed: 30,
    size: 'medium',
    darkvision: 60,
    traits: [
      { id: 'fey-ancestry', name: 'Fey Ancestry', description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'charmed' } } },

      { id: 'skill-versatility', name: 'Skill Versatility', description: 'You gain proficiency in two skills of your choice.', kind: 'passive' },
    ],
    languages: ['common', 'elvish', 'one-of-choice'],
    icon: 'fa-users',

    flavor: 'Half-elves blend the grace of their elven heritage with the ambition of their human blood.',
  },
  {
    id: 'half-orc',
    name: 'Half-Orc',
    description: 'Whether united under the leadership of a mighty warlock or having fought to a standstill after years of conflict, half-orcs and orcs share a fierce heritage.',
    asi: { str: 2, dex: 0, con: 1, int: 0, wis: 0, cha: 0 },
    speed: 30,
    size: 'medium',
    darkvision: 60,
    traits: [
      { id: 'relentless-endurance', name: 'Relentless Endurance', description: 'When you are reduced to 0 HP but not killed outright, you drop to 1 HP instead. Once per long rest.', kind: 'resource', grantsResource: 'relentless-endurance' },
      { id: 'savage-attacks', name: 'Savage Attacks', description: 'On a melee weapon crit, roll one additional damage die and add it to the total.', kind: 'passive', effect: { kind: 'crit-bonus-dice', payload: { count: 1 } } },
    ],
    languages: ['common', 'orc'],
    icon: 'fa-user',
    iconUrl: '/icons/races/half-orc.webp',

    flavor: 'Half-orcs are fierce warriors, combining orcish strength with human adaptability.',
  },
  {
    id: 'tiefling',
    name: 'Tiefling',
    description: 'Tieflings share a ravenous heritage with devils.',
    asi: { str: 0, dex: 0, con: 0, int: 1, wis: 0, cha: 2 },
    speed: 30,
    size: 'medium',
    darkvision: 60,
    traits: [
      { id: 'hellish-resistance', name: 'Hellish Resistance', description: 'You have resistance to fire damage.', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'fire' } } },
      { id: 'infernal-legacy', name: 'Infernal Legacy', description: 'You know the thaumaturgy cantrip. At L3, you can cast hellish rebuke once per long rest as a L2 spell (DEX save, 3d10 fire). At L5, you can cast darkness once per long rest. Charisma is your spellcasting ability for these.', kind: 'resource', grantsResource: 'hellish-rebuke' },
    ],
    languages: ['common', 'infernal'],
    icon: 'fa-fire',
    iconUrl: '/icons/races/tiefling.webp',

    flavor: 'Tieflings bear the mark of infernal ancestry, wielding fire and shadow.',
  },
];
