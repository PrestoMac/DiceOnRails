import React, { useEffect, useState } from 'react';
import { AppSettings, Message, GameState } from '../types';
import { getVoices } from '../services/audioService';
import { authService } from '../services/authService';
import Toggle from './shared/Toggle';
import SectionH from './shared/SectionH';

interface SettingsModalProps {
  settings: AppSettings;
  userId?: string;
  messages?: Message[];
  gameState?: GameState;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

const ToggleRow: React.FC<{ label: string; on: boolean; onClick: () => void; description?: string; className?: string }> = ({ label, on, onClick, description, className = '' }) => (
  <div className={`flex items-center justify-between py-2 ${className}`}>
    <div>
      <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">{label}</label>
      {description && <p className="text-xs text-stone-600 mt-1">{description}</p>}
    </div>
    <Toggle on={on} onClick={onClick} />
  </div>
);

const buildDebugLog = (messages: Message[] | undefined, gameState: GameState | undefined): string => {
  const msgs = messages || [];
  const gs = gameState;
  const now = new Date().toISOString();
  const L: string[] = [`=== DiceOnRails Session Log — ${now} ===`, ''];
  if (gs?.party?.length) {
    L.push('─ Party State ─');
    for (const c of gs.party) {
      const stats = `STR ${c.stats.str} DEX ${c.stats.dex} CON ${c.stats.con} INT ${c.stats.int} WIS ${c.stats.wis} CHA ${c.stats.cha}`;
      const inv = c.inventory.filter(i => i.equipped).map(i => i.name).join(', ') || 'none';
      L.push(`  ${c.name} — Lvl ${c.level} ${c.race} ${c.class}`);
      L.push(`  HP: ${c.hp.current}/${c.hp.max}  XP: ${c.experience}/${c.experienceToNextLevel}  Location: ${c.location}`);
      L.push(`  Stats: ${stats}`);
      L.push(`  Equipped: ${inv}`);
      if (c.deathSaves) L.push(`  Death Saves: ${c.deathSaves.successes}S / ${c.deathSaves.failures}F${c.deathSaves.isStable ? ' (Stable)' : ''}`);
    }
    L.push('');
  }
  if (gs?.combat?.isActive) {
    L.push(`─ Active Combat (Round ${gs.combat.round}, Turn ${gs.combat.turnIndex}) ─`);
    L.push(`  Current actor: ${gs.combat.initiative[gs.combat.turnIndex]?.name || '?'}`);
    for (const e of gs.combat.initiative) {
      const hp = e.type === 'enemy' ? gs.combat.enemies.find(en => en.id === e.id) : null;
      const pm = !hp ? gs.party.find(p => p.id === e.id) : undefined;
      const hpStr = hp ? `HP ${hp.hp.current}/${hp.hp.max}` : pm ? `HP ${pm.hp.current}/${pm.hp.max}` : '';
      L.push(`  ${e.type === 'player' ? '👤' : '👾'} ${e.name} (Init: ${e.initiative})${e.hasActedThisTurn ? ' ✓' : ''}${e.isDead ? ' 💀' : ''}${hpStr ? ' ' + hpStr : ''}`);
    }
    L.push('');
    L.push('─ Enemy Details ─');
    for (const en of gs.combat.enemies) {
      L.push(`  ${en.name} — AC ${en.ac} HP ${en.hp.current}/${en.hp.max}${en.cr ? ' CR ' + en.cr : ''}`);
      for (const atk of en.attacks) L.push(`    ${atk.name}: +${atk.toHit} ${atk.damageDice} ${atk.damageType}`);
      if (en.damageResistances?.length) L.push(`    Resist: ${en.damageResistances.join(', ')}`);
      if (en.damageVulnerabilities?.length) L.push(`    Vulnerable: ${en.damageVulnerabilities.join(', ')}`);
      if (en.damageImmunities?.length) L.push(`    Immune: ${en.damageImmunities.join(', ')}`);
    }
    L.push('');
  }
  if (gs?.lastDiceRoll) {
    L.push('─ Last Dice Roll ─');
    const dr = gs.lastDiceRoll;
    L.push(`  ${dr.count}d${dr.sides}${dr.modifier !== 0 ? (dr.modifier > 0 ? '+' + dr.modifier : dr.modifier) : ''} = ${dr.total}`);
    L.push(`  Results: [${dr.results.join(', ')}]`);
    L.push('');
  }
  if (gs?.worldDescription) {
    L.push('─ World Description ─');
    L.push(`  ${gs.worldDescription.substring(0, 500)}`);
    L.push('');
  }
  L.push('─ Chat Log ─');
  for (const m of msgs) {
    const ts = new Date(m.timestamp).toLocaleTimeString();
    const role = m.role === 'user' ? (m.senderName || 'Player') : m.role === 'model' ? 'GM' : 'System';
    L.push(`[${ts}] ${role}: ${m.text}`);
  }
  L.push('');
  L.push('─── End of Log ───');
  return L.join('\n');
};

/** Settings modal with voice selection, atmosphere toggle, debug mode, password update, and debug log export. */
const SettingsModal: React.FC<SettingsModalProps> = ({ settings, userId, messages, gameState, onSave, onClose }) => {
  const [local, setLocal] = useState<AppSettings>(settings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getVoices().then(v => setAvailableVoices([...v].sort((a, b) => {
      if (a.lang.startsWith('en') && !b.lang.startsWith('en')) return -1;
      if (!a.lang.startsWith('en') && b.lang.startsWith('en')) return 1;
      return a.name.localeCompare(b.name);
    })));
  }, []);

  const hc = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setLocal(p => ({ ...p, [key]: value }));

  const copyDebugLogs = () => {
    navigator.clipboard.writeText(buildDebugLog(messages, gameState)).then(() => {
      const btn = document.activeElement as HTMLButtonElement;
      if (btn) {
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy Raw Logs (Debug)'; }, 2000);
      }
    }).catch(() => alert('Failed to copy logs.'));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-xl bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-white transition-colors"><i className="fas fa-times text-xl"></i></button>
        <h2 className="fantasy-font text-3xl font-bold text-amber-600 mb-6 uppercase tracking-widest border-b border-stone-800 pb-2">Chronicle Settings</h2>
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-4 custom-scrollbar">
          <section className="space-y-4 pt-4">
            <div className="flex justify-between items-center">
              <SectionH>Visual Essence (ImageRouter)</SectionH>
              <div className="flex items-center gap-3"><span className="text-[9px] uppercase font-bold text-stone-600 tracking-widest">Enable Atmosphere</span><Toggle on={local.enableAtmosphere} onClick={() => hc('enableAtmosphere', !local.enableAtmosphere)} /></div>
            </div>
            <p className="text-xs text-stone-500 italic px-3">Dynamic visual atmosphere for your current location</p>
          </section>
          <section className="space-y-4 pt-4 border-t border-stone-800">
            <SectionH>Narrator's Voice</SectionH>
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Select Voice</label>
              <select value={local.voiceName} onChange={e => hc('voiceName', e.target.value)} className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-stone-300 outline-none focus:border-amber-700 transition-all text-sm">
                <option value="">System Default</option>
                {availableVoices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {[{ key: 'rate' as const, label: 'Speed', min: 0.5, max: 2, step: 0.1, suffix: 'x' }, { key: 'pitch' as const, label: 'Pitch', min: 0.5, max: 1.5, step: 0.1 }].map(r => (
                <div key={r.key} className="space-y-2">
                  <div className="flex justify-between items-center"><label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">{r.label}</label><span className="text-xs text-amber-600 font-mono">{local[r.key].toFixed(1)}{r.suffix ?? ''}</span></div>
                  <input type="range" min={r.min} max={r.max} step={r.step} value={local[r.key]} onChange={e => hc(r.key, parseFloat(e.target.value))} className="w-full accent-amber-600 bg-stone-800 h-1.5 rounded-lg appearance-none cursor-pointer" />
                </div>
              ))}
            </div>
            <ToggleRow label="Auto-Narrate Response" on={local.autoSpeak} onClick={() => hc('autoSpeak', !local.autoSpeak)} />
          </section>
          {userId && <section className="space-y-4 pt-4 border-t border-stone-800">
            <SectionH>Account Security</SectionH>
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Update Password</label>
              <div className="flex gap-2">
                <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="flex-1 bg-stone-950 border border-stone-800 rounded-lg p-3 text-stone-300 outline-none focus:border-amber-700 transition-all text-sm" />
                <button onClick={async () => {
                  if (!newPassword || newPassword.length < 6) { setPasswordStatus({ type: 'error', text: 'Password must be at least 6 characters.' }); return; }
                  const { error } = await authService.updatePassword(newPassword);
                  if (error) setPasswordStatus({ type: 'error', text: error.message });
                  else { setPasswordStatus({ type: 'success', text: 'Password updated successfully.' }); setNewPassword(''); }
                }} className="px-4 bg-stone-800 hover:bg-amber-900 border border-stone-800 text-stone-400 hover:text-white rounded-lg transition-colors font-bold text-xs uppercase tracking-widest">Update</button>
              </div>
              {passwordStatus && <p className={`text-xs ${passwordStatus.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{passwordStatus.text}</p>}
            </div>
          </section>}
          <section className="space-y-4 pt-4 border-t border-stone-800">
            <SectionH>Chronicler's Insight</SectionH>
            <ToggleRow label="Debug Mode" on={local.debugMode} onClick={() => hc('debugMode', !local.debugMode)} description="Enable verbose console logging for prompt caching & game state diagnostics" className="px-3" />
            <div className="px-3">
              <button onClick={copyDebugLogs} className="w-full py-2 bg-stone-950 hover:bg-stone-900 border border-stone-800 rounded-lg text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-amber-500 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-clipboard text-[9px]"></i>
                <span>Copy Raw Logs (Debug)</span>
              </button>
              <p className="text-[10px] text-stone-600 mt-1 px-1">Copies last chat messages, party state, and active combat data to clipboard</p>
            </div>
          </section>
        </div>
        <div className="pt-6 flex gap-3 border-t border-stone-800 mt-6">
          <button onClick={() => onSave(local)} className="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-lg uppercase tracking-widest text-xs transition-all shadow-lg shadow-amber-900/20">Save Changes</button>
          <button onClick={onClose} className="px-6 py-3 bg-stone-800 hover:bg-stone-700 text-stone-400 font-bold rounded-lg uppercase tracking-widest text-xs transition-all">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
