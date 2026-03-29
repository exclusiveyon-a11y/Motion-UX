// Vercel serverless function — TMap POI 검색 API proxy
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "query is required" });

  try {
    const url = `https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(query)}&count=5&appKey=jd4lOOp2nI2dHWR4Rb2vE20d6C2fy4455wjVRVlu`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
