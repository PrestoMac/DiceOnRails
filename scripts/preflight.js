import fs from 'fs';
import path from 'path';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
const nodeModulesPath = path.join(rootDir, 'node_modules');

function runNpmInstall() {
    console.log('📦 Installing dependencies...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCmd, ['install'], { stdio: 'inherit', cwd: rootDir });
    if (result.error) {
        console.error('Failed to run npm install:', result.error);
        process.exit(1);
    }
}

function checkEnv() {
    if (!fs.existsSync(envPath)) return false;
    const content = fs.readFileSync(envPath, 'utf-8');
    if (!content.includes('VITE_SUPABASE_URL')) return false;
    return true;
}

if (!fs.existsSync(nodeModulesPath)) {
    runNpmInstall();
}

if (!checkEnv()) {
    console.log('⚠️  Environment not configured.');
    console.log('🚀 Launching Web Installer...');

    const env = { ...process.env, VITE_SETUP_MODE: 'true' };

    spawn('npm', ['exec', 'vite'], { stdio: 'inherit', cwd: rootDir, shell: true, env: env });
} else {
    console.log('✅ Environment ready. Starting development server...');
    spawn('npm', ['exec', 'vite'], { stdio: 'inherit', cwd: rootDir, shell: true });
}
