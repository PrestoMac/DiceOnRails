import React from 'react';
import Chip from '../../primitives/Chip';
import Tooltip from '../../primitives/Tooltip';
import Card, { SectionHeader } from '../../primitives/Card';
import { cx } from '../../primitives/cx';
import { calculateMaxHp, getMod } from '../../../../services/classEngine';
import { SKILLS_LIST, ASI_LEVELS } from '../../../../constants';
import { FEATS_CATALOG } from '../../../../utils/feats';
import { FIGHTING_STYLE_OPTIONS } from '../../../../utils/classes';
import { INVOCATIONS_BY_ID } from '../../../../data/invocations';
import { SPELLS_BY_ID } from '../../../../utils/spells';
import { STAT_LABELS, DRAGON_ANCESTRIES } from '../../../creation/constants';
import { getEffectiveAsiMap } from '../../../creation/asiUtils';
import { getAlignmentName, getBackgroundName } from '../../../../utils/backgrounds';
import { buildForgeTempCharacter, getSubraceName, kebabToTitle } from '../forgeUtils';
import { ForgeErrorBanner } from '../forgeWidgets';
import type { ForgeIssue, ForgeState, StartingLocation } from '../forgeTypes';

/** Props for the forge's final review step. */
export interface ReviewStepV2Props {
  wizardState: ForgeState;
  finalizeError: string | null;
  /** Failing steps, rendered as a clickable checklist (jump-to-step). */
  issues: ForgeIssue[];
  onGoToStep: (key: string) => void;
  /** Join-mode: the campaign's starting location is displayed read-only. */
  isNewCampaign?: boolean;
  campaignStartingLocation?: StartingLocation;
  needsSpellsStep?: boolean;
}

/**
 * Forge step 10: final summary — port of the legacy ReviewStep with the fixes
 * applied: the stat grid includes racial + subrace + bonus + ASI-slot
 * allocations, and all raw kebab ids are resolved to display names.
 */
const ReviewStepV2: React.FC<ReviewStepV2Props> = ({
  wizardState, finalizeError, issues, onGoToStep, isNewCampaign = false, campaignStartingLocation, needsSpellsStep = false,
}) => {
  const {
    name, selectedRace, selectedClass, stats, level, allocatedSkills, goldPool, inventory, asiFeatSlots,
    selectedSubclassId, selectedCantrips, selectedSpells, alignment, background, personalityTraits, ideals,
    bonds, flaws, backstory, fightingStyleChoice, invocationChoices, selectedSubraceId, draconicAncestry,
  } = wizardState;
  const asiMap = getEffectiveAsiMap(selectedRace, selectedSubraceId, wizardState.halfElfChoice1, wizardState.halfElfChoice2);
  const tempChar = buildForgeTempCharacter(wizardState);
  const maxHp = calculateMaxHp(tempChar);
  const profBonus = Math.ceil(level / 4) + 1;
  const subraceName = getSubraceName(wizardState);
  const subclassName = selectedClass.subclasses?.find(sc => sc.id === selectedSubclassId)?.name;
  const fightingStyleName = FIGHTING_STYLE_OPTIONS.find(o => o.id === fightingStyleChoice)?.label
    || (fightingStyleChoice ? kebabToTitle(fightingStyleChoice) : null);
  const dragon = draconicAncestry ? DRAGON_ANCESTRIES.find(d => d.id === draconicAncestry) : undefined;

  /** Final displayed stats: base + racial + subrace + bonus + ASI-slot allocations. */
  const finalStat = (stat: keyof typeof stats): number => {
    let total = stats[stat] + (asiMap[stat] || 0) + (wizardState.bonusStatAllocations[stat] || 0);
    for (const slot of asiFeatSlots) {
      if (slot.type === 'asi' && slot.statAllocations) {
        total += slot.statAllocations[stat] || 0;
      }
    }
    return total;
  };

  const hasPersona = alignment || background || personalityTraits.length || ideals.length || bonds.length || flaws.length || backstory.trim();

  return (
    <div className="space-y-5">
      <SectionHeader icon="fa-flag-checkered">Final Summary</SectionHeader>

      <Card className="space-y-6 max-h-[52dvh] overflow-y-auto v2-scrollbar">
        {/* Hero header */}
        <div className="flex justify-between items-start gap-4 border-b border-white/[0.06] pb-4">
          <div className="min-w-0">
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest">The Legend</p>
            <p className="font-display text-3xl text-parchment leading-tight truncate">{name || 'Unnamed Hero'}</p>
            <p className="text-ember-400 italic text-sm">
              Level {level} {selectedRace.name}{subraceName ? ` (${subraceName})` : ''} {selectedClass.name}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest">Vitality</p>
            <p className="text-2xl font-bold text-verdant-400">{maxHp} HP</p>
          </div>
        </div>

        {/* Stats (all bonuses included — legacy bug fixed) */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(Object.keys(stats) as (keyof typeof stats)[]).map(stat => {
            const total = finalStat(stat);
            const mod = getMod(total);
            return (
              <div key={stat} className="bg-obsidian-850/80 p-2 rounded-lg border border-white/[0.06] text-center">
                <div className="text-[8px] uppercase text-parchment-faint font-bold">{stat}</div>
                <div className="font-bold font-mono text-parchment">{total}</div>
                <div className={cx('text-[9px] font-mono', mod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                  {mod >= 0 ? `+${mod}` : mod}
                </div>
              </div>
            );
          })}
        </div>

        {/* Saving throws */}
        <div>
          <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Saving Throws</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(stats) as (keyof typeof stats)[]).map(stat => {
              const total = stats[stat] + (asiMap[stat] || 0);
              const mod = getMod(total);
              const isProficient = selectedClass.savingThrowProfs?.includes(stat);
              const saveVal = mod + (isProficient ? profBonus : 0);
              return (
                <span
                  key={stat}
                  className={cx(
                    'text-[10px] font-mono px-2 py-1 rounded border',
                    isProficient
                      ? 'border-ember-500/40 bg-ember-500/10 text-ember-300'
                      : 'border-white/[0.08] bg-obsidian-850/60 text-parchment-mute',
                  )}
                >
                  {stat.toUpperCase()}: {saveVal >= 0 ? '+' : ''}{saveVal}
                  {isProficient && <i className="fas fa-star text-[7px] ml-1 text-ember-500" aria-hidden="true" />}
                </span>
              );
            })}
          </div>
          <p className="text-[9px] text-parchment-faint mt-1.5">
            <Tooltip
              content="Proficient saves add your Proficiency Bonus (scales with level) on top of the stat modifier. Each class is proficient in two specific saving throws."
              side="top"
            >
              <span><i className="fas fa-star text-ember-500 text-[7px] mr-1" aria-hidden="true" />= Proficient</span>
            </Tooltip>
          </p>
        </div>

        {/* Trained skills */}
        <div>
          <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Trained Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(allocatedSkills).filter(([, v]) => v > 0).map(([sN, r]) => {
              const sk = SKILLS_LIST.find(s => s.name === sN);
              return <Chip key={sN} color="neutral">{sk?.label || sN} (Rank {r})</Chip>;
            })}
            {Object.entries(allocatedSkills).filter(([, v]) => v > 0).length === 0 && (
              <span className="text-xs text-parchment-faint italic">No skills trained yet.</span>
            )}
          </div>
        </div>

        {/* Specials — display names resolved from catalogs */}
        {(subclassName || fightingStyleName || invocationChoices.length > 0 || subraceName || dragon) && (
          <div className="space-y-2">
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest">Path & Specials</p>
            <div className="flex flex-wrap gap-1.5">
              {subclassName && <Chip color="arcane" icon="fa-code-branch">{subclassName}</Chip>}
              {subraceName && <Chip color="arcane" icon="fa-users-viewfinder">{subraceName}</Chip>}
              {fightingStyleName && <Chip color="ember" icon="fa-sword">{fightingStyleName}</Chip>}
              {dragon && <Chip color="ember" icon="fa-dragon">{dragon.label} Ancestry ({dragon.damageType})</Chip>}
              {invocationChoices.map(id => (
                <Chip key={id} color="arcane" icon="fa-hand-sparkles">
                  {INVOCATIONS_BY_ID[id]?.name || kebabToTitle(id)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Feats & ASIs */}
        {asiFeatSlots.length > 0 && (
          <div>
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Feats and Ability Improvements</p>
            <div className="space-y-1">
              {asiFeatSlots.map((slot, idx) => {
                const slotLevel = ASI_LEVELS[idx];
                if (slot.type === 'feat' && slot.featId) {
                  const feat = FEATS_CATALOG.find(f => f.id === slot.featId);
                  return (
                    <div key={idx} className="text-[11px] text-parchment-dim flex items-center gap-2">
                      <span className="text-ember-400 font-bold shrink-0">Lv{slotLevel}:</span>
                      <i className={cx('fas', feat?.icon || 'fa-star', 'text-ember-400')} aria-hidden="true" />
                      <span>{feat?.name || kebabToTitle(slot.featId)}</span>
                      {slot.featId === 'resilient' && slot.saveStatChoice && (
                        <span className="text-[10px] text-frost-300">({slot.saveStatChoice.toUpperCase()})</span>
                      )}
                      {slot.featId === 'skilled' && (slot.skillChoices || []).length > 0 && (
                        <span className="text-[10px] text-parchment-faint">
                          ({(slot.skillChoices || []).map(s => SKILLS_LIST.find(sk => sk.name === s)?.label || s).join(', ')})
                        </span>
                      )}
                    </div>
                  );
                }
                if (slot.type === 'asi' && slot.statAllocations) {
                  const allocs = Object.entries(slot.statAllocations)
                    .filter(([, v]) => (v ?? 0) > 0)
                    .map(([k, v]) => `+${v} ${STAT_LABELS[k] || k.toUpperCase()}`)
                    .join(', ');
                  return (
                    <div key={idx} className="text-[11px] text-parchment-dim flex items-center gap-2">
                      <span className="text-ember-400 font-bold shrink-0">Lv{slotLevel}:</span>
                      <span className="text-verdant-400">{allocs}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}

        {/* Spells — display names via SPELLS_BY_ID */}
        {needsSpellsStep && (selectedCantrips.length > 0 || selectedSpells.length > 0) && (
          <div>
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Spells</p>
            {selectedCantrips.length > 0 && (
              <div className="mb-1">
                <span className="text-[9px] text-arcane-300 uppercase font-bold">Cantrips: </span>
                <span className="text-[11px] text-parchment-dim">
                  {selectedCantrips.map(id => SPELLS_BY_ID[id]?.name || kebabToTitle(id)).join(', ')}
                </span>
              </div>
            )}
            {selectedSpells.length > 0 && (
              <div>
                <span className="text-[9px] text-arcane-300 uppercase font-bold">Spells: </span>
                <span className="text-[11px] text-parchment-dim">
                  {selectedSpells.map(id => SPELLS_BY_ID[id]?.name || kebabToTitle(id)).join(', ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Wealth + pack */}
        <div>
          <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Starting Wealth</p>
          <div className="flex items-center gap-1.5 text-ember-300 font-bold text-sm">
            <i className="fas fa-coins" aria-hidden="true" />
            <span>{Math.floor(goldPool)} GP, {Math.round((goldPool % 1) * 10)} SP</span>
          </div>
        </div>
        <div>
          <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Starting Pack</p>
          <p className="text-[11px] text-parchment-mute italic">{inventory.map(i => `${i.name} x${i.quantity}`).join(', ') || 'Empty.'}</p>
        </div>
        <div>
          <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-1">Proficiency Bonus</p>
          <span className="text-ember-300 font-mono font-bold text-lg">+{profBonus}</span>
          <span className="text-parchment-faint text-[10px] ml-2">scales with level</span>
        </div>

        {/* Starting location (join mode) */}
        {!isNewCampaign && campaignStartingLocation && (
          <div>
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-1">Starting Location</p>
            <p className="text-ember-300 font-display text-lg">{campaignStartingLocation.name}</p>
          </div>
        )}

        {/* Persona */}
        {hasPersona && (
          <div className="border-t border-white/[0.06] pt-4">
            <p className="text-parchment-faint uppercase text-[10px] font-bold tracking-widest mb-2">Persona &amp; Background</p>
            <div className="space-y-1.5">
              {(alignment || background) && (
                <div className="flex flex-wrap gap-1.5">
                  {alignment && <Chip color="ember">{getAlignmentName(alignment)}</Chip>}
                  {background && <Chip color="neutral">{getBackgroundName(background)}</Chip>}
                </div>
              )}
              {personalityTraits.filter(t => t.trim()).map((t, i) => (
                <p key={`p${i}`} className="text-[11px] text-parchment-dim"><span className="text-ember-400 font-bold">Trait:</span> {t}</p>
              ))}
              {ideals.filter(t => t.trim()).map((t, i) => (
                <p key={`i${i}`} className="text-[11px] text-parchment-dim"><span className="text-ember-400 font-bold">Ideal:</span> {t}</p>
              ))}
              {bonds.filter(t => t.trim()).map((t, i) => (
                <p key={`b${i}`} className="text-[11px] text-parchment-dim"><span className="text-ember-400 font-bold">Bond:</span> {t}</p>
              ))}
              {flaws.filter(t => t.trim()).map((t, i) => (
                <p key={`f${i}`} className="text-[11px] text-parchment-dim"><span className="text-blood-400 font-bold">Flaw:</span> {t}</p>
              ))}
              {backstory.trim() && (
                <blockquote className="border-l-2 border-ember-500/50 pl-3 italic text-[11px] text-parchment-mute leading-relaxed mt-2">
                  &ldquo;{backstory.trim()}&rdquo;
                </blockquote>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Validation checklist */}
      {issues.length > 0 ? (
        <Card accent="blood" className="space-y-1.5">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-blood-400 mb-1">
            <i className="fas fa-list-check mr-2" aria-hidden="true" />Before You Begin
          </p>
          {issues.map(issue => (
            <button
              key={issue.stepKey}
              type="button"
              onClick={() => onGoToStep(issue.stepKey)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-blood-500/[0.07] border border-blood-500/25 hover:border-blood-400/50 text-left transition-colors cursor-pointer"
            >
              <i className="fas fa-circle-exclamation text-blood-400 text-xs shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0 text-[11px] text-blood-300 truncate">
                <strong className="font-bold">{issue.label}:</strong> {issue.message}
              </span>
              <i className="fas fa-arrow-right text-blood-400/70 text-[10px] shrink-0" aria-hidden="true" />
            </button>
          ))}
        </Card>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-verdant-500/[0.08] border border-verdant-500/30">
          <i className="fas fa-circle-check text-verdant-400" aria-hidden="true" />
          <span className="text-xs text-verdant-300 font-bold">Ready to adventure.</span>
        </div>
      )}

      {finalizeError && <ForgeErrorBanner message={finalizeError} />}
    </div>
  );
};

export default ReviewStepV2;
