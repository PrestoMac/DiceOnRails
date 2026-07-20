import React, { useEffect, useRef } from 'react';

interface ExportMenuProps {
  show: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

const EXPORT_BTN_CLASS = 'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-300 hover:bg-stone-800/80 hover:text-amber-400 transition-colors text-left';
const EXPORT_ICON_CLASS = 'text-xs w-5 text-center text-stone-500';

/** Dropdown menu for exporting the chat log (copy to clipboard or download as .txt). */
const ExportMenu: React.FC<ExportMenuProps> = ({ show, onClose, onCopy, onDownload }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="absolute right-0 top-full mt-1 w-52 bg-stone-900 border border-stone-700/60 rounded-lg shadow-xl z-40 overflow-hidden" ref={menuRef}>
      <button onClick={onCopy} className={EXPORT_BTN_CLASS}>
        <i className={`fas fa-copy ${EXPORT_ICON_CLASS}`}></i> Copy all
      </button>
      <button onClick={onDownload} className={EXPORT_BTN_CLASS}>
        <i className={`fas fa-file-lines ${EXPORT_ICON_CLASS}`}></i> Download as .txt
      </button>
    </div>
  );
};

export default ExportMenu;
