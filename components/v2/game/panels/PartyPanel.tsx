import React from 'react';
import type { Character } from '../../../../types';
import { calculateAc } from '../../../../services/classEngine';
import { isUnconscious } from '../../../../services/conditionEngine';
import Avatar from '../../primitives/Avatar';
import Card, { SectionHeader } from '../../primitives/Card';
import Chip from '../../primitives/Chip';
import HpBar from '../../primitives/HpBar';
import Tooltip from '../../primitives/Tooltip';
import { cx } from '../../primitives/cx';
import { titleCase, isBuffCondition } from './panelUtils';

export interface PartyPanelProps {
  party: Character[];
  /** The character currently shown in the CharacterPanel dock. */
  viewingCharacterId: string | null;
  onViewCharacter: (id: string) => void;
  /** The local player's own character — gets the "You" chip. */
  myCharacterId?: string | null;
  /** Character ids currently typing (multiplayer presence). */
  typingCharacterIds?: ReadonlySet<string>;
}

/**
 * Emberlight V2 party dock panel — the multiplayer roster that replaces the
 * legacy per-character tab bar. Each row shows portrait, HP, AC, and live
 * conditions; clicking a row switches the inspected character. In solo play
 * this still renders (single entry) so the dock layout stays stable.
 */
const PartyPanel: React.FC<PartyPanelProps> = ({
  party,
  viewingCharacterId,
  onViewCharacter,
  myCharacterId,
  typingCharacterIds,
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col bg-obsidian-950 font-body text-parchment">
      <div className="shrink-0 border-b border-white/[0.06] bg-obsidian-900/95 px-3 pb-3 pt-3">
        <SectionHeader icon="fa-users" className="mb-0">
          The Party
          <span className="ml-1 font-mono text-[10px] normal-case tracking-normal text-parchment-faint">
            {party.length}
          </span>
        </SectionHeader>
      </div>

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto v2-scrollbar px-3 py-3">
        {party.map((char) => {
          const isViewing = viewingCharacterId === char.id;
          const isMe = myCharacterId === char.id;
          const equippedArmor = char.inventory.find((i) => i.equipped && i.type === 'armor') ?? null;
          const ac = calculateAc(char, equippedArmor);
          const down = char.hp.current <= 0 || isUnconscious(char);
          const conditions = char.conditions ?? [];
          const isTyping = typingCharacterIds?.has(char.id) ?? false;

          return (
            <Card
              key={char.id}
              interactive
              accent={isViewing ? 'ember' : 'none'}
              onClick={() => onViewCharacter(char.id)}
              title={`Inspect ${char.name}`}
              className={cx(
                'p-3',
                isViewing && 'border-ember-500/40 bg-obsidian-850 shadow-[0_0_18px_rgba(245,158,11,0.10)]',
                down && 'border-blood-500/40',
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={char.name}
                  src={char.portraitUrl || undefined}
                  size="md"
                  ring={isViewing ? 'ember' : 'none'}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className={cx('truncate font-display text-sm font-semibold', down ? 'text-blood-300' : 'text-parchment')}>
                      {char.name}
                    </h4>
                    {isMe && <Chip color="ember">You</Chip>}
                    {isTyping && (
                      <span className="text-[10px] italic text-arcane-300" aria-label={`${char.name} is writing`}>
                        writing…
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-parchment-mute">
                    L{char.level} {titleCase(char.race)} {titleCase(char.class)}
                  </p>
                </div>
                <Tooltip content="Armor Class">
                  <span className="flex shrink-0 flex-col items-center rounded-lg border border-white/[0.07] bg-obsidian-900 px-2 py-1">
                    <i className="fas fa-shield-halved text-[9px] text-frost-400" aria-hidden="true" />
                    <span className="font-mono text-xs font-semibold text-parchment">{ac}</span>
                  </span>
                </Tooltip>
              </div>

              <div className="mt-2.5">
                <HpBar current={char.hp.current} max={char.hp.max} height="sm" showNumbers />
                {char.tempHp != null && char.tempHp > 0 && (
                  <p className="mt-1 text-[10px] font-mono text-frost-300">+{char.tempHp} temp</p>
                )}
              </div>

              {(down || conditions.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {down && <Chip color="blood">Down</Chip>}
                  {conditions.map((c) => (
                    <Chip key={c.id} color={isBuffCondition(c) ? 'verdant' : 'blood'}>
                      <span className="capitalize">{c.id}</span>
                    </Chip>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default PartyPanel;
