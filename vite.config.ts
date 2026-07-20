import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Vite configuration. Enables React, conditionally activates setup-mode middleware, configures the LLM API proxy, sets path aliases, and splits vendor chunks. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  
  let isSetupMode = process.env.VITE_SETUP_MODE === 'true';
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    if (content.includes('VITE_SUPABASE_URL')) {
      console.log('🔹 .env found and valid. Disabling Setup Mode.');
      isSetupMode = false;
    }
  }

  const proxyConfig = {
    '/api': {
      target: env.VITE_LLM_PROXY_TARGET || env.VITE_LLM_API_BASE || 'https://opencode.ai/zen/go/v1',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  };
  return {
    appType: 'spa',
    server: { port: 3000, host: '0.0.0.0', proxy: proxyConfig },
    preview: { port: 3000, host: '0.0.0.0', proxy: proxyConfig },
    plugins: [
      react(),
      {
        name: 'configure-setup-server',
        configureServer(server) {
          
          if (isSetupMode) {
            console.log('🔹 Setup mode active. listening for /__setup/save...');


            server.middlewares.use('/__setup/save', async (req, res) => {
              console.log(`🔹 [SetupMiddleware] Received ${req.method} request`);
              if (req.method === 'POST') {
                const chunks = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', () => {
                  const body = Buffer.concat(chunks).toString();
                  try {
                    const data = JSON.parse(body);
                    
                    

                    let envContent = '';
                    envContent += `VITE_LLM_API_KEY=${data.VITE_LLM_API_KEY || ''}\n`;
                    envContent += `VITE_LLM_API_BASE=${data.VITE_LLM_API_BASE || 'https://openrouter.ai/api/v1'}\n`;
                    envContent += `VITE_IMAGE_ROUTER_API_KEY=${data.VITE_IMAGE_ROUTER_API_KEY || ''}\n`;
                    envContent += `VITE_SUPABASE_URL=${data.VITE_SUPABASE_URL}\n`;
                    envContent += `VITE_SUPABASE_ANON_KEY=${data.VITE_SUPABASE_ANON_KEY}\n`;
                    envContent += `VITE_LLM_MODEL=${data.VITE_LLM_MODEL || 'deepseek/deepseek-v4-flash'}\n`;
                    envContent += `VITE_IMAGE_MODEL=${data.VITE_IMAGE_MODEL || 'stabilityai/sdxl-turbo'}\n`;

                    fs.writeFileSync(envPath, envContent);
                    res.statusCode = 200;
                    res.end(JSON.stringify({ success: true }));

                  } catch (e) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ success: false, error: e.message }));
                  }
                });
              } else {
                res.statusCode = 405;
                res.end();
              }
            });
          }
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      
      'import.meta.env.VITE_SETUP_MODE': JSON.stringify(isSetupMode ? 'true' : 'false')
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-vercel': ['@vercel/analytics', '@vercel/speed-insights'],
            'vendor-ui': ['react-markdown'],
          }
        }
      }
    }
  };
});
