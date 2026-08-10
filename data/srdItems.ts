import { InventoryItem } from '../types';

export const SRD_ITEMS: Omit<InventoryItem, 'quantity'>[] = [
  {
    name: 'Dagger',
    type: 'weapon',
    icon: 'fa-khanda',
    rarity: 'common',
    description: 'A small, sharp knife used for stabbing or throwing.',
    weight: 1,
    cost: '2 gp',
    stats: {
      damage: '1d4',
      damageType: 'piercing',
      properties: ['finesse', 'light', 'thrown (20/60)']
    }
  },
  {
    name: 'Daggers',
    type: 'weapon',
    icon: 'fa-khanda',
    rarity: 'common',
    description: 'A pair of small, easily concealed sharp blades.',
    weight: 2,
    cost: '4 gp',
    stats: {
      damage: '1d4',
      damageType: 'piercing',
      properties: ['finesse', 'light', 'thrown (20/60)']
    }
  },
  {
    name: 'Shortsword',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A short, double-edged blade popular among rogues and dual-wielders.',
    weight: 2,
    cost: '10 gp',
    stats: {
      damage: '1d6',
      damageType: 'piercing',
      properties: ['finesse', 'light']
    }
  },
  {
    name: 'Longsword',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A versatile two-handed sword favored by knights and warriors.',
    weight: 4,
    cost: '15 gp',
    stats: {
      damage: '1d8',
      damageType: 'slashing',
      properties: ['versatile (1d10)']
    }
  },
  {
    name: 'Greatsword',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A massive two-handed sword that deals devastating cuts.',
    weight: 6,
    cost: '50 gp',
    stats: {
      damage: '2d6',
      damageType: 'slashing',
      properties: ['heavy', 'two-handed']
    }
  },
  {
    name: 'Warhammer',
    type: 'weapon',
    icon: 'fa-hammer',
    rarity: 'common',
    description: 'A heavy war hammer with a crushing head, favored by paladins.',
    weight: 2,
    cost: '15 gp',
    stats: {
      damage: '1d8',
      damageType: 'bludgeoning',
      properties: ['versatile (1d10)']
    }
  },
  {
    name: 'Mace',
    type: 'weapon',
    icon: 'fa-hammer',
    rarity: 'common',
    description: 'A heavy club with a metal head, designed to crush armor and bone.',
    weight: 4,
    cost: '5 gp',
    stats: {
      damage: '1d6',
      damageType: 'bludgeoning'
    }
  },
  {
    name: 'Quarterstaff',
    type: 'weapon',
    icon: 'fa-staff-snake',
    rarity: 'common',
    description: 'A simple cylindrical rod of wood, often capped with metal. Light and versatile.',
    weight: 4,
    cost: '2 sp',
    stats: {
      damage: '1d6',
      damageType: 'bludgeoning',
      properties: ['versatile (1d8)']
    }
  },
  {
    name: 'Staff',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'An arcane staff that doubles as a walking stick and a weapon.',
    weight: 4,
    cost: '5 gp',
    stats: {
      damage: '1d6',
      damageType: 'bludgeoning',
      properties: ['versatile (1d8)']
    }
  },
  {
    name: 'Rock',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A simple stone picked up off the ground. Effective when thrown.',
    weight: 1,
    cost: '0 gp',
    stats: {
      damage: '1d4',
      damageType: 'bludgeoning',
      properties: ['thrown (20/60)']
    }
  },
  {
    name: 'Shortbow',
    type: 'weapon',
    icon: 'fa-bow-arrow',
    rarity: 'common',
    description: 'A compact bow for hunting and ranged skirmishing.',
    weight: 2,
    cost: '25 gp',
    stats: {
      damage: '1d6',
      damageType: 'piercing',
      properties: ['range (80/320)', 'two-handed']
    }
  },
  {
    name: 'Leather Armor',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Light vest and leggings made of boiled leather.',
    weight: 8,
    cost: '10 gp',
    stats: {
      acFormula: '11 + DEX'
    }
  },
  {
    name: 'Hide Armor',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Crude armor fashioned from thick furs and hides.',
    weight: 12,
    cost: '10 gp',
    stats: {
      acFormula: '12 + DEX'
    }
  },
  {
    name: 'Chain Shirt',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'A shirt made of interlocking metal rings, worn between clothing layers.',
    weight: 20,
    cost: '50 gp',
    stats: {
      acFormula: '13 + DEX'
    }
  },
  {
    name: 'Chain Mail',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Heavy interlocking metal rings offering solid protection.',
    weight: 55,
    cost: '75 gp',
    stats: {
      acFormula: '16',
      stealthDisadv: true,
      strengthReq: 13
    }
  },
  {
    name: 'Plate Armor',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Shaped metal plates covering the entire body. Maximum protection.',
    weight: 65,
    cost: '1500 gp',
    stats: {
      acFormula: '18',
      stealthDisadv: true,
      strengthReq: 15
    }
  },
  {
    name: 'Arcane Robes',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Light, comfortable robes woven with thread that conducts arcane energy.',
    weight: 3,
    cost: '1 gp',
    stats: {
      acFormula: '10 + DEX'
    }
  },
  {
    name: 'Shield',
    type: 'shield',
    icon: 'fa-shield-halved',
    rarity: 'common',
    description: 'A wooden or metal shield carried in one hand to deflect attacks.',
    weight: 6,
    cost: '10 gp',
    stats: {
      acBonus: 2
    }
  },
  {
    name: 'Potion of Healing',
    type: 'potion',
    icon: 'fa-flask-round-potion',
    rarity: 'common',
    description: 'A magical red fluid that seals wounds upon ingestion.',
    weight: 0.5,
    cost: '50 gp',
    stats: {
      healing: '2d4+2'
    }
  },
  {
    name: 'Potion of Greater Healing',
    type: 'potion',
    icon: 'fa-flask-round-potion',
    rarity: 'uncommon',
    description: 'A stronger blend of healing herbs and magic fluid.',
    weight: 0.5,
    cost: '150 gp',
    stats: {
      healing: '4d4+4'
    }
  },
  {
    name: 'Potion of Superior Healing',
    type: 'potion',
    icon: 'fa-flask-round-potion',
    rarity: 'rare',
    description: 'A rare, highly concentrated healing potion.',
    weight: 0.5,
    cost: '500 gp',
    stats: {
      healing: '8d4+8'
    }
  },
  {
    name: 'Spellbook',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A leather-bound journal containing intricate magical formulae and spells.',
    weight: 3,
    cost: '50 gp',
    stats: {}
  },
  {
    name: 'Thieves\' Tools',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A set of lockpicks and shears for bypassing traps and locks.',
    weight: 1,
    cost: '25 gp',
    stats: {}
  },
  {
    name: 'Holy Symbol',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A representation of a deity, used as a focus for divine spellcasters.',
    weight: 1,
    cost: '5 gp',
    stats: {}
  },
  {
    name: 'Backpack',
    type: 'gear',
    icon: 'fa-cross',
    rarity: 'common',
    description: 'A sturdy leather backpack that stores your traveling gear.',
    weight: 5,
    cost: '2 gp',
    stats: {}
  },
  {
    name: 'Bedroll',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A wool blanket and thin pad rolled up for sleeping on the ground.',
    weight: 7,
    cost: '1 gp',
    stats: {}
  },
  {
    name: 'Explorer\'s Pack',
    type: 'gear',
    icon: 'fa-bed',
    rarity: 'common',
    description: 'A survival pack containing a backpack, bedroll, torches, rations, and waterskin.',
    weight: 50,
    cost: '10 gp',
    stats: {}
  },
  {
    name: 'Rope, Hempen (50 ft)',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'Fifty feet of sturdy hempen rope.',
    weight: 10,
    cost: '1 gp',
    stats: {}
  },
  {
    name: 'Rations (1 day)',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'Compact, dry rations consisting of jerky, dried fruit, and hardtack.',
    weight: 2,
    cost: '5 sp',
    stats: {}
  },
  {
    name: 'Waterskin',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A leather pouch designed to hold up to four pints of water.',
    weight: 5,
    cost: '2 sp',
    stats: {}
  },
  {
    name: 'Torch',
    type: 'gear',
    icon: 'fa-bottle-water',
    rarity: 'common',
    description: 'A wooden stick covered in pitch. Provides bright light in a 20-foot radius.',
    weight: 1,
    cost: '1 cp',
    stats: {}
  },
  {
    name: 'Handaxe',
    type: 'weapon',
    icon: 'fa-lightbulb',
    rarity: 'common',
    description: 'A small axe that can be thrown or used in melee.',
    weight: 2,
    cost: '5 gp',
    stats: {
      damage: '1d6',
      damageType: 'slashing',
      properties: ['light', 'thrown (20/60)']
    }
  },
  {
    name: 'Light Hammer',
    type: 'weapon',
    icon: 'fa-hammer',
    rarity: 'common',
    description: 'A small hammer designed for throwing.',
    weight: 2,
    cost: '2 gp',
    stats: {
      damage: '1d4',
      damageType: 'bludgeoning',
      properties: ['light', 'thrown (20/60)']
    }
  },
  {
    name: 'Javelin',
    type: 'weapon',
    icon: 'fa-person-skating',
    rarity: 'common',
    description: 'A light spear designed for throwing.',
    weight: 2,
    cost: '5 sp',
    stats: {
      damage: '1d6',
      damageType: 'piercing',
      properties: ['thrown (30/120)']
    }
  },
  {
    name: 'Greataxe',
    type: 'weapon',
    icon: 'fa-axe',
    rarity: 'common',
    description: 'A massive two-handed axe that delivers devastating blows.',
    weight: 7,
    cost: '30 gp',
    stats: {
      damage: '1d12',
      damageType: 'slashing',
      properties: ['heavy', 'two-handed']
    }
  },
  {
    name: 'Light Crossbow',
    type: 'weapon',
    icon: 'fa-crosshairs',
    rarity: 'common',
    description: 'A ranged weapon that fires bolts with a crank mechanism.',
    weight: 5,
    cost: '25 gp',
    stats: {
      damage: '1d8',
      damageType: 'piercing',
      properties: ['range (80/320)', 'two-handed', 'loading']
    }
  },
  {
    name: 'Heavy Crossbow',
    type: 'weapon',
    icon: 'fa-crosshairs',
    rarity: 'common',
    description: 'A large crossbow requiring two hands and a crank to fire.',
    weight: 18,
    cost: '50 gp',
    stats: {
      damage: '1d10',
      damageType: 'piercing',
      properties: ['range (100/400)', 'two-handed', 'loading', 'heavy']
    }
  },
  {
    name: 'Longbow',
    type: 'weapon',
    icon: 'fa-bow-arrow',
    rarity: 'common',
    description: 'A large bow made of yew or other woods.',
    weight: 2,
    cost: '50 gp',
    stats: {
      damage: '1d8',
      damageType: 'piercing',
      properties: ['range (150/600)', 'two-handed', 'heavy']
    }
  },
  {
    name: 'Rapier',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A slender, pointy sword with a basket hilt.',
    weight: 2,
    cost: '25 gp',
    stats: {
      damage: '1d8',
      damageType: 'piercing',
      properties: ['finesse']
    }
  },
  {
    name: 'Scimitar',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A curved, slashing sword with a light blade.',
    weight: 3,
    cost: '25 gp',
    stats: {
      damage: '1d6',
      damageType: 'slashing',
      properties: ['finesse', 'light']
    }
  },
  {
    name: 'Battleaxe',
    type: 'weapon',
    icon: 'fa-axe',
    rarity: 'common',
    description: 'A versatile axe that can be wielded one- or two-handed.',
    weight: 4,
    cost: '10 gp',
    stats: {
      damage: '1d8',
      damageType: 'slashing',
      properties: ['versatile (1d10)']
    }
  },
  {
    name: 'Sickle',
    type: 'weapon',
    icon: 'fa-sickle',
    rarity: 'common',
    description: 'A curved farming tool used as a weapon.',
    weight: 2,
    cost: '1 gp',
    stats: {
      damage: '1d4',
      damageType: 'slashing',
      properties: ['light']
    }
  },
  {
    name: 'Spear',
    type: 'weapon',
    icon: 'fa-person-skating',
    rarity: 'common',
    description: 'A simple polearm with a pointed tip.',
    weight: 3,
    cost: '1 gp',
    stats: {
      damage: '1d6',
      damageType: 'piercing',
      properties: ['thrown (20/60)', 'versatile (1d8)']
    }
  },
  {
    name: 'Club',
    type: 'weapon',
    icon: 'fa-baseball-bat',
    rarity: 'common',
    description: 'A simple, heavy piece of wood used as a weapon.',
    weight: 2,
    cost: '1 sp',
    stats: {
      damage: '1d4',
      damageType: 'bludgeoning',
      properties: ['light']
    }
  },
  {
    name: 'Greatclub',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A large, heavy club wielded with two hands.',
    weight: 10,
    cost: '2 sp',
    stats: {
      damage: '1d8',
      damageType: 'bludgeoning',
      properties: ['two-handed']
    }
  },
  {
    name: 'Halberd',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A two-handed pole weapon with an axe blade and a spike.',
    weight: 6,
    cost: '20 gp',
    stats: {
      damage: '1d10',
      damageType: 'slashing',
      properties: ['heavy', 'two-handed', 'reach']
    }
  },
  {
    name: 'Glaive',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A polearm with a single-edged blade on the end.',
    weight: 6,
    cost: '20 gp',
    stats: {
      damage: '1d10',
      damageType: 'slashing',
      properties: ['heavy', 'two-handed', 'reach']
    }
  },
  {
    name: 'Lance',
    type: 'weapon',
    icon: 'fa-person-skating',
    rarity: 'common',
    description: 'A long reach weapon designed for mounted combat.',
    weight: 6,
    cost: '10 gp',
    stats: {
      damage: '1d12',
      damageType: 'piercing',
      properties: ['reach', 'special']
    }
  },
  {
    name: 'Maul',
    type: 'weapon',
    icon: 'fa-hammer',
    rarity: 'common',
    description: 'A heavy sledgehammer wielded with two hands.',
    weight: 10,
    cost: '10 gp',
    stats: {
      damage: '2d6',
      damageType: 'bludgeoning',
      properties: ['heavy', 'two-handed']
    }
  },
  {
    name: 'Pike',
    type: 'weapon',
    icon: 'fa-person-skating',
    rarity: 'common',
    description: 'A very long spear used by infantry.',
    weight: 18,
    cost: '5 gp',
    stats: {
      damage: '1d10',
      damageType: 'piercing',
      properties: ['heavy', 'two-handed', 'reach']
    }
  },
  {
    name: 'War Pick',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A pick designed for punching through armor.',
    weight: 2,
    cost: '5 gp',
    stats: {
      damage: '1d8',
      damageType: 'piercing',
      properties: ['versatile (1d10)']
    }
  },
  {
    name: 'Flail',
    type: 'weapon',
    icon: 'fa-mace',
    rarity: 'common',
    description: 'A spiked ball on a chain attached to a handle.',
    weight: 2,
    cost: '10 gp',
    stats: {
      damage: '1d8',
      damageType: 'bludgeoning',
      properties: []
    }
  },
  {
    name: 'Morningstar',
    type: 'weapon',
    icon: 'fa-mace',
    rarity: 'common',
    description: 'A spiked metal ball on a shaft.',
    weight: 4,
    cost: '15 gp',
    stats: {
      damage: '1d8',
      damageType: 'piercing',
      properties: []
    }
  },
  {
    name: 'Trident',
    type: 'weapon',
    icon: 'fa-sword',
    rarity: 'common',
    description: 'A three-pronged spear used in fishing and combat.',
    weight: 4,
    cost: '5 gp',
    stats: {
      damage: '1d6',
      damageType: 'piercing',
      properties: ['thrown (20/60)', 'versatile (1d8)']
    }
  },
  {
    name: 'Net',
    type: 'weapon',
    icon: 'fa-net',
    rarity: 'common',
    description: 'A mesh net used to entangle creatures.',
    weight: 3,
    cost: '1 gp',
    stats: {
      damage: '0',
      damageType: 'bludgeoning',
      properties: ['thrown (5/15)', 'special']
    }
  },
  {
    name: 'Dart',
    type: 'weapon',
    icon: 'fa-person-skating',
    rarity: 'common',
    description: 'A small, light missile with a fletched tail.',
    weight: 0.25,
    cost: '5 cp',
    stats: {
      damage: '1d4',
      damageType: 'piercing',
      properties: ['finesse', 'thrown (20/60)']
    }
  },
  {
    name: 'Sling',
    type: 'weapon',
    icon: 'fa-person-skating',
    rarity: 'common',
    description: 'A simple leather pouch on a cord for throwing stones.',
    weight: 0,
    cost: '1 sp',
    stats: {
      damage: '1d4',
      damageType: 'bludgeoning',
      properties: ['range (30/120)']
    }
  },
  {
    name: 'Padded Armor',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Quilted layers of cloth and padding.',
    weight: 8,
    cost: '5 gp',
    stats: {
      acFormula: '11 + DEX',
      stealthDisadv: true
    }
  },
  {
    name: 'Studded Leather Armor',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Leather armor reinforced with rivets or spikes.',
    weight: 13,
    cost: '45 gp',
    stats: {
      acFormula: '12 + DEX'
    }
  },
  {
    name: 'Scale Mail',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Armor made of overlapping metal scales.',
    weight: 45,
    cost: '50 gp',
    stats: {
      acFormula: '14 + DEX (max 2)',
      stealthDisadv: true
    }
  },
  {
    name: 'Breastplate',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'A metal chest piece worn over clothing or padding.',
    weight: 20,
    cost: '400 gp',
    stats: {
      acFormula: '14 + DEX (max 2)'
    }
  },
  {
    name: 'Splint Armor',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Band of metal plates riveted to leather backing.',
    weight: 60,
    cost: '200 gp',
    stats: {
      acFormula: '17',
      stealthDisadv: true,
      strengthReq: 15
    }
  },
  {
    name: 'Ring Mail',
    type: 'armor',
    icon: 'fa-shirt',
    rarity: 'common',
    description: 'Leather armor with metal rings sewn into it.',
    weight: 40,
    cost: '30 gp',
    stats: {
      acFormula: '14',
      stealthDisadv: true
    }
  },
  {
    name: 'Arcane Focus',
    type: 'gear',
    icon: 'fa-wand-magic',
    rarity: 'common',
    description: 'An orb, crystal, rod, or staff used as a spellcasting focus.',
    weight: 1,
    cost: '10 gp',
    stats: {}
  },
  {
    name: 'Druidic Focus',
    type: 'gear',
    icon: 'fa-wand-magic',
    rarity: 'common',
    description: 'A sprig of mistletoe, totem item, or wooden staff used as a druidic focus.',
    weight: 1,
    cost: '5 gp',
    stats: {}
  },
  {
    name: 'Component Pouch',
    type: 'gear',
    icon: 'fa-leaf',
    rarity: 'common',
    description: 'A pouch containing material components for spellcasting.',
    weight: 2,
    cost: '25 gp',
    stats: {}
  },
  {
    name: 'Priest\'s Pack',
    type: 'gear',
    icon: 'fa-pouch',
    rarity: 'common',
    description: 'Includes a backpack, blanket, candles, tinderbox, alms box, rations, and waterskin.',
    weight: 20,
    cost: '19 gp',
    stats: {}
  },
  {
    name: 'Dungeoneer\'s Pack',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'Includes a backpack, crowbar, hammer, pitons, torches, rations, waterskin, and rope.',
    weight: 50,
    cost: '12 gp',
    stats: {}
  },
  {
    name: 'Entertainer\'s Pack',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'Includes a backpack, bedroll, costume, candles, rations, waterskin, and disguise kit.',
    weight: 40,
    cost: '40 gp',
    stats: {}
  },
  {
    name: 'Scholar\'s Pack',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'Includes a backpack, book of lore, ink, ink pen, parchment, and lamp.',
    weight: 10,
    cost: '40 gp',
    stats: {}
  },
  {
    name: 'Diplomat\'s Pack',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'Includes a chest, map/scroll case, fine clothes, ink, lamp, oil, paper, perfume, and sealing wax.',
    weight: 36,
    cost: '39 gp',
    stats: {}
  },
  {
    name: 'Herbalism Kit',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A kit for identifying and brewing herbal remedies and potions.',
    weight: 3,
    cost: '5 gp',
    stats: {}
  },
  {
    name: 'Poisoner\'s Kit',
    type: 'gear',
    icon: 'fa-suitcase',
    rarity: 'common',
    description: 'A kit for extracting and mixing poisons.',
    weight: 2,
    cost: '50 gp',
    stats: {}
  },
];
