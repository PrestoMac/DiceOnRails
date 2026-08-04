import React, { useEffect, useState } from 'react';
import type { Character, InventoryItem, ActiveCondition, RacialTrait, SpellDefinition } from '../../../../types';
import { SKILLS_LIST } from '../../../../constants';
import { getAllFeats } from '../../../../services/featsService';
import type { FeatDefinition } from '../../../../utils/feats';
import {
  getClassDef,
  getSubclassDef,
  getRaceDef,
  calculateAc,
  getProficiencyBonus,
  calculateSpeed,
  getDarkvisionRange,
  getSavingThrowBonus,
  getSpellSaveDc,
  getSpellAttackBonus,
  getDamageResistances,
  getMod,
} from '../../../../services/classEngine';
import { parseExhaustionLevel } from '../../../../services/conditionEngine';
import { SPELLS_BY_ID } from '../../../../utils/spells';
import { getMaxPrepared } from '../../../../services/spellcastingEngine';
import { CONDITION_INFO, EXHAUSTION_LEVELS, getExhaustionSummary } from '../../../../data/conditionInfo';
import { STAT_INFO } from '../../../../data/referenceConstants';
import { getAlignmentName, getBackgroundName } from '../../../../utils/backgrounds';
import Avatar from '../../primitives/Avatar';
import Button from '../../primitives/Button';
import Card, { SectionHeader } from '../../primitives/Card';
import Chip from '../../primitives/Chip';
import HpBar from '../../primitives/HpBar';
import StatBadge from '../../primitives/StatBadge';
import Tabs from '../../primitives/Tabs';
import Tooltip from '../../primitives/Tooltip';
import EmptyState from '../../primitives/EmptyState';
import { TextArea } from '../../primitives/Field';
import { cx } from '../../primitives/cx';
import { Z } from '../../primitives/layers';
import BackgroundSheet from '../sheets/BackgroundSheet';
import SpellbookSheet from '../sheets/SpellbookSheet';
import { ItemDetailModalV2, SpellDetailModalV2, ConditionDetailModalV2, FeatDetailModalV2 } from '../sheets/DetailModals';
import type { V2ItemDetail } from '../sheets/DetailModals';
import { titleCase, isBuffCondition, formatConditionDuration, rollDiceFormula } from './panelUtils';

export interface CharacterPanelProps {
  character: Character;
  onUpdateInventory: (items: InventoryItem[], charId?: string) => void;
  onLevelUp?: (characterId: string) => void;
  onSendMessage?: (text: string) => void;
  onTriggerDiceRoll?: (rollData: Record<string, unknown>) => Promise<void>;
  /** Soft banner: another player's turn is resolving — edits may be overwritten. */
  isProcessing?: boolean;
  /** Current viewer's user id — gates personal notes to the character owner. */
  currentUserId?: string;
  /** True when the viewer is the campaign host (gates GM notes). */
  isHost?: boolean;
  /** Patches arbitrary character fields (notes, persona). UI-only path. */
  onUpdateCharacterFields?: (partial: Partial<Character>, charId?: string) => void;
  /** UI-direct spellbook management (prepare/unprepare for prepared casters). */
  onManageSpellbook?: (characterId: string, action: 'learn' | 'prepare' | 'unprepare' | 'forget' | 'finish_prep', spellId: string) => Promise<boolean>;
  /** Known-caster Tasha's-style swap. */
  onSwapKnownSpell?: (characterId: string, oldSpellId: string, newSpellId: string) => Promise<boolean>;
  /** True when combat is active — locks spell management. */
  isCombatActive?: boolean;
}

type PanelTab = 'stats' | 'gear' | 'magic' | 'story';

const STATS: (keyof Character['stats'])[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const ITEM_TYPE_ICONS: Record<string, string> = {
  weapon: 'fa-sword',
  armor: 'fa-helmet-battle',
  shield: 'fa-shield',
  potion: 'fa-flask',
  gear: 'fa-toolbox',
  other: 'fa-gem',
};

/** Rarity tint ladder inside the Emberlight palette (common → legendary). */
const RARITY_ICON_COLOR: Record<string, string> = {
  uncommon: 'text-verdant-400',
  rare: 'text-frost-400',
  'very rare': 'text-arcane-300',
  legendary: 'text-ember-400',
};

/** Fallback swap used to satisfy SpellbookSheet when no known-caster handler is wired. */
const noopSwapSpell = (): Promise<boolean> => Promise.resolve(false);

/* ------------------------------------------------------------------ */
/* Feature accordions (class / subclass / racial traits)              */
/* ------------------------------------------------------------------ */

interface FeatureAccordionProps {
  title: string;
  icon: string;
  features?: Array<{ id: string; level?: number; name: string; description: string }>;
  level: number;
}

const FeatureAccordion: React.FC<FeatureAccordionProps> = ({ title, icon, features, level }) => {
  const filtered = (features ?? []).filter((f) => (f.level ?? 1) <= level);
  if (filtered.length === 0) return null;
  return (
    <section>
      <SectionHeader icon={icon}>{title}</SectionHeader>
      <div className="space-y-1">
        {filtered.map((f) => (
          <details
            key={f.id}
            className="group rounded-lg border border-white/[0.05] bg-obsidian-850/60 px-3 py-2"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-parchment-dim transition-colors hover:text-ember-300 [&::-webkit-details-marker]:hidden">
              <i
                className="fas fa-chevron-right text-[9px] text-ember-600 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {f.level !== undefined && (
                <span className="font-mono text-[10px] text-ember-500/80">L{f.level}</span>
              )}
              <span className="font-semibold">{f.name}</span>
            </summary>
            <p className="mt-1.5 pl-5 text-[11px] leading-relaxed text-parchment-mute">{f.description}</p>
          </details>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Condition chips (buffs verdant / debuffs blood)                    */
/* ------------------------------------------------------------------ */

const ConditionRow: React.FC<{ condition: ActiveCondition; tone: 'blood' | 'verdant'; onView: () => void }> = ({
  condition: c,
  tone,
  onView,
}) => {
  const info = CONDITION_INFO[c.id];
  return (
    <button
      type="button"
      onClick={onView}
      title="View condition details"
      className={cx(
        'w-full cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors',
        tone === 'blood'
          ? 'border-blood-500/20 bg-blood-950/20 hover:border-blood-500/40'
          : 'border-verdant-500/20 bg-verdant-950/20 hover:border-verdant-500/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <i
            className={cx('fas text-[10px]', info?.icon ?? 'fa-circle', tone === 'blood' ? 'text-blood-400' : 'text-verdant-400')}
            aria-hidden="true"
          />
          <span className={cx('truncate text-xs font-bold capitalize', tone === 'blood' ? 'text-blood-300' : 'text-verdant-300')}>
            {c.id}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {c.saveEnd && c.saveDC !== undefined && c.saveDC > 0 && (
            <span className="rounded bg-ember-500/15 px-1 text-[9px] font-mono text-ember-300">
              DC {c.saveDC} {c.saveEnd.toUpperCase()}
            </span>
          )}
          <span className="text-[9px] font-mono text-parchment-faint">{formatConditionDuration(c)} left</span>
        </div>
      </div>
      {info && <p className="mt-0.5 pl-4 text-[10px] leading-relaxed text-parchment-faint">{info.summary}</p>}
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Inventory row (equip / drink / qty / click-to-detail)              */
/* ------------------------------------------------------------------ */

interface InventoryRowProps {
  item: InventoryItem;
  isProcessing?: boolean;
  onView: () => void;
  onToggleEquip: () => void;
  onDrink: () => void;
}

const InventoryRow: React.FC<InventoryRowProps> = ({ item, isProcessing, onView, onToggleEquip, onDrink }) => {
  const typeKey = item.type ?? 'other';
  const icon = ITEM_TYPE_ICONS[typeKey] ?? ITEM_TYPE_ICONS.other;
  const rarityColor = (item.rarity && RARITY_ICON_COLOR[item.rarity]) || 'text-parchment-faint';
  const equippable = item.type === 'weapon' || item.type === 'armor' || item.type === 'shield';
  const drinkable = item.type === 'potion' && !!item.stats?.healing;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView();
        }
      }}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.05] bg-obsidian-850/60 px-2.5 py-2 transition-colors hover:bg-obsidian-800 hover:border-white/[0.12]"
    >
      <i className={cx('fas w-4 text-center text-sm', icon, rarityColor)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-parchment-dim">
          {item.name}
          {item.equipped && (
            <span className="ml-1.5 rounded-full border border-verdant-500/30 bg-verdant-500/15 px-1.5 py-px align-middle text-[8px] font-bold uppercase tracking-wider text-verdant-400">
              Equipped
            </span>
          )}
        </p>
        <p className="text-[9px] uppercase tracking-wider text-parchment-faint">
          {item.type ?? 'item'}
          {item.rarity && item.rarity !== 'common' ? ` · ${item.rarity}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {equippable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleEquip();
            }}
            title={item.equipped ? 'Unequip' : 'Equip'}
            className={cx(
              'inline-flex cursor-pointer select-none items-center gap-1 rounded-md border px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-wider transition-colors',
              item.equipped
                ? 'border-verdant-500/60 bg-verdant-600 text-obsidian-950 hover:bg-verdant-500'
                : 'border-white/10 bg-transparent text-parchment-mute hover:border-white/25 hover:bg-white/[0.04] hover:text-parchment',
            )}
          >
            <i
              className={cx('fas text-[9px]', item.type === 'weapon' ? 'fa-sword' : item.equipped ? 'fa-shield-halved' : 'fa-shield')}
              aria-hidden="true"
            />
            {item.equipped ? 'Equipped' : 'Equip'}
          </button>
        )}
        {drinkable && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.stopPropagation();
              onDrink();
            }}
            title={`Drink — restores ${item.stats?.healing ?? ''} HP`}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-transparent px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-wider text-verdant-400 transition-colors hover:border-verdant-500/40 hover:bg-verdant-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <i className="fas fa-flask text-[9px]" aria-hidden="true" />
            Drink
          </button>
        )}
        <span className="rounded-md border border-white/[0.06] bg-obsidian-950/70 px-1.5 py-0.5 text-[10px] font-mono text-parchment-mute">
          ×{item.quantity}
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* NotesSection — full port of the legacy NotesPanel                  */
/* ------------------------------------------------------------------ */

interface NotesSectionProps {
  character: Character;
  currentUserId?: string;
  isHost?: boolean;
  onSaveNotes: (charId: string, notes: string) => void;
  onSaveGmNotes: (charId: string, gmNotes: string) => void;
}

/** Personal (owner-gated) + GM (host-gated) notes, private-by-convention like the legacy panel. */
const NotesSection: React.FC<NotesSectionProps> = ({ character, currentUserId, isHost, onSaveNotes, onSaveGmNotes }) => {
  const isOwner = !currentUserId || character.ownerId === currentUserId;
  const [notes, setNotes] = useState(character.notes ?? '');
  const [gmNotes, setGmNotes] = useState(character.gmNotes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingGm, setEditingGm] = useState(false);

  // Re-sync local draft when the underlying character changes (e.g. remote sync).
  useEffect(() => {
    if (!editingNotes) setNotes(character.notes ?? '');
  }, [character.notes, editingNotes]);
  useEffect(() => {
    if (!editingGm) setGmNotes(character.gmNotes ?? '');
  }, [character.gmNotes, editingGm]);

  if (!isOwner && !isHost) return null;

  return (
    <section>
      <SectionHeader icon="fa-feather-pointed">Notes</SectionHeader>
      <div className="space-y-3">
        {isOwner && (
          <Card>
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ember-400/90">
                <i className="fas fa-feather-pointed text-[10px]" aria-hidden="true" />
                Personal Notes
              </h4>
              {editingNotes ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="fa-check"
                  onClick={() => {
                    onSaveNotes(character.id, notes);
                    setEditingNotes(false);
                  }}
                >
                  Save
                </Button>
              ) : (
                <Button size="sm" variant="ghost" icon="fa-pen" onClick={() => setEditingNotes(true)}>
                  Edit
                </Button>
              )}
            </div>
            {editingNotes ? (
              <TextArea value={notes} onChange={setNotes} placeholder="Private journal — only you can see this." rows={4} />
            ) : (
              <p className="min-h-[1.5rem] whitespace-pre-wrap text-xs italic text-parchment-mute">
                {notes || 'No personal notes yet.'}
              </p>
            )}
          </Card>
        )}
        {isHost && (
          <Card accent="ember">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ember-300">
                <i className="fas fa-crown text-[10px]" aria-hidden="true" />
                GM Notes
              </h4>
              {editingGm ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="fa-check"
                  onClick={() => {
                    onSaveGmNotes(character.id, gmNotes);
                    setEditingGm(false);
                  }}
                >
                  Save
                </Button>
              ) : (
                <Button size="sm" variant="ghost" icon="fa-pen" onClick={() => setEditingGm(true)}>
                  Edit
                </Button>
              )}
            </div>
            {editingGm ? (
              <TextArea
                value={gmNotes}
                onChange={setGmNotes}
                placeholder="Host-only notes — visible only to the campaign host."
                rows={4}
              />
            ) : (
              <p className="min-h-[1.5rem] whitespace-pre-wrap text-xs italic text-parchment-mute">
                {gmNotes || 'No GM notes yet.'}
              </p>
            )}
          </Card>
        )}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Main panel                                                          */
/* ------------------------------------------------------------------ */

/** Emberlight V2 character dock panel — sticky vitals header + Stats / Gear / Magic / Story tabs. */
const CharacterPanel: React.FC<CharacterPanelProps> = ({
  character,
  onUpdateInventory,
  onLevelUp,
  onSendMessage,
  onTriggerDiceRoll,
  isProcessing,
  currentUserId,
  isHost,
  onUpdateCharacterFields,
  onManageSpellbook,
  onSwapKnownSpell,
  isCombatActive,
}) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('stats');
  const [showBackground, setShowBackground] = useState(false);
  const [showSpellbook, setShowSpellbook] = useState(false);
  const [viewingItem, setViewingItem] = useState<V2ItemDetail | null>(null);
  const [viewingSpell, setViewingSpell] = useState<SpellDefinition | null>(null);
  const [viewingConditionId, setViewingConditionId] = useState<string | null>(null);
  const [viewingFeat, setViewingFeat] = useState<FeatDefinition | null>(null);

  /* ---- derived character data (same engine calls as the legacy sheet) ---- */
  const feats = getAllFeats(character);
  const equippedArmorItem = character.inventory.find((i) => i.equipped && i.type === 'armor') ?? null;
  const totalAc = calculateAc(character, equippedArmorItem);
  const profBonus = getProficiencyBonus(character);
  const speed = calculateSpeed(character);
  const darkvision = getDarkvisionRange(character);
  const classDef = getClassDef(character.class);
  const subclassDef = character.subclassId ? getSubclassDef(character.class, character.subclassId) : undefined;
  const raceDef = getRaceDef(character.race);
  const damageResistances = getDamageResistances(character);
  const spellSaveDc = classDef?.spellcasting ? getSpellSaveDc(character) : null;
  const spellAttackBonus = classDef?.spellcasting ? getSpellAttackBonus(character) : null;
  const nextLevelXp = character.experienceToNextLevel || 300;
  const xpPercent = nextLevelXp > 0 ? Math.min(100, Math.max(0, (character.experience / nextLevelXp) * 100)) : 100;
  const activeResources = (character.resources ?? []).filter((r) => r.max > 0);
  const slotPools = activeResources.filter((r) => r.id.startsWith('spell-slot-'));
  const nonSlotResources = activeResources.filter((r) => !r.id.startsWith('spell-slot-'));
  const isPreparedCaster = classDef?.spellcasting?.prepMode === 'prepared';
  const spellList = isPreparedCaster ? character.preparedSpells : character.knownSpells;
  const exhaustionLevel = parseExhaustionLevel(character);
  const visibleConditions = (character.conditions ?? []).filter((c) => !c.id.startsWith('exhaustion-'));
  const buffs = visibleConditions.filter(isBuffCondition);
  const debuffs = visibleConditions.filter((c) => !isBuffCondition(c));
  const canLevelUp = ((character.unusedStatPoints || 0) > 0 || (character.unusedSkillPoints || 0) > 0) && !!onLevelUp;
  const concentrationName = character.concentrationSpellId
    ? (SPELLS_BY_ID[character.concentrationSpellId]?.name ?? character.concentrationSpellId)
    : undefined;

  const racialTraits: RacialTrait[] = [
    ...(character.racialTraits ?? [])
      .map((id) => raceDef?.traits.find((t) => t.id === id))
      .filter((t): t is RacialTrait => !!t),
    ...(raceDef?.subraces?.find((sr) => sr.id === character.subraceId)?.traits ?? []),
  ];

  const subraceName = character.subraceId
    ? raceDef?.subraces?.find((sr) => sr.id === character.subraceId)?.name
    : undefined;

  /* ---- spellcasting block data ---- */
  const maxPreparedCount = isPreparedCaster ? getMaxPrepared(character, character.level) : 0;
  const leveledPreparedCount = (character.preparedSpells ?? []).filter((s) => (SPELLS_BY_ID[s]?.level ?? 1) > 0).length;
  const hasPendingChoice = !!(
    character.pendingSpellSwap ||
    (character.pendingWizardSpells ?? 0) > 0 ||
    character.cantripSwapAvailable ||
    character.shortRestSpellSwapAvailable
  );

  /* ---- persona summary data ---- */
  const alignmentName = character.alignment ? getAlignmentName(character.alignment) : undefined;
  const backgroundName = character.background ? getBackgroundName(character.background) : undefined;
  const hasPersona = !!(
    alignmentName ||
    backgroundName ||
    (character.personalityTraits?.length ?? 0) > 0 ||
    (character.ideals?.length ?? 0) > 0 ||
    (character.bonds?.length ?? 0) > 0 ||
    (character.flaws?.length ?? 0) > 0 ||
    character.appearance ||
    character.backstory
  );

  /* ---- behaviors (ported from the legacy sheet) ---- */
  const handleToggleEquip = (idx: number) => {
    const newInv = [...character.inventory];
    const item = newInv[idx];
    if (!item) return;
    (['weapon', 'armor', 'shield'] as const).forEach((t) => {
      if (item.type === t && !item.equipped) {
        newInv.forEach((i) => {
          if (i.type === t) i.equipped = false;
        });
      }
    });
    newInv[idx] = { ...item, equipped: !item.equipped };
    onUpdateInventory(newInv, character.id);
  };

  const handleDrinkPotion = (idx: number) => {
    const item = character.inventory[idx];
    if (!item) return;
    const healingFormula = item.stats?.healing || '2d4+2';
    const roll = rollDiceFormula(healingFormula);
    const amountHealed = roll.total;
    if (onTriggerDiceRoll) {
      void onTriggerDiceRoll({
        characterName: character.name,
        rollType: 'damage',
        label: `${item.name} Healing`,
        rollResult: roll.results.reduce((a, b) => a + b, 0),
        modifier: +(healingFormula.match(/(\d+)$/) || [0, 0])[1],
        sides: +(healingFormula.match(/d(\d+)/) || [0, 4])[1],
        count: roll.results.length,
        results: roll.results,
      });
    }
    const newHp = Math.min(character.hp.max, character.hp.current + amountHealed);
    // Legacy behavior: the hp mutation rides along with the inventory sync below
    // (handleUpdateInventory persists the whole character blob).
    character.hp.current = newHp;
    const newInventory = [...character.inventory];
    const slot = newInventory[idx];
    if (slot.quantity > 1) {
      newInventory[idx] = { ...slot, quantity: slot.quantity - 1 };
    } else {
      newInventory.splice(idx, 1);
    }
    onUpdateInventory(newInventory, character.id);
    onSendMessage?.(
      `[Use Potion] ${character.name} drinks ${item.name}!\n` +
        `• Healing: **+${amountHealed}** HP restored (${healingFormula})\n` +
        `• Vitality: **${newHp} / ${character.hp.max}** HP.`,
    );
  };

  const tabItems = [
    { key: 'stats', label: 'Stats', icon: 'fa-chart-column' },
    { key: 'gear', label: 'Gear', icon: 'fa-bag-shopping', badge: character.inventory.length },
    { key: 'magic', label: 'Magic', icon: 'fa-wand-sparkles', badge: hasPendingChoice ? '!' : undefined },
    { key: 'story', label: 'Story', icon: 'fa-book-open', badge: buffs.length + debuffs.length + (exhaustionLevel > 0 ? 1 : 0) },
  ];

  return (
    <div className="h-full min-h-0 bg-obsidian-950 font-body text-parchment">
      <div className="h-full min-h-0 overflow-y-auto v2-scrollbar">
        {/* Sticky vitals header */}
        <div className={cx('sticky top-0 border-b border-white/[0.06] bg-obsidian-900/95 px-4 pb-3 pt-3 backdrop-blur-md', Z.content)}>
          {isProcessing && (
            <div
              className="mb-2 flex items-center gap-2 rounded-lg border border-ember-500/30 bg-ember-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ember-300"
              role="status"
            >
              <i className="fas fa-spinner fa-spin" aria-hidden="true" />
              <span>A turn is resolving — inventory edits may be overwritten.</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Avatar
              name={character.name}
              src={character.portraitUrl || undefined}
              size="lg"
              ring="ember"
              onClick={() => setShowBackground(true)}
              title="View background & persona"
            />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setShowBackground(true)}
                title="View background & persona"
                className="group flex w-full items-center gap-2 text-left"
              >
                <h2 className="truncate font-display text-xl font-bold uppercase tracking-wider text-ember-400 transition-colors group-hover:text-ember-300">
                  {character.name}
                </h2>
                <i
                  className="fas fa-id-card shrink-0 text-sm text-parchment-faint transition-colors group-hover:text-ember-400"
                  aria-hidden="true"
                />
              </button>
              <p className="truncate text-xs italic text-parchment-mute">
                Level {character.level} {titleCase(character.race)}
                {subraceName ? ` (${subraceName})` : ''} {titleCase(character.class)}
              </p>
            </div>
          </div>

          {canLevelUp && onLevelUp && (
            <Button size="sm" icon="fa-crown" block className="mt-2 animate-ember-glow" onClick={() => onLevelUp(character.id)}>
              Level Up Available!
              {character.unusedStatPoints > 0 && (
                <span className="rounded bg-obsidian-950/60 px-1.5 py-0.5 text-[9px] font-mono normal-case">
                  +{character.unusedStatPoints} Stats
                </span>
              )}
              {(character.unusedSkillPoints || 0) > 0 && (
                <span className="rounded bg-obsidian-950/60 px-1.5 py-0.5 text-[9px] font-mono normal-case">
                  +{character.unusedSkillPoints} Skills
                </span>
              )}
            </Button>
          )}

          {/* Vitality */}
          <div className="mt-3 space-y-1">
            <div className="flex items-baseline justify-between font-display text-[11px] font-semibold uppercase tracking-widest">
              <span className="flex items-center gap-1.5 text-parchment-mute">
                <i className="fas fa-heart-pulse text-[10px] text-blood-400" aria-hidden="true" />
                Vitality
              </span>
              <span className={character.hp.current < 5 ? 'animate-pulse font-bold text-blood-400' : 'text-parchment-dim'}>
                {character.hp.current} / {character.hp.max} HP
              </span>
            </div>
            <Tooltip
              content="At 0 HP you fall unconscious and begin death saves (3 successes = stable / 3 failures = death). Nat 20 = 2 successes; nat 1 = 2 failures."
              className="w-full"
            >
              <HpBar current={character.hp.current} max={character.hp.max} height="md" />
            </Tooltip>
          </div>

          {/* AC / derived-stat chip row (AC card + InfoChips port) */}
          {classDef && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatBadge
                label="AC"
                icon="fa-shield-halved"
                value={totalAc}
                color="ember"
                tip={`AC ${totalAc}. Formula: Light armor = 11 + DEX, Medium = 13 + min(DEX, 2), Heavy = fixed. Unarmored = 10 + DEX. Add shield (+2) if equipped.`}
              />
              <StatBadge
                label="Speed"
                icon="fa-shoe-prints"
                value={`${speed} ft`}
                tip="Movement per turn. Halved by grappled or exhaustion level 2; zeroed by restrained, paralysis, or exhaustion level 5."
              />
              {darkvision > 0 && (
                <StatBadge
                  label="Dark"
                  icon="fa-eye"
                  value={`${darkvision} ft`}
                  tip="See in dim light as if bright, and in darkness as if dim, up to this range."
                />
              )}
              <StatBadge
                label="Prof"
                icon="fa-medal"
                value={`+${profBonus}`}
                tip="Added to attack rolls, saving throws, and skill checks you are proficient in. Scales with level."
              />
              {character.hitDice && classDef.hitDie && (
                <StatBadge
                  label="Hit Dice"
                  icon="fa-dice-d20"
                  value={`${character.hitDice.current}/${character.hitDice.max} d${classDef.hitDie}`}
                  tip="Spend during a Short Rest to recover HP. A Long Rest restores half (min 1)."
                />
              )}
              {spellSaveDc !== null && (
                <StatBadge
                  label="Spell DC"
                  icon="fa-wand-magic-sparkles"
                  value={spellSaveDc}
                  color="arcane"
                  tip="8 + proficiency + spellcasting modifier. The target a creature must roll on a saving throw to resist your spell."
                />
              )}
              {spellAttackBonus !== null && (
                <StatBadge
                  label="Spell Atk"
                  icon="fa-crosshairs"
                  value={`+${spellAttackBonus}`}
                  color="arcane"
                  tip="proficiency + spellcasting modifier. Added to your d20 on spell attack rolls."
                />
              )}
            </div>
          )}

          {/* Experience */}
          <div className="mt-3 space-y-1">
            <div className="flex items-baseline justify-between font-display text-[10px] font-semibold uppercase tracking-widest">
              <span className="text-parchment-mute">Experience</span>
              <span className="font-mono text-ember-400">
                {character.experience || 0} / {nextLevelXp} XP
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full border border-white/[0.05] bg-obsidian-800">
              <div className="h-full bg-ember-600/80 transition-all duration-700" style={{ width: `${xpPercent}%` }} />
            </div>
          </div>

          {/* Concentration / exhaustion indicator chips */}
          {(concentrationName || exhaustionLevel > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {concentrationName && (
                <Chip color="arcane" icon="fa-circle-notch" title="Concentrating on this spell">
                  <span className="flex items-center gap-1">
                    <i className="fas fa-spinner fa-spin text-[9px]" aria-hidden="true" />
                    {concentrationName}
                  </span>
                </Chip>
              )}
              {exhaustionLevel > 0 && (
                <Chip color="ember" icon="fa-battery-quarter" title="Exhaustion — see the Story tab for details">
                  Exhaustion L{exhaustionLevel}
                </Chip>
              )}
            </div>
          )}

          <Tabs items={tabItems} active={activeTab} onChange={(key) => setActiveTab(key as PanelTab)} className="mt-3" small />
        </div>

        {/* Tab body */}
        <div className="space-y-5 px-4 pb-6 pt-4">
          {activeTab === 'stats' && (
            <>
              <section>
                <SectionHeader icon="fa-dumbbell">Ability Scores</SectionHeader>
                <div className="grid grid-cols-3 gap-2">
                  {STATS.map((stat) => {
                    const val = character.stats[stat];
                    const info = STAT_INFO[stat];
                    return (
                      <StatBadge
                        key={stat}
                        label={stat}
                        value={val}
                        mod={getMod(val)}
                        className="w-full"
                        tip={info ? `${info.label}: ${info.governs}` : stat}
                      />
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionHeader icon="fa-shield-heart">Saving Throws</SectionHeader>
                <div className="grid grid-cols-2 gap-1.5">
                  {STATS.map((stat) => {
                    const bonus = getSavingThrowBonus(character, stat);
                    const isProf = classDef?.savingThrowProfs.includes(stat);
                    return (
                      <div
                        key={stat}
                        className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-obsidian-850/60 px-2.5 py-1.5 text-xs"
                        title={isProf ? 'Proficient in this save' : 'Not proficient'}
                      >
                        <span className="flex items-center gap-1.5">
                          {isProf ? (
                            <i className="fas fa-circle text-[5px] text-ember-400" aria-hidden="true" />
                          ) : (
                            <span className="w-[5px]" aria-hidden="true" />
                          )}
                          <span className="font-display font-semibold uppercase tracking-wider text-parchment-dim">{stat}</span>
                        </span>
                        <span className={cx('font-mono font-bold', bonus >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                          {bonus >= 0 ? `+${bonus}` : bonus}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionHeader icon="fa-list-check">Proficient Skills</SectionHeader>
                {character.skills && Object.keys(character.skills).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(character.skills).map(([skillName, rank]) => {
                      const sd = SKILLS_LIST.find((s) => s.name === skillName);
                      if (!sd) return null;
                      const totalMod = getMod(character.stats[sd.stat] ?? 10) + rank;
                      return (
                        <div
                          key={skillName}
                          className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-obsidian-850/60 p-2 text-xs transition-colors hover:bg-obsidian-800"
                          title={sd.description}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold capitalize text-parchment-dim">{sd.label}</span>
                            <span className="font-mono text-[8px] uppercase text-parchment-faint">
                              {sd.stat} (Rank {rank})
                            </span>
                          </div>
                          <span className={cx('font-mono font-bold', totalMod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                            {totalMod >= 0 ? `+${totalMod}` : totalMod}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-2 text-center text-[11px] italic text-parchment-faint">No skills trained yet.</p>
                )}
              </section>
            </>
          )}

          {activeTab === 'gear' && (
            <>
              <section>
                <SectionHeader icon="fa-bag-shopping">Inventory</SectionHeader>
                {character.inventory.length > 0 ? (
                  <div className="space-y-1.5">
                    {character.inventory.map((item, idx) => (
                      <InventoryRow
                        key={`${item.name}-${idx}`}
                        item={item}
                        isProcessing={isProcessing}
                        onView={() => setViewingItem(item)}
                        onToggleEquip={() => handleToggleEquip(idx)}
                        onDrink={() => handleDrinkPotion(idx)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState compact icon="fa-bag-shopping" title="Pack is Empty" body="Items you acquire will appear here." />
                )}
              </section>

              <section>
                <SectionHeader icon="fa-coins">Wealth</SectionHeader>
                <div className="flex gap-4">
                  <span className="flex items-center gap-2 text-xs font-medium text-parchment-dim">
                    <i className="fas fa-coins text-ember-400" aria-hidden="true" />
                    {character.currency.gp} GP
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium text-parchment-dim">
                    <i className="fas fa-coins text-parchment-mute" aria-hidden="true" />
                    {character.currency.sp} SP
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium text-parchment-dim">
                    <i className="fas fa-coins text-ember-800" aria-hidden="true" />
                    {character.currency.cp} CP
                  </span>
                </div>
              </section>

              <section>
                <SectionHeader icon="fa-location-dot">Current Location</SectionHeader>
                <p className="text-sm italic leading-relaxed text-parchment-mute">{character.location}</p>
              </section>
            </>
          )}

          {activeTab === 'magic' && (
            <>
              {classDef?.spellcasting && (
                <section>
                  <SectionHeader
                    icon="fa-wand-sparkles"
                    right={
                      <div className="flex items-center gap-2">
                        {hasPendingChoice && (
                          <Chip color="ember" icon="fa-star" className="animate-pulse">
                            Choice Available
                          </Chip>
                        )}
                        {onManageSpellbook && (
                          <Button size="sm" variant="ghost" icon="fa-book" onClick={() => setShowSpellbook(true)} title="Manage spells">
                            Manage
                          </Button>
                        )}
                      </div>
                    }
                  >
                    Spellcasting
                  </SectionHeader>

                  {slotPools.length > 0 && (
                    <div className="mb-2.5 flex flex-wrap gap-1.5">
                      {slotPools.map((slot) => {
                        const level = parseInt(slot.id.replace('spell-slot-', ''), 10);
                        return (
                          <div
                            key={slot.id}
                            className="flex items-center gap-1.5 rounded-lg border border-white/[0.05] bg-obsidian-850/70 px-2.5 py-1.5"
                            title={`Level ${level} spell slots`}
                          >
                            <span className="font-display text-[10px] font-semibold uppercase text-parchment-mute">L{level}</span>
                            <span className="flex items-center gap-1">
                              {Array.from({ length: slot.max }).map((_, i) => (
                                <span
                                  key={i}
                                  className={cx(
                                    'h-2.5 w-2.5 rounded-full border',
                                    i < slot.current ? 'border-arcane-400/60 bg-arcane-500' : 'border-white/10 bg-obsidian-800',
                                  )}
                                />
                              ))}
                            </span>
                            <span className="text-[10px] font-mono text-parchment-faint">
                              {slot.current}/{slot.max}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(spellList?.length ?? 0) > 0 && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-parchment-faint">
                          {isPreparedCaster ? 'Prepared Spells' : 'Known Spells'}
                        </p>
                        {isPreparedCaster && (
                          <span className="font-mono text-[10px] font-bold text-arcane-300">
                            {leveledPreparedCount} / {maxPreparedCount}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(spellList ?? []).map((sid) => {
                          const spell = SPELLS_BY_ID[sid];
                          if (!spell) return null;
                          return (
                            <Chip
                              key={sid}
                              color="arcane"
                              icon={spell.level === 0 ? 'fa-hat-wizard' : undefined}
                              onClick={() => setViewingSpell(spell)}
                              title={`View ${spell.name} details`}
                            >
                              {spell.name}
                            </Chip>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section>
                <SectionHeader icon="fa-battery-three-quarters">Resources</SectionHeader>
                {nonSlotResources.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {nonSlotResources.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-1.5 rounded-lg border border-white/[0.05] bg-obsidian-850/60 px-2.5 py-1.5 text-xs"
                        title={`Resets on ${r.resetOn} rest`}
                      >
                        {r.icon && <i className={cx('fas text-[10px] text-ember-400', r.icon)} aria-hidden="true" />}
                        <span className="text-parchment-mute">{r.name}:</span>
                        <span className="font-mono font-bold text-ember-300">{r.current}</span>
                        <span className="text-parchment-faint">/</span>
                        <span className="font-mono text-parchment-mute">{r.max}</span>
                        <span className="text-[8px] uppercase text-parchment-faint">({r.resetOn})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] italic text-parchment-faint">None</p>
                )}
              </section>

              <FeatureAccordion
                title={subraceName ? `Racial Traits (${subraceName})` : 'Racial Traits'}
                icon="fa-fingerprint"
                features={racialTraits}
                level={character.level}
              />
            </>
          )}

          {activeTab === 'story' && (
            <>
              {classDef && (
                <FeatureAccordion
                  title={`${classDef.name} Features`}
                  icon="fa-hat-wizard"
                  features={classDef.features}
                  level={character.level}
                />
              )}
              {subclassDef && (
                <FeatureAccordion
                  title={subclassDef.name}
                  icon="fa-gem"
                  features={subclassDef.features}
                  level={character.level}
                />
              )}

              {feats.length > 0 && (
                <section>
                  <SectionHeader icon="fa-medal">Feats</SectionHeader>
                  <div className="flex flex-wrap gap-1.5">
                    {feats.map((feat) => (
                      <Chip
                        key={feat.id}
                        color="ember"
                        icon={feat.icon}
                        onClick={() => setViewingFeat(feat)}
                        title={feat.name}
                      >
                        {feat.shortName}
                      </Chip>
                    ))}
                  </div>
                </section>
              )}

              {(exhaustionLevel > 0 || buffs.length > 0 || debuffs.length > 0) && (
                <section>
                  <SectionHeader icon="fa-triangle-exclamation">Conditions</SectionHeader>
                  <div className="space-y-3">
                    {exhaustionLevel > 0 && (
                      <Card accent="ember">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <i className="fas fa-battery-quarter text-[11px] text-ember-400" aria-hidden="true" />
                            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-ember-400">
                              Exhaustion
                            </span>
                          </div>
                          <span className="rounded bg-ember-500/15 px-1.5 text-[10px] font-mono text-ember-300">
                            Level {exhaustionLevel}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-parchment-mute">
                          {getExhaustionSummary(exhaustionLevel)} Speed penalty: -{exhaustionLevel * 5} ft.
                        </p>
                        <details className="mt-2">
                          <summary className="cursor-pointer font-display text-[10px] font-semibold uppercase tracking-wider text-ember-600">
                            All exhaustion levels
                          </summary>
                          <ul className="mt-1.5 space-y-0.5">
                            {EXHAUSTION_LEVELS.map((l) => (
                              <li
                                key={l.level}
                                className={cx('text-[10px]', l.level <= exhaustionLevel ? 'text-ember-300' : 'text-parchment-faint')}
                              >
                                <strong className="font-mono">L{l.level}:</strong> {l.description}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </Card>
                    )}

                    {buffs.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-verdant-400">
                          <i className="fas fa-shield-halved text-[10px]" aria-hidden="true" />
                          Active Buffs
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {buffs.map((c) => (
                            <ConditionRow
                              key={`${c.id}-${c.source}`}
                              condition={c}
                              tone="verdant"
                              onView={() => setViewingConditionId(c.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {debuffs.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-blood-400">
                          <i className="fas fa-triangle-exclamation text-[10px]" aria-hidden="true" />
                          Active Conditions
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {debuffs.map((c) => (
                            <ConditionRow
                              key={`${c.id}-${c.source}`}
                              condition={c}
                              tone="blood"
                              onView={() => setViewingConditionId(c.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {damageResistances.length > 0 && (
                <section>
                  <SectionHeader icon="fa-shield-virus">Resistances</SectionHeader>
                  <div className="flex flex-wrap gap-1.5">
                    {damageResistances.map((dr) => (
                      <Chip key={dr} color="frost" icon="fa-shield" className="uppercase">
                        {dr} Resistance
                      </Chip>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <SectionHeader
                  icon="fa-id-card"
                  right={
                    <Button size="sm" variant="ghost" icon="fa-book-open" onClick={() => setShowBackground(true)}>
                      {hasPersona ? 'Open Background' : 'Add Persona'}
                    </Button>
                  }
                >
                  Persona
                </SectionHeader>
                {hasPersona ? (
                  <Card>
                    {(alignmentName || backgroundName) && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {alignmentName && <Chip color="frost" icon="fa-scale-balanced">{alignmentName}</Chip>}
                        {backgroundName && <Chip color="ember" icon="fa-scroll">{backgroundName}</Chip>}
                      </div>
                    )}
                    <dl className="space-y-1.5 text-xs leading-relaxed">
                      {([
                        ['Personality', character.personalityTraits],
                        ['Ideals', character.ideals],
                        ['Bonds', character.bonds],
                        ['Flaws', character.flaws],
                      ] as Array<[string, string[] | undefined]>).map(([label, items]) =>
                        items && items.length > 0 ? (
                          <div key={label} className="flex gap-2">
                            <dt className="w-20 shrink-0 font-display font-semibold uppercase tracking-wider text-parchment-faint">
                              {label}
                            </dt>
                            <dd className="text-parchment-mute">{items.join('; ')}</dd>
                          </div>
                        ) : null,
                      )}
                      {character.appearance && (
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 font-display font-semibold uppercase tracking-wider text-parchment-faint">
                            Appearance
                          </dt>
                          <dd className="text-parchment-mute">{character.appearance}</dd>
                        </div>
                      )}
                      {character.backstory && (
                        <div className="flex gap-2">
                          <dt className="w-20 shrink-0 font-display font-semibold uppercase tracking-wider text-parchment-faint">
                            Backstory
                          </dt>
                          <dd className="whitespace-pre-wrap italic text-parchment-mute">{character.backstory}</dd>
                        </div>
                      )}
                    </dl>
                  </Card>
                ) : (
                  <p className="text-[11px] italic text-parchment-faint">
                    No persona details recorded — open the background sheet to write this hero&apos;s story.
                  </p>
                )}
              </section>

              {onUpdateCharacterFields && (
                <NotesSection
                  character={character}
                  currentUserId={currentUserId}
                  isHost={isHost}
                  onSaveNotes={(charId, notes) => onUpdateCharacterFields({ notes }, charId)}
                  onSaveGmNotes={(charId, gmNotes) => onUpdateCharacterFields({ gmNotes }, charId)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Sheets & detail modals (teammate-owned components) */}
      <BackgroundSheet
        character={character}
        open={showBackground}
        onClose={() => setShowBackground(false)}
        onUpdateCharacterFields={onUpdateCharacterFields}
        currentUserId={currentUserId}
      />
      {onManageSpellbook && (
        <SpellbookSheet
          character={character}
          open={showSpellbook}
          onClose={() => setShowSpellbook(false)}
          onManageSpellbook={onManageSpellbook}
          onSwapKnownSpell={onSwapKnownSpell ?? noopSwapSpell}
          isCombatActive={isCombatActive}
        />
      )}
      <ItemDetailModalV2 item={viewingItem} onClose={() => setViewingItem(null)} />
      <SpellDetailModalV2 spell={viewingSpell} onClose={() => setViewingSpell(null)} />
      <ConditionDetailModalV2 conditionId={viewingConditionId} onClose={() => setViewingConditionId(null)} />
      <FeatDetailModalV2 feat={viewingFeat} onClose={() => setViewingFeat(null)} />
    </div>
  );
};

export default CharacterPanel;
