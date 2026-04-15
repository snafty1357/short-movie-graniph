/**
 * Vercel Serverless Function: Fal.ai Proxy
 * CORS回避のためにFal.aiへのリクエストを中継
 */

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.VITE_FAL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'VITE_FAL_KEY is not configured' });
  }

  const { path, host, url: fullUrl } = req.query;
  
  let targetUrl;
  
  if (fullUrl) {
    targetUrl = fullUrl;
  } else if (path) {
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    let targetHost = 'queue.fal.run';
    if (host === 'fal.run') targetHost = 'fal.run';
    targetUrl = `https://${targetHost}/${cleanPath}`;
  } else {
    return res.status(400).json({ error: 'Missing path or url parameter' });
  }

  console.log(`[Proxy] ${req.method} -> ${targetUrl}`);

  try {
    const fetchOptions = {
      method: req.method || 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Accept': 'application/json',
      },
    };

    if (req.method === 'POST' || req.method === 'PUT') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      if (req.body) {
        fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    return res.status(500).json({ error: 'Proxy Error', details: error.message });
  }
}
