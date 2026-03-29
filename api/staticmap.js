// Vercel serverless function — TMap Static Map API proxy
const TMAP_KEY = process.env.TMAP_APP_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!TMAP_KEY) {
    res.status(500).json({ error: "TMAP_APP_KEY is missing" });
    return;
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "appKey") continue;

    const key = k === "centerLon" ? "lon" : k === "centerLat" ? "lat" : k;

    if (Array.isArray(v)) {
      v.forEach((val) => params.append(key, String(val)));
    } else if (v != null) {
      params.append(key, String(v));
    }
  }

  const url = `https://apis.openapi.sk.com/tmap/staticMap?${params.toString()}`;

  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        appKey: TMAP_KEY,
        Accept: "image/png, image/jpeg, image/*, */*",
      },
    });

    if (!r.ok) {
      const txt = await r.text();
      console.error("TMAP staticMap error", {
        status: r.status,
        url,
        response: txt,
      });
      res.status(r.status).json({
        error: "TMAP request failed",
        status: r.status,
        details: txt,
        requestUrl: url,
      });
      return;
    }

    const ct = r.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await r.arrayBuffer());

    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    res.status(200).send(buf);
  } catch (err) {
    console.error("TMAP staticMap fetch failed", err);
    res.status(500).json({
      error: "Proxy fetch failed",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
