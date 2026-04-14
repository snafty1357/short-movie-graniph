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
      server.middlewares.use('/api/gemini', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
           res.statusCode = 500;
           res.end(JSON.stringify({ error: { message: 'GEMINI_API_KEY is not configured' } }));
           return;
        }

        let body = '';
        await new Promise<void>((resolve) => {
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => resolve());
        });

        try {
          const reqBody = JSON.parse(body);
          const { messages, system_instruction } = reqBody;
          
          let systemText = "";
          const contents = [];
          for (const msg of messages) {
            if (msg.role === 'system') {
              systemText += msg.content + "\\n";
            } else {
              contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
            }
          }
          
          const requestBody: any = {
            contents,
            generationConfig: {
              temperature: reqBody.temperature || 0.7,
              maxOutputTokens: reqBody.max_tokens || 4000
            }
          };
          if (systemText || system_instruction) {
            requestBody.systemInstruction = { parts: [{ text: system_instruction || systemText }] };
          }

          const modelName = reqBody.model || 'gemini-2.5-flash';
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          const data: any = await response.json();
          if (!response.ok) {
            res.statusCode = response.status;
            res.end(JSON.stringify({ error: { message: data.error?.message || 'Gemini API Error' } }));
            return;
          }

          const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ choices: [{ message: { content: textOutput } }] }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { message: err.message } }));
        }
      });

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
        },
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost');
            const model = url.searchParams.get('model') || 'gemini-2.5-flash';
            return `/v1beta/models/${model}:generateContent`;
          },
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, _req) => {
              const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
              if (apiKey) {
                proxyReq.path = proxyReq.path + `?key=${apiKey}`;
              }
            });
            
            // To make gemini behave like OpenAI format, we would need to proxyRes
            // But since body transformation is hard in http-proxy, it's better to NOT use direct proxy 
            // for Claude and Gemini, and instead fix local dev to use a simple express server or just 
            // handle it in the frontend! 
            // WAIT. If I handle mapping in the frontend, I DO NOT need proxy body modification! 
            // I should handle text -> OpenAI format mapping in the FRONTEND or use Vercel Serverless!
            // Actually, wait, does the frontend currently send standard OpenAI bodies? Yes.
            // If I just route them via frontend directly without Vercel in local, then CORS applies!
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
