import React from 'react';
import Modal from './Modal';
import Button from './Button';
import { cx } from './cx';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Branded replacement for the native window.confirm. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  icon = danger ? 'fa-triangle-exclamation' : 'fa-circle-question',
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} icon={icon} size="sm">
    {body && <div className="text-sm text-parchment-dim leading-relaxed">{body}</div>}
    <div className={cx('mt-6 flex gap-3', danger ? 'flex-row-reverse' : 'flex-row-reverse')}>
      <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} size="sm" className="flex-1">
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={onCancel} size="sm" className="flex-1">
        {cancelLabel}
      </Button>
    </div>
  </Modal>
);

export default ConfirmDialog;
