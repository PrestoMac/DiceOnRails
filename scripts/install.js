import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

console.log(chalk.green.bold('\n🗡️  DiceOnRails Installer 🛡️\n'));



async function main() {
    try {
        let supabaseUrl = '';
        let supabaseKey = '';

        if (fs.existsSync(envPath)) {
            console.log(chalk.yellow('Found existing .env file.'));
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: 'Do you want to overwrite the existing .env file?',
                    default: false,
                },
            ]);

            if (!overwrite) {
                console.log(chalk.blue('Skipping .env configuration...'));
                dotenv.config({ path: envPath });
                supabaseUrl = process.env.VITE_SUPABASE_URL;
                supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
                await setupDatabase(supabaseUrl, supabaseKey);
                await finalizeSetup();
                return;
            }
        }



        console.log(chalk.cyan('Please provide the following configuration:\n'));

        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'VITE_LLM_API_KEY',
                message: 'AI API Key (OpenRouter or OpenAI):',
                validate: input => input ? true : 'API Key is required',
            },
            {
                type: 'input',
                name: 'VITE_IMAGE_ROUTER_API_KEY',
                message: 'Image Router API Key:',
                default: '',
            },
            {
                type: 'input',
                name: 'VITE_SUPABASE_URL',
                message: 'Supabase URL:',
                validate: input => input.startsWith('http') ? true : 'Must be a valid URL starting with http/https',
            },
            {
                type: 'input',
                name: 'VITE_SUPABASE_ANON_KEY',
                message: 'Supabase Anon Key:',
                validate: input => input ? true : 'Key is required',
            }
        ]);

        supabaseUrl = answers.VITE_SUPABASE_URL;
        supabaseKey = answers.VITE_SUPABASE_ANON_KEY;

        let envContent = '';
        envContent += `VITE_LLM_API_KEY=${answers.VITE_LLM_API_KEY}\n`;
        envContent += `VITE_LLM_API_BASE=https://openrouter.ai/api/v1\n`;
        envContent += `VITE_IMAGE_ROUTER_API_KEY=${answers.VITE_IMAGE_ROUTER_API_KEY}\n`;
        envContent += `VITE_SUPABASE_URL=${supabaseUrl}\n`;
        envContent += `VITE_SUPABASE_ANON_KEY=${supabaseKey}\n`;
        envContent += `VITE_LLM_MODEL=deepseek/deepseek-v4-flash\n`;
        envContent += `VITE_IMAGE_MODEL=stabilityai/sdxl-turbo\n`;

        fs.writeFileSync(envPath, envContent);
        console.log(chalk.green('✔ .env file created successfully!\n'));

        await setupDatabase(supabaseUrl, supabaseKey);

        await finalizeSetup();

    } catch (error) {
        console.error(chalk.red('\n❌ Error during installation:'), error.message);
        process.exit(1);
    }
}

async function finalizeSetup() {
    console.log(chalk.cyan('\n-----------------------------------'));
    console.log(chalk.cyan('Checking dependencies...'));

    if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
        console.log(chalk.yellow('node_modules not found. Installing dependencies...'));
        try {
            execSync('npm install', { stdio: 'inherit', cwd: rootDir });
            console.log(chalk.green('✔ Dependencies installed.'));
        } catch (e) {
            console.error(chalk.red('Failed to install dependencies. Please run npm install manually.'));
        }
    } else {
        console.log(chalk.green('✔ Dependencies appear to be installed.'));
    }

    const { startApp } = await inquirer.prompt([{
        type: 'confirm',
        name: 'startApp',
        message: 'Do you want to start the app now?',
        default: true
    }]);

    if (startApp) {
        console.log(chalk.magenta('🚀 Launching DiceOnRails...'));
        try {
            const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
            const child = spawn(npmCmd, ['run', 'dev'], { cwd: rootDir, stdio: 'inherit' });

            child.on('error', (err) => {
                console.error(chalk.red('Failed to start app:'), err);
            });
        } catch (e) {
            console.error(chalk.red('Error launching app:'), e);
        }
    } else {
        console.log(chalk.green('Setup complete! Run `npm run dev` to start.'));
    }
}

async function setupDatabase(url, key) {
    if (!url || !key) {
        if (!process.env.VITE_SUPABASE_URL) dotenv.config({ path: envPath });
        url = url || process.env.VITE_SUPABASE_URL;
        key = key || process.env.VITE_SUPABASE_ANON_KEY;
    }

    if (!url || !key) {
        console.log(chalk.red('Missing Supabase credentials. Cannot verify connection.'));
        return;
    }

    console.log(chalk.blue('Testing Supabase connection...'));
    const supabase = createClient(url, key);

    try {
        const { error: campaignsError } = await supabase.from('campaigns').select('count', { count: 'exact', head: true });
        const { error: savesError } = await supabase.from('game_saves').select('count', { count: 'exact', head: true });
        const { error: itemsError } = await supabase.from('srd_items').select('count', { count: 'exact', head: true });

        if (campaignsError || savesError || itemsError) {
            console.log(chalk.red(`Database setup incomplete or connection failed.`));
            if (campaignsError) console.log(chalk.red(`• "campaigns" table check: ${campaignsError.message}`));
            if (savesError) console.log(chalk.red(`• "game_saves" table check: ${savesError.message}`));
            if (itemsError) console.log(chalk.red(`• "srd_items" table check: ${itemsError.message}`));

            const { trySetup } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'trySetup',
                    message: 'It looks like some required tables are missing. Show SQL to create the database tables?',
                    default: true
                }
            ]);

            if (trySetup) {
                console.log(chalk.yellow('\nPlease run this SQL in your Supabase SQL Editor:'));
                console.log(chalk.gray('----------------------------------------------------------------'));
                console.log(chalk.white(`
-- 1. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL, 
    name TEXT NOT NULL,
    game_state JSONB DEFAULT '{}'::jsonb,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public view" ON campaigns FOR SELECT USING (true);
CREATE POLICY "Public update" ON campaigns FOR UPDATE USING (true);
CREATE POLICY "Public insert" ON campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Host delete" ON campaigns FOR DELETE USING (auth.uid() = host_id);


-- 2. Legacy Game Saves Table
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


-- 3. SRD Items Table
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
CREATE POLICY "Public delete" ON srd_items FOR DELETE USING (true);


-- 4. Progression Helpers (optional — query XP, levels, and stat points from JSONB game_state)
CREATE OR REPLACE FUNCTION get_character_xp(game_state JSONB, character_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE((party_item->>'experience')::INTEGER, 0)
  FROM jsonb_array_elements(game_state->'party') AS party_item
  WHERE party_item->>'id' = character_id;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_character_level(game_state JSONB, character_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE((party_item->>'level')::INTEGER, 1)
  FROM jsonb_array_elements(game_state->'party') AS party_item
  WHERE party_item->>'id' = character_id;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_character_unused_points(game_state JSONB, character_id TEXT)
RETURNS INTEGER AS $$
  SELECT COALESCE((party_item->>'unusedStatPoints')::INTEGER, 0)
  FROM jsonb_array_elements(game_state->'party') AS party_item
  WHERE party_item->>'id' = character_id;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE VIEW campaign_party_progression AS
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  c.host_id,
  c.created_at,
  p.name AS character_name,
  p.class AS character_class,
  p.race AS character_race,
  COALESCE((p.level)::INTEGER, 1) AS character_level,
  COALESCE((p.experience)::INTEGER, 0) AS character_xp,
  COALESCE((p."experienceToNextLevel")::INTEGER, 300) AS xp_to_next,
  COALESCE((p."unusedStatPoints")::INTEGER, 0) AS unused_stat_points,
  (p."hp")->>'current' AS hp_current,
  (p."hp")->>'max' AS hp_max
FROM campaigns c,
  jsonb_to_recordset(c.game_state->'party') AS p(
    id TEXT, name TEXT, class TEXT, race TEXT, level INTEGER,
    experience INTEGER, "experienceToNextLevel" INTEGER, "unusedStatPoints" INTEGER,
    hp JSONB
  );
                `));
                console.log(chalk.gray('----------------------------------------------------------------\n'));
                console.log(chalk.cyan('After running the SQL above, run the seeding script to populate items:'));
                console.log(chalk.white('   npm run seed-items\n'));
            }
        } else {
            console.log(chalk.green('✔ Connection successful and all tables exist.'));
            
            const { data } = await supabase.from('srd_items').select('count', { count: 'exact', head: true });
            if (data && data.count === 0) {
                console.log(chalk.yellow('Global items database is empty. Auto-seeding...'));
                try {
                    execSync('node scripts/seed_items.js', { stdio: 'inherit', cwd: rootDir });
                    console.log(chalk.green('✔ Seeding complete!'));
                } catch (e) {
                    console.log(chalk.red('Failed to auto-seed. You can run "node scripts/seed_items.js" manually.'));
                }
            }
        }

    } catch (e) {
        console.error(chalk.red('Unexpected error connecting to Supabase:'), e);
    }
}

main();
