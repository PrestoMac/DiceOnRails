import React from 'react';
import { TextField } from '../../primitives/Field';
import IconButton from '../../primitives/IconButton';
import Tooltip from '../../primitives/Tooltip';
import Card, { SectionHeader } from '../../primitives/Card';
import { ASI_LEVELS } from '../../../../constants';
import type { ForgeStepProps } from '../forgeTypes';

export type IdentityStepProps = ForgeStepProps;

/** Forge step 1: character name + starting level (ported from the legacy NameStep). */
const IdentityStep: React.FC<IdentityStepProps> = ({ wizard, updateWizard }) => {
  const { name, level } = wizard;
  const asiSlotCount = ASI_LEVELS.filter(l => l <= level).length;

  return (
    <div className="space-y-6">
      <Card accent="ember">
        <SectionHeader icon="fa-feather-pointed">Identify Yourself</SectionHeader>
        <TextField
          label="Name"
          value={name}
          onChange={v => updateWizard({ name: v })}
          placeholder="Character Name..."
          autoFocus
          inputClassName="text-center font-display text-xl py-3.5"
        />
      </Card>

      <Card>
        <SectionHeader icon="fa-arrow-trend-up">Starting Level</SectionHeader>
        <div className="flex items-center gap-4 bg-obsidian-950/80 border border-white/[0.08] rounded-lg p-2">
          <IconButton
            icon="fa-minus"
            variant="subtle"
            size="lg"
            tip="Decrease level"
            disabled={level <= 1}
            onClick={() => updateWizard({ level: Math.max(1, level - 1) })}
          />
          <div className="flex-1 text-center text-3xl font-bold font-display text-parchment">{level}</div>
          <IconButton
            icon="fa-plus"
            variant="subtle"
            size="lg"
            tip="Increase level"
            disabled={level >= 20}
            onClick={() => updateWizard({ level: Math.min(20, level + 1) })}
          />
        </div>
        {level >= 11 && (
          <div className="flex items-start gap-2 mt-3 bg-ember-500/[0.07] border border-ember-500/30 rounded-lg p-3 text-[11px] text-ember-300">
            <i className="fas fa-exclamation-triangle text-ember-400 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>High-Level Character:</strong> Level {level} grants {asiSlotCount} ASI/Feat slots and unlocks
              advanced class features. Recommended for experienced players.
            </span>
          </div>
        )}
        <div className="flex gap-4 text-[11px] text-parchment-mute justify-center flex-wrap mt-4">
          <Tooltip
            content="Proficiency Bonus is added to attack rolls, saving throws, and skill checks you are trained in. Scales with level: +2 at L1, +3 at L5, +4 at L9, +5 at L13, +6 at L17."
            side="top"
          >
            <span className="inline-flex items-center gap-1.5 bg-obsidian-850/80 border border-white/[0.06] rounded-full px-3 py-1.5">
              <i className="fas fa-shield-halved text-ember-500" aria-hidden="true" />
              Proficiency Bonus:
              <strong className="text-ember-300 font-mono">+{Math.ceil(level / 4) + 1}</strong>
            </span>
          </Tooltip>
          <Tooltip
            content="ASI/Feat slots are milestones (levels 4, 8, 12, 16, 19) where you can either increase ability scores (+1 to two stats, or +2 to one) OR take a feat instead. Level 1 grants one starting slot under the variant rule."
            side="top"
          >
            <span className="inline-flex items-center gap-1.5 bg-obsidian-850/80 border border-white/[0.06] rounded-full px-3 py-1.5">
              <i className="fas fa-star text-ember-500" aria-hidden="true" />
              ASI Slots at Level {level}:
              <strong className="text-ember-300 font-mono">{asiSlotCount}</strong>
            </span>
          </Tooltip>
        </div>
      </Card>
    </div>
  );
};

export default IdentityStep;
