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

        const urlParsed = new URL(req.url || '', `http://${req.headers.host}`);
        const path = urlParsed.searchParams.get('path');
        const host = urlParsed.searchParams.get('host');
        const fullUrl = urlParsed.searchParams.get('url');

        let targetUrl;

        if (fullUrl) {
          targetUrl = fullUrl;
        } else if (path) {
          const cleanPath = path.startsWith('/') ? path.substring(1) : path;
          let targetHost = 'queue.fal.run';
          if (host === 'fal.run') targetHost = 'fal.run';
          targetUrl = `https://${targetHost}/${cleanPath}`;
        } else {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing path or url parameter' }));
          return;
        }

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

function aiProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/claude', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        const apiKey = env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY;
        if (!apiKey) {
           res.statusCode = 500;
           res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY is not configured' } }));
           return;
        }

        let body = '';
        await new Promise<void>((resolve) => {
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => resolve());
        });

        try {
          const reqBody = JSON.parse(body);
          const { messages, model, max_tokens, temperature } = reqBody;
          
          let systemText = "";
          const claudeMessages = [];
          for (const msg of messages) {
            if (msg.role === 'system') {
              systemText += msg.content + "\\n";
            } else {
              claudeMessages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
            }
          }

          const requestBody: any = {
            model: model || 'claude-3-7-sonnet-20250219',
            max_tokens: max_tokens || 4000,
            temperature: temperature || 0.7,
            messages: claudeMessages,
          };
          if (systemText) requestBody.system = systemText;

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody),
          });

          const data: any = await response.json();
          if (!response.ok) {
            res.statusCode = response.status;
            res.end(JSON.stringify({ error: { message: data.error?.message || 'Claude API Error' } }));
            return;
          }

          const textOutput = data.content?.[0]?.text || "";
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ choices: [{ message: { content: textOutput } }] }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { message: err.message } }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Load env from .env files AND process.env (Vercel injects vars to process.env)
  const fileEnv = loadEnv(mode, (process as any).cwd(), '')
  const env = { ...process.env, ...fileEnv } as Record<string, string>

  return {
    server: {
      proxy: {
        '/api/openai': {
          target: 'https://api.openai.com/v1/chat/completions',
          changeOrigin: true,
          rewrite: () => '',
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const apiKey = env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY;
              if (apiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
              }
            });
          }
        }
      }
    },
    plugins: [
      react(),
      falProxyPlugin(env),
      aiProxyPlugin(env),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      'process.env.VITE_FAL_KEY': JSON.stringify(env.VITE_FAL_KEY),
      'process.env': {},
    },
    // Explicitly expose VITE_ environment variables
    envPrefix: ['VITE_']
  }
})
