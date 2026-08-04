import React, { useEffect, useState } from 'react';
import Modal from '../primitives/Modal';
import Button from '../primitives/Button';
import IconButton from '../primitives/IconButton';
import { TextField } from '../primitives/Field';
import { useToastV2 } from '../primitives/Toast';

interface JoinCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onJoin: (id: string) => void;
}

/** Modal for joining an existing multiplayer campaign by its shared Campaign ID. */
const JoinCampaignModal: React.FC<JoinCampaignModalProps> = ({ open, onClose, onJoin }) => {
  const { toast } = useToastV2();
  const [campaignId, setCampaignId] = useState('');
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    if (open) setCampaignId('');
  }, [open]);

  const trimmed = campaignId.trim();
  const canJoin = trimmed.length >= 4;

  const handlePaste = async () => {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setCampaignId(text.trim());
        toast('Campaign ID pasted.', 'success');
      } else {
        toast('Your clipboard is empty.', 'warning');
      }
    } catch {
      toast('Clipboard access denied — paste the ID manually.', 'warning');
    } finally {
      setPasting(false);
    }
  };

  const handleJoin = () => {
    if (!canJoin) return;
    onJoin(trimmed);
    setCampaignId('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a Party"
      subtitle="Embark on a chronicle hosted by another player."
      icon="fa-users"
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="fa-users" disabled={!canJoin} onClick={handleJoin}>
            Join Party
          </Button>
        </div>
      }
    >
      <div className="flex items-end gap-2">
        <TextField
          className="flex-1"
          label="Campaign ID"
          icon="fa-key"
          placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
          value={campaignId}
          onChange={setCampaignId}
          onEnter={handleJoin}
          inputClassName="font-mono"
          autoFocus
        />
        <IconButton
          icon="fa-paste"
          variant="subtle"
          tip="Paste from clipboard"
          disabled={pasting}
          onClick={() => void handlePaste()}
        />
      </div>
      <p className="mt-2 text-xs text-parchment-faint flex items-center gap-1.5">
        <i className="fas fa-circle-info" aria-hidden="true" />
        Ask your party host for the Campaign ID.
      </p>
    </Modal>
  );
};

export default JoinCampaignModal;
