import React from 'react';
import type { SpellDefinition } from '../../../../types';
import { CONDITION_INFO, EXHAUSTION_LEVELS } from '../../../../data/conditionInfo';
import type { FeatDefinition } from '../../../../utils/feats';
import Modal from '../../primitives/Modal';
import Chip from '../../primitives/Chip';
import { cx } from '../../primitives/cx';

/** Font Awesome icon per spell school (ported from the legacy SpellbookModal). */
export const SCHOOL_ICONS: Record<string, string> = {
  evocation: 'fa-fire', abjuration: 'fa-shield', conjuration: 'fa-wand-sparkles',
  divination: 'fa-eye', enchantment: 'fa-heart', illusion: 'fa-cloud',
  necromancy: 'fa-skull', transmutation: 'fa-flask',
};

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ------------------------------------------------------------------ */
/* Item detail                                                         */
/* ------------------------------------------------------------------ */

export interface V2ItemDetail {
  name: string;
  quantity?: number;
  type?: string;
  rarity?: string;
  description?: string;
  weight?: string | number;
  cost?: number | string;
  stats?: {
    damage?: string;
    damageType?: string;
    healing?: string;
    acBonus?: number;
    acFormula?: string;
    properties?: string[];
    strengthReq?: number;
    stealthDisadv?: boolean;
  };
}

type ChipColor = 'ember' | 'arcane' | 'verdant' | 'blood' | 'frost' | 'neutral';

interface RarityStyle {
  chip: ChipColor;
  /** Left accent border classes applied to the Modal panel. */
  border: string;
  text: string;
}

const RARITY_STYLES: Record<string, RarityStyle> = {
  common: { chip: 'neutral', border: 'border-l-obsidian-500', text: 'text-parchment-mute' },
  uncommon: { chip: 'frost', border: 'border-l-frost-500', text: 'text-frost-400' },
  rare: { chip: 'arcane', border: 'border-l-arcane-500', text: 'text-arcane-300' },
  'very rare': { chip: 'blood', border: 'border-l-blood-500', text: 'text-blood-300' },
  legendary: { chip: 'ember', border: 'border-l-ember-500', text: 'text-ember-400' },
};

const rarityOf = (rarity?: string): RarityStyle => RARITY_STYLES[(rarity ?? 'common').toLowerCase()] ?? RARITY_STYLES.common;

/** Stat grid row: label left, value right (mono), mirroring the legacy item modal. */
const StatRow: React.FC<{ label: string; value: React.ReactNode; valueClass?: string }> = ({ label, value, valueClass }) => (
  <>
    <div className="text-parchment-faint">{label}:</div>
    <div className={cx('text-right text-parchment-dim', valueClass)}>{value}</div>
  </>
);

export function ItemDetailModalV2({ item, onClose }: { item: V2ItemDetail | null; onClose: () => void }): React.ReactElement | null {
  if (!item) return null;
  const rarity = rarityOf(item.rarity);
  const stats = item.stats;

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      icon="fa-box-open"
      size="md"
      className={cx('border-l-4', rarity.border)}
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <Chip color={rarity.chip} className="uppercase">{item.rarity || 'common'}</Chip>
        <Chip color="neutral" className="uppercase">{item.type || 'item'}</Chip>
        {(item.quantity ?? 0) > 1 && <Chip color="neutral">×{item.quantity}</Chip>}
      </div>

      <p className="text-xs text-parchment-mute italic font-medium leading-relaxed mb-3">
        &ldquo;{item.description || 'No description available.'}&rdquo;
      </p>

      <div className="border-t border-white/[0.06] my-2" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono">
        {item.type === 'weapon' && stats && (
          <>
            <StatRow label="Damage" value={<span>{stats.damage} {stats.damageType}</span>} />
            {stats.properties?.length ? (
              <StatRow label="Properties" value={stats.properties.join(', ')} />
            ) : null}
          </>
        )}
        {item.type === 'armor' && stats && (
          <>
            <StatRow label="Armor Class" value={stats.acFormula} />
            {stats.strengthReq ? <StatRow label="Strength Req" value={stats.strengthReq} /> : null}
            {stats.stealthDisadv ? <StatRow label="Stealth" value="Disadvantage" valueClass="text-blood-400" /> : null}
          </>
        )}
        {item.type === 'shield' && stats && (
          <StatRow label="Armor Class" value={`+${stats.acBonus}`} />
        )}
        {item.type === 'potion' && stats && (
          <StatRow label="Healing" value={stats.healing} valueClass="text-verdant-400" />
        )}
        <StatRow label="Weight" value={`${item.weight || 0} lbs`} />
        <StatRow label="Cost" value={item.cost || '0 gp'} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Spell detail                                                        */
/* ------------------------------------------------------------------ */

const SpellStatBox: React.FC<{ label: string; value: React.ReactNode; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg px-3 py-2">
    <p className="text-[9px] uppercase font-bold text-parchment-faint tracking-wider">{label}</p>
    <p className={cx('mt-0.5', highlight ? 'font-bold text-arcane-300' : 'text-parchment-dim')}>{value}</p>
  </div>
);

export function SpellDetailModalV2({ spell, onClose }: { spell: SpellDefinition | null; onClose: () => void }): React.ReactElement | null {
  if (!spell) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={spell.name}
      subtitle={`${spell.level === 0 ? 'Cantrip' : `Level ${spell.level} Spell`} · ${capitalize(spell.school)}`}
      icon={SCHOOL_ICONS[spell.school] || 'fa-star'}
      size="md"
    >
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <SpellStatBox label="Casting Time" value={<span className="capitalize">{spell.castingTime}</span>} />
          <SpellStatBox label="Range" value={spell.range} />
          <SpellStatBox label="Duration" value={spell.duration} />
          <SpellStatBox label="Concentration" value={spell.requiresConcentration ? 'Yes' : 'No'} highlight={spell.requiresConcentration} />
        </div>
        {spell.damage && (
          <div className="bg-blood-950/20 border border-blood-900/40 rounded-lg p-2">
            <span className="text-[9px] uppercase font-bold text-blood-400">Damage</span>
            <p className="font-mono font-bold text-blood-300">
              {spell.damage.dice} {spell.damage.type}
            </p>
          </div>
        )}
        {spell.healing && (
          <div className="bg-verdant-950/20 border border-verdant-900/40 rounded-lg p-2">
            <span className="text-[9px] uppercase font-bold text-verdant-400">Healing</span>
            <p className="font-mono font-bold text-verdant-300">{spell.healing}</p>
          </div>
        )}
        <p className="text-parchment-mute leading-relaxed">{spell.description}</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Condition detail                                                    */
/* ------------------------------------------------------------------ */

/** Humanizes a condition id ('turned-undead' / 'dodging' → 'Turned Undead' / 'Dodging'). */
const formatConditionName = (id: string): string =>
  id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function ConditionDetailModalV2({ conditionId, onClose }: { conditionId: string | null; onClose: () => void }): React.ReactElement | null {
  if (!conditionId) return null;
  const info = CONDITION_INFO[conditionId];
  const name = formatConditionName(conditionId);
  const toneColor = info?.tone === 'buff' ? 'text-verdant-400' : info?.tone === 'debuff' ? 'text-blood-400' : 'text-ember-400';

  return (
    <Modal
      open
      onClose={onClose}
      title={name}
      subtitle="Condition"
      icon={info?.icon ?? 'fa-circle'}
      size="md"
    >
      {info ? (
        <div className="space-y-3 text-xs">
          <div className="bg-obsidian-850/80 rounded-lg p-3 border border-white/[0.06]">
            <span className="text-parchment-faint uppercase text-[9px] font-bold tracking-wider">Summary</span>
            <p className="text-parchment mt-0.5 flex items-start gap-2">
              <i className={cx('fas mt-0.5', info.icon, toneColor)} aria-hidden="true" />
              <span>{info.summary}</span>
            </p>
          </div>
          {info.effects && info.effects.length > 0 && (
            <div className="bg-obsidian-850/80 rounded-lg p-3 border border-white/[0.06]">
              <span className="text-parchment-faint uppercase text-[9px] font-bold tracking-wider">Mechanical Effects</span>
              <ul className="list-disc list-inside mt-1 space-y-1">
                {info.effects.map((eff, i) => <li key={i} className="text-parchment-dim">{eff}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-parchment-mute italic">No detailed reference for &ldquo;{name}&rdquo;.</p>
      )}

      <details className="mt-4 border-t border-white/[0.06] pt-3">
        <summary className="text-[10px] uppercase text-ember-400/90 cursor-pointer font-bold tracking-wider">Exhaustion reference</summary>
        <ul className="mt-2 space-y-0.5">
          {EXHAUSTION_LEVELS.map(l => (
            <li key={l.level} className="text-[10px] text-parchment-mute">
              <strong className="text-ember-300">L{l.level} {l.label}:</strong> {l.description}
            </li>
          ))}
        </ul>
      </details>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Feat detail                                                         */
/* ------------------------------------------------------------------ */

interface CategoryStyle {
  chip: ChipColor;
  label: string;
  /** Left accent border classes applied to the Modal panel. */
  border: string;
  /** Icon-well classes. */
  well: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  combat: { chip: 'blood', label: 'Combat', border: 'border-l-blood-500', well: 'bg-blood-500/10 border-blood-500/30 text-blood-400' },
  magic: { chip: 'arcane', label: 'Magic', border: 'border-l-arcane-500', well: 'bg-arcane-500/10 border-arcane-500/30 text-arcane-300' },
  general: { chip: 'ember', label: 'General', border: 'border-l-ember-500', well: 'bg-ember-500/10 border-ember-500/30 text-ember-400' },
  armor: { chip: 'neutral', label: 'Armor', border: 'border-l-parchment-mute', well: 'bg-white/[0.04] border-white/10 text-parchment-dim' },
  'saving-throw': { chip: 'frost', label: 'Saves & Defense', border: 'border-l-frost-500', well: 'bg-frost-500/10 border-frost-500/30 text-frost-400' },
  flavor: { chip: 'verdant', label: 'Roleplay', border: 'border-l-verdant-500', well: 'bg-verdant-500/10 border-verdant-500/30 text-verdant-400' },
};

export function FeatDetailModalV2({ feat, onClose }: { feat: FeatDefinition | null; onClose: () => void }): React.ReactElement | null {
  if (!feat) return null;
  const cat = CATEGORY_STYLES[feat.category] || CATEGORY_STYLES.general;

  return (
    <Modal
      open
      onClose={onClose}
      title={feat.name}
      icon="fa-scroll"
      size="md"
      className={cx('border-l-4', cat.border)}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cx('w-12 h-12 rounded-xl border flex items-center justify-center shrink-0', cat.well)}>
          <i className={cx('fas text-xl', feat.icon)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Chip color={cat.chip} className="uppercase">{cat.label}</Chip>
            {feat.shortName && feat.shortName !== feat.name && (
              <span className="text-[10px] uppercase font-mono text-parchment-faint tracking-widest">{feat.shortName}</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 my-2">
        <div>
          <h3 className="text-[10px] uppercase font-bold text-parchment-mute tracking-widest mb-1">Description</h3>
          <p className="text-sm text-parchment-dim leading-relaxed">{feat.description}</p>
        </div>
        <div className="bg-ember-500/[0.06] border border-ember-500/20 rounded-lg p-3">
          <h3 className="text-[10px] uppercase font-bold text-ember-400 tracking-widest mb-1 flex items-center gap-1">
            <i className="fas fa-cog text-[9px]" aria-hidden="true" /> Mechanical Effect
          </h3>
          <p className="text-sm text-ember-100 leading-relaxed">{feat.mechanicalEffect}</p>
        </div>

        {feat.prerequisites && (
          <div className="bg-blood-950/20 border border-blood-900/40 rounded-lg p-3">
            <h3 className="text-[10px] uppercase font-bold text-blood-400 tracking-widest mb-1 flex items-center gap-1">
              <i className="fas fa-lock text-[9px]" aria-hidden="true" /> Prerequisites
            </h3>
            <ul className="text-xs text-parchment-dim space-y-1">
              {feat.prerequisites.level !== undefined && (
                <li>• Character level {feat.prerequisites.level} or higher</li>
              )}
              {feat.prerequisites.stat && Object.entries(feat.prerequisites.stat).map(([stat, min]) => (
                <li key={stat}>• {stat.toUpperCase()} {min} or higher</li>
              ))}
              {feat.prerequisites.armorProf?.map(p => (
                <li key={p}>• {p.charAt(0).toUpperCase() + p.slice(1)} Armor proficiency</li>
              ))}
              {feat.prerequisites.otherFeats?.map(f => (
                <li key={f}>• {f.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
