import React, { useState } from 'react';
import { Campaign } from '../types';
import CampaignModal from './CampaignModal';

interface CampaignDashboardProps {
  campaigns: Campaign[];
  onSelectCampaign: (id: string) => void;
  onCreateNew: () => void;
  onDeleteCampaign: (id: string) => void;
  onRenameCampaign: (id: string, newName: string) => Promise<void>;
  onJoinCampaign?: (id: string) => void;
  loading?: boolean;
}

const DashboardBtn: React.FC<{ onClick: () => void; icon: string; children: React.ReactNode }> = ({ onClick, icon, children }) => (
  <button onClick={onClick} className="w-full group relative overflow-hidden bg-stone-900 border border-stone-800 hover:border-amber-800/50 p-6 rounded-xl transition-all duration-300 shadow-xl">
    <div className="absolute inset-0 bg-gradient-to-r from-amber-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
    <div className="flex flex-col items-center justify-center gap-3 relative z-10">
      <div className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center group-hover:bg-amber-900/30 group-hover:scale-110 transition-all duration-300 mb-1">
        <i className={`fas ${icon} text-xl ${icon==='fa-plus'?'text-amber-600/70 group-hover:text-amber-500':'text-stone-500 group-hover:text-amber-500'}`}></i>
      </div>
      <span className="text-xl font-bold text-stone-400 group-hover:text-amber-100 transition-colors fantasy-font tracking-wide">{children}</span>
    </div>
  </button>
);

/** Dashboard listing saved campaigns with rename, delete, resume, and join actions. */
const CampaignDashboard: React.FC<CampaignDashboardProps> = ({ campaigns, onSelectCampaign, onCreateNew, onDeleteCampaign, onRenameCampaign, onJoinCampaign, loading = false }) => {
  const [renamingId, setRenamingId] = useState<string|null>(null);
  const [renameName, setRenameName] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);

  if (loading) return <div className="h-full w-full flex items-center justify-center text-stone-400"><div className="flex flex-col items-center gap-4"><i className="fas fa-circle-notch fa-spin text-3xl text-amber-600"></i><span className="fantasy-font tracking-widest text-lg">Summoning Archives...</span></div></div>;

  return (
    <div className="h-full w-full bg-stone-950 overflow-y-auto relative custom-scrollbar">
      <div className="fixed inset-0 opacity-10 pointer-events-none" style={{backgroundImage:'radial-gradient(circle at 50% 30%, #78350f 0%, transparent 70%)', backgroundSize:'100% 100%'}}></div>
      <div className="min-h-full flex flex-col items-center p-6 md:p-12 pt-20 md:pt-32 relative z-10">
        <div className="w-full max-w-4xl flex flex-col items-center">
          <h1 className="fantasy-font text-4xl md:text-6xl text-amber-600 mb-2 drop-shadow-lg tracking-wider text-center">Your Chronicles</h1>
          <div className="h-1 w-24 bg-gradient-to-r from-transparent via-amber-800 to-transparent mb-12"></div>
          <div className="w-full space-y-4">
            {campaigns.length === 0 ? <div className="text-stone-400 text-center bg-stone-900/50 p-12 rounded-xl border border-stone-800 backdrop-blur-sm">
              <i className="fas fa-book-open text-4xl mb-4 opacity-50 text-amber-900"></i>
              <p className="mb-4 text-xl font-serif text-amber-500/80">The archives are empty.</p>
              <p className="text-sm opacity-60 max-w-md mx-auto">Begin your first adventure to carve your name into history. The bards are waiting for a story to tell.</p></div>
            : campaigns.map(campaign => (
              <div key={campaign.id} className="bg-stone-900/60 backdrop-blur-md p-6 rounded-xl border border-stone-800 hover:border-amber-700/50 hover:bg-stone-900/80 transition-all group shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl md:text-2xl font-bold text-stone-200 group-hover:text-amber-500 transition-colors truncate">{campaign.name}</h2>
                  <div className="flex items-center gap-4 mt-2 text-stone-400 text-sm">
                    <span className="flex items-center gap-1.5" title="Hero Name"><i className="fas fa-user-shield text-amber-700"></i><span className="truncate max-w-[150px]">{campaign.characterName||'Unknown Hero'}</span></span>
                    <span className="w-1 h-1 rounded-full bg-stone-700"></span>
                    <span className="flex items-center gap-1.5" title="Last Played"><i className="fas fa-history text-amber-700"></i>{new Date(campaign.lastPlayed).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                  <button onClick={() => { setRenamingId(campaign.id); setRenameName(campaign.name); }} className="p-3 rounded-lg text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors" title="Rename Chronicle"><i className="fas fa-pen-nib"></i></button>
                  <button onClick={() => { if (confirm('Delete this campaign? The chronicles will be lost forever.')) onDeleteCampaign(campaign.id); }} className="p-3 rounded-lg text-stone-500 hover:text-red-400 hover:bg-red-950/30 transition-colors" title="Delete Campaign"><i className="fas fa-trash-alt"></i></button>
                  <button onClick={() => onSelectCampaign(campaign.id)} className="ml-2 flex-1 md:flex-none bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white shadow-lg shadow-amber-900/20 px-6 py-2.5 rounded-lg transition-all font-bold tracking-wide text-sm uppercase transform active:scale-95">
                    <span className="flex items-center justify-center gap-2">{campaign.stage==='creation'?'Forge Hero':'Resume'}<i className="fas fa-chevron-right text-xs opacity-70"></i></span>
                  </button>
                </div>
              </div>
            ))}
            <DashboardBtn onClick={onCreateNew} icon="fa-plus">Start New Chronicle</DashboardBtn>
            {onJoinCampaign && <DashboardBtn onClick={() => setShowJoinModal(true)} icon="fa-users">Join Existing Party</DashboardBtn>}
          </div>
        </div>
      </div>
      <CampaignModal mode="rename" isOpen={!!renamingId} currentName={renameName} onConfirm={async (n) => { if (renamingId) { await onRenameCampaign(renamingId, n); setRenamingId(null); }}} onCancel={() => setRenamingId(null)} />
      <CampaignModal mode="join" isOpen={showJoinModal} onConfirm={id => { onJoinCampaign?.(id); setShowJoinModal(false); }} onCancel={() => setShowJoinModal(false)} />
    </div>
  );
};

export default CampaignDashboard;
