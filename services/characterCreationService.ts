import { Character, StartingLocation, InventoryItem, FeatSelection } from '../types';
import { WizardState } from '../components/creation/types';
import { calculateXPToNextLevel } from './progressionService';
import { ASI_LEVELS, FALLBACK_STARTING_LOCATION } from '../constants';
import { getMod, getRaceDef, recalculateResourcePools } from './classEngine';
import { DRAGON_ANCESTRIES } from '../components/creation/constants';
import { computeSkillBudget } from '../components/creation/skillPoints';
import { RACES_BY_ID } from '../utils/races';
import { CLASSES_BY_ID } from '../utils/classes';
import { lookupSRDItem } from '../utils/srdItems';
import { applyEffects, CharacterCreatedContext } from './effectDispatcher';

/** Builds a fully-formed Character object from wizard creation state, validating name, location, stats, feats, and subclass choices. */
export function buildCharacterFromWizard(
  wizard: WizardState,
  options: { isNewCampaign: boolean; campaignStartingLocation?: StartingLocation; remainingSkillPoints?: number; onSetStartingLocation?: (location: StartingLocation) => void }
): { character: Character; errors: string[] } {
  const errors: string[] = [];
  const { name, selectedRace, selectedClass, stats, inventory, goldPool, level, allocatedSkills, asiFeatSlots, selectedSubclassId, selectedCantrips, selectedSpells, draconicAncestry, halfElfChoice1, halfElfChoice2, backstory, alignment, background, personalityTraits, ideals, bonds, flaws, appearance } = wizard;
  const { isNewCampaign, campaignStartingLocation, remainingSkillPoints, onSetStartingLocation } = options;

  if (!name.trim()) { errors.push("Your character must have a name before beginning their chronicle."); return { character: null as unknown as Character, errors }; }

  const loc = isNewCampaign ? wizard.selectedLocation : (campaignStartingLocation || FALLBACK_STARTING_LOCATION);
  if (isNewCampaign && !loc) { errors.push("Please select a starting location."); return { character: null as unknown as Character, errors }; }
  if (loc && onSetStartingLocation) onSetStartingLocation(loc);

  const fs = { ...stats };
  if (typeof selectedRace.asi === 'object') Object.entries(selectedRace.asi).forEach(([s, v]) => { (fs as Record<string, number>)[s] += v as number; });

  if (typeof selectedRace.asi === 'string') {
    const halfElfStats = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 2 };
    if (halfElfChoice1) (halfElfStats as Record<string, number>)[halfElfChoice1] += 1;
    if (halfElfChoice2) (halfElfStats as Record<string, number>)[halfElfChoice2] += 1;
    for (const [s, v] of Object.entries(halfElfStats)) (fs as Record<string, number>)[s] += v as number;
  }

  // Bonus stat points allocated on the Stats step (spends down the
  // (level-1)*2 budget granted by this system's STAT_POINTS_PER_LEVEL rule).
  for (const [stat, v] of Object.entries(wizard.bonusStatAllocations || {})) {
    if (typeof v === 'number' && v > 0) (fs as Record<string, number>)[stat] = ((fs as Record<string, number>)[stat] || 0) + v;
  }
  const bonusAllocated = Object.values(wizard.bonusStatAllocations || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  const collectedFeats: string[] = [];
  const featSelections: { level: number; type: 'asi' | 'feat'; featId?: string; statAllocations?: Record<string, number> }[] = [];
  const featChoices: Record<string, Record<string, unknown>> = {};
  const updatedSkills = { ...allocatedSkills };

  asiFeatSlots.forEach((slot, idx) => {
    if (!slot) return;
    const slotLevel = ASI_LEVELS[idx];
    if (slot.type === 'asi' && slot.statAllocations) {
      for (const [stat, v] of Object.entries(slot.statAllocations)) {
        if (typeof v === 'number' && v > 0) (fs as Record<string, number>)[stat] = ((fs as Record<string, number>)[stat] || 0) + v;
      }
      featSelections.push({ level: slotLevel, type: 'asi', statAllocations: slot.statAllocations });
    } else if (slot.type === 'feat' && slot.featId) {
      collectedFeats.push(slot.featId);
      if (slot.saveStatChoice) featChoices[slot.featId] = { ...(featChoices[slot.featId] || {}), saveStat: slot.saveStatChoice };
      if (slot.skillChoices && slot.featId === 'skilled') {
        for (const sk of slot.skillChoices) updatedSkills[sk] = (updatedSkills[sk] || 0) + 1;
      }
      featSelections.push({ level: slotLevel, type: 'feat', featId: slot.featId });
    }
  });

  const conMod = getMod(fs.con);

  const racialTraits: string[] = [];
  const raceDef = getRaceDef(selectedRace.id);
  if (raceDef) for (const t of raceDef.traits) { racialTraits.push(t.id); }

  const tempChar = { id: 'player-temp', name, race: selectedRace.id, class: selectedClass.id, level, stats: fs, inventory, racialTraits };
  const resources = recalculateResourcePools(tempChar as unknown as Character);

  const builtChar: Character = {
    id: 'player-' + Date.now(), name, race: selectedRace.id, class: selectedClass.id, level,
    hp: {
      current: selectedClass.hpBase + conMod + (selectedClass.hpPerLevel + conMod) * (level - 1),
      max: selectedClass.hpBase + conMod + (selectedClass.hpPerLevel + conMod) * (level - 1),
    },
    stats: fs, inventory,
    currency: (() => {
      let gp = Math.floor(goldPool);
      let sp = Math.round((goldPool - gp) * 10);
      if (sp >= 10) { gp += Math.floor(sp / 10); sp = sp % 10; }
      return { gp, sp, cp: 0 };
    })(),
    location: loc?.name || '', experience: 0, experienceToNextLevel: calculateXPToNextLevel(level),
    unusedStatPoints: Math.max(0, (level - 1) * 2 - bonusAllocated), maxHpBonus: 0, hitDice: { current: level, max: level },
    skills: updatedSkills, unusedSkillPoints: remainingSkillPoints || 0,
    feats: collectedFeats, featSelections, featChoices, pendingFeatChoice: false,
    resources, racialTraits,
    conditionsImmunities: (selectedRace.id === 'elf' || selectedRace.id === 'half-elf') ? ['sleep'] : undefined,
    knownSpells: !selectedClass.spellcasting ? [] : (
      selectedClass.id === 'wizard' || selectedClass.spellcasting.prepMode === 'known'
        ? [...selectedCantrips, ...selectedSpells]
        : [...selectedCantrips]
    ),
    preparedSpells: !selectedClass.spellcasting ? [] : (
      selectedClass.id === 'wizard'
        ? [...selectedCantrips, ...selectedSpells.slice(0, Math.max(1, level + getMod(fs.int)))]
        : selectedClass.spellcasting.prepMode === 'prepared'
        ? [...selectedCantrips, ...selectedSpells]
        : [...selectedCantrips]
    ),
    subclassId: selectedSubclassId || undefined,
    backstory: backstory || undefined,
    alignment: alignment || undefined,
    background: background || undefined,
    personalityTraits: personalityTraits.length ? personalityTraits : undefined,
    ideals: ideals.length ? ideals : undefined,
    bonds: bonds.length ? bonds : undefined,
    flaws: flaws.length ? flaws : undefined,
    appearance: appearance || undefined,
    halfElfStatChoices: (typeof selectedRace.asi === 'string' && halfElfChoice1 && halfElfChoice2) ? [halfElfChoice1, halfElfChoice2] as unknown as [string, string] : undefined,
    draconicAncestry: (() => {
      if (selectedRace.id === 'dragonborn' && draconicAncestry) return draconicAncestry;
      if (selectedClass.id === 'sorcerer' && selectedSubclassId === 'draconic-bloodline' && draconicAncestry) return draconicAncestry;
      return undefined;
    })(),
    draconicDamageType: (() => {
      const a = (selectedRace.id === 'dragonborn' && draconicAncestry) ? draconicAncestry
        : (selectedClass.id === 'sorcerer' && selectedSubclassId === 'draconic-bloodline' && draconicAncestry) ? draconicAncestry : null;
      if (!a) return undefined;
      return (DRAGON_ANCESTRIES.find(d => d.id === a)?.damageType as string) || undefined;
    })(),
    unlockedSubclassFeatures: [],
    languages: (() => {
      const r = RACES_BY_ID[selectedRace.id];
      return r?.languages ? [...r.languages] : ['common'];
    })(),
  };

  // Grant domain spells at character creation
  if (selectedSubclassId) {
    const subDef = CLASSES_BY_ID[selectedClass.id]?.subclasses?.find(s => s.id === selectedSubclassId);
    if (subDef?.domainSpells?.length) {
      builtChar.preparedSpells = [...(builtChar.preparedSpells || []), ...subDef.domainSpells];
    }
  }

  const creationCtx: CharacterCreatedContext = { _hook: 'onCharacterCreated', character: builtChar };
  applyEffects(builtChar, 'onCharacterCreated', creationCtx);

  return {
    character: builtChar,
    errors,
  };
}

/** Authoring-level specification for a quick-start preset character. Only the meaningful choices are stored; HP, resources, racial traits, and other derived fields are computed by {@link buildCharacterFromWizard}. All presets are level 1. */
export interface PresetCharacterSpec {
  /** Stable unique id, e.g. `'human-fighter'`. */
  id: string;
  /** Display name of the character. */
  name: string;
  /** Race id matching {@link RaceDefinition.id} (e.g. `'human'`, `'half-elf'`). */
  raceId: string;
  /** Class id matching {@link ClassDefinition.id} (e.g. `'fighter'`, `'cleric'`). */
  classId: string;
  /** One-line descriptor shown on the preset card (e.g. "Front-line sword-and-board warrior"). */
  tagline: string;
  /** Optional longer flavor text shown when the preset is selected. */
  description?: string;
  /** Base ability scores BEFORE racial ASIs are applied. Use the standard array (15/14/13/12/10/8) allocated to the class's priorities. */
  stats: Character['stats'];
  /** Skill proficiency allocations. Each key is a skill name (lowercase, matches {@link SKILLS_LIST}); each value is typically `1` (proficiency). Must satisfy the class's `skillChoices.count`. */
  allocatedSkills: Record<string, number>;
  /** The level-1 ASI/Feat slot choice. `level` is injected automatically. */
  asiFeatSlot: Omit<FeatSelection, 'level'>;
  /** Cantrip ids for spellcasters (matches {@link SpellDefinition.id}). */
  cantrips?: string[];
  /** Level-1 spell ids for spellcasters (matches {@link SpellDefinition.id}). */
  spells?: string[];
  /** Subclass id for classes that choose one at level 1 (cleric, sorcerer, warlock). */
  subclassId?: string;
  /** Dragon ancestry id for Dragonborn and Draconic Bloodline sorcerers (matches {@link DRAGON_ANCESTRIES}). */
  draconicAncestry?: string;
  /** The two +1 stat choices for Half-Elf (`'flexible-2'` ASI). Each entry is a stat key (`'str'|'dex'|'con'|'int'|'wis'` — cha is automatic). */
  halfElfChoices?: [Exclude<keyof Character['stats'], 'cha'>, Exclude<keyof Character['stats'], 'cha'>];
  /** Starting gold (integer GP). Defaults to `10` (matching the wizard's level-1 default). */
  goldPool?: number;
  /** Optional character backstory. */
  backstory?: string;
  /** Optional SRD 5.1 background & persona fields (narrative-only). */
  alignment?: string;
  background?: string;
  personalityTraits?: string[];
  ideals?: string[];
  bonds?: string[];
  flaws?: string[];
  appearance?: string;
}

/**
 * Hydrates starting equipment for a class into full InventoryItem objects, mirroring the
 * useEffect logic in WizardShell. Each catalog item name is resolved via lookupSRDItem and
 * auto-equipped if it is a weapon/armor/shield. An "Explorer's Pack" is always appended.
 */
export function hydrateStartingEquipment(classId: string): InventoryItem[] {
  const cls = CLASSES_BY_ID[classId];
  const names: string[] = cls?.startingEquipment ?? [];
  const items: InventoryItem[] = names.map((itemName) => {
    const srd = lookupSRDItem(itemName);
    return {
      name: itemName,
      quantity: 1,
      type: srd?.type || 'other',
      rarity: srd?.rarity || 'common',
      description: srd?.description || 'No description available.',
      weight: srd?.weight || 0,
      cost: srd?.cost || '0 gp',
      stats: srd?.stats || {},
      equipped: srd?.type === 'weapon' || srd?.type === 'armor' || srd?.type === 'shield',
    };
  });
  const epName = "Explorer's Pack";
  const ep = lookupSRDItem(epName);
  items.push({
    name: epName, quantity: 1,
    type: ep?.type || 'other', rarity: ep?.rarity || 'common',
    description: ep?.description || 'No description available.',
    weight: ep?.weight || 0, cost: ep?.cost || '0 gp',
    stats: ep?.stats || {}, equipped: false,
  });
  return items;
}

/**
 * Builds a fully-formed level-1 Character from a preset spec by delegating to
 * {@link buildCharacterFromWizard}. Throws if the race/class ids are unknown or the
 * resulting character fails validation. Location handling is left to the caller
 * (the quick-start flow sets it via `onSetStartingLocation` before `handleCharacterCreated`).
 */
export function buildPresetCharacter(spec: PresetCharacterSpec): Character {
  const race = RACES_BY_ID[spec.raceId];
  const cls = CLASSES_BY_ID[spec.classId];
  if (!race) throw new Error(`buildPresetCharacter: unknown raceId "${spec.raceId}" (spec "${spec.id}")`);
  if (!cls) throw new Error(`buildPresetCharacter: unknown classId "${spec.classId}" (spec "${spec.id}")`);

  const wizard: WizardState = {
    name: spec.name,
    level: 1,
    backstory: spec.backstory ?? '',
    alignment: spec.alignment ?? '',
    background: spec.background ?? '',
    personalityTraits: spec.personalityTraits ?? [],
    ideals: spec.ideals ?? [],
    bonds: spec.bonds ?? [],
    flaws: spec.flaws ?? [],
    appearance: spec.appearance ?? '',
    selectedRace: race,
    selectedClass: cls,
    stats: spec.stats,
    inventory: hydrateStartingEquipment(spec.classId),
    allocatedSkills: spec.allocatedSkills,
    goldPool: spec.goldPool ?? 10,
    selectedSpells: spec.spells ?? [],
    selectedCantrips: spec.cantrips ?? [],
    selectedSubclassId: spec.subclassId ?? null,
    asiFeatSlots: [{ ...spec.asiFeatSlot, level: 1 } as FeatSelection],
    draconicAncestry: spec.draconicAncestry ?? null,
    halfElfChoice1: spec.halfElfChoices?.[0] ?? null,
    halfElfChoice2: spec.halfElfChoices?.[1] ?? null,
    generatedLocations: [],
    selectedLocation: null,
    isGeneratingLocs: false,
    isRerolling: false,
    statsGenMode: 'array',
    rolledStatValues: [],
    rollHistory: [],
    bonusStatAllocations: {},
  };

  // Replicate the skill-points formula at level 1 (no per-level bonus term).
  const skillBudget = computeSkillBudget(cls, 1);
  const allocatedSum = Object.values(spec.allocatedSkills).reduce((s, v) => s + v, 0);
  const remainingSkillPoints = skillBudget - allocatedSum;

  const { character, errors } = buildCharacterFromWizard(wizard, { isNewCampaign: false, remainingSkillPoints });
  if (errors.length > 0 || !character) {
    throw new Error(`buildPresetCharacter: preset "${spec.id}" failed validation: ${errors.join('; ')}`);
  }
  return character;
}
