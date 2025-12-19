export default async function handler(request, response) {
  const GAS_API_URL = process.env.GAS_API_URL;

  if (!GAS_API_URL) {
    return response.status(500).json({ error: 'GAS_API_URL is missing' });
  }

  try {
    const res = await fetch(GAS_API_URL);
    
    // GAS側エラーのハンドリング
    if (!res.ok) {
      return response.status(502).json({ error: `GAS returned status ${res.status}` });
    }

    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      console.error("GAS Error Response:", text);
      return response.status(502).json({ error: 'Invalid response from GAS (Not JSON)' });
    }

    const data = await res.json();
    
    // Vercel推奨のCDNキャッシュ設定
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
    
    return response.status(200).json(data);

  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Failed to connect to GAS' });
  }
}