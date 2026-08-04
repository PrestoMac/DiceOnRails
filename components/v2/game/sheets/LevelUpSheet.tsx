import React, { useMemo, useState } from 'react';
import { Character } from '../../../../types';
import { SKILLS_LIST, ASI_LEVELS } from '../../../../constants';
import { cryptoRoll } from '../../../../utils/random';
import { FeatDefinition, FEATS_CATALOG, FEAT_CATEGORIES } from '../../../../utils/feats';
import { filterAvailableFeats, validateFeatPrereqs } from '../../../../services/featsService';
import { getClassDef, getSubclassDef, getSpellSaveDc, getSpellAttackBonus, getMod } from '../../../../services/classEngine';
import { SPELLS_BY_ID } from '../../../../utils/spells';
import { INVOCATIONS_CATALOG, getInvocationCount } from '../../../../data/invocations';
import { FIGHTING_STYLE_OPTIONS } from '../../../../data/classes';
import type { FeatChoiceOptions } from '../../../../hooks/useProgression';
import Modal from '../../primitives/Modal';
import Tabs, { TabItem } from '../../primitives/Tabs';
import Button from '../../primitives/Button';
import Chip from '../../primitives/Chip';
import Card, { SectionHeader } from '../../primitives/Card';
import { TextField } from '../../primitives/Field';
import IconButton from '../../primitives/IconButton';
import { cx } from '../../primitives/cx';
import { useToastV2 } from '../../primitives/Toast';
import { FeatDetailModalV2 } from './DetailModals';

const STAT_LABELS: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const STAT_LABELS_FULL: Record<string, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

const ASI_FEAT_IDS = new Set([
  'resilient', 'lightly-armored', 'moderately-armored', 'heavily-armored',
  'heavy-armor-master', 'actor', 'athlete', 'tavern-brawler', 'linguist', 'keen-mind',
]);

type StatKey = keyof Character['stats'];
type Tab = 'hp' | 'stats' | 'skills' | 'choice' | 'asi' | 'feat' | 'subclass' | 'resources' | 'spells' | 'invocations' | 'fighting-style-two';

interface LevelUpSheetProps {
  character: Character;
  selectedAllocations: Partial<Record<keyof Character['stats'], number>>;
  remainingPoints: number;
  previewHp: number;
  error: string | null;
  onAllocate: (stat: keyof Character['stats'], delta: number) => void;
  onConfirm: (skillAllocations?: Record<string, number>, hpDeviation?: number) => Promise<void> | void;
  onCancel: () => void;
  onConfirmAsi: () => Promise<void> | void;
  onConfirmFeat: (opts: FeatChoiceOptions) => Promise<void> | void;
  onAcknowledgeSubclass: () => Promise<void> | void;
  onConfirmInvocations: (invocationIds: string[]) => Promise<boolean>;
  onConfirmFightingStyleTwo: (style: string) => Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/* Inline row builders (Emberlight restyle of the wizard shared rows)  */
/* ------------------------------------------------------------------ */

const RemainingBanner: React.FC<{ label: string; remaining: number; total?: number }> = ({ label, remaining, total }) => (
  <div className="flex justify-between items-center bg-obsidian-850/80 p-3 rounded-lg border border-white/[0.06]">
    <span className="text-xs text-parchment-dim">{label}</span>
    <span className={cx('text-lg font-bold font-mono', remaining > 0 ? 'text-ember-400 animate-pulse' : 'text-verdant-400')}>
      {remaining}
      {total !== undefined ? `/${total}` : ''}
    </span>
  </div>
);

const StatRowV2: React.FC<{
  stat: StatKey;
  currentValue: number;
  allocation: number;
  newValue: number;
  modifier: number;
  disableAdd: boolean;
  onAllocate: (delta: number) => void;
}> = ({ stat, currentValue: cv, allocation: al, newValue: nv, modifier: nm, disableAdd, onAllocate }) => (
  <div className="flex items-center gap-3 bg-obsidian-850/60 border border-white/[0.06] hover:border-white/[0.12] rounded-lg p-3 transition-colors">
    <div className="w-24 text-left">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-dim">{STAT_LABELS[stat]}</div>
      <div className="text-[10px] text-parchment-faint">{STAT_LABELS_FULL[stat]}</div>
    </div>
    <div className="flex items-center gap-2">
      <IconButton icon="fa-minus" size="sm" variant="subtle" tip="Decrease" disabled={al <= 0} onClick={() => onAllocate(-1)} />
      <div className="w-10 text-center">
        <span className={cx('text-base font-bold font-mono', al > 0 ? 'text-verdant-400' : 'text-parchment')}>{nv}</span>
      </div>
      <IconButton icon="fa-plus" size="sm" variant="subtle" tip="Increase" disabled={disableAdd} onClick={() => onAllocate(1)} />
    </div>
    <div className="ml-auto text-right">
      <span className={cx('text-[10px] font-mono', nm >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
        {nm >= 0 ? '+' : ''}
        {nm} MOD
      </span>
      {al > 0 && <span className="text-verdant-400 text-[10px] ml-1 block font-bold">+{al} (Was {cv})</span>}
    </div>
  </div>
);

const SkillRowV2: React.FC<{
  label: string;
  statKey: string;
  rank: number;
  totalRank: number;
  totalMod: number;
  remainingPoints: number;
  onAllocate: (delta: number) => void;
  description?: string;
}> = ({ label, statKey, rank, totalRank, totalMod, remainingPoints, onAllocate, description }) => (
  <div className="flex items-center gap-3 bg-obsidian-850/60 border border-white/[0.06] hover:border-white/[0.12] rounded-lg p-3 transition-colors">
    <div className="flex-1 min-w-0 text-left">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold text-parchment truncate">{label}</span>
        <span className="text-[9px] uppercase font-mono px-1 rounded bg-obsidian-800 border border-white/[0.06] text-parchment-mute">
          {statKey}
        </span>
      </div>
      {description && <span className="text-[10px] text-parchment-faint line-clamp-1">{description}</span>}
    </div>
    <div className="flex items-center gap-2">
      <IconButton icon="fa-minus" size="sm" variant="subtle" tip="Decrease" disabled={rank <= 0} onClick={() => onAllocate(-1)} />
      <div className="w-8 text-center">
        <span className={cx('text-sm font-bold font-mono', rank > 0 ? 'text-verdant-400' : 'text-parchment-dim')}>{totalRank}</span>
      </div>
      <IconButton icon="fa-plus" size="sm" variant="subtle" tip="Increase" disabled={remainingPoints <= 0 || totalRank >= 20} onClick={() => onAllocate(1)} />
    </div>
    <div className="w-16 text-right shrink-0">
      <span className={cx('text-xs font-mono font-bold', totalMod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
        {totalMod >= 0 ? '+' : ''}
        {totalMod} MOD
      </span>
      <span className="text-[9px] text-parchment-faint block">(Rank {totalRank})</span>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

/** Level-up sheet: HP roll, stat/skill allocation, ASI or feat choice, subclass, invocations, styles, resources, spells. */
const LevelUpSheet: React.FC<LevelUpSheetProps> = ({
  character,
  selectedAllocations,
  remainingPoints,
  previewHp,
  error,
  onAllocate,
  onConfirm,
  onCancel,
  onConfirmAsi,
  onConfirmFeat,
  onAcknowledgeSubclass,
  onConfirmInvocations,
  onConfirmFightingStyleTwo,
}) => {
  const { toast } = useToastV2();
  const isAsi = character.pendingFeatChoice && ASI_LEVELS.includes(character.level);
  const hasSubclassFeature = character.pendingSubclassFeature && character.subclassId;
  const subclassDef = character.subclassId ? getSubclassDef(character.class, character.subclassId) : undefined;
  const newSubclassFeatures =
    hasSubclassFeature && subclassDef
      ? subclassDef.features.filter((f) => f.level === character.level && !(character.unlockedSubclassFeatures || []).includes(f.level))
      : [];
  const hasPendingInvocations = character.class === 'warlock' && (character.pendingInvocations ?? 0) > 0;
  const championL10Feature = subclassDef?.features.find((f) => f.level === character.level && f.id === 'additional-fighting-style');
  const hasPendingFightingStyleTwo = !!(championL10Feature && !character.fightingStyleTwo);
  const defaultTab: Tab = hasSubclassFeature
    ? 'subclass'
    : hasPendingInvocations
      ? 'invocations'
      : hasPendingFightingStyleTwo
        ? 'fighting-style-two'
        : isAsi
          ? 'choice'
          : 'hp';

  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [localSkills, setLocalSkills] = useState<Record<string, number>>({});
  const [subclassAcknowledged, setSubclassAcknowledged] = useState(false);
  const classDef = getClassDef(character.class);
  const hitDie = classDef?.hitDie || 8;
  const averageRoll = classDef?.hpPerLevel || 5;
  const [hpRoll, setHpRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [tempRoll, setTempRoll] = useState(1);
  const conMod = getMod(character.stats.con + (selectedAllocations.con || 0));
  const startingUnusedSkillPoints = character.unusedSkillPoints || 0;
  const remainingSkillPoints = startingUnusedSkillPoints - Object.values(localSkills).reduce((s, v) => s + v, 0);

  const [choiceType, setChoiceType] = useState<'asi' | 'feat' | null>(null);
  const [selectedFeatId, setSelectedFeatId] = useState<string | null>(null);
  const [featSearch, setFeatSearch] = useState('');
  const [featCategory, setFeatCategory] = useState<string>('all');
  const [viewingFeat, setViewingFeat] = useState<FeatDefinition | null>(null);
  const [saveStatChoice, setSaveStatChoice] = useState<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>(
    (character.featChoices?.['resilient']?.saveStat as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | undefined) || 'con',
  );
  const [asiBonusesForFeat, setAsiBonusesForFeat] = useState<Partial<Record<StatKey, number>>>({});
  const [skilledChoices, setSkilledChoices] = useState<string[]>([]);
  const [pendingInvocationPicks, setPendingInvocationPicks] = useState<string[]>([]);
  const [pendingFightingStyleTwo, setPendingFightingStyleTwo] = useState<string>('');

  const handleRollHp = () => {
    if (rolling) return;
    setRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setTempRoll(cryptoRoll(hitDie));
      if (++count > 10) {
        clearInterval(interval);
        setHpRoll(cryptoRoll(hitDie));
        setRolling(false);
      }
    }, 70);
  };

  const handleAllocateSkill = (skillName: string, delta: number) =>
    setLocalSkills((p) => {
      const nv = (p[skillName] || 0) + delta;
      if (nv < 0 || Object.values({ ...p, [skillName]: nv }).reduce((s, v) => s + v, 0) > startingUnusedSkillPoints) return p;
      return { ...p, [skillName]: nv };
    });

  const hpGain = hpRoll !== null ? Math.max(1, hpRoll + conMod) : 0;
  const hpDeviation = hpRoll !== null ? hpRoll - averageRoll : 0;
  const finalPreviewHp = previewHp + hpDeviation;

  const filteredFeats = useMemo(() => {
    let feats = filterAvailableFeats(character, featSearch);
    if (featCategory !== 'all') feats = feats.filter((f) => f.category === featCategory);
    return feats;
  }, [character, featSearch, featCategory]);

  const selectedFeat = useMemo(() => FEATS_CATALOG.find((f) => f.id === selectedFeatId) || null, [selectedFeatId]);
  const selectedFeatValidation = useMemo(() => {
    if (!selectedFeat) return null;
    return validateFeatPrereqs(character, selectedFeat.id);
  }, [character, selectedFeat]);

  const featNeedsAsi = selectedFeat && ASI_FEAT_IDS.has(selectedFeat.id);
  const featNeedsSaveStat = selectedFeat?.id === 'resilient';
  const featNeedsSkills = selectedFeat?.id === 'skilled';

  const asiTotalForFeat = Object.values(asiBonusesForFeat).reduce((s, v) => s + (v || 0), 0);
  const asiValid = !featNeedsAsi || asiTotalForFeat === 1;

  const tabs: Array<{ key: Tab; icon: string; label: string; show: boolean }> = [
    { key: 'subclass', icon: 'fa-gem', label: 'Subclass', show: !!hasSubclassFeature && !subclassAcknowledged },
    { key: 'hp', icon: 'fa-heart', label: 'HP Roll', show: !isAsi && !hasSubclassFeature },
    { key: 'stats', icon: 'fa-shield-alt', label: 'Attributes', show: !isAsi },
    { key: 'skills', icon: 'fa-hat-wizard', label: 'Skills', show: !isAsi },
    { key: 'choice', icon: 'fa-star', label: 'ASI / Feat', show: !!isAsi },
    { key: 'asi', icon: 'fa-arrow-up', label: 'ASI', show: !!isAsi && choiceType === 'asi' },
    { key: 'feat', icon: 'fa-trophy', label: 'Feat', show: !!isAsi && choiceType === 'feat' },
    { key: 'invocations', icon: 'fa-eye', label: 'Invocations', show: hasPendingInvocations },
    { key: 'fighting-style-two', icon: 'fa-shield-halved', label: 'Style II', show: hasPendingFightingStyleTwo },
    { key: 'resources', icon: 'fa-bolt', label: 'Resources', show: (character.resources || []).length > 0 },
    { key: 'spells', icon: 'fa-book', label: 'Spells', show: !!classDef?.spellcasting },
  ];

  const doneFor = (key: Tab): boolean =>
    key === 'hp'
      ? hpRoll !== null
      : key === 'stats'
        ? remainingPoints === 0
        : key === 'skills'
          ? remainingSkillPoints === 0
          : key === 'choice'
            ? choiceType !== null
            : key === 'asi'
              ? remainingPoints === 0
              : key === 'feat'
                ? !!selectedFeatId
                : false;

  const tabItems: TabItem[] = tabs
    .filter((t) => t.show)
    .map((t) => ({ key: t.key, label: t.label, icon: t.icon, badge: doneFor(t.key) ? '✓' : '' }));

  const renderStatRows = (asiMode: boolean) => (
    <div className="space-y-2">
      {(Object.keys(character.stats) as StatKey[]).map((stat) => {
        const cv = character.stats[stat];
        const al = selectedAllocations[stat] || 0;
        const nv = cv + al;
        const nm = getMod(nv);
        const disableAdd = remainingPoints <= 0 || nv >= 20 || (asiMode && al >= 2);
        return (
          <StatRowV2
            key={stat}
            stat={stat}
            currentValue={cv}
            allocation={al}
            newValue={nv}
            modifier={nm}
            disableAdd={disableAdd}
            onAllocate={(d) => onAllocate(stat, d)}
          />
        );
      })}
    </div>
  );

  const renderHpTab = () => (
    <div className="space-y-6 py-2 animate-fade-in">
      <div className="text-center p-4 bg-obsidian-850/70 rounded-xl border border-white/[0.06]">
        <p className="text-parchment-dim text-sm">
          Your calling dictates a <span className="text-ember-400 font-bold">1d{hitDie}</span> Hit Die for leveling up.
        </p>
        <div className="flex justify-center items-center gap-4 my-6">
          <div
            className={cx(
              'w-20 h-20 bg-obsidian-900 border-2 rounded-xl flex flex-col justify-center items-center relative shadow-2xl transition-all',
              rolling ? 'border-ember-500 scale-105 rotate-12 animate-bounce' : 'border-white/[0.08]',
            )}
          >
            <span className="text-[10px] text-parchment-faint uppercase font-bold absolute top-1.5 tracking-tighter">d{hitDie}</span>
            <span
              className={cx(
                'text-4xl font-bold font-mono',
                rolling ? 'text-ember-400' : hpRoll !== null ? 'text-verdant-400' : 'text-parchment-faint',
              )}
            >
              {rolling ? tempRoll : hpRoll !== null ? hpRoll : '?'}
            </span>
          </div>
        </div>
        <div className="flex gap-3 max-w-sm mx-auto">
          <Button icon="fa-dice" onClick={handleRollHp} disabled={rolling} className="flex-1" size="sm">
            Roll Die
          </Button>
          <Button variant="subtle" onClick={() => setHpRoll(averageRoll)} disabled={rolling} className="flex-1" size="sm">
            Take Average ({averageRoll})
          </Button>
        </div>
      </div>
      {hpRoll !== null && (
        <Card accent="verdant" className="p-4 text-center animate-slide-up">
          <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-parchment-dim mb-2">
            HP Gained Summary
          </h3>
          <div className="flex justify-center items-center gap-4 text-sm font-mono">
            <div>
              <span className="text-parchment-faint block text-[10px] uppercase font-sans">Roll Result</span>
              <span className="text-parchment text-lg font-bold">{hpRoll}</span>
            </div>
            <span className="text-parchment-faint text-xl">+</span>
            <div>
              <span className="text-parchment-faint block text-[10px] uppercase font-sans">CON Modifier</span>
              <span className={cx('text-lg font-bold', conMod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                {conMod >= 0 ? '+' : ''}
                {conMod}
              </span>
            </div>
            <span className="text-parchment-faint text-xl">=</span>
            <div className="bg-verdant-950/25 border border-verdant-500/30 px-3 py-1 rounded">
              <span className="text-verdant-500 block text-[10px] uppercase font-sans font-bold">Total Gained</span>
              <span className="text-verdant-400 text-lg font-bold font-mono">+{hpGain} HP</span>
            </div>
          </div>
          <p className="text-parchment-faint text-[10px] mt-3">
            Max HP: {character.hp.max} <span className="text-ember-500">→</span> {finalPreviewHp}
          </p>
        </Card>
      )}
    </div>
  );

  const renderSkillsTab = () => (
    <div className="space-y-3 py-2 animate-fade-in">
      <RemainingBanner label="Available Skill Points:" remaining={remainingSkillPoints} />
      <div className="space-y-2">
        {SKILLS_LIST.map((skill) => {
          const cr = character.skills?.[skill.name] || 0;
          const pa = localSkills[skill.name] || 0;
          const fr = cr + pa;
          const gsv = character.stats[skill.stat] + (selectedAllocations[skill.stat] || 0);
          const tm = getMod(gsv) + fr;
          return (
            <SkillRowV2
              key={skill.name}
              label={skill.label}
              statKey={skill.stat}
              rank={pa}
              totalRank={fr}
              totalMod={tm}
              remainingPoints={remainingSkillPoints}
              onAllocate={(d) => handleAllocateSkill(skill.name, d)}
              description={skill.description}
            />
          );
        })}
      </div>
    </div>
  );

  const renderChoiceOrAsOrFeat = () => (
    <div className="space-y-3 py-2 animate-fade-in">
      {!choiceType && (
        <Card className="text-center p-4">
          <p className="text-xs text-parchment-dim">Ability Score Improvement level reached.</p>
          <p className="text-[10px] text-parchment-faint mt-1">
            Choose: Ability Score Improvement <span className="text-ember-500">or</span> a Feat
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Card
              interactive
              className="p-4 text-center"
              onClick={() => {
                setChoiceType('asi');
                setActiveTab('asi');
              }}
            >
              <i className="fas fa-arrow-up text-2xl text-ember-400 mb-1" aria-hidden="true" />
              <p className="font-display text-xs font-bold uppercase tracking-wider text-parchment">Ability Score</p>
              <p className="text-[9px] text-parchment-mute mt-0.5">+1 to two stats, or +2 to one</p>
            </Card>
            <Card
              interactive
              className="p-4 text-center"
              onClick={() => {
                setChoiceType('feat');
                setActiveTab('feat');
              }}
            >
              <i className="fas fa-trophy text-2xl text-ember-400 mb-1" aria-hidden="true" />
              <p className="font-display text-xs font-bold uppercase tracking-wider text-parchment">Take a Feat</p>
              <p className="text-[9px] text-parchment-mute mt-0.5">Choose from the SRD feat list</p>
            </Card>
          </div>
        </Card>
      )}

      {choiceType === 'asi' && (
        <div className="space-y-3">
          <RemainingBanner label="Points to allocate:" remaining={remainingPoints} total={2} />
          {renderStatRows(true)}
          <button
            type="button"
            onClick={() => {
              setChoiceType(null);
              setActiveTab('choice');
            }}
            className="w-full py-2 text-[10px] uppercase font-semibold tracking-widest text-parchment-faint hover:text-parchment transition-colors cursor-pointer"
          >
            ← Back to ASI/Feat choice
          </button>
        </div>
      )}

      {choiceType === 'feat' && (
        <div className="space-y-3">
          {selectedFeatId && (
            <Card accent="ember" className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-[10px] uppercase font-semibold text-ember-400 tracking-widest">Selected Feat</p>
                  <h4 className="text-base font-bold text-parchment truncate">{selectedFeat?.name}</h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="fa-circle-info"
                  onClick={() => setViewingFeat(selectedFeat)}
                >
                  Details
                </Button>
              </div>
              {selectedFeatValidation && !selectedFeatValidation.ok && (
                <p className="text-xs text-blood-400 mt-1">
                  <i className="fas fa-exclamation-triangle mr-1" aria-hidden="true" />
                  {selectedFeatValidation.reason}
                </p>
              )}
            </Card>
          )}

          {featNeedsAsi && selectedFeat && (
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-obsidian-850/80 p-2 rounded-lg border border-white/[0.06]">
                <span className="text-[10px] text-parchment-dim">+1 ability point to allocate:</span>
                <span className={cx('text-sm font-bold font-mono', asiTotalForFeat === 1 ? 'text-verdant-400' : 'text-ember-400')}>
                  {asiTotalForFeat}/1
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(character.stats) as StatKey[]).map((stat) => {
                  const al = asiBonusesForFeat[stat] || 0;
                  const proposed = character.stats[stat] + al;
                  const disableAdd = al >= 1 || asiTotalForFeat >= 1 || proposed > 20;
                  return (
                    <div key={stat} className="bg-obsidian-850/60 border border-white/[0.06] rounded-lg p-2 text-center">
                      <div className="text-[9px] uppercase text-parchment-faint font-bold">{STAT_LABELS[stat]}</div>
                      <div className="flex items-center justify-center gap-1 my-1">
                        <IconButton
                          icon="fa-minus"
                          size="sm"
                          variant="subtle"
                          tip="Decrease"
                          disabled={al <= 0}
                          onClick={() => setAsiBonusesForFeat((p) => ({ ...p, [stat]: 0 }))}
                        />
                        <span className={cx('text-xs font-mono font-bold w-7', al > 0 ? 'text-verdant-400' : 'text-parchment-dim')}>
                          {proposed}
                        </span>
                        <IconButton
                          icon="fa-plus"
                          size="sm"
                          variant="subtle"
                          tip="Increase"
                          disabled={disableAdd}
                          onClick={() => setAsiBonusesForFeat((p) => ({ ...p, [stat]: 1 }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {featNeedsSaveStat && (
            <Card className="p-3 space-y-2">
              <SectionHeader>Choose Saving Throw Proficiency</SectionHeader>
              <div className="grid grid-cols-3 gap-1">
                {STAT_KEYS.map((stat) => (
                  <button
                    type="button"
                    key={stat}
                    onClick={() => setSaveStatChoice(stat)}
                    className={cx(
                      'py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border',
                      saveStatChoice === stat
                        ? 'bg-ember-500/15 text-ember-300 border-ember-500/40'
                        : 'bg-obsidian-800 text-parchment-mute border-white/[0.06] hover:bg-obsidian-750',
                    )}
                  >
                    {STAT_LABELS[stat]}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {featNeedsSkills && (
            <Card className="p-3 space-y-2">
              <SectionHeader>Choose 3 Skills ({skilledChoices.length}/3)</SectionHeader>
              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto v2-scrollbar">
                {SKILLS_LIST.map((s) => {
                  const isSelected = skilledChoices.includes(s.name);
                  const disableAdd = isSelected || skilledChoices.length >= 3;
                  return (
                    <button
                      type="button"
                      key={s.name}
                      onClick={() => {
                        if (isSelected) setSkilledChoices((p) => p.filter((x) => x !== s.name));
                        else if (!disableAdd) setSkilledChoices((p) => [...p, s.name]);
                      }}
                      className={cx(
                        'py-1 px-2 rounded-md text-[10px] text-left transition-colors cursor-pointer border disabled:opacity-40',
                        isSelected
                          ? 'bg-ember-500/15 text-ember-300 border-ember-500/40'
                          : 'bg-obsidian-800 text-parchment-mute border-white/[0.06] hover:bg-obsidian-750',
                      )}
                      disabled={!isSelected && disableAdd}
                    >
                      {isSelected && <i className="fas fa-check text-[8px] mr-1" aria-hidden="true" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="space-y-2">
            <TextField icon="fa-magnifying-glass" value={featSearch} onChange={setFeatSearch} placeholder="Search feats..." />
            <div className="flex flex-wrap gap-1">
              <Chip color="ember" active={featCategory === 'all'} onClick={() => setFeatCategory('all')}>
                All
              </Chip>
              {FEAT_CATEGORIES.map((c) => (
                <Chip key={c.key} icon={c.icon} color="ember" active={featCategory === c.key} onClick={() => setFeatCategory(c.key)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto pr-1 v2-scrollbar space-y-2">
            {filteredFeats.length === 0 ? (
              <p className="text-center text-parchment-faint text-xs py-4">No matching feats available.</p>
            ) : (
              filteredFeats.map((feat) => {
                const validation = validateFeatPrereqs(character, feat.id);
                const meetsPrereqs = validation.ok;
                const isSelected = selectedFeatId === feat.id;
                return (
                  <div
                    key={feat.id}
                    onClick={() => meetsPrereqs && setSelectedFeatId(feat.id)}
                    className={cx(
                      'p-3 rounded-lg border transition-all text-left cursor-pointer flex items-start gap-3',
                      isSelected
                        ? 'border-ember-500/50 bg-ember-500/10'
                        : meetsPrereqs
                          ? 'border-white/[0.06] bg-obsidian-850/40 hover:bg-obsidian-850/80 hover:border-white/[0.12]'
                          : 'border-white/[0.04] bg-obsidian-850/20 opacity-50 cursor-not-allowed',
                    )}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && meetsPrereqs) {
                        e.preventDefault();
                        setSelectedFeatId(feat.id);
                      }
                    }}
                  >
                    <div className="w-9 h-9 rounded-lg bg-obsidian-800 border border-white/[0.06] flex items-center justify-center shrink-0">
                      <i className={cx('fas text-ember-400 text-sm', feat.icon)} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-parchment truncate">{feat.name}</h4>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingFeat(feat);
                          }}
                          className="text-parchment-faint hover:text-parchment text-xs cursor-pointer"
                          title="View details"
                          aria-label={`View details for ${feat.name}`}
                        >
                          <i className="fas fa-info-circle" aria-hidden="true" />
                        </button>
                      </div>
                      <p className="text-[10px] text-ember-400 font-mono uppercase tracking-wider">{feat.shortName}</p>
                      <p className="text-[10px] text-parchment-dim mt-1 line-clamp-2">{feat.mechanicalEffect}</p>
                      {!meetsPrereqs && validation.reason && (
                        <p className="text-[9px] text-blood-400 mt-1 flex items-center gap-1">
                          <i className="fas fa-lock text-[8px]" aria-hidden="true" />
                          {validation.reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFeatId(null);
              setAsiBonusesForFeat({});
              setSkilledChoices([]);
              setChoiceType(null);
              setActiveTab('choice');
            }}
            className="w-full py-2 text-[10px] uppercase font-semibold tracking-widest text-parchment-faint hover:text-parchment transition-colors cursor-pointer"
          >
            ← Back to choice
          </button>
        </div>
      )}
    </div>
  );

  const renderSubclassTab = () => (
    <div className="space-y-4 py-2 animate-fade-in">
      <Card accent="ember" className="p-5 text-center">
        <div className="text-4xl mb-2">
          <i className="fas fa-gem text-ember-400" aria-hidden="true" />
        </div>
        <h3 className="font-display font-bold text-lg text-ember-300">New Subclass Feature Unlocked!</h3>
        {newSubclassFeatures.map((f) => (
          <div key={f.id} className="mt-4 bg-obsidian-850/60 border border-white/[0.06] rounded-lg p-4 text-left">
            <p className="text-sm font-bold text-parchment">{f.name}</p>
            <p className="text-xs text-parchment-mute mt-1">{f.description}</p>
            {f.choice && <p className="text-[10px] text-ember-500/90 mt-1 italic">You may need to make a choice for this feature.</p>}
          </div>
        ))}
      </Card>
      <Button
        block
        onClick={() => {
          setSubclassAcknowledged(true);
          if (onAcknowledgeSubclass) onAcknowledgeSubclass();
          setActiveTab('hp');
        }}
      >
        Acknowledge
      </Button>
    </div>
  );

  const renderResourcesTab = () => (
    <div className="space-y-3 py-2 animate-fade-in">
      <SectionHeader icon="fa-bolt">Class & Race Resources</SectionHeader>
      {(character.resources || [])
        .filter((r) => r.max > 0)
        .map((r) => (
          <div key={r.id} className="flex items-center justify-between bg-obsidian-850/60 border border-white/[0.06] rounded-lg p-3">
            <div className="flex items-center gap-2 min-w-0">
              {r.icon && <i className={cx('fas text-ember-400 text-xs', r.icon)} aria-hidden="true" />}
              <div className="min-w-0">
                <span className="text-sm font-bold text-parchment truncate">{r.name}</span>
                <span className="text-[10px] text-parchment-faint block">Resets on {r.resetOn} rest</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-base font-bold font-mono text-ember-300">{r.current}</span>
              <span className="text-parchment-faint text-sm">/{r.max}</span>
            </div>
          </div>
        ))}
      {(character.resources || []).filter((r) => r.max > 0).length === 0 && (
        <p className="text-xs text-parchment-faint text-center py-6 italic">No resource pools available.</p>
      )}
    </div>
  );

  const renderInvocationsTab = () => {
    const available = INVOCATIONS_CATALOG.filter(
      (inv) => inv.minLevel <= character.level && !(character.invocations ?? []).includes(inv.id),
    );
    return (
      <div className="space-y-3 py-2 animate-fade-in">
        <Card accent="arcane" className="p-4 text-center">
          <div className="text-3xl mb-1">
            <i className="fas fa-eye text-arcane-300" aria-hidden="true" />
          </div>
          <h3 className="font-display font-bold text-arcane-300">Eldritch Invocations</h3>
          <p className="text-[10px] text-parchment-mute mt-1">
            Pick {character.pendingInvocations} new invocation{character.pendingInvocations === 1 ? '' : 's'} from the list below.
            Your current invocation budget is {getInvocationCount(character.level)} at L{character.level}.
          </p>
        </Card>
        <div className="max-h-72 overflow-y-auto pr-1 v2-scrollbar space-y-2">
          {available.map((inv) => {
            const isSelected = pendingInvocationPicks.includes(inv.id);
            const disablePick = !isSelected && pendingInvocationPicks.length >= (character.pendingInvocations ?? 0);
            return (
              <button
                type="button"
                key={inv.id}
                onClick={() => {
                  if (isSelected) setPendingInvocationPicks((p) => p.filter((x) => x !== inv.id));
                  else if (!disablePick) setPendingInvocationPicks((p) => [...p, inv.id]);
                }}
                className={cx(
                  'w-full text-left p-3 rounded-lg border transition-colors cursor-pointer disabled:opacity-40',
                  isSelected
                    ? 'bg-arcane-500/15 border-arcane-500/40'
                    : 'bg-obsidian-850/40 border-white/[0.06] hover:bg-obsidian-850/80',
                )}
                disabled={!isSelected && disablePick}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-parchment">
                      {inv.name}
                      {inv.prerequisite ? <span className="text-[9px] text-parchment-faint ml-1">· {inv.prerequisite}</span> : null}
                    </p>
                    <p className="text-[10px] text-parchment-mute mt-0.5">{inv.description}</p>
                  </div>
                  {isSelected && <i className="fas fa-check text-arcane-300 text-xs" aria-hidden="true" />}
                </div>
              </button>
            );
          })}
          {available.length === 0 && (
            <p className="text-center text-parchment-faint text-xs py-4 italic">No new invocations available at this level.</p>
          )}
        </div>
        <Button
          variant="arcane"
          block
          onClick={async () => {
            const ok = await onConfirmInvocations(pendingInvocationPicks);
            if (ok) setPendingInvocationPicks([]);
          }}
          disabled={pendingInvocationPicks.length !== (character.pendingInvocations ?? 0)}
        >
          Learn {pendingInvocationPicks.length > 0 ? `(${pendingInvocationPicks.length}/${character.pendingInvocations ?? 0})` : ''}
        </Button>
      </div>
    );
  };

  const renderFightingStyleTwoTab = () => (
    <div className="space-y-3 py-2 animate-fade-in">
      <Card accent="ember" className="p-4 text-center">
        <div className="text-3xl mb-1">
          <i className="fas fa-shield-halved text-ember-400" aria-hidden="true" />
        </div>
        <h3 className="font-display font-bold text-ember-300">Additional Fighting Style</h3>
        <p className="text-[10px] text-parchment-mute mt-1">
          Champion L10 — pick a second fighting style (cannot duplicate your first).
        </p>
      </Card>
      <div className="grid grid-cols-1 gap-2">
        {FIGHTING_STYLE_OPTIONS.filter((fs) => fs.id !== 'protection' && fs.id !== character.fightingStyle).map((fs) => (
          <button
            type="button"
            key={fs.id}
            onClick={() => setPendingFightingStyleTwo(fs.id)}
            className={cx(
              'p-3 rounded-lg border text-left transition-colors cursor-pointer',
              pendingFightingStyleTwo === fs.id
                ? 'bg-ember-500/15 border-ember-500/40'
                : 'bg-obsidian-850/40 border-white/[0.06] hover:bg-obsidian-850/80',
            )}
          >
            <p className="text-xs font-bold text-parchment">{fs.label}</p>
            <p className="text-[10px] text-parchment-mute mt-0.5">{fs.description}</p>
          </button>
        ))}
      </div>
      <Button
        block
        onClick={async () => {
          if (!pendingFightingStyleTwo) return;
          const ok = await onConfirmFightingStyleTwo(pendingFightingStyleTwo);
          if (ok) setPendingFightingStyleTwo('');
        }}
        disabled={!pendingFightingStyleTwo}
      >
        Confirm Style
      </Button>
    </div>
  );

  const renderSpellsTab = () => (
    <div className="space-y-3 py-2 animate-fade-in">
      {character.pendingSpellSwap && classDef?.spellcasting?.prepMode === 'known' && (
        <div className="bg-ember-500/[0.08] border border-ember-500/30 rounded-lg p-2.5 flex items-center gap-2 text-xs text-ember-200">
          <i className="fas fa-arrows-rotate text-ember-400" aria-hidden="true" />
          <span>
            You may swap one known spell for another. Use the "Manage Spells" button on your character sheet or input bar after
            closing this sheet.
          </span>
        </div>
      )}
      {character.class === 'wizard' && (
        <div className="bg-ember-500/[0.08] border border-ember-500/30 rounded-lg p-2.5 flex items-center gap-2 text-xs text-ember-200">
          <i className="fas fa-book-bookmark text-ember-400" aria-hidden="true" />
          <span>
            Wizard Spellbook: You gain 2 new spells of your choice for your spellbook on level-up.
            {character.pendingWizardSpells ? ` (${character.pendingWizardSpells} pending)` : ''} Use the "Spellbook" button on
            your character sheet to learn them anytime.
          </span>
        </div>
      )}
      {classDef?.spellcasting && (
        <Card className="p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase text-parchment-mute font-bold">Spellcasting Ability</span>
            <span className="text-xs font-bold text-ember-300">{classDef.spellcasting.ability.toUpperCase()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase text-parchment-mute font-bold">Spell Save DC</span>
            <span className="text-xs font-bold text-ember-300">{getSpellSaveDc(character)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase text-parchment-mute font-bold">Spell Attack Bonus</span>
            <span className="text-xs font-bold text-ember-300">+{getSpellAttackBonus(character)}</span>
          </div>
        </Card>
      )}
      <div className="space-y-2">
        {(character.resources || [])
          .filter((r) => r.id.startsWith('spell-slot-') && r.max > 0)
          .map((slot) => (
            <div key={slot.id} className="flex items-center justify-between bg-obsidian-850/60 border border-white/[0.06] rounded-lg p-2.5">
              <span className="text-xs text-parchment-dim">Level {slot.id.slice(-1)} Slots</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: slot.max }).map((_, i) => (
                  <span
                    key={i}
                    className={cx('w-3.5 h-3.5 rounded-full', i < slot.current ? 'bg-ember-500' : 'bg-obsidian-800 border border-white/10')}
                  />
                ))}
                <span className="text-[10px] text-parchment-faint ml-1.5 font-mono">
                  {slot.current}/{slot.max}
                </span>
              </div>
            </div>
          ))}
      </div>
      {classDef?.spellcasting && (
        <div>
          <SectionHeader icon="fa-book">
            {character.class === 'wizard'
              ? 'Spellbook Spells (Known)'
              : classDef.spellcasting.prepMode === 'prepared'
                ? 'Prepared Spells'
                : 'Known Spells'}
          </SectionHeader>
          <div className="max-h-40 overflow-y-auto space-y-1 v2-scrollbar">
            {(character.knownSpells || []).map((sid) => {
              const spell = SPELLS_BY_ID[sid];
              const isPrep = (character.preparedSpells || []).includes(sid);
              return spell ? (
                <div key={sid} className="flex items-center justify-between bg-obsidian-850/40 border border-white/[0.06] rounded-lg p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-parchment-dim truncate">{spell.name}</span>
                    {character.class === 'wizard' && spell.level > 0 && (
                      <Chip color={isPrep ? 'ember' : 'neutral'} className="uppercase text-[8px]">
                        {isPrep ? 'Prepared' : 'In Spellbook'}
                      </Chip>
                    )}
                  </div>
                  <span className="text-[10px] text-parchment-faint capitalize shrink-0">
                    {spell.school} L{spell.level}
                  </span>
                </div>
              ) : null;
            })}
            {(character.knownSpells || []).length === 0 && (
              <p className="text-xs text-parchment-faint text-center py-4 italic">
                Select spells at character creation or during level-up.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Gating mirrors the legacy LevelUpModal exactly — including its `!featNeedsSaveStat`
  // clause (the Resilient feat is unconfirmable in the legacy UI; preserved here for
  // behavioral parity pending an engine-side decision).
  const canConfirm = isAsi
    ? choiceType === 'asi'
      ? remainingPoints === 0
      : !!(
          choiceType === 'feat' &&
          selectedFeatId &&
          selectedFeatValidation?.ok &&
          asiValid &&
          !featNeedsSaveStat &&
          (!featNeedsSkills || skilledChoices.length === 3)
        )
    : remainingPoints === 0 && remainingSkillPoints === 0 && hpRoll !== null;

  const invocationsPendingUnresolved = hasPendingInvocations && pendingInvocationPicks.length !== (character.pendingInvocations ?? 0);
  const fightingStyleTwoUnresolved = hasPendingFightingStyleTwo && !pendingFightingStyleTwo;
  const sidePicksBlock = invocationsPendingUnresolved || fightingStyleTwoUnresolved;

  const footerSummary = (() => {
    if (!isAsi) {
      return (
        <>
          <div>
            HP: <span className="text-parchment">{character.hp.max}</span> →{' '}
            <span className="text-verdant-400 font-bold">{hpRoll !== null ? finalPreviewHp : '?'}</span>
          </div>
          <div>
            Stats: <span className="text-parchment">{remainingPoints} left</span>
          </div>
          <div>
            Skills: <span className="text-parchment">{remainingSkillPoints} left</span>
          </div>
        </>
      );
    }
    if (choiceType === 'asi') {
      return (
        <div className="w-full text-center">
          Points: <span className={remainingPoints === 0 ? 'text-verdant-400' : 'text-ember-400'}>2</span> — {remainingPoints}{' '}
          remaining
        </div>
      );
    }
    if (choiceType === 'feat') {
      return (
        <div className="w-full text-center">
          {selectedFeatId ? (
            <span className="text-verdant-400">Feat selected: {selectedFeat?.name}</span>
          ) : (
            <span className="text-ember-400">Choose a feat below</span>
          )}
        </div>
      );
    }
    return <div className="w-full text-center text-ember-400">Choose: Ability Score Improvement or a Feat</div>;
  })();

  const confirmLabel = isAsi
    ? choiceType === 'asi'
      ? 'Confirm ASI'
      : choiceType === 'feat'
        ? `Take ${selectedFeat?.shortName || 'Feat'}`
        : 'Choose First'
    : 'Confirm Level Up';

  const handleConfirm = () => {
    if (isAsi) {
      if (choiceType === 'asi') {
        onConfirmAsi();
      } else if (choiceType === 'feat' && selectedFeatId) {
        onConfirmFeat({
          featId: selectedFeatId,
          asiBonuses: featNeedsAsi ? asiBonusesForFeat : undefined,
          saveStatChoice: featNeedsSaveStat ? saveStatChoice : undefined,
          skillChoices: featNeedsSkills ? skilledChoices : undefined,
        });
      } else {
        toast('Please make a choice first.', 'warning');
      }
      return;
    }
    if (remainingPoints > 0 || remainingSkillPoints > 0) {
      toast('Please allocate all available attribute and skill points.', 'warning');
      return;
    }
    if (hpRoll === null) {
      toast('Please roll for HP or take average before continuing.', 'warning');
      return;
    }
    if (sidePicksBlock) {
      toast('Please resolve your pending invocation or fighting-style picks first.', 'warning');
      return;
    }
    onConfirm(localSkills, hpDeviation);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title={`Level Up — ${character.name}`}
      subtitle={`${character.race} ${character.class} → Level ${character.level}${isAsi ? ' · Ability Score Improvement' : ''}`}
      icon={isAsi ? 'fa-star' : 'fa-crown'}
      size="lg"
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-parchment-mute font-mono bg-obsidian-850/70 p-2.5 rounded-lg border border-white/[0.06]">
            {footerSummary}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={onCancel}>
              Later
            </Button>
            <Button className="flex-1" onClick={handleConfirm} disabled={!canConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <Tabs small items={tabItems} active={activeTab} onChange={(k) => setActiveTab(k as Tab)} className="mb-4" />
      {error && (
        <div className="mb-4 p-2.5 bg-blood-950/25 border border-blood-500/40 rounded-lg text-blood-300 text-xs text-center">
          {error}
        </div>
      )}
      <div className="min-h-[250px]">
        {activeTab === 'hp' && renderHpTab()}
        {activeTab === 'stats' && (
          <div className="space-y-3 py-2 animate-fade-in">
            <RemainingBanner label="Available Attribute Points:" remaining={remainingPoints} />
            {renderStatRows(false)}
          </div>
        )}
        {activeTab === 'skills' && renderSkillsTab()}
        {(activeTab === 'choice' || activeTab === 'asi' || activeTab === 'feat') && renderChoiceOrAsOrFeat()}
        {activeTab === 'subclass' && renderSubclassTab()}
        {activeTab === 'resources' && renderResourcesTab()}
        {activeTab === 'invocations' && renderInvocationsTab()}
        {activeTab === 'fighting-style-two' && renderFightingStyleTwoTab()}
        {activeTab === 'spells' && renderSpellsTab()}
      </div>
      <FeatDetailModalV2 feat={viewingFeat} onClose={() => setViewingFeat(null)} />
    </Modal>
  );
};

export default LevelUpSheet;
