// Vercel serverless function — Kakao Mobility Directions API proxy
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { origin, destination, priority = "RECOMMEND" } = req.query;
  if (!origin || !destination) {
    return res.status(400).json({ error: "origin and destination are required" });
  }

  const url =
    `https://apis-navi.kakaomobility.com/v1/directions` +
    `?origin=${origin}&destination=${destination}&priority=${priority}`;

  try {
    const r = await fetch(url, {
      headers: { Authorization: "KakaoAK 1c79839beae0f45c97b4f08e2adeddd5" },
    });
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
