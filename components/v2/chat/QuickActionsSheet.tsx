import React, { useMemo, useState } from 'react';
import type { Character } from '../../../types';
import { SPELLS_BY_ID } from '../../../utils/spells';
import { CLASSES_BY_ID } from '../../../utils/classes';
import { SKILLS_LIST } from '../../../constants';
import Sheet from '../primitives/Sheet';
import Tabs from '../primitives/Tabs';
import Chip from '../primitives/Chip';
import { cx } from '../primitives/cx';
import { SCHOOL_ICONS } from '../game/sheets/DetailModals';

interface QuickActionsSheetProps {
  open: boolean;
  onClose: () => void;
  character?: Character | null;
  combatActive: boolean;
  onPick: (fillText: string) => void;
  onArcaneRecovery?: () => void;
  onNaturalRecovery?: () => void;
  onManageSpellbook?: () => void;
}

type QuickCategory = 'spell' | 'weapon' | 'feature' | 'rest' | 'skill' | 'item' | 'death';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  fillText: string;
  hint?: string;
  category: QuickCategory;
  badge?: string;
}

const CATEGORY_META: Record<QuickCategory, { label: string; icon: string; accent: string }> = {
  spell: { label: 'Spells', icon: 'fa-wand-sparkles', accent: 'text-arcane-400' },
  weapon: { label: 'Weapons', icon: 'fa-khanda', accent: 'text-blood-400' },
  feature: { label: 'Features', icon: 'fa-bolt', accent: 'text-ember-400' },
  skill: { label: 'Skills', icon: 'fa-dice-d20', accent: 'text-verdant-400' },
  item: { label: 'Items', icon: 'fa-flask', accent: 'text-frost-400' },
  rest: { label: 'Rest', icon: 'fa-bed', accent: 'text-parchment-dim' },
  death: { label: 'Rest', icon: 'fa-skull', accent: 'text-blood-400' },
};

/** Special modal-button gating — mirrors the old InputArea memo logic exactly. */
function useSpecialButtons(character: Character | null | undefined, combatActive: boolean) {
  return useMemo(
    () => ({
      arcaneRecovery: (() => {
        if (!character || character.class !== 'wizard') return false;
        const pool = character.resources?.find((r) => r.id === 'arcane-recovery');
        return pool ? pool.current > 0 : true;
      })(),
      naturalRecovery: (() => {
        if (!character || character.class !== 'druid' || character.subclassId !== 'circle-of-the-land') return false;
        const pool = character.resources?.find((r) => r.id === 'natural-recovery');
        return pool ? pool.current > 0 : true;
      })(),
      spellbook: (() => {
        if (!character) return false;
        const cls = CLASSES_BY_ID[character.class];
        return !!cls?.spellcasting && !combatActive;
      })(),
    }),
    [character, combatActive],
  );
}

/** Builds the full quick-action list for a character (ported verbatim from the old InputArea memo). */
function useQuickActions(character: Character | null | undefined): QuickAction[] {
  return useMemo<QuickAction[]>(() => {
    if (!character) return [];
    const actions: QuickAction[] = [];

    /* Prepared + known spells (Ritual badge; wizard unprepared-ritual free-cast). */
    const spellIds = new Set<string>([...(character.preparedSpells || []), ...(character.knownSpells || [])]);
    for (const spellId of spellIds) {
      const spell = SPELLS_BY_ID[spellId];
      if (!spell) continue;
      const levelLabel = spell.level === 0 ? 'Cantrip' : `${spell.level}${spell.level === 1 ? 'st' : spell.level === 2 ? 'nd' : spell.level === 3 ? 'rd' : 'th'}-level`;
      const damageStr = spell.damage ? `${spell.damage.dice} ${spell.damage.type}` : '';
      const healStr = spell.healing ? `Heals ${spell.healing}` : '';
      const saveStr = spell.save ? `DC save ${spell.save.stat.toUpperCase()} (${spell.save.onSuccess})` : '';
      const atkStr = spell.attackRoll ? 'Spell attack' : '';
      const concStr = spell.requiresConcentration ? 'Concentration' : '';
      const extras = [damageStr, healStr, saveStr, atkStr, concStr].filter(Boolean).join(', ');
      const shortDesc = spell.shortDescription || spell.description;

      const isRitual = !!spell.ritual;
      const isPrepared = (character.preparedSpells || []).includes(spellId);
      const isPreparedCaster = CLASSES_BY_ID[character.class]?.spellcasting?.prepMode === 'prepared';
      const isUnpreparedRitual = isRitual && isPreparedCaster && !isPrepared;

      let badge: string | undefined;
      if (isRitual) badge = 'Ritual';

      const ritualNote = isRitual
        ? isUnpreparedRitual
          ? ` [Ritual — Unprepared. ${character.class === 'wizard' ? 'Wizards can cast rituals directly from their spellbook without preparing!' : 'Prepare this spell to cast it.'}]`
          : ' [Ritual — 10 min cast time, costs 0 slots]'
        : '';

      actions.push({
        id: `spell-${spellId}`,
        label: spell.name,
        icon: spell.icon || SCHOOL_ICONS[spell.school] || 'fa-hat-wizard',
        fillText: isUnpreparedRitual && character.class === 'wizard' ? `Cast ${spell.name} as a ritual` : `Cast ${spell.name}`,
        hint: `${spell.name} — ${levelLabel}${ritualNote}. ${spell.school.charAt(0).toUpperCase() + spell.school.slice(1)}. ${spell.castingTime}, ${spell.range}${extras ? `. ${extras}` : ''}. ${shortDesc.slice(0, 120)}${shortDesc.length > 120 ? '...' : ''}`,
        category: 'spell',
        badge,
      });
    }

    /* Equipped weapons. */
    const equippedWeapons = (character.inventory || []).filter((i) => i.equipped && i.type === 'weapon');
    for (const w of equippedWeapons) {
      const dmg = w.stats?.damage ? `${w.stats.damage} ${w.stats.damageType || ''}` : '';
      const props = w.stats?.properties?.length ? w.stats.properties.join(', ') : '';
      actions.push({
        id: `weapon-${w.name}`,
        label: w.name,
        icon: 'fa-crosshairs',
        fillText: `Attack with ${w.name}`,
        hint: `${w.name}${dmg ? ` — ${dmg}` : ''}${props ? `. Properties: ${props}` : ''}${w.description ? `. ${w.description.slice(0, 100)}` : ''}`,
        category: 'weapon',
      });
    }

    /* Class resource features (arcane-recovery skipped — it gets a dedicated modal button). */
    const classDef = CLASSES_BY_ID[character.class];
    if (classDef) {
      for (const feat of classDef.features) {
        if (feat.level > character.level || feat.kind !== 'resource') continue;
        if (feat.id === 'arcane-recovery') continue;
        actions.push({
          id: `feature-${feat.id}`,
          label: feat.name,
          icon: 'fa-bolt',
          fillText: `Use ${feat.name}`,
          hint: `${feat.name} (Level ${feat.level}, ${feat.kind.replace('-', ' ')}). ${feat.description.slice(0, 150)}${feat.description.length > 150 ? '...' : ''}`,
          category: 'feature',
        });
      }
    }

    /* Top-4 trained skills. */
    const trainedSkills = Object.entries(character.skills ?? {})
      .filter(([, rank]) => (rank ?? 0) > 0)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .slice(0, 4);
    for (const [skillName] of trainedSkills) {
      const def = SKILLS_LIST.find((s) => s.name === skillName);
      actions.push({
        id: `skill-${skillName}`,
        label: def?.label ?? skillName,
        icon: 'fa-dice-d20',
        fillText: `I roll a ${def?.label ?? skillName} check`,
        hint: `${def?.label ?? skillName} (${def?.stat?.toUpperCase() || ''}) — ${def?.description ?? ''}`,
        category: 'skill',
      });
    }

    /* First-3 potions. */
    const potions = (character.inventory || []).filter((i) => i.type === 'potion');
    for (const p of potions.slice(0, 3)) {
      const heal = p.stats?.healing ? `Heals ${p.stats.healing}` : '';
      actions.push({
        id: `item-${p.name}`,
        label: p.name,
        icon: 'fa-flask',
        fillText: `Drink ${p.name}`,
        hint: `${p.name}${heal ? ` — ${heal}` : ''}${p.description ? `. ${p.description.slice(0, 100)}` : ''}`,
        category: 'item',
      });
    }

    /* Death save when at 0 HP. */
    if (character.hp.current === 0) {
      actions.push({
        id: 'death-save',
        label: 'Death Save',
        icon: 'fa-skull',
        fillText: 'I roll a death saving throw',
        hint: 'Roll d20 (no modifier). 10+ = success, 1 = 2 failures, 9 or less = failure. 3 successes = stable, 3 failures = death.',
        category: 'death',
      });
    }

    return actions;
  }, [character]);
}

const REST_ACTIONS: QuickAction[] = [
  {
    id: 'shortrest',
    label: 'Short Rest',
    icon: 'fa-campground',
    fillText: '/shortrest',
    hint: 'Short Rest (1h): spend Hit Dice to recover HP. Refreshes Fighter Second Wind, Warlock pact slots, and other short-rest resources. No automatic HP.',
    category: 'rest',
  },
  {
    id: 'longrest',
    label: 'Long Rest',
    icon: 'fa-bed',
    fillText: '/longrest',
    hint: 'Long Rest (8h, 24h cooldown): restores all HP, half of Hit Dice, all spell slots (except Warlock pact slots), and reduces exhaustion by 1 level. Must have ≥1 HP.',
    category: 'rest',
  },
];

const SpecialButton: React.FC<{ icon: string; label: string; hint: string; accent: string; onClick: () => void }> = ({
  icon, label, hint, accent, onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg bg-obsidian-850 border border-white/[0.06] hover:border-ember-500/40 hover:bg-obsidian-800 transition-all cursor-pointer"
  >
    <span className={cx('inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] shrink-0 text-sm', accent)}>
      <i className={cx('fas', icon)} aria-hidden="true" />
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold text-parchment">{label}</span>
      <span className="block text-[11px] text-parchment-mute truncate">{hint}</span>
    </span>
    <i className="fas fa-arrow-right text-[10px] text-parchment-faint" aria-hidden="true" />
  </button>
);

/** Categorized quick-action picker (spells / weapons / features / skills / items / rest) rendered as a bottom sheet. */
const QuickActionsSheet: React.FC<QuickActionsSheetProps> = ({
  open, onClose, character, combatActive, onPick, onArcaneRecovery, onNaturalRecovery, onManageSpellbook,
}) => {
  const special = useSpecialButtons(character, combatActive);
  const actions = useQuickActions(character);
  const [activeTab, setActiveTab] = useState<QuickCategory>('spell');

  const groups = useMemo(() => {
    const byCat = new Map<QuickCategory, QuickAction[]>();
    for (const key of Object.keys(CATEGORY_META) as QuickCategory[]) byCat.set(key, []);
    for (const a of actions) byCat.get(a.category)?.push(a);
    /* Death saves + rests share the Rest tab. */
    const rest = [...(byCat.get('death') ?? []), ...(byCat.get('rest') ?? []), ...REST_ACTIONS];
    byCat.set('rest', rest);
    byCat.set('death', []);
    return byCat;
  }, [actions]);

  const tabs = useMemo(
    () =>
      (['spell', 'weapon', 'feature', 'skill', 'item', 'rest'] as QuickCategory[])
        .map((key) => ({ key, count: groups.get(key)?.length ?? 0 }))
        .filter((t) => t.count > 0 || t.key === 'rest')
        .map((t) => ({ key: t.key, label: CATEGORY_META[t.key].label, icon: CATEGORY_META[t.key].icon, badge: t.count })),
    [groups],
  );

  const tabKeys = new Set(tabs.map((t) => t.key));
  const effectiveTab: QuickCategory = tabKeys.has(activeTab) ? activeTab : (tabs[0]?.key as QuickCategory | undefined) ?? 'rest';
  const visibleActions = groups.get(effectiveTab) ?? [];

  const pick = (fillText: string) => {
    onPick(fillText);
    onClose();
  };

  const launch = (cb?: () => void) => () => {
    cb?.();
    onClose();
  };

  const recoveryCap = Math.ceil((character?.level ?? 1) / 2);

  return (
    <Sheet open={open} onClose={onClose} title="Quick Actions" icon="fa-dice-d20" size="auto">
      <div className="flex flex-col gap-2 mb-4">
        {special.arcaneRecovery && onArcaneRecovery && (
          <SpecialButton
            icon="fa-hat-wizard"
            label="Arcane Recovery"
            hint={`Recover up to ${recoveryCap} levels of spell slots. Once per long rest.`}
            accent="text-arcane-400"
            onClick={launch(onArcaneRecovery)}
          />
        )}
        {special.naturalRecovery && onNaturalRecovery && (
          <SpecialButton
            icon="fa-leaf"
            label="Natural Recovery"
            hint={`Recover up to ${recoveryCap} levels of spell slots on a short rest. Once per long rest.`}
            accent="text-verdant-400"
            onClick={launch(onNaturalRecovery)}
          />
        )}
        {special.spellbook && onManageSpellbook && (
          <SpecialButton
            icon="fa-book"
            label="Manage Spells"
            hint="Prepare/unprepare spells, or swap a known spell. Locked in combat."
            accent="text-ember-400"
            onClick={launch(onManageSpellbook)}
          />
        )}
      </div>

      <Tabs
        items={tabs}
        active={effectiveTab}
        onChange={(key) => setActiveTab(key as QuickCategory)}
        className="mb-3"
      />

      {visibleActions.length === 0 ? (
        <p className="text-sm text-parchment-mute italic py-6 text-center">
          Nothing here yet — this will fill in as your adventure progresses.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visibleActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => pick(action.fillText)}
              title={action.hint ?? action.fillText}
              className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg bg-obsidian-850/60 border border-white/[0.05] hover:border-ember-500/40 hover:bg-obsidian-800 transition-all cursor-pointer"
            >
              <i
                className={cx('fas w-5 text-center text-sm shrink-0', action.icon, CATEGORY_META[action.category].accent)}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm text-parchment">{action.label}</span>
                  {action.badge && (
                    <Chip color="arcane" icon="fa-sparkles">
                      {action.badge}
                    </Chip>
                  )}
                </span>
                {action.hint && (
                  <span className="block text-[11px] text-parchment-mute truncate mt-0.5">{action.hint}</span>
                )}
              </span>
              <i className="fas fa-arrow-right text-[10px] text-parchment-faint" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <p className="text-[10px] text-parchment-faint italic mt-4 text-center">
        Picking an action fills the input — press Enter to send.
      </p>
    </Sheet>
  );
};

export default QuickActionsSheet;
