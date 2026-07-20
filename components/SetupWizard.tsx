import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { isDebugMode } from '../utils/debug';

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

const CONNECTED = '✅ Connection Successful! Tables Verified.';

const FormField = ({ label, name, value, onChange, type, placeholder }: {
  label: React.ReactNode; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string;
}) => (
  <div>
    <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1">{label}</label>
    <input name={name} value={value} onChange={onChange} className="w-full bg-stone-950 border border-stone-700 rounded p-2 text-stone-200 focus:border-amber-500 outline-none" type={type} placeholder={placeholder} />
  </div>
);

/** Multi-step initial setup wizard for API keys and Supabase database configuration. */
const SetupWizard: React.FC = () => {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    VITE_LLM_API_KEY: '',
    VITE_LLM_API_BASE: 'https://openrouter.ai/api/v1',
    VITE_IMAGE_ROUTER_API_KEY: '',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_ANON_KEY: '',
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setConfig({...config, [e.target.name]: e.target.value});

  const checkTable = async (supabase: { from: (table: string) => { select: (...cols: string[]) => { limit: (n: number) => Promise<{ error: { code?: string; message?: string } | null }> } } }, table: string) => {
    setStatus(`Checking table: ${table}...`);
    if (isDebugMode) console.log(`🔹 Verifying ${table} table...`);
    const { error: err } = await supabase.from(table).select('id').limit(1);
    if (isDebugMode) console.log(`🔹 ${table} Result:`, { error: err });
    if (err?.code === '42P01' || err?.message?.toLowerCase().includes('does not exist')) {
      setStatus(`⚠️ Missing table: ${table}. Tables need creation.`);
      return false;
    }
    if (err) { setStatus(`⚠️ Error checking ${table}. Tables need creation.`); return false; }
    return true;
  };

  const testSupabase = async () => {
    setStatus('Testing connection...');
    setError(null);
    try {
      if (!config.VITE_SUPABASE_URL || !config.VITE_SUPABASE_ANON_KEY) throw new Error("Missing Supabase URL or Key");
      const supabase = createClient(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_ANON_KEY);
      for (const t of ['campaigns', 'game_saves', 'srd_items']) { if (!(await checkTable(supabase, t))) return false; }
      setStatus(CONNECTED);
      return true;
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.message?.includes('does not exist') || err.code === '42P01') { setStatus('⚠️ Missing Tables Detected. Tables need creation.'); return false; }
      setError(err.message); setStatus(null); return false;
    }
  };

  const saveConfig = async () => {
    setStatus('Saving configuration...');
    try {
      const res = await fetch('/__setup/save', { method:'POST', body:JSON.stringify(config), headers:{'Content-Type':'application/json'} });
      if (res.ok) { setStatus('✅ Configuration Saved! Restarting...'); setTimeout(() => window.location.reload(), 2000); }
      else {
        let msg = "Failed to save config";
        try { const d = await res.json(); if (d?.error) msg = d.error; } catch { msg = `Server returned ${res.status}: ${res.statusText}`; }
        throw new Error(msg);
      }
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const connected = status === CONNECTED;

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center text-stone-200">
      <div className="w-full max-w-md bg-stone-900 border border-stone-800 p-8 rounded-xl shadow-2xl">
        <h1 className="text-3xl font-bold text-amber-500 mb-6 text-center fantasy-font">DiceOnRails Setup</h1>

        {step === 1 && <div className="space-y-4">
          <p className="text-sm text-stone-400 mb-4">Let's configure your adventure. Enter your AI API key below.</p>
          <p className="text-xs text-stone-500 mb-2">Default provider is <strong>OpenRouter</strong> (change later in Settings). Get a free key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-amber-500 hover:underline">openrouter.ai/keys</a>.</p>
          <FormField label="API Key" name="VITE_LLM_API_KEY" value={config.VITE_LLM_API_KEY} onChange={handleChange} type="password" placeholder="sk-or-v1-... or sk-proj-..." />
          <FormField label={<>Image Router API Key <span className="text-stone-600">(optional)</span></>} name="VITE_IMAGE_ROUTER_API_KEY" value={config.VITE_IMAGE_ROUTER_API_KEY} onChange={handleChange} type="password" />
          <div className="pt-4 flex justify-end"><button onClick={() => setStep(2)} className="bg-amber-600 hover:bg-amber-700 text-stone-950 font-bold py-2 px-6 rounded transition-colors">Next</button></div>
        </div>}

        {step === 2 && <div className="space-y-4">
          <h2 className="text-xl font-bold text-stone-100">Database Connection</h2>
          <p className="text-sm text-stone-400">Connect to your Supabase project.</p>
          <FormField label="Supabase URL" name="VITE_SUPABASE_URL" value={config.VITE_SUPABASE_URL} onChange={handleChange} placeholder="https://xyz.supabase.co" />
          <FormField label="Supabase Anon Key" name="VITE_SUPABASE_ANON_KEY" value={config.VITE_SUPABASE_ANON_KEY} onChange={handleChange} type="password" />
          {status?.includes('Tables need creation') && <div className="mt-4 p-4 bg-stone-950 border border-stone-800 rounded animate-fade-in">
            <p className="text-amber-500 text-sm font-bold mb-2">⚠️ Missing Tables Detected</p>
            <p className="text-stone-400 text-xs mb-3">The required database tables were not found. Please run the following SQL in your Supabase project to create them.</p>
            <div>
              <p className="text-stone-300 text-xs font-bold mb-1">Manual SQL</p>
              <p className="text-stone-500 text-[10px] mb-2">Copy and run this in the <a href="https://supabase.com/dashboard/project/_/sql" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Supabase SQL Editor</a>.</p>
              <div className="relative">
                <pre className="bg-stone-900 p-2 rounded text-[10px] text-stone-400 overflow-x-auto h-32 custom-scrollbar border border-stone-800">{SQL}</pre>
                <button onClick={() => navigator.clipboard.writeText(SQL)} className="absolute top-2 right-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-[10px] py-1 px-2 rounded border border-stone-600 transition-colors">Copy SQL</button>
              </div>
            </div>
          </div>}
          <div className="pt-4 flex justify-between">
            <button onClick={() => setStep(1)} className="text-stone-500 hover:text-stone-300 transition-colors">Back</button>
            <div className="space-x-2">
              <button onClick={testSupabase} className="bg-stone-800 hover:bg-stone-700 text-stone-200 py-2 px-4 rounded border border-stone-600 transition-colors">Test</button>
              <button onClick={saveConfig} className={`font-bold py-2 px-6 rounded transition-colors ${connected ? 'bg-amber-600 hover:bg-amber-700 text-stone-950' : 'bg-stone-800 text-stone-600 cursor-not-allowed border border-stone-700'}`} disabled={!connected} title={connected ? "Save configuration and launch app" : "Please verify database connection first"}>Save & Launch</button>
            </div>
          </div>
        </div>}

        {status && <div className="mt-6 p-3 bg-stone-800/50 rounded border border-stone-700 text-center text-amber-400 text-sm animate-pulse">{status}{status.includes('Restarting') && <p className="text-xs text-stone-500 mt-1">Check your terminal if reload doesn't happen automatically.</p>}</div>}
        {error && <div className="mt-6 p-3 bg-red-950/30 rounded border border-red-900 text-center text-red-500 text-sm">{error}</div>}
      </div>
    </div>
  );
};

export default SetupWizard;
