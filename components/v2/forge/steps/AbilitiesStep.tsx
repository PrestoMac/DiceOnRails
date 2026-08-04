import React from 'react';
import Button from '../../primitives/Button';
import Tooltip from '../../primitives/Tooltip';
import Card, { SectionHeader } from '../../primitives/Card';
import Tabs from '../../primitives/Tabs';
import { cx } from '../../primitives/cx';
import { CLASSES_CATALOG } from '../../../../utils/classes';
import { getMod } from '../../../../services/classEngine';
import { cryptoRoll } from '../../../../utils/random';
import { STAT_LABELS, POINT_BUY_COSTS, GEN_MODES } from '../../../creation/constants';
import { getEffectiveAsiMap } from '../../../creation/asiUtils';
import { ForgeAdjBtn, PointsBanner } from '../forgeWidgets';
import type { ForgeState } from '../forgeTypes';
import type { ForgeStepProps } from '../forgeTypes';

export type AbilitiesStepProps = ForgeStepProps;

const CLASS_RECOMMENDED_STATS: Record<string, Record<string, number>> =
  Object.fromEntries(CLASSES_CATALOG.map(c => [c.name, c.recommendedStats]));
const CLASS_STATS_PRIORITY: Record<string, string[]> =
  Object.fromEntries(CLASSES_CATALOG.map(c => [c.name, c.statPriority]));

type StatsMap = ForgeState['stats'];

/**
 * Forge step 4: ability scores — full port of the legacy StatsStep.
 * Point buy (27 pts), standard array (class presets), or 4d6-drop-lowest
 * rolling; plus the Half-Elf flexible +1 ASI picker and the high-level bonus
 * ability point allocator. All state lives in the shared wizard store
 * (statsGenMode/rolledStatValues/rollHistory/bonusStatAllocations/
 * halfElfChoice1/2) so navigating away and back preserves everything.
 */
const AbilitiesStep: React.FC<AbilitiesStepProps> = ({ wizard, updateWizard }) => {
  const { selectedClass, selectedRace, stats: localStats, level } = wizard;
  const genMode = wizard.statsGenMode || 'buy';
  const rolledValues = wizard.rolledStatValues || [];
  const rollHistory = wizard.rollHistory || [];
  const bonusStats = wizard.bonusStatAllocations || {};
  const halfElfChoice1 = wizard.halfElfChoice1;
  const halfElfChoice2 = wizard.halfElfChoice2;

  const hasRolled = rolledValues.length > 0;
  const totalSpent = Object.values(localStats).reduce((s, v) => s + (POINT_BUY_COSTS[v] || 0), 0);

  const buildStatMap = (values: number[]): StatsMap => {
    const sorted = [...values].sort((a, b) => b - a);
    return Object.fromEntries(CLASS_STATS_PRIORITY[selectedClass.name].map((s, i) => [s, sorted[i]])) as StatsMap;
  };

  /** Mode-tab switch reseeds stats (a real user action, never a mount effect). */
  const applyGenMode = (mode: 'buy' | 'array' | 'roll') => {
    const updates: Partial<ForgeState> = { statsGenMode: mode };
    if (mode === 'buy') updates.stats = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
    else if (mode === 'array') updates.stats = { ...CLASS_RECOMMENDED_STATS[selectedClass.name] } as StatsMap;
    else if (mode === 'roll' && rolledValues.length > 0) updates.stats = buildStatMap(rolledValues);
    updateWizard(updates);
  };

  const handlePointBuyUpdate = (stat: string, delta: number) => {
    const nv = (localStats as Record<string, number>)[stat] + delta;
    if (nv < 8 || nv > 15) return;
    if (Object.values({ ...localStats, [stat]: nv }).reduce((s, v) => s + (POINT_BUY_COSTS[v] || 0), 0) <= 27) {
      updateWizard({ stats: { ...localStats, [stat]: nv } });
    }
  };

  const swapStatValue = (stat: string, tv: number) => {
    const e = Object.entries(localStats);
    const tk = e.find(([, v]) => v === tv)?.[0];
    const swapped = Object.fromEntries(
      e.map(([k, v]) => [k, k === stat ? tv : k === tk ? (localStats as Record<string, number>)[stat] : v]),
    ) as StatsMap;
    updateWizard({ stats: swapped });
  };

  const roll4d6DropLowest = () => {
    const rolls = Array.from({ length: 6 }, () => {
      const d = Array.from({ length: 4 }, () => cryptoRoll(6));
      const s = [...d].sort((a, b) => a - b);
      return { dice: d, dropped: s[0], total: s[1] + s[2] + s[3] };
    });
    const totals = rolls.map(r => r.total);
    updateWizard({ rolledStatValues: totals, rollHistory: rolls, statsGenMode: 'roll', stats: buildStatMap(totals) });
  };

  const autoAssign = () => {
    if (genMode === 'roll' && !hasRolled) return;
    updateWizard({
      stats: genMode === 'roll' ? buildStatMap(rolledValues) : ({ ...CLASS_RECOMMENDED_STATS[selectedClass.name] } as StatsMap),
    });
  };

  const asiMap = getEffectiveAsiMap(selectedRace, wizard.selectedSubraceId, halfElfChoice1, halfElfChoice2);
  const racialConBonus = asiMap['con'] || 0;
  const totalCon = localStats.con + racialConBonus;
  const conMod = getMod(totalCon);
  const previewHp = selectedClass.hpBase + conMod + (selectedClass.hpPerLevel + conMod) * (level - 1);

  const bonusBudget = (level - 1) * 2;
  const bonusAllocated = Object.values(bonusStats).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  const bonusRemaining = bonusBudget - bonusAllocated;

  return (
    <div className="space-y-5">
      <SectionHeader icon="fa-dumbbell">Attributes</SectionHeader>

      <Tooltip
        content={`Formula: Hit Die (${selectedClass.hpBase} at L1) + CON mod (${conMod >= 0 ? '+' : ''}${conMod}) + (Hit Die Per Level + CON mod) × (level - 1). Each level adds the class hit die average rounded up, plus your CON modifier, to your max HP.`}
        side="bottom"
        className="block"
      >
        <div className="flex justify-between items-center bg-verdant-500/[0.07] border border-verdant-500/30 rounded-xl px-4 py-2.5">
          <span className="text-xs text-parchment-mute">
            <i className="fas fa-heart text-blood-400 mr-1.5" aria-hidden="true" />
            Estimated Max HP
          </span>
          <span className="font-bold font-mono text-verdant-400 text-base">{previewHp}</span>
        </div>
      </Tooltip>

      <Tabs
        items={GEN_MODES.map(m => ({ key: m.key, label: m.label, icon: m.key === 'buy' ? 'fa-coins' : m.key === 'array' ? 'fa-list-ol' : 'fa-dice' }))}
        active={genMode}
        onChange={key => applyGenMode(key as 'buy' | 'array' | 'roll')}
      />

      {genMode === 'buy' && (
        <div className="space-y-2">
          <PointsBanner label="Points Remaining" remaining={27 - totalSpent} total={27} />
          <div className="flex gap-1 flex-wrap">
            {Object.entries(POINT_BUY_COSTS).map(([score, cost]) => (
              <span key={score} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/[0.08] bg-obsidian-900/70 text-parchment-mute">
                {score}={cost}pt
              </span>
            ))}
          </div>
        </div>
      )}

      {genMode === 'array' && (
        <Card className="text-xs text-center text-parchment-mute">
          Standard Array values: <span className="font-mono text-ember-300 font-bold">15, 14, 13, 12, 10, 8</span>. Assign values to each stat below.
        </Card>
      )}

      {genMode === 'roll' && (
        <Card className="space-y-3">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-xs text-parchment-mute">Roll 4d6 and drop the lowest die 6 times:</span>
            <Button size="sm" variant="arcane" icon="fa-dice" onClick={roll4d6DropLowest}>
              {hasRolled ? 'Re-Roll' : 'Roll Stats'}
            </Button>
          </div>
          {hasRolled && (
            <div className="grid grid-cols-3 gap-2 bg-obsidian-850/60 p-2.5 rounded-lg border border-white/[0.06] text-[10px] font-mono text-center">
              {rollHistory.map((r, i) => (
                <div key={i} className="bg-obsidian-950/70 p-1.5 rounded border border-white/[0.05]">
                  <div className="text-[8px] text-parchment-faint uppercase tracking-tighter">Roll {i + 1}</div>
                  <div className="text-parchment-dim mt-0.5">
                    {r.dice.map((d, di) => (
                      <span key={di} className={cx('mr-0.5', d === r.dropped && 'text-blood-400/60 line-through')}>{d}</span>
                    ))}
                  </div>
                  <div className="text-verdant-400 font-bold mt-1 text-xs">Total: {r.total}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center gap-4 text-[10px] text-parchment-faint px-1">
        <span><i className="fas fa-star text-ember-400 text-[8px] mr-1" aria-hidden="true" />Primary Stat</span>
        <span><i className="fas fa-star text-parchment-faint text-[8px] mr-1" aria-hidden="true" />Secondary Stat</span>
      </div>

      <Button variant="ghost" icon="fa-wand-magic-sparkles" block onClick={autoAssign} disabled={genMode === 'roll' && !hasRolled}>
        Auto-Assign Stats for {selectedClass.name}
      </Button>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        {(Object.entries(localStats) as [string, number][]).map(([stat, val]) => {
          const priorities = CLASS_STATS_PRIORITY[selectedClass.name];
          const racialBonus = asiMap[stat] || 0;
          const totalScore = val + racialBonus;
          const totalMod = getMod(totalScore);
          return (
            <div key={stat} role="group" aria-label={STAT_LABELS[stat]} className="space-y-1.5 bg-obsidian-900/70 p-3 rounded-xl border border-white/[0.06]">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-parchment-mute">
                <div className="flex items-center gap-1.5">
                  <span>{STAT_LABELS[stat]}</span>
                  {(priorities[0] === stat || (selectedClass.name === 'Paladin' && priorities[1] === stat)) && (
                    <i className="fas fa-star text-ember-400 text-[8px]" aria-hidden="true" />
                  )}
                  {priorities[1] === stat && selectedClass.name !== 'Paladin' && (
                    <i className="fas fa-star text-parchment-faint text-[8px]" aria-hidden="true" />
                  )}
                </div>
                <Tooltip content="Modifier is derived from (score − 10) / 2, rounded down. Applied to d20 rolls tied to this stat." side="top">
                  <span className={cx('font-mono text-xs font-bold', totalMod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                    {totalMod >= 0 ? '+' : ''}{totalMod} MOD
                  </span>
                </Tooltip>
              </div>
              <div className="flex items-center justify-between gap-2 bg-obsidian-950/80 p-1.5 rounded-lg border border-white/[0.08]">
                {genMode === 'buy' ? (
                  <>
                    <ForgeAdjBtn onClick={() => handlePointBuyUpdate(stat, -1)} disabled={val <= 8} icon="minus" />
                    <div className="text-center flex-1"><span className="text-lg font-bold font-mono text-parchment">{val}</span></div>
                    <ForgeAdjBtn onClick={() => handlePointBuyUpdate(stat, 1)} disabled={val >= 15 || 27 - totalSpent <= 0} icon="plus" />
                  </>
                ) : (
                  <select
                    value={val}
                    onChange={e => swapStatValue(stat, parseInt(e.target.value, 10))}
                    disabled={genMode === 'roll' && !hasRolled}
                    className="w-full bg-obsidian-950 text-parchment outline-none text-center font-bold font-mono text-sm py-0.5 border-none cursor-pointer"
                  >
                    {genMode === 'roll' && !hasRolled
                      ? <option value="10">Roll first...</option>
                      : (genMode === 'array' ? [15, 14, 13, 12, 10, 8] : [...rolledValues].sort((a, b) => b - a)).map((v, vi) => (
                          <option key={vi} value={v}>{v}</option>
                        ))
                    }
                  </select>
                )}
              </div>
              <div className="flex justify-between items-center text-[9px] text-parchment-faint">
                <span>Base: {val}</span>
                {racialBonus > 0 && <span className="text-ember-500 font-bold">+{racialBonus} {selectedRace.name}</span>}
                <span>Total: {totalScore}</span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedRace.asi === 'flexible-2' && (
        <Card accent="ember" className="space-y-3">
          <p className="text-xs text-ember-300 font-bold text-center">Half-Elf: Choose two stats to receive +1</p>
          <div role="group" aria-label="Half-Elf ability score improvement" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(stat => {
              const selected = halfElfChoice1 === stat || halfElfChoice2 === stat;
              return (
                <button
                  key={stat}
                  type="button"
                  onClick={() => {
                    const updates: Partial<ForgeState> = {};
                    if (halfElfChoice1 === stat) updates.halfElfChoice1 = null;
                    else if (halfElfChoice2 === stat) updates.halfElfChoice2 = null;
                    else if (!halfElfChoice1) updates.halfElfChoice1 = stat;
                    else if (!halfElfChoice2 && halfElfChoice1 !== stat) updates.halfElfChoice2 = stat;
                    updateWizard(updates);
                  }}
                  className={cx(
                    'p-2 rounded-lg border text-center text-xs transition-all cursor-pointer',
                    selected
                      ? 'border-ember-500/60 bg-ember-500/10 text-ember-300'
                      : 'border-white/[0.08] bg-obsidian-900/60 text-parchment-dim hover:border-white/20',
                  )}
                >
                  <div className="font-bold uppercase">{stat}</div>
                  <div className="text-[9px]">{selected ? '+1' : '—'}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {level > 1 && (
        <Card accent="arcane" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-arcane-300">Bonus Ability Points</p>
            <span className={cx('text-xs font-mono font-bold', bonusRemaining > 0 ? 'text-arcane-300' : 'text-verdant-400')}>
              {bonusRemaining} / {bonusBudget}
            </span>
          </div>
          <p className="text-[9px] text-parchment-faint -mt-1">
            Bonus progression points from your higher starting level. Unspent points carry over for later allocation.
          </p>
          <div role="group" aria-label="Bonus ability points" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(stat => {
              const base = (localStats as Record<string, number>)[stat];
              const racial = asiMap[stat] || 0;
              const al = bonusStats[stat] || 0;
              const projected = base + racial + al;
              const disableAdd = al >= 2 || bonusRemaining <= 0 || projected >= 20;
              const disableRem = al <= 0;
              return (
                <div key={stat} className="bg-obsidian-900/70 border border-white/[0.06] rounded-lg p-2 text-center">
                  <div className="text-[9px] uppercase text-parchment-faint font-bold">{STAT_LABELS[stat]}</div>
                  <div className="flex items-center justify-center gap-1 my-1.5">
                    <ForgeAdjBtn
                      onClick={() => updateWizard({ bonusStatAllocations: { ...bonusStats, [stat]: Math.max(0, (bonusStats[stat] || 0) - 1) } })}
                      disabled={disableRem}
                      icon="minus"
                    />
                    <span className={cx('text-xs font-mono font-bold w-7', al > 0 ? 'text-arcane-300' : 'text-parchment-dim')}>{projected}</span>
                    <ForgeAdjBtn
                      onClick={() => updateWizard({ bonusStatAllocations: { ...bonusStats, [stat]: (bonusStats[stat] || 0) + 1 } })}
                      disabled={disableAdd}
                      icon="plus"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default AbilitiesStep;
