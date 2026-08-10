import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Screen from '../primitives/Screen';
import Button from '../primitives/Button';
import ProgressRail from '../primitives/ProgressRail';
import { TextField } from '../primitives/Field';
import { useToastV2 } from '../primitives/Toast';
import { cx } from '../primitives/cx';

/** SQL required to provision the Supabase project (verbatim from the legacy SetupWizard). */
const SQL = `CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL,
    name TEXT NOT NULL,
    game_state JSONB DEFAULT '{}'::jsonb,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public view" ON campaigns FOR SELECT USING (true);
CREATE POLICY "Public update" ON campaigns FOR UPDATE USING (true);
CREATE POLICY "Public insert" ON campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Host delete" ON campaigns FOR DELETE USING (auth.uid() = host_id);

CREATE TABLE IF NOT EXISTS game_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    campaign_id TEXT,
    game_state JSONB DEFAULT '{}'::jsonb,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE game_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own saves" ON game_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own saves" ON game_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own saves" ON game_saves FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS srd_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    rarity TEXT NOT NULL,
    description TEXT NOT NULL,
    weight NUMERIC DEFAULT 0,
    cost TEXT DEFAULT '0 gp',
    stats JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE srd_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public select" ON srd_items FOR SELECT USING (true);
CREATE POLICY "Public insert" ON srd_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON srd_items FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON srd_items FOR DELETE USING (true);`;

const REQUIRED_TABLES: readonly string[] = ['campaigns', 'game_saves', 'srd_items'];
const DEFAULT_LLM_BASE = 'https://openrouter.ai/api/v1';

type SetupStep = 'keys' | 'database' | 'launch';

interface SetupConfig {
  VITE_LLM_API_KEY: string;
  VITE_LLM_API_BASE: string;
  VITE_IMAGE_ROUTER_API_KEY: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
}

interface DbTestState {
  kind: 'idle' | 'testing' | 'ok' | 'missing';
  missingTables: string[];
  error?: string;
}

/** A table exists unless the probe surfaces a "relation does not exist" (or any) error — legacy SetupWizard logic. */
const isTableProbeError = (err: { code?: string; message?: string } | null): boolean => {
  if (err?.code === '42P01' || err?.message?.toLowerCase().includes('does not exist')) return true;
  if (err) return true;
  return false;
};

const mask = (value: string): string => (value.length > 4 ? `••••••${value.slice(-4)}` : '••••••');

const SummaryRow: React.FC<{ label: string; value: string; tone?: 'ok' | 'mute' }> = ({ label, value, tone = 'ok' }) => (
  <div className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.05] last:border-b-0">
    <span className="text-xs font-display font-semibold uppercase tracking-[0.15em] text-parchment-mute">{label}</span>
    <span className={cx('text-sm text-right truncate max-w-[60%]', tone === 'ok' ? 'text-parchment' : 'text-parchment-faint')}>
      {value}
    </span>
  </div>
);

/** V2 three-step setup wizard: API keys → database verification → save & launch. */
const SetupScreen: React.FC = () => {
  const { toast } = useToastV2();
  const [step, setStep] = useState<SetupStep>('keys');
  const [config, setConfig] = useState<SetupConfig>({
    VITE_LLM_API_KEY: '',
    VITE_LLM_API_BASE: DEFAULT_LLM_BASE,
    VITE_IMAGE_ROUTER_API_KEY: '',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
  });
  const [keyError, setKeyError] = useState<string | null>(null);
  const [dbTest, setDbTest] = useState<DbTestState>({ kind: 'idle', missingTables: [] });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateConfig = (name: keyof SetupConfig) => (value: string) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
    if (name === 'VITE_LLM_API_KEY' && value.trim()) setKeyError(null);
    if (name === 'VITE_SUPABASE_URL' || name === 'VITE_SUPABASE_ANON_KEY') setDbTest({ kind: 'idle', missingTables: [] });
  };

  const stepIndex = step === 'keys' ? 0 : step === 'database' ? 1 : 2;

  const goNextFromKeys = () => {
    if (!config.VITE_LLM_API_KEY.trim()) {
      setKeyError('An LLM API key is required to power the Game Master.');
      return;
    }
    setKeyError(null);
    setStep('database');
  };

  const testSupabase = async () => {
    if (!config.VITE_SUPABASE_URL.trim() || !config.VITE_SUPABASE_ANON_KEY.trim()) {
      setDbTest({ kind: 'idle', missingTables: [], error: 'Missing Supabase URL or Anon Key.' });
      return;
    }
    setDbTest({ kind: 'testing', missingTables: [] });
    try {
      const supabase = createClient(config.VITE_SUPABASE_URL.trim(), config.VITE_SUPABASE_ANON_KEY.trim());
      const missing: string[] = [];
      for (const table of REQUIRED_TABLES) {
        const { error: err } = await supabase.from(table).select('id').limit(1);
        if (isTableProbeError(err)) missing.push(table);
      }
      if (missing.length > 0) {
        setDbTest({ kind: 'missing', missingTables: missing });
      } else {
        setDbTest({ kind: 'ok', missingTables: [] });
      }
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.message?.includes('does not exist') || err.code === '42P01') {
        setDbTest({ kind: 'missing', missingTables: [...REQUIRED_TABLES] });
      } else {
        setDbTest({ kind: 'idle', missingTables: [], error: err.message });
      }
    }
  };

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SQL);
      toast('Setup SQL copied to clipboard.', 'success');
    } catch {
      toast('Could not copy the SQL — select and copy it manually.', 'error');
    }
  };

  const saveConfig = async () => {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const res = await fetch('/__setup/save', {
        method: 'POST',
        body: JSON.stringify(config),
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setSaveStatus('saved');
        toast('Configuration saved. Restarting the realm…', 'success');
        window.setTimeout(() => window.location.reload(), 2000);
      } else {
        let msg = 'Failed to save configuration';
        try {
          const d = (await res.json()) as { error?: string } | null;
          if (d?.error) msg = d.error;
        } catch {
          msg = `Server returned ${res.status}: ${res.statusText}`;
        }
        throw new Error(msg);
      }
    } catch (e: unknown) {
      const message = (e as Error).message;
      setSaveStatus('idle');
      setSaveError(message);
      toast(message, 'error');
    }
  };

  const railSteps = [
    { key: 'keys', label: 'API Keys', icon: 'fa-key', done: stepIndex > 0 },
    { key: 'database', label: 'Database', icon: 'fa-database', done: stepIndex > 1 },
    { key: 'launch', label: 'Launch', icon: 'fa-rocket', done: false },
  ];

  return (
    <Screen center>
      <div className="w-full max-h-[100dvh] overflow-y-auto v2-scrollbar px-4 py-10">
        <div className="w-full max-w-lg mx-auto bg-obsidian-900/70 border border-white/[0.06] rounded-2xl p-6 md:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-1">
              <span className="text-ember-500">Dice</span>
              <span className="text-parchment"> On Rails</span>
            </h1>
            <p className="font-display text-[11px] uppercase tracking-[0.25em] text-parchment-mute">Realm Setup</p>
          </div>

          <ProgressRail
            className="mb-6"
            orientation="top"
            currentKey={step}
            steps={railSteps}
            onJump={(key) => setStep(key as SetupStep)}
          />

          {step === 'keys' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <p className="text-sm text-parchment-dim">
                Let us configure your adventure. Enter your AI API key below.
              </p>
              <p className="text-xs text-parchment-mute">
                Default provider is <strong className="text-parchment-dim">OpenRouter</strong> (you can change this later in
                Settings). Get a free key at{' '}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-ember-400 hover:text-ember-300 hover:underline"
                >
                  openrouter.ai/keys
                </a>
                .
              </p>
              <TextField
                label="LLM API Key"
                type="password"
                icon="fa-key"
                placeholder="sk-or-v1-... or sk-proj-..."
                value={config.VITE_LLM_API_KEY}
                onChange={updateConfig('VITE_LLM_API_KEY')}
                error={keyError ?? undefined}
                hint="Required. Never leaves your machine except to call the model provider."
              />
              <TextField
                label="LLM API Base"
                icon="fa-server"
                placeholder={DEFAULT_LLM_BASE}
                value={config.VITE_LLM_API_BASE}
                onChange={updateConfig('VITE_LLM_API_BASE')}
                hint="Optional. Leave as the OpenRouter default unless you self-host."
              />
              <TextField
                label="Image Router API Key"
                type="password"
                icon="fa-image"
                value={config.VITE_IMAGE_ROUTER_API_KEY}
                onChange={updateConfig('VITE_IMAGE_ROUTER_API_KEY')}
                hint="Optional. Enables generated atmosphere art and character portraits."
              />
              <div className="pt-2 flex justify-end">
                <Button icon="fa-arrow-right" onClick={goNextFromKeys}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'database' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div>
                <h2 className="font-display text-lg font-bold text-parchment tracking-wider">Database Connection</h2>
                <p className="text-sm text-parchment-dim mt-1">Connect to your Supabase project.</p>
              </div>
              <TextField
                label="Supabase URL"
                icon="fa-link"
                placeholder="https://xyz.supabase.co"
                value={config.VITE_SUPABASE_URL}
                onChange={updateConfig('VITE_SUPABASE_URL')}
              />
              <TextField
                label="Supabase Anon Key"
                type="password"
                icon="fa-lock"
                value={config.VITE_SUPABASE_ANON_KEY}
                onChange={updateConfig('VITE_SUPABASE_ANON_KEY')}
              />

              {dbTest.kind === 'testing' && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-frost-500/40 bg-frost-900/20 text-frost-300 text-sm animate-fade-in">
                  <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />
                  Testing connection…
                </div>
              )}
              {dbTest.kind === 'ok' && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-verdant-500/40 bg-verdant-950/40 text-verdant-300 text-sm animate-fade-in">
                  <i className="fas fa-circle-check" aria-hidden="true" />
                  Connection successful! All required tables verified.
                </div>
              )}
              {dbTest.error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-blood-500/40 bg-blood-950/40 text-blood-300 text-sm animate-fade-in">
                  <i className="fas fa-circle-exclamation" aria-hidden="true" />
                  {dbTest.error}
                </div>
              )}
              {dbTest.kind === 'missing' && (
                <div className="p-4 rounded-lg border border-ember-500/40 bg-ember-950/20 animate-fade-in">
                  <p className="text-ember-400 text-sm font-display font-semibold uppercase tracking-wider mb-2">
                    <i className="fas fa-triangle-exclamation mr-1.5" aria-hidden="true" />
                    Missing Tables Detected
                  </p>
                  <p className="text-parchment-dim text-xs mb-1 leading-relaxed">
                    The following tables were not found:{' '}
                    <span className="font-mono text-ember-300">{dbTest.missingTables.join(', ')}</span>. Run the SQL below in
                    your Supabase project to create them.
                  </p>
                  <p className="text-parchment-faint text-[10px] mb-2">
                    Copy and run this in the{' '}
                    <a
                      href="https://supabase.com/dashboard/project/_/sql"
                      target="_blank"
                      rel="noreferrer"
                      className="text-frost-400 hover:underline"
                    >
                      Supabase SQL Editor
                    </a>
                    , then test again.
                  </p>
                  <div className="relative">
                    <pre className="bg-obsidian-950 p-3 rounded-lg text-[10px] leading-relaxed text-parchment-mute overflow-auto v2-scrollbar max-h-44 border border-white/[0.08]">
                      {SQL}
                    </pre>
                    <Button
                      variant="subtle"
                      size="sm"
                      icon="fa-copy"
                      className="absolute top-2 right-2"
                      onClick={() => void copySql()}
                    >
                      Copy SQL
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-2">
                <Button variant="ghost" icon="fa-arrow-left" onClick={() => setStep('keys')}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="subtle"
                    icon="fa-plug"
                    loading={dbTest.kind === 'testing'}
                    onClick={() => void testSupabase()}
                  >
                    Test Connection
                  </Button>
                  <Button
                    icon="fa-arrow-right"
                    disabled={dbTest.kind !== 'ok'}
                    title={dbTest.kind === 'ok' ? 'Continue to launch' : 'Verify the database connection first'}
                    onClick={() => setStep('launch')}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'launch' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div>
                <h2 className="font-display text-lg font-bold text-parchment tracking-wider">Ready to Launch</h2>
                <p className="text-sm text-parchment-dim mt-1">Review your configuration, then save and restart.</p>
              </div>
              <div className="bg-obsidian-950/60 border border-white/[0.06] rounded-xl px-4 py-2">
                <SummaryRow label="LLM API Key" value={mask(config.VITE_LLM_API_KEY.trim())} />
                <SummaryRow label="LLM API Base" value={config.VITE_LLM_API_BASE.trim() || DEFAULT_LLM_BASE} />
                <SummaryRow
                  label="Image Router Key"
                  value={config.VITE_IMAGE_ROUTER_API_KEY.trim() ? mask(config.VITE_IMAGE_ROUTER_API_KEY.trim()) : 'Not set — visuals disabled'}
                  tone={config.VITE_IMAGE_ROUTER_API_KEY.trim() ? 'ok' : 'mute'}
                />
                <SummaryRow label="Supabase URL" value={config.VITE_SUPABASE_URL.trim()} />
                <SummaryRow
                  label="Database Tables"
                  value={dbTest.kind === 'ok' ? 'Verified' : 'Not verified'}
                  tone={dbTest.kind === 'ok' ? 'ok' : 'mute'}
                />
              </div>
              {saveStatus === 'saved' && (
                <div className="p-3 rounded-lg border border-verdant-500/40 bg-verdant-950/40 text-verdant-300 text-sm text-center animate-fade-in">
                  <i className="fas fa-circle-check mr-1.5" aria-hidden="true" />
                  Configuration saved! Restarting…
                  <span className="block text-[10px] text-verdant-400/70 mt-1">
                    Check your terminal if the reload does not happen automatically.
                  </span>
                </div>
              )}
              {saveError && (
                <div className="p-3 rounded-lg border border-blood-500/40 bg-blood-950/40 text-blood-300 text-sm text-center animate-fade-in">
                  {saveError}
                </div>
              )}
              <div className="pt-2 flex items-center justify-between gap-2">
                <Button variant="ghost" icon="fa-arrow-left" onClick={() => setStep('database')} disabled={saveStatus !== 'idle'}>
                  Back
                </Button>
                <Button
                  icon="fa-rocket"
                  loading={saveStatus === 'saving'}
                  disabled={dbTest.kind !== 'ok' || saveStatus === 'saved'}
                  title={dbTest.kind === 'ok' ? 'Save configuration and launch the app' : 'Verify the database connection first'}
                  onClick={() => void saveConfig()}
                >
                  Save & Launch
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
};

export default SetupScreen;
