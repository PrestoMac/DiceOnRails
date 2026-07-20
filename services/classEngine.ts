import { Character, ResourcePool, InventoryItem } from '../types';
import { CLASSES_CATALOG, ClassDefinition } from '../utils/classes';
import { RACES_CATALOG, RaceDefinition } from '../utils/races';
import { SubclassSummary } from '../types';
import { getExhaustionPenalty } from './conditionEngine';
import { getResilientSaveBonus } from './featsService';

/** Calculates the ability modifier for a given score. */
function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Returns the ability modifier for a given stat value. */
export const getMod = abilityMod;

/** Returns the spellcasting ability modifier value for the character's class, or null if not a spellcaster. */
function spellAbilityValue(character: Character): number | null {
  const classDef = getClassDef(character.class);
  return classDef?.spellcasting ? abilityMod(character.stats[classDef.spellcasting.ability]) : null;
}

/** Looks up a class definition by its lowercase ID from the classes catalog. */
export function getClassDef(classId: string): ClassDefinition | undefined {
  if (!classId) return undefined;
  return CLASSES_CATALOG.find(c => c.id === classId.toLowerCase());
}

/** Looks up a race definition by its lowercase ID from the races catalog. */
export function getRaceDef(raceId: string): RaceDefinition | undefined {
  return RACES_CATALOG.find(r => r.id === raceId.toLowerCase());
}

/** Looks up a subclass definition by class ID and subclass ID. */
export function getSubclassDef(classId: string, subclassId: string): SubclassSummary | undefined {
  return getClassDef(classId)?.subclasses.find(s => s.id === subclassId.toLowerCase());
}

/** Calculates the maximum HP for a character accounting for class, CON, feats (Tough), Draconic Bloodline, and bonuses. */
export function calculateMaxHp(character: Character): number {
  const classDef = getClassDef(character.class);
  if (!classDef) return character.hp?.max ?? 10;
  const conMod = abilityMod(character.stats.con);
  const draconicBonus = character.sorcerousOrigin === 'draconic-bloodline' ? character.level : 0;
  const toughBonus = character.feats?.includes('tough') ? 2 * character.level : 0;
  const total = classDef.hpBase + conMod + (classDef.hpPerLevel + conMod) * (character.level - 1)
              + draconicBonus + toughBonus + (character.maxHpBonus || 0);
  return Math.max(1, total);
}

/** Checks whether a character can equip a given armor type based on class proficiencies and domain features. */
export function canEquipArmor(character: Character, armorType: 'light' | 'medium' | 'heavy' | 'shield'): boolean {
  const classDef = getClassDef(character.class);
  if (!classDef) return armorType === 'light';
  if (classDef.armorProfs.includes(armorType)) return true;
  return classDef.id === 'cleric' && character.divineDomain === 'life-domain' && armorType === 'heavy';
}

/** Determines the armor type category (light/medium/heavy/shield) from an inventory item's stats and name. */
export function getArmorTypeFromItem(item: InventoryItem): 'light' | 'medium' | 'heavy' | 'shield' {
  if (item.type === 'shield') return 'shield';
  const formula = item.stats?.acFormula || '';
  if (formula.startsWith('11')) return 'light';
  if (/^1[2-5]/.test(formula)) return 'medium';
  if (/^1[6-8]/.test(formula)) return 'heavy';
  const name = item.name?.toLowerCase() ?? '';
  if (/(?:plate|chain mail|splint|scale mail)/.test(name)) return 'heavy';
  return 'light';
}

/** Checks whether the character has Draconic Resilience from the Draconic Bloodline sorcerer subclass. */
function hasDraconicResilience(character: Character): boolean {
  return character.class === 'sorcerer' && character.sorcerousOrigin === 'draconic-bloodline';
}

/** Evaluates whether a character meets a named condition (e.g. 'no-heavy-armor', 'no-armor'). */
function meetsCondition(character: Character, condition: string | undefined): boolean {
  if (!condition) return true;
  if (condition === 'no-heavy-armor') {
    const equipped = character.inventory.find(i => i.equipped && i.type === 'armor');
    return !equipped || /(?:leather|hide|chain shirt)/.test(equipped.name?.toLowerCase() ?? '');
  }
  if (condition === 'no-armor') {
    return !character.inventory.some(i => i.equipped && (i.type === 'armor' || i.type === 'shield'));
  }
  return true;
}

/** Parses an armor AC formula (e.g. '12 + DEX', '14 max 2') and returns the calculated AC value. */
function parseArmorFormula(formula: string, dexMod: number): number {
  if (formula.includes('max 2')) return parseInt(formula) + Math.min(2, dexMod);
  if (formula.includes('+ DEX')) return parseInt(formula) + dexMod;
  return parseInt(formula);
}

/** Adds +1 AC from the Dual Wielder feat if the character has two weapons equipped. */
function addDualWielderBonus(character: Character, ac: number): number {
  if (character.feats?.includes('dual-wielder')) {
    const equippedWeapons = character.inventory.filter(i => i.equipped && i.type === 'weapon');
    if (equippedWeapons.length >= 2) ac += 1;
  }
  return ac;
}

/** Calculates a character's full Armor Class considering armor, shield, class features (Barbarian/Monk/Draconic), feats, and bonuses. */
export function calculateAc(character: Character, equippedArmor: InventoryItem | null): number {
  const dexMod = abilityMod(character.stats.dex);
  const conMod = abilityMod(character.stats.con);
  const wisMod = abilityMod(character.stats.wis);
  const hasShield = character.inventory.some(i => i.equipped && i.type === 'shield');
  const shieldBonus = hasShield ? 2 : 0;
  const acBonus = character.acBonus || 0;

  if (!equippedArmor) {
    if (character.class === 'barbarian') {
      return addDualWielderBonus(character, 10 + dexMod + conMod + shieldBonus + acBonus);
    }
    if (character.class === 'monk') {
      return addDualWielderBonus(character, 10 + dexMod + wisMod + shieldBonus + acBonus);
    }
    if (hasDraconicResilience(character)) {
      return addDualWielderBonus(character, 13 + dexMod + shieldBonus + acBonus);
    }
    return addDualWielderBonus(character, 10 + dexMod + shieldBonus + acBonus);
  }

  if (equippedArmor.type === 'shield') {
    return addDualWielderBonus(character, 10 + dexMod + acBonus + (hasShield ? 2 : 0));
  }

  const formula = equippedArmor.stats?.acFormula || '10 + DEX';
  let ac = parseArmorFormula(formula, dexMod) + shieldBonus + acBonus;
  ac = addDualWielderBonus(character, ac);
  if (character.acMinimum && ac < character.acMinimum) ac = character.acMinimum;
  return ac;
}

/** Computes the total saving throw bonus for a given stat, including proficiency, feats (Resilient, Shield Master), and Rogue's Slippery Mind. */
export function getSavingThrowBonus(character: Character, stat: 'str'|'dex'|'con'|'int'|'wis'|'cha'): number {
  const ability = abilityMod(character.stats[stat]);
  const classDef = getClassDef(character.class);
  const profBonus = getProficiencyBonus(character);
  const isProficient = classDef?.savingThrowProfs.includes(stat) ?? false;
  let bonus = ability + (isProficient ? profBonus : 0);
  if (character.feats?.includes('resilient')) {
    try {
      bonus += getResilientSaveBonus(character, stat);
    } catch { /* featsService unavailable in some contexts */ }
  }
  if (character.feats?.includes('shield-master') && stat === 'dex' &&
      character.inventory.some(i => i.equipped && i.type === 'shield')) {
    bonus += 2;
  }
  if (stat === 'dex' && character.class === 'rogue' && character.level >= 15 && !isProficient) {
    bonus += profBonus;
  }
  return bonus;
}

/** Returns the proficiency bonus for a character based on level: 2 + floor((level-1)/4). */
export function getProficiencyBonus(character: Character): number {
  return Math.floor((character.level - 1) / 4) + 2;
}

/** Returns the spell save DC for a character, or 0 if the class does not have spellcasting. */
export function getSpellSaveDc(character: Character): number {
  const ability = spellAbilityValue(character);
  return ability !== null ? 8 + getProficiencyBonus(character) + ability : 0;
}

/** Returns the spell attack bonus for a character, or 0 if the class does not have spellcasting. */
export function getSpellAttackBonus(character: Character): number {
  const ability = spellAbilityValue(character);
  return ability !== null ? getProficiencyBonus(character) + ability : 0;
}

/** Calculates a character's speed in feet, accounting for race, feats (Mobile, Athlete), bonuses, and exhaustion penalties. */
export function calculateSpeed(character: Character): number {
  const race = getRaceDef(character.race);
  if (!race) return 30;
  let speed = race.speed;
  for (const trait of race.traits) {
    if (trait.effect?.kind === 'speed-bonus' && meetsCondition(character, trait.effect.payload?.condition)) {
      speed += trait.effect.payload.bonus as number;
    }
  }
  if (character.feats?.includes('mobile') || character.feats?.includes('athlete')) speed += 10;
  speed += character.speedBonus || 0;
  speed -= getExhaustionPenalty(character) * 5;
  return Math.max(0, speed);
}

/** Returns the darkvision range in feet for the character's race, or 0 if none. */
export function getDarkvisionRange(character: Character): number {
  return getRaceDef(character.race)?.darkvision ?? 0;
}

/** Finds a character's resource pool by its string ID (e.g. 'spell-slot-1', 'ki'). */
export function getResource(character: Character, id: string): ResourcePool | undefined {
  return (character.resources || []).find(r => r.id === id);
}

/** Attempts to spend `amount` from a character resource pool; returns false if insufficient. */
export function spendResource(character: Character, id: string, amount = 1): boolean {
  const r = getResource(character, id);
  if (!r || r.current < amount) return false;
  r.current -= amount;
  return true;
}

/** Restores resources that reset on the given rest type (short/long/turn); for long rests also recovers half hit dice. */
export function recoverResources(character: Character, restType: 'short' | 'long' | 'turn'): void {
  for (const r of (character.resources || [])) {
    if (r.resetOn === restType) r.current = r.max;
  }
  if (restType === 'long') {
    character.hitDice.current = Math.min(
      character.hitDice.max,
      character.hitDice.current + Math.ceil(character.hitDice.max / 2)
    );
  }
}

/** Collects all damage resistance types for a character from racial traits only (no class/feat sources). */
export function getDamageResistances(character: Character): string[] {
  const result: string[] = [];
  const race = getRaceDef(character.race);
  for (const traitId of (character.racialTraits || [])) {
    const trait = race?.traits.find(t => t.id === traitId);
    if (trait?.effect?.kind === 'damage-resistance') {
      if (trait.effect.payload?.type === 'from-draconic-ancestry') {
        result.push(character.draconicDamageType || 'fire');
      } else {
        result.push(trait.effect.payload.type as string);
      }
    }
  }
  return result;
}

/** Collects all condition immunities for a character from racial traits. */
export function getConditionsImmunities(character: Character): string[] {
  const result: string[] = [];
  const race = getRaceDef(character.race);
  for (const traitId of (character.racialTraits || [])) {
    const trait = race?.traits.find(t => t.id === traitId);
    if (trait?.effect?.kind === 'condition-immunity') {
      result.push(trait.effect.payload.condition as string);
    }
  }
  return result;
}

/** Rebuilds the character's full resource pool list (class features, spell slots, racial traits), preserving existing current values within max bounds. */
export function recalculateResourcePools(character: Character): ResourcePool[] {
  const resources: ResourcePool[] = [];
  const level = character.level || 1;
  const classDef = character.class ? getClassDef(character.class) : undefined;
  const chaMod = character.stats && typeof character.stats.cha === 'number'
    ? abilityMod(character.stats.cha)
    : 0;

  if (classDef) {
    for (const feat of classDef.features) {
      if (feat.level <= level && feat.kind === 'resource' && feat.grantsResource) {
        let max = 1;
        let resetOn: 'short' | 'long' = 'long';
        
        if (feat.grantsResource === 'ki') {
          max = level;
          resetOn = 'short';
        } else if (feat.grantsResource === 'sorcery-points') {
          max = level;
          resetOn = 'long';
        } else if (feat.grantsResource === 'lay-on-hands-pool') {
          max = 5 * level;
          resetOn = 'long';
        } else if (feat.grantsResource === 'rage') {
          resetOn = 'long';
          if (level >= 20) max = 9999;
          else if (level >= 17) max = 6;
          else if (level >= 12) max = 5;
          else if (level >= 6) max = 4;
          else if (level >= 3) max = 3;
          else max = 2;
        } else if (feat.grantsResource === 'divine-sense') {
          max = Math.max(1, 1 + chaMod);
          resetOn = 'long';
        } else if (feat.grantsResource === 'bardic-inspiration') {
          max = Math.max(1, chaMod);
          resetOn = 'long';
        } else if (feat.grantsResource === 'second-wind') {
          max = 1;
          resetOn = 'short';
        } else if (feat.grantsResource === 'action-surge') {
          max = level >= 17 ? 2 : 1;
          resetOn = 'short';
        } else if (feat.grantsResource === 'channel-divinity') {
          resetOn = 'short';
          if (level >= 18) max = 3;
          else if (level >= 6) max = 2;
          else max = 1;
        } else if (feat.grantsResource === 'wild-shape') {
          resetOn = 'short';
          max = level >= 20 ? 9999 : 2;
        } else if (feat.grantsResource === 'indomitable') {
          resetOn = 'long';
          if (level >= 17) max = 3;
          else if (level >= 13) max = 2;
          else max = 1;
        }
        
        resources.push({
          id: feat.grantsResource,
          name: feat.name,
          current: max,
          max: max,
          resetOn,
          source: 'class',
          sourceId: classDef.id
        });
      }
    }

    if (classDef.spellcasting && classDef.spellcasting.spellSlots) {
      const slots = classDef.spellcasting.spellSlots[Math.min(level - 1, classDef.spellcasting.spellSlots.length - 1)];
      if (slots) {
        for (let i = 0; i < slots.length; i++) {
          if (slots[i] > 0) {
            resources.push({
              id: `spell-slot-${i + 1}`,
              name: `Level ${i + 1} Spell Slot`,
              current: slots[i],
              max: slots[i],
              resetOn: classDef.spellcasting.tradition === 'pact' ? 'short' : 'long',
              source: 'class',
              sourceId: classDef.id
            });
          }
        }
      }
    }
  }

  const raceDef = character.race ? getRaceDef(character.race) : undefined;
  if (raceDef) {
    for (const t of raceDef.traits) {
      if (t.kind === 'resource' && t.grantsResource) {
        const max = 1;
        let resetOn: 'short' | 'long' = 'short';
        if (t.grantsResource === 'relentless-endurance' || t.grantsResource === 'hellish-rebuke' || t.grantsResource === 'hellish-rebellion') {
          resetOn = 'long';
        }
        resources.push({
          id: t.grantsResource,
          name: t.name,
          current: max,
          max: max,
          resetOn,
          source: 'race',
          sourceId: raceDef.id
        });
      }
    }
  }

  const existingMap = new Map((character.resources || []).map(r => [r.id, r]));
  for (const r of resources) {
    const existing = existingMap.get(r.id);
    if (existing) {
      r.current = Math.min(existing.current, r.max);
    }
  }

  return resources;
}
