import React, { useEffect, useState } from 'react';
import type { Campaign } from '../../../types';
import Screen from '../primitives/Screen';
import Button from '../primitives/Button';
import IconButton from '../primitives/IconButton';
import Modal from '../primitives/Modal';
import ConfirmDialog from '../primitives/ConfirmDialog';
import EmptyState from '../primitives/EmptyState';
import { TextField } from '../primitives/Field';
import { useToastV2 } from '../primitives/Toast';
import CampaignCard from './CampaignCard';
import JoinCampaignModal from './JoinCampaignModal';

interface HallScreenProps {
  campaigns: Campaign[];
  loading?: boolean;
  userId?: string;
  onSelectCampaign: (id: string) => void;
  onCreateNew: () => void;
  onDeleteCampaign: (id: string) => void;
  onRenameCampaign: (id: string, name: string) => Promise<void> | void;
  onJoinCampaign: (id: string) => void;
  onOpenSettings: () => void;
  /** When provided, renders a sign-out button in the header (caller owns the confirm dialog). */
  onLogout?: () => void;
}

/** Pulsing placeholder shown while saved campaigns load. */
const SkeletonCard: React.FC = () => (
  <div className="h-44 rounded-xl bg-obsidian-900/70 border border-white/[0.06] p-4 animate-pulse">
    <div className="h-5 w-2/3 rounded bg-white/[0.06]" />
    <div className="mt-3 h-3 w-1/3 rounded bg-white/[0.06]" />
    <div className="mt-2 h-3 w-1/4 rounded bg-white/[0.05]" />
    <div className="mt-8 h-8 w-full rounded-lg bg-white/[0.06]" />
  </div>
);

/** V2 campaign dashboard: the Hall of Chronicles. Lists, resumes, renames, deletes, creates, and joins campaigns. */
const HallScreen: React.FC<HallScreenProps> = ({
  campaigns,
  loading = false,
  onSelectCampaign,
  onCreateNew,
  onDeleteCampaign,
  onRenameCampaign,
  onJoinCampaign,
  onOpenSettings,
  onLogout,
}) => {
  const { toast } = useToastV2();
  const [renaming, setRenaming] = useState<Campaign | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    setRenameValue(renaming?.name ?? '');
  }, [renaming]);

  const handleRenameSave = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenameSaving(true);
    try {
      await onRenameCampaign(renaming.id, name);
      toast('Chronicle renamed.', 'success');
      setRenaming(null);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDeleteConfirm = () => {
    if (deleting) onDeleteCampaign(deleting.id);
    setDeleting(null);
  };

  return (
    <Screen>
      <div className="flex-1 min-h-0 overflow-y-auto v2-scrollbar">
        <div className="w-full max-w-6xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-ember-500 tracking-wide drop-shadow-lg">
                Hall of Chronicles
              </h1>
              <p className="mt-1.5 text-sm text-parchment-mute">
                Choose a chronicle to resume your legend, or begin a new one.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <IconButton icon="fa-gear" tip="Settings" onClick={onOpenSettings} size="lg" />
              {onLogout && <IconButton icon="fa-right-from-bracket" tip="Sign out" onClick={onLogout} size="lg" />}
              <Button icon="fa-plus" onClick={onCreateNew}>
                New Chronicle
              </Button>
              <Button variant="ghost" icon="fa-users" onClick={() => setJoinOpen(true)}>
                Join Party
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : campaigns.length === 0 ? (
            <div>
              <EmptyState
                icon="fa-book-open"
                title="The archives are empty."
                body="Begin your first adventure to carve your name into history. The bards are waiting for a story to tell."
              />
              <div className="flex flex-wrap items-center justify-center gap-3 -mt-6">
                <Button icon="fa-plus" onClick={onCreateNew}>
                  New Chronicle
                </Button>
                <Button variant="ghost" icon="fa-users" onClick={() => setJoinOpen(true)}>
                  Join Party
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onResume={() => onSelectCampaign(campaign.id)}
                  onRename={() => setRenaming(campaign)}
                  onDelete={() => setDeleting(campaign)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rename modal */}
      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename Chronicle"
        subtitle="Update the title of your legend."
        icon="fa-pen"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRenaming(null)} disabled={renameSaving}>
              Cancel
            </Button>
            <Button
              icon="fa-check"
              loading={renameSaving}
              disabled={!renameValue.trim()}
              onClick={() => void handleRenameSave()}
            >
              Save Title
            </Button>
          </div>
        }
      >
        <TextField
          label="Chronicle Title"
          placeholder="e.g., The Lost Mines of Phandelver"
          value={renameValue}
          onChange={setRenameValue}
          onEnter={() => void handleRenameSave()}
          autoFocus
        />
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleting !== null}
        danger
        title="Delete Chronicle"
        confirmLabel="Delete Forever"
        icon="fa-triangle-exclamation"
        body={
          deleting ? (
            <>
              Deleting <span className="text-parchment font-semibold">&ldquo;{deleting.name}&rdquo;</span> is permanent.
              The chronicle, its heroes, and every saved turn will be lost forever. This cannot be undone.
            </>
          ) : undefined
        }
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleting(null)}
      />

      {/* Join existing party */}
      <JoinCampaignModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoin={onJoinCampaign} />
    </Screen>
  );
};

export default HallScreen;
