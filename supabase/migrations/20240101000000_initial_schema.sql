CREATE TABLE IF NOT EXISTS campaigns (
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
