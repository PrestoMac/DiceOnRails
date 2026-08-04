import React from 'react';
import { formatGameTime } from '../../../utils/timeUtils';
import { cx } from '../primitives/cx';
import { Z } from '../primitives/layers';
import IconButton from '../primitives/IconButton';
import Tooltip from '../primitives/Tooltip';
import { useToastV2 } from '../primitives/Toast';

interface TopBarProps {
  locationLabel?: string;
  gameTimeMinutes?: number;
  campaignName?: string;
  shareId?: string;
  recentActivity: string[];
  onBack: () => void;
  backIcon?: string;
  backTip?: string;
  onOpenCompendium: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  showLogout: boolean;
  /** Optional slot rendered immediately after the back button (e.g. dock toggle). */
  leading?: React.ReactNode;
}

/** Slim 56px chrome bar: back nav, location/game-time context, activity bell, share + panel shortcuts. */
const TopBar: React.FC<TopBarProps> = ({
  locationLabel,
  gameTimeMinutes,
  campaignName,
  shareId,
  recentActivity,
  onBack,
  backIcon = 'fa-arrow-left',
  backTip = 'Back',
  onOpenCompendium,
  onOpenSettings,
  onLogout,
  showLogout,
  leading,
}) => {
  const { toast } = useToastV2();

  const timeLabel =
    gameTimeMinutes !== undefined
      ? (() => {
          const t = formatGameTime(gameTimeMinutes);
          return `Day ${t.day} · ${t.time} · ${t.period}`;
        })()
      : undefined;

  const copyShareId = () => {
    if (!shareId) return;
    navigator.clipboard
      .writeText(shareId)
      .then(() => toast('Share code copied to clipboard.', 'success'))
      .catch(() => toast('Could not copy the share code.', 'error'));
  };

  return (
    <header
      className={cx(
        'relative h-14 shrink-0 flex items-center gap-2 px-3 sm:px-4 border-b border-white/[0.06] bg-obsidian-900/85 backdrop-blur-md',
        Z.nav,
      )}
    >
      <IconButton icon={backIcon} tip={backTip} onClick={onBack} />
      {leading}

      <div className="flex items-center gap-2 min-w-0 flex-1">
        {locationLabel && (
          <span className="inline-flex items-center gap-1.5 max-w-[40%] sm:max-w-[260px] px-2.5 py-1 rounded-full bg-obsidian-800/80 border border-white/[0.08]">
            <i className="fas fa-location-dot text-ember-400 text-[10px] shrink-0" aria-hidden="true" />
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-parchment truncate">
              {locationLabel}
            </span>
          </span>
        )}
        {timeLabel && (
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-obsidian-800/60 border border-white/[0.06]">
            <i className="fas fa-clock text-parchment-faint text-[10px]" aria-hidden="true" />
            <span className="text-[10px] font-mono text-parchment-dim capitalize whitespace-nowrap">{timeLabel}</span>
          </span>
        )}
        {campaignName && (
          <span className="hidden lg:inline text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-parchment-faint truncate">
            {campaignName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {recentActivity.length > 0 && (
          <Tooltip
            side="bottom"
            content={
              <div className="w-56">
                <p className="pb-1.5 font-display text-[9px] font-semibold uppercase tracking-[0.16em] text-parchment-faint">
                  Recent Activity
                </p>
                {recentActivity.slice(0, 10).map((a, i) => (
                  <div key={i} className="text-[11px] text-parchment-dim py-0.5 truncate">
                    {a}
                  </div>
                ))}
              </div>
            }
          >
            <span className="relative inline-flex">
              <IconButton icon="fa-bell" tip="Recent party activity" aria-label="Recent party activity" />
              <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-ember-500 border-2 border-obsidian-950 flex items-center justify-center">
                <span className="text-[8px] font-bold text-obsidian-950 leading-none">{recentActivity.length}</span>
              </span>
            </span>
          </Tooltip>
        )}

        {shareId && (
          <span className="hidden sm:inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-obsidian-800/80 border border-white/[0.08]">
            <i className="fas fa-share-nodes text-arcane-400 text-[10px]" aria-hidden="true" />
            <span className="text-[10px] font-mono text-parchment-dim max-w-[72px] truncate">{shareId}</span>
            <IconButton icon="fa-copy" tip="Copy share code" size="sm" onClick={copyShareId} />
          </span>
        )}

        <IconButton icon="fa-book-open" tip="Compendium" onClick={onOpenCompendium} />
        <IconButton icon="fa-gear" tip="Settings" onClick={onOpenSettings} />
        {showLogout && <IconButton icon="fa-right-from-bracket" tip="Log out" variant="danger" onClick={onLogout} />}
        <span className="w-2 h-2 ml-1 rounded-full bg-verdant-500 animate-pulse" title="Synced" aria-label="Synced" />
      </div>
    </header>
  );
};

export default TopBar;
