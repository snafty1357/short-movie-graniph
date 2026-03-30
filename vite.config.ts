import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * ローカル開発用: /api/proxy リクエストを Fal.ai に転送するミドルウェアプラグイン
 */
function falProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'fal-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        const apiKey = env.VITE_FAL_KEY || env.FAL_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'FAL_KEY missing in .env' }));
          return;
        }

        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const path = url.searchParams.get('path');
        const host = url.searchParams.get('host');

        if (!path) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing path parameter' }));
          return;
        }

        const cleanPath = path.startsWith('/') ? path.substring(1) : path;
        let targetHost = 'queue.fal.run';
        if (host === 'fal.run') targetHost = 'fal.run';

        const targetUrl = `https://${targetHost}/${cleanPath}`;
        console.log(`[Proxy] ${req.method} -> ${targetUrl}`);

        let body = '';
        await new Promise<void>((resolve) => {
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => resolve());
        });

        try {
          const fetchOptions: RequestInit = {
            method: req.method || 'GET',
            headers: {
              'Authorization': `Key ${apiKey}`,
              'Accept': 'application/json',
            },
          };

          if (req.method === 'POST' || req.method === 'PUT') {
            (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
            if (body) fetchOptions.body = body;
          }

          const response = await fetch(targetUrl, fetchOptions);
          const responseText = await response.text();

          let data;
          try { data = JSON.parse(responseText); }
          catch { data = { raw: responseText }; }

          if (!response.ok) {
            console.error(`[Proxy] Error ${response.status}:`, responseText.substring(0, 500));
          }

          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        } catch (error: any) {
          console.error('[Proxy] Error:', error.message);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Proxy Error', details: error.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '')

  return {
    plugins: [
      react(),
      falProxyPlugin(env),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.VITE_FAL_KEY': JSON.stringify(env.VITE_FAL_KEY),
      'process.env': {}
    }
  }
})
