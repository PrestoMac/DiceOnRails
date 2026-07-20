import { Character } from '../types';
import { RacialTrait } from '../types';

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
  flavor: string;
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
    flavor: 'Humans are the most adaptable race, with a diverse range of cultures and backgrounds.',
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
      { id: 'keen-senses', name: 'Keen Senses', description: 'You have proficiency in the Perception skill.', kind: 'passive' },
      { id: 'fey-ancestry', name: 'Fey Ancestry', description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'charmed' } } },
      { id: 'trance', name: 'Trance', description: 'Elves don\'t need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day.', kind: 'passive' },
    ],
    languages: ['common', 'elvish'],
    icon: 'fa-leaf',
    flavor: 'Elves are graceful and long-lived, with a deep connection to nature and magic.',
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
      { id: 'dwarven-resilience', name: 'Dwarven Resilience', description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'poison' } } },
      { id: 'stonecunning', name: 'Stonecunning', description: 'Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus.', kind: 'passive' },
    ],
    languages: ['common', 'dwarvish'],
    icon: 'fa-mountain',
    flavor: 'Dwarves are stout and resilient, born of mountain stone and steel.',
  },
  {
    id: 'halfling',
    name: 'Halfling',
    description: 'The diminutive halflings survive in a world full of larger creatures by avoiding notice or, when necessary, evading trouble.',
    asi: { str: 0, dex: 2, con: 0, int: 0, wis: 0, cha: 1 },
    speed: 25,
    size: 'small',
    traits: [
      { id: 'lucky', name: 'Lucky', description: 'When you roll a 1 on an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.', kind: 'passive', effect: { kind: 'reroll-ones', payload: { scope: 'all' } } },
      { id: 'brave', name: 'Brave', description: 'You have advantage on saving throws against being frightened.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'frightened' } } },
      { id: 'halfling-nimbleness', name: 'Halfling Nimbleness', description: 'You can move through the space of any creature that is of a size larger than yours.', kind: 'passive' },
    ],
    languages: ['common', 'halfling'],
    icon: 'fa-shoe-prints',
    flavor: 'Halflings are nimble and lucky, finding comfort in the smallest places.',
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
        effect: { kind: 'breath-weapon', payload: { saveDC: '8 + CON + prof', damage: '2d6', scaling: { 6: '3d6', 11: '4d6', 16: '5d6' } } } },
      { id: 'damage-resistance-dragonborn', name: 'Damage Resistance', description: 'You have resistance to the damage type associated with your draconic ancestry.', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'from-draconic-ancestry' } } },
    ],
    languages: ['common', 'draconic'],
    icon: 'fa-dragon',
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
      { id: 'gnome-cunning', name: 'Gnome Cunning', description: 'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.', kind: 'passive', effect: { kind: 'advantage-on-save', payload: { against: 'magic' } } },
    ],
    languages: ['common', 'gnomish'],
    icon: 'fa-hat-wizard',
    flavor: 'Gnomes are tinkerers and inventors, bursting with curiosity and magical energy.',
  },
  {
    id: 'half-elf',
    name: 'Half-Elf',
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
    icon: 'fa-user-graduate',
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
      { id: 'savage-attacks', name: 'Savage Attacks', description: 'On a melee weapon crit, roll one additional damage die and add it to the total.', kind: 'passive', effect: { kind: 'weapon-damage-extra-die', payload: { dieSize: 0 } } },
    ],
    languages: ['common', 'orc'],
    icon: 'fa-fist-raised',
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
    flavor: 'Tieflings bear the mark of infernal ancestry, wielding fire and shadow.',
  },
];
