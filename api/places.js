export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`;
  try {
    const r = await fetch(url, { headers: { Authorization: "KakaoAK 1c79839beae0f45c97b4f08e2adeddd5" } });
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
