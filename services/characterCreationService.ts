import { Character, StartingLocation } from '../types';
import { WizardState } from '../components/creation/types';
import { calculateXPToNextLevel } from './progressionService';
import { ASI_LEVELS, FALLBACK_STARTING_LOCATION } from '../constants';
import { getMod, getRaceDef, recalculateResourcePools } from './classEngine';
import { DRAGON_ANCESTRIES } from '../components/creation/constants';

/** Builds a fully-formed Character object from wizard creation state, validating name, location, stats, feats, and subclass choices. */
export function buildCharacterFromWizard(
  wizard: WizardState,
  options: { isNewCampaign: boolean; campaignStartingLocation?: StartingLocation; remainingSkillPoints?: number; onSetStartingLocation?: (location: StartingLocation) => void }
): { character: Character; errors: string[] } {
  const errors: string[] = [];
  const { name, selectedRace, selectedClass, stats, inventory, goldPool, level, allocatedSkills, asiFeatSlots, selectedSubclassId, selectedCantrips, selectedSpells, draconicAncestry, halfElfChoice1, halfElfChoice2, backstory } = wizard;
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

  const finalRaceConBonus = typeof selectedRace.asi === 'object' ? (selectedRace.asi as Record<string, number>).con || 0 : 0;
  const conMod = getMod(fs.con + finalRaceConBonus);

  const racialTraits: string[] = [];
  const raceDef = getRaceDef(selectedRace.id);
  if (raceDef) for (const t of raceDef.traits) { racialTraits.push(t.id); }

  const tempChar = { id: 'player-temp', name, race: selectedRace.id, class: selectedClass.id, level, stats: fs, inventory, racialTraits };
  const resources = recalculateResourcePools(tempChar as unknown as Character);

  return {
    character: {
      id: 'player-' + Date.now(), name, race: selectedRace.id, class: selectedClass.id, level,
      hp: {
        current: selectedClass.hpBase + conMod + (selectedClass.hpPerLevel + conMod) * (level - 1),
        max: selectedClass.hpBase + conMod + (selectedClass.hpPerLevel + conMod) * (level - 1),
      },
      stats: fs, inventory,
      currency: { gp: Math.floor(goldPool), sp: Math.round((goldPool % 1) * 10), cp: 0 },
      location: loc?.name || '', experience: 0, experienceToNextLevel: calculateXPToNextLevel(level),
      unusedStatPoints: (level - 1) * 2, maxHpBonus: 0, hitDice: { current: level, max: level },
      skills: updatedSkills, unusedSkillPoints: remainingSkillPoints || 0,
      feats: collectedFeats, featSelections, featChoices, pendingFeatChoice: false,
      resources, racialTraits,
      conditionsImmunities: (selectedRace.id === 'elf' || selectedRace.id === 'half-elf') ? ['unconscious'] : undefined,
      knownSpells: selectedClass.spellcasting?.prepMode === 'prepared' ? [...selectedCantrips] : [...selectedCantrips, ...selectedSpells],
      preparedSpells: selectedClass.spellcasting?.prepMode === 'prepared' ? [...selectedCantrips, ...selectedSpells] : [...selectedCantrips],
      subclassId: selectedSubclassId || undefined,
      backstory: backstory || undefined,
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
    },
    errors,
  };
}
