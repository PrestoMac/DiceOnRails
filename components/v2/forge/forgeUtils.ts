import type { Character, InventoryItem } from '../../../types';
import { lookupSRDItem } from '../../../utils/srdItems';
import { getMod, getRaceDef, calculateMaxHp } from '../../../services/classEngine';
import { getCantripsKnown, getSpellsKnown, getMaxPrepared, getWizardSpellbookCapacity } from '../../../services/spellcastingEngine';
import { getEffectiveAsiMap } from '../../creation/asiUtils';
import { SHOP_ITEMS } from '../../../data/shopItems';
import type { ForgeState } from './forgeTypes';

export const ALL_STATS: (keyof Character['stats'])[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Prettifies a kebab-case id for display (last-resort fallback only). */
export function kebabToTitle(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Looks up the display name of the wizard's selected subrace, if any. */
export function getSubraceName(wizard: ForgeState): string | undefined {
  if (!wizard.selectedSubraceId) return undefined;
  return wizard.selectedRace.subraces?.find(sr => sr.id === wizard.selectedSubraceId)?.name;
}

/**
 * Armor Class formula — ported verbatim from the legacy GearStep:
 * unarmored = 10 + DEX, light = 11 + DEX, medium = base(13) + min(DEX,2),
 * heavy = fixed base(16); shield adds +2. Only equipped items count.
 */
export function calculateAC(inv: InventoryItem[], dexScore: number): number {
  const dexMod = getMod(dexScore);
  const armor = inv.find(i => i.type === 'armor' && i.equipped);
  const shield = inv.find(i => i.type === 'shield' && i.equipped);
  const shieldBonus = shield ? (shield.stats?.acBonus || 2) : 0;
  if (!armor) return 10 + dexMod + shieldBonus;
  const formula = armor.stats?.acFormula;
  if (formula === 'light') return 11 + dexMod + shieldBonus;
  if (formula === 'medium') return (armor.stats?.acBonus || 13) + Math.min(dexMod, 2) + shieldBonus;
  if (formula === 'heavy') return (armor.stats?.acBonus || 16) + shieldBonus;
  return 10 + dexMod + shieldBonus;
}

/** Resolves a sell-base price (GP): shop price if in the shop, else parsed SRD cost, else 2 GP. */
export function getSellBase(name: string): number {
  const shopItem = SHOP_ITEMS.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (shopItem) return shopItem.price;
  const srd = lookupSRDItem(name);
  const match = (srd?.cost || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 2;
}

/**
 * Builds the ReviewStep-style temp Character for accurate HP calculation —
 * resolved stats include racial ASI (subrace REPLACE + half-elf flexible),
 * bonus level allocations, and ASI-slot allocations; racial traits include
 * subrace traits; feats are collected from feat slots. Used by the preview
 * rail and the review step so HP-affecting effects (Hill Dwarf toughness,
 * Draconic Bloodline, Tough feat) apply at creation.
 */
export function buildForgeTempCharacter(wizard: ForgeState): Character {
  const { name, selectedRace, selectedClass, stats, level, asiFeatSlots, selectedSubclassId, selectedSubraceId } = wizard;
  const asiMap = getEffectiveAsiMap(selectedRace, selectedSubraceId, wizard.halfElfChoice1, wizard.halfElfChoice2);
  const resolvedStats = { ...stats };
  for (const [s, v] of Object.entries(asiMap)) resolvedStats[s as keyof typeof stats] += v;
  for (const [s, v] of Object.entries(wizard.bonusStatAllocations || {})) {
    if (v > 0) resolvedStats[s as keyof typeof stats] += v;
  }
  for (const slot of asiFeatSlots) {
    if (slot.type === 'asi' && slot.statAllocations) {
      for (const [s, v] of Object.entries(slot.statAllocations)) {
        if (typeof v === 'number' && v > 0) resolvedStats[s as keyof typeof stats] += v;
      }
    }
  }
  const raceDef = getRaceDef(selectedRace.id);
  const racialTraits: string[] = [];
  if (raceDef) for (const t of raceDef.traits) racialTraits.push(t.id);
  const subraceDef = selectedSubraceId ? selectedRace.subraces?.find(sr => sr.id === selectedSubraceId) : undefined;
  if (subraceDef?.traits) for (const t of subraceDef.traits) racialTraits.push(t.id);
  const collectedFeats: string[] = [];
  for (const slot of asiFeatSlots) {
    if (slot.type === 'feat' && slot.featId) collectedFeats.push(slot.featId);
  }
  return {
    id: 'forge-preview', name, race: selectedRace.id, class: selectedClass.id, level,
    stats: resolvedStats, inventory: [], racialTraits, feats: collectedFeats,
    subraceId: selectedSubraceId || undefined,
    sorcerousOrigin: (selectedClass.id === 'sorcerer' && selectedSubclassId === 'draconic-bloodline') ? 'draconic-bloodline' : undefined,
    maxHpBonus: 0, hp: { current: 0, max: 0 },
    currency: { gp: 0, sp: 0, cp: 0 }, location: '',
    experience: 0, experienceToNextLevel: 0, unusedStatPoints: 0,
    hitDice: { current: level, max: level },
  };
}

/** Live max-HP preview for the forge (temp character through the real engine). */
export function computePreviewHp(wizard: ForgeState): number {
  return calculateMaxHp(buildForgeTempCharacter(wizard));
}

/** Live armor-class preview (equipped items + effective DEX incl. racial ASI). */
export function computePreviewAc(wizard: ForgeState): number {
  const asiMap = getEffectiveAsiMap(wizard.selectedRace, wizard.selectedSubraceId, wizard.halfElfChoice1, wizard.halfElfChoice2);
  return calculateAC(wizard.inventory, wizard.stats.dex + (asiMap.dex || 0));
}

/**
 * Minimal Character for spell-cap engine calls — replicates the legacy
 * SpellsStep `{ stats, class, level }` shape (RAW base stats with NO racial
 * ASI / bonus allocations, preserving cap parity with the old wizard).
 */
function buildSpellCapCharacter(wizard: ForgeState): Character {
  return {
    id: 'forge-spellcaps', name: wizard.name, race: wizard.selectedRace.id, class: wizard.selectedClass.id,
    level: wizard.level, stats: { ...wizard.stats },
    hp: { current: 0, max: 0 }, inventory: [], currency: { gp: 0, sp: 0, cp: 0 }, location: '',
    experience: 0, experienceToNextLevel: 0, unusedStatPoints: 0, maxHpBonus: 0,
    hitDice: { current: wizard.level, max: wizard.level },
  };
}

/** Highest spell level the character actually has slots for (handles full casters, half-casters, and warlock pact magic). */
export function computeMaxCastableLevel(wizard: ForgeState): number {
  const { selectedClass, level } = wizard;
  const sc = selectedClass.spellcasting;
  if (!sc) return 0;
  const slotsRow = sc.spellSlots?.[Math.min(level - 1, sc.spellSlots.length - 1)];
  if (slotsRow) {
    for (let i = slotsRow.length - 1; i >= 0; i--) {
      if (slotsRow[i] > 0) return i + 1;
    }
  }
  if (selectedClass.id === 'warlock' && sc.pactMagic) {
    if (level >= 17) return 5;
    if (level >= 11) return 4;
    if (level >= 9) return 3;
    if (level >= 5) return 2;
    if (level >= 3) return 1;
  }
  return 1;
}

export interface SpellCaps {
  maxCantrips: number;
  maxSpells: number;
  isWizard: boolean;
  isPrepared: boolean;
  maxCastableLevel: number;
}

/** Spell selection caps from the real engine helpers (shared by step + shell validation). */
export function computeSpellCaps(wizard: ForgeState): SpellCaps {
  const { selectedClass, level } = wizard;
  const temp = buildSpellCapCharacter(wizard);
  const maxCantrips = getCantripsKnown(temp, level);
  const isWizard = selectedClass.id === 'wizard';
  const isPrepared = selectedClass.spellcasting?.prepMode === 'prepared';
  const maxSpells = isWizard
    ? getWizardSpellbookCapacity(level)
    : isPrepared
      ? getMaxPrepared(temp, level)
      : getSpellsKnown(temp, level);
  return { maxCantrips, maxSpells, isWizard, isPrepared, maxCastableLevel: computeMaxCastableLevel(wizard) };
}
