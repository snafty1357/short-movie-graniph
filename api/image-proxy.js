export const config = {
  maxDuration: 60,
};

// 許可するURLドメインのホワイトリスト
const ALLOWED_HOSTS = [
  'fal.media',
  'storage.googleapis.com',
  'v3.fal.media',
  'queue.fal.run',
  'fal.run',
];

export default async function handler(req, res) {
  // CORS headers
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN 
    ? process.env.CORS_ALLOWED_ORIGIN 
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // SSRF対策: URLのホストがホワイトリストに含まれるか検証
  try {
    const parsedUrl = new URL(url);
    const isAllowed = ALLOWED_HOSTS.some(host => 
      parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host)
    );
    if (!isAllowed) {
      return res.status(403).json({ error: 'URL host not allowed', host: parsedUrl.hostname });
    }
    // HTTPSのみ許可
    if (parsedUrl.protocol !== 'https:') {
      return res.status(403).json({ error: 'Only HTTPS URLs are allowed' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Convert arrayBuffer to Buffer for Vercel sending binary data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Optionally set cache control to keep images cached at the edge
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[Image Proxy] Error:', error.message);
    return res.status(500).json({ error: 'Image Fetch Error', details: error.message });
  }
}
