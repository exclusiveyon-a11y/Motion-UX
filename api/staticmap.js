// Vercel serverless function — Kakao Static Map API proxy
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (Array.isArray(v)) v.forEach(val => params.append(k, val));
    else params.append(k, v);
  }

  const url = `https://dapi.kakao.com/v2/maps/staticmap?${params.toString()}`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: "KakaoAK 1c79839beae0f45c97b4f08e2adeddd5" },
    });
    const ct = r.headers.get("content-type") || "image/png";
    res.setHeader("Content-Type", ct);
    const buf = await r.arrayBuffer();
    res.status(r.status).send(Buffer.from(buf));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
