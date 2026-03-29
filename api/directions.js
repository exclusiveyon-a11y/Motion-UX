// Vercel serverless function — TMap 자동차 경로안내 API proxy
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { startX, startY, endX, endY, searchOption = "0" } = req.query;
  if (!startX || !startY || !endX || !endY) {
    return res.status(400).json({ error: "startX, startY, endX, endY are required" });
  }

  try {
    const r = await fetch("https://apis.openapi.sk.com/tmap/routes?version=1&format=json", {
      method: "POST",
      headers: {
        "appKey": "jd4lOOp2nI2dHWR4Rb2vE20d6C2fy4455wjVRVlu",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startX, startY, endX, endY,
        reqCoordType: "WGS84GEO",
        resCoordType: "WGS84GEO",
        searchOption,
      }),
    });
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
