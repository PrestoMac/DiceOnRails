import { useState, useEffect } from 'react';

/** Mode options for the campaign creation, joining, or renaming modal. */
export type CampaignModalMode = 'create' | 'join' | 'rename';

interface CampaignModalProps {
  mode: CampaignModalMode;
  isOpen: boolean;
  currentName?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const TITLES: Record<CampaignModalMode, string> = {
  create: 'Name Your Chronicle',
  join: 'Join Existing Chronicle',
  rename: 'Rename Chronicle',
};

const SUBTITLES: Record<CampaignModalMode, string | undefined> = {
  create: undefined,
  join: 'Enter the Campaign ID shared by your party host.',
  rename: 'Update the title of your legend.',
};

const PLACEHOLDERS: Record<CampaignModalMode, string> = {
  create: 'e.g., The Lost Mines of Phandelver',
  join: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
  rename: 'New chronicle title...',
};

const CONFIRM_LABELS: Record<CampaignModalMode, string> = {
  create: 'Begin Journey',
  join: 'Join Party',
  rename: 'Save Title',
};

const INPUT_TYPES: Record<CampaignModalMode, string> = {
  create: 'text',
  join: 'text',
  rename: 'text',
};

const CornerBorder: React.FC<{ className: string }> = ({ className }) => (
  <div className={`absolute ${className} w-4 h-4 border-amber-800/50`} />
);

/** Modal dialog for creating, renaming, or joining a campaign. */
const CampaignModal: React.FC<CampaignModalProps> = ({ mode, isOpen, currentName, onConfirm, onCancel }) => {
  const [value, setValue] = useState(mode === 'rename' ? (currentName ?? '') : '');

  useEffect(() => {
    if (mode === 'rename') setValue(currentName ?? '');
    else setValue('');
  }, [mode, currentName, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) { onConfirm(value.trim()); setValue(''); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-stone-900 border border-stone-700 rounded-xl p-8 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
        {mode === 'create' && (
          <>
            <CornerBorder className="top-2 left-2 border-t-2 border-l-2 rounded-tl" />
            <CornerBorder className="top-2 right-2 border-t-2 border-r-2 rounded-tr" />
            <CornerBorder className="bottom-2 left-2 border-b-2 border-l-2 rounded-bl" />
            <CornerBorder className="bottom-2 right-2 border-b-2 border-r-2 rounded-br" />
          </>
        )}
        {mode === 'rename' && (
          <div className="absolute top-0 right-0 p-2 opacity-50">
            <svg className="w-8 h-8 text-amber-700" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2 4h4l-3 3 1 5-4-3-4 3 1-5-3-3h4z" /></svg>
          </div>
        )}
        <h2 className={`font-bold mb-2 ${mode === 'create' ? 'fantasy-font text-3xl text-amber-600 mb-6 text-center' : 'text-2xl text-amber-500'}`}>
          {TITLES[mode]}
        </h2>
        {SUBTITLES[mode] && <p className="text-stone-400 mb-6 text-sm">{SUBTITLES[mode]}</p>}
        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'create' && (
            <div>
              <label className="block text-stone-400 text-sm font-bold uppercase tracking-widest mb-2">Campaign Title</label>
              <input type={INPUT_TYPES[mode]} value={value} onChange={e => setValue(e.target.value)} placeholder={PLACEHOLDERS[mode]} autoFocus
                className="w-full bg-stone-950 border border-stone-800 text-stone-100 p-4 rounded-lg focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 placeholder-stone-700 transition-all font-serif text-lg" />
            </div>
          )}
          {(mode === 'join' || mode === 'rename') && (
            <input type={INPUT_TYPES[mode]} value={value} onChange={e => setValue(e.target.value)} placeholder={PLACEHOLDERS[mode]} autoFocus
              className={`w-full bg-stone-950 border border-stone-800 text-stone-200 px-4 py-3 rounded-lg focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50 transition-all placeholder-stone-600 ${mode === 'join' ? 'font-mono text-sm' : 'font-serif'}`} />
          )}
          <div className={`flex gap-3 ${mode === 'create' ? 'justify-end pt-2' : 'justify-end'}`}>
            <button type="button" onClick={onCancel}
              className="px-4 py-2 rounded-lg text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors uppercase text-xs font-bold tracking-wider">Cancel</button>
            <button type="submit" disabled={!value.trim()}
              className={`px-6 py-2 rounded-lg font-bold uppercase tracking-wider transition-all shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed ${value.trim() ? 'bg-amber-700 hover:bg-amber-600 text-stone-100' : 'bg-stone-800 text-stone-600'}`}>
              {CONFIRM_LABELS[mode]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CampaignModal;
