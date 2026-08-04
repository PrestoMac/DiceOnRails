import React from 'react';
import type { Campaign } from '../../../types';
import Card from '../primitives/Card';
import Button from '../primitives/Button';
import IconButton from '../primitives/IconButton';

interface CampaignCardProps {
  campaign: Campaign;
  onResume: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** A single saved-chronicle tile in the Hall of Chronicles. */
const CampaignCard: React.FC<CampaignCardProps> = ({ campaign, onResume, onRename, onDelete }) => (
  <Card className="flex flex-col gap-3 h-full transition-colors hover:border-ember-500/30">
    <div className="flex-1 min-w-0">
      <h3 className="font-display text-lg font-bold text-parchment tracking-wide truncate">{campaign.name}</h3>
      <p className="mt-1.5 flex items-center gap-2 text-xs text-parchment-dim">
        <i className="fas fa-user text-ember-500/80" aria-hidden="true" />
        <span className="truncate">{campaign.characterName ?? 'Unknown Hero'}</span>
      </p>
      <p className="mt-1 text-[11px] text-parchment-faint">
        Created {new Date(campaign.createdAt).toLocaleDateString()}
      </p>
    </div>
    <div className="flex items-center gap-2 pt-1">
      <Button size="sm" icon="fa-chevron-right" className="flex-1" onClick={onResume}>
        Resume
      </Button>
      <IconButton icon="fa-pen" variant="subtle" size="sm" tip="Rename chronicle" onClick={onRename} />
      <IconButton icon="fa-trash" variant="danger" size="sm" tip="Delete chronicle" onClick={onDelete} />
    </div>
  </Card>
);

export default CampaignCard;
