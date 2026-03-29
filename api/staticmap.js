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
  let hasCoordType = false;
  let hasMarkers = false;

  const normalizeMarkerValue = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const [lon, lat] = parts;
      return `${lat},${lon}`;
    }

    return String(raw);
  };

  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === "appKey") continue;

    const key =
      k === "centerLon"
        ? "lon"
        : k === "centerLat"
          ? "lat"
          : k === "marker1"
            ? "markers"
            : k;

    if (key === "coordType") hasCoordType = true;
    if (key === "markers") hasMarkers = true;

    if (Array.isArray(v)) {
      v.forEach((val) => {
        const value = key === "markers" ? normalizeMarkerValue(val) : String(val);
        params.append(key, value);
      });
    } else if (v != null) {
      const value = key === "markers" ? normalizeMarkerValue(v) : String(v);
      params.append(key, value);
    }
  }

  if (!hasCoordType) {
    params.append("coordType", "WGS84GEO");
  }

  if (!hasMarkers) {
    const lon = req.query?.centerLon ?? req.query?.lon;
    const lat = req.query?.centerLat ?? req.query?.lat;
    if (lon != null && lat != null) {
      params.append("markers", `${lat},${lon}`);
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
        tip: "TMap StaticMap expects lon/lat for center and markers in lat,lon order.",
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
