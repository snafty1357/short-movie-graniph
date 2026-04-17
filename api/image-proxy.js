export const config = {
  maxDuration: 60,
};

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
