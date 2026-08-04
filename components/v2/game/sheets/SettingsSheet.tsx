import React, { useEffect, useState } from 'react';
import { AppSettings, GameState, Message } from '../../../../types';
import { getVoices } from '../../../../services/audioService';
import { authService } from '../../../../services/authService';
import Modal from '../../primitives/Modal';
import Toggle from '../../primitives/Toggle';
import Button from '../../primitives/Button';
import { SectionHeader } from '../../primitives/Card';
import { cx } from '../../primitives/cx';
import { useToastV2 } from '../../primitives/Toast';

interface SettingsSheetProps {
  settings: AppSettings;
  userId?: string;
  messages: Message[];
  gameState: GameState;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

/** Builds a plain-text diagnostic dump of the current session (party, combat, dice, chat) for bug reports. */
export function buildDebugLogV2(settings: AppSettings, messages: Message[] | undefined, gameState: GameState | undefined): string {
  const msgs = messages || [];
  const gs = gameState;
  const now = new Date().toISOString();
  const L: string[] = [`=== DiceOnRails Session Log — ${now} ===`, ''];
  L.push('─ Settings ─');
  L.push(`  voice=${settings.voiceName || 'default'} rate=${settings.rate} pitch=${settings.pitch} volume=${settings.volume}`);
  L.push(`  autoSpeak=${settings.autoSpeak} atmosphere=${settings.enableAtmosphere} debug=${settings.debugMode}`);
  L.push(`  suggestions=${settings.enableSuggestions ?? 'unset'} portraits=${settings.enablePortraits ?? 'unset'}`);
  L.push('');
  if (gs?.party?.length) {
    L.push('─ Party State ─');
    for (const c of gs.party) {
      const stats = `STR ${c.stats.str} DEX ${c.stats.dex} CON ${c.stats.con} INT ${c.stats.int} WIS ${c.stats.wis} CHA ${c.stats.cha}`;
      const inv = c.inventory.filter((i) => i.equipped).map((i) => i.name).join(', ') || 'none';
      L.push(`  ${c.name} — Lvl ${c.level} ${c.race} ${c.class}`);
      L.push(`  HP: ${c.hp.current}/${c.hp.max}  XP: ${c.experience}/${c.experienceToNextLevel}  Location: ${c.location}`);
      L.push(`  Stats: ${stats}`);
      L.push(`  Equipped: ${inv}`);
      if (c.deathSaves)
        L.push(
          `  Death Saves: ${c.deathSaves.successes}S / ${c.deathSaves.failures}F${c.deathSaves.isStable ? ' (Stable)' : ''}`,
        );
    }
    L.push('');
  }
  if (gs?.combat?.isActive) {
    L.push(`─ Active Combat (Round ${gs.combat.round}, Turn ${gs.combat.turnIndex}) ─`);
    L.push(`  Current actor: ${gs.combat.initiative[gs.combat.turnIndex]?.name || '?'}`);
    for (const e of gs.combat.initiative) {
      const hp = e.type === 'enemy' ? gs.combat.enemies.find((en) => en.id === e.id) : null;
      const pm = !hp ? gs.party.find((p) => p.id === e.id) : undefined;
      const hpStr = hp ? `HP ${hp.hp.current}/${hp.hp.max}` : pm ? `HP ${pm.hp.current}/${pm.hp.max}` : '';
      L.push(
        `  ${e.type === 'player' ? '[P]' : '[E]'} ${e.name} (Init: ${e.initiative})${e.hasActedThisTurn ? ' (acted)' : ''}${e.isDead ? ' (dead)' : ''}${hpStr ? ' ' + hpStr : ''}`,
      );
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
    const role = m.role === 'user' ? m.senderName || 'Player' : m.role === 'model' ? 'GM' : 'System';
    L.push(`[${ts}] ${role}: ${m.text}`);
  }
  L.push('');
  L.push('─── End of Log ───');
  return L.join('\n');
}

const ToggleRow: React.FC<{ label: string; on: boolean; onToggle: () => void; description?: string }> = ({
  label,
  on,
  onToggle,
  description,
}) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="min-w-0">
      <span className="block font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-dim">
        {label}
      </span>
      {description && <p className="text-[11px] text-parchment-faint mt-0.5 leading-snug">{description}</p>}
    </div>
    <Toggle on={on} onToggle={onToggle} label={label} />
  </div>
);

const SliderRow: React.FC<{
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}> = ({ label, min, max, step, value, format, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between items-center">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-mute">{label}</span>
      <span className="text-xs text-ember-400 font-mono">{format(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-ember-600 bg-obsidian-800 h-1.5 rounded-lg appearance-none cursor-pointer"
    />
  </div>
);

/** Emberlight settings sheet: visuals, narrator voice, gameplay toggles, account security, diagnostics. */
const SettingsSheet: React.FC<SettingsSheetProps> = ({ settings, userId, messages, gameState, onSave, onClose }) => {
  const { toast } = useToastV2();
  const [local, setLocal] = useState<AppSettings>(settings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getVoices().then((v) =>
      setAvailableVoices(
        [...v].sort((a, b) => {
          if (a.lang.startsWith('en') && !b.lang.startsWith('en')) return -1;
          if (!a.lang.startsWith('en') && b.lang.startsWith('en')) return 1;
          return a.name.localeCompare(b.name);
        }),
      ),
    );
  }, []);

  const hc = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setLocal((p) => ({ ...p, [key]: value }));

  const copyDebugLogs = () => {
    navigator.clipboard
      .writeText(buildDebugLogV2(local, messages, gameState))
      .then(() => toast('Debug logs copied to clipboard.', 'success'))
      .catch(() => toast('Failed to copy logs.', 'error'));
  };

  const replayTour = () => {
    toast('Replaying the onboarding tour…', 'info');
    window.dispatchEvent(new CustomEvent('dor:replay-tour'));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Chronicle Settings"
      icon="fa-gear"
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" icon="fa-floppy-disk" onClick={() => onSave(local)}>
            Save Changes
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <SectionHeader icon="fa-wand-magic-sparkles">Visual Essence (ImageRouter)</SectionHeader>
          <ToggleRow
            label="Enable Atmosphere"
            on={local.enableAtmosphere}
            onToggle={() => hc('enableAtmosphere', !local.enableAtmosphere)}
            description="Dynamic visual atmosphere for your current location."
          />
          <ToggleRow
            label="Enable Portraits"
            on={!!local.enablePortraits}
            onToggle={() => hc('enablePortraits', !local.enablePortraits)}
            description="Auto-generate a portrait for each new character (regenerate anytime in the persona modal)."
          />
        </section>

        <section className="space-y-3 border-t border-white/[0.06] pt-5">
          <SectionHeader icon="fa-headphones">Narrator's Voice</SectionHeader>
          <label className="block">
            <span className="block mb-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-mute">
              Select Voice
            </span>
            <select
              value={local.voiceName}
              onChange={(e) => hc('voiceName', e.target.value)}
              className="w-full bg-obsidian-950/80 border border-white/10 focus:border-ember-500/60 rounded-lg px-3 py-2.5 text-sm text-parchment outline-none transition-colors"
            >
              <option value="">System Default</option>
              {availableVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <SliderRow label="Speed" min={0.5} max={2} step={0.1} value={local.rate} format={(v) => `${v.toFixed(1)}x`} onChange={(v) => hc('rate', v)} />
            <SliderRow label="Pitch" min={0.5} max={1.5} step={0.1} value={local.pitch} format={(v) => v.toFixed(1)} onChange={(v) => hc('pitch', v)} />
            <SliderRow label="Volume" min={0} max={1} step={0.05} value={local.volume} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => hc('volume', v)} />
          </div>
          <ToggleRow
            label="Auto-Narrate Response"
            on={local.autoSpeak}
            onToggle={() => hc('autoSpeak', !local.autoSpeak)}
          />
        </section>

        <section className="space-y-3 border-t border-white/[0.06] pt-5">
          <SectionHeader icon="fa-gamepad">Gameplay</SectionHeader>
          <ToggleRow
            label="Suggested Actions"
            on={!!local.enableSuggestions}
            onToggle={() => hc('enableSuggestions', !local.enableSuggestions)}
            description="Shows 2-3 suggested next actions after each turn. May make one small additional API call when a turn doesn't naturally produce suggestions."
          />
          <ToggleRow
            label="Debug Mode"
            on={local.debugMode}
            onToggle={() => hc('debugMode', !local.debugMode)}
            description="Enable verbose console logging for prompt caching & game state diagnostics."
          />
        </section>

        {userId && (
          <section className="space-y-3 border-t border-white/[0.06] pt-5">
            <SectionHeader icon="fa-lock">Account Security</SectionHeader>
            <span className="block font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-mute">
              Update Password
            </span>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 bg-obsidian-950/80 border border-white/10 focus:border-ember-500/60 rounded-lg px-3 py-2.5 text-sm text-parchment placeholder:text-parchment-faint outline-none transition-colors"
              />
              <Button
                variant="subtle"
                size="sm"
                onClick={async () => {
                  if (!newPassword || newPassword.length < 6) {
                    setPasswordStatus({ type: 'error', text: 'Password must be at least 6 characters.' });
                    return;
                  }
                  const { error } = await authService.updatePassword(newPassword);
                  if (error) setPasswordStatus({ type: 'error', text: error.message });
                  else {
                    setPasswordStatus({ type: 'success', text: 'Password updated successfully.' });
                    setNewPassword('');
                  }
                }}
              >
                Update
              </Button>
            </div>
            {passwordStatus && (
              <p className={cx('text-xs', passwordStatus.type === 'success' ? 'text-verdant-400' : 'text-blood-400')}>
                {passwordStatus.text}
              </p>
            )}
          </section>
        )}

        <section className="space-y-3 border-t border-white/[0.06] pt-5">
          <SectionHeader icon="fa-microscope">Diagnostics</SectionHeader>
          <div>
            <Button variant="ghost" size="sm" icon="fa-clipboard" block onClick={copyDebugLogs}>
              Copy Raw Logs (Debug)
            </Button>
            <p className="text-[10px] text-parchment-faint mt-1.5 px-1">
              Copies last chat messages, party state, and active combat data to clipboard.
            </p>
          </div>
          <div>
            <Button variant="ghost" size="sm" icon="fa-route" block onClick={replayTour}>
              Replay Onboarding Tour
            </Button>
            <p className="text-[10px] text-parchment-faint mt-1.5 px-1">Re-runs the first-session tour of the play screen.</p>
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default SettingsSheet;
