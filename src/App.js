import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────
   Glide — 자율주행 호출 프로토타입
   디자인 정본: Figma "📱 Screens" (sQI9EmtFBeoDOc2hLQevXw)
   백엔드: api/directions.js, api/places.js (TMap proxy)
   ───────────────────────────────────────────────────────── */

// Figma 순서 그대로: Rush → Cruise → Glide Pure → Glide
const TIERS = [
  { key: "rush",       label: "Rush",       why: "빠른 길 우선 · 기능 없음",                color: "#A0AEC0", line: "#9CA3AF" },
  { key: "cruise",     label: "Cruise",     why: "혼잡 구간 ↓ · 큰길 위주 · 시간 균형",      color: "#E9A23B", line: "#E9A23B" },
  { key: "glide-pure", label: "Glide Pure", why: "정숙한 주행 · 정차 최소화",                color: "#5FD3B3", line: "#34C759" },
  { key: "glide",      label: "Glide",      why: "부드러운 경로 · 정체 구간 우회",          color: "#2F6FED", line: "#2F6FED" },
];

const TIER_FEATURES = {
  "rush":       ["최단 시간 우선", "법정 최고속도 운행"],
  "cruise":     ["액티브 서스펜션", "시트 각도 조절", "블라인드 개방", "실내 온도 조절"],
  "glide-pure": ["액티브 서스펜션 + 커브 틸팅", "리클라이닝 시트 90~150°", "저소음 캐빈 · 파노라마", "최고속도 사용자 조절"],
  "glide":      ["액티브 서스펜션", "시트 각도 조절", "블라인드 개방", "Glide Earpiece 제공"],
};

const MOCK_ROUTES = [
  { tier: 0, name: "최단 경로",       why: "빠른 길 우선 · 기능 없음",      time: "23분", price: "₩10,800", diff: "기본",  msdv: 72, points: [], stats: { cong: 9, alley: 4, turns: 14, express: "2.8km" } },
  { tier: 1, name: "균형 경로",       why: "혼잡 구간 ↓ · 큰길 위주",       time: "25분", price: "₩11,500", diff: "+2분", msdv: 55, points: [], stats: { cong: 5, alley: 2, turns: 9,  express: "4.1km" } },
  { tier: 2, name: "정숙 경로",       why: "정차 최소화 · 큰길 위주",       time: "29분", price: "₩13,800", diff: "+6분", msdv: 18, points: [], stats: { cong: 1, alley: 0, turns: 2,  express: "4.1km" } },
  { tier: 3, name: "멀미 저감 경로",  why: "정체 구간 우회 · 부드러운 가감속", time: "27분", price: "₩12,400", diff: "+4분", msdv: 36, points: [], stats: { cong: 2, alley: 0, turns: 4,  express: "4.1km" } },
];

const RECENTS = [
  { name: "집",       addr: "서울 서초구 서초대로 78길 24",  lat: 37.5511, lng: 126.9233, dist: 432 },
  { name: "코엑스",   addr: "서울 강남구 영동대로 513",      lat: 37.5127, lng: 127.0594, dist: 405 },
  { name: "잠실역",   addr: "서울 송파구 올림픽로 240",      lat: 37.5133, lng: 127.1001, dist: 612 },
];

/* ────────── 알고리즘 (백엔드 보존) ────────── */
const SHARP_TURNS = [12, 13, 14, 16, 17, 18, 19];

function calcMSDV(pts) {
  if (!pts || pts.length < 3) return 15;
  const stride = Math.max(1, Math.floor(pts.length / 20));
  const s = pts.filter((_, i) => i % stride === 0);
  let total = 0, sharp = 0, n = 0;
  for (let i = 1; i < s.length - 1; i++) {
    const p1=s[i-1], p2=s[i], p3=s[i+1];
    const dx1=p2.x-p1.x, dy1=p2.y-p1.y, dx2=p3.x-p2.x, dy2=p3.y-p2.y;
    const l1=Math.sqrt(dx1*dx1+dy1*dy1), l2=Math.sqrt(dx2*dx2+dy2*dy2);
    if (l1 < 1e-10 || l2 < 1e-10) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, (dx1*dx2+dy1*dy2)/(l1*l2)))) * 180/Math.PI;
    total += a; if (a > 15) sharp++; n++;
  }
  return n === 0 ? 15 : Math.min(55, Math.round((total/n)*2.5 + (sharp/n)*35));
}
function calcRouteMSDV(pts, links) {
  const geom = calcMSDV(pts);
  if (!links?.length) return geom;
  const cong  = links.filter(l => l.congestion >= 1).length;
  const alley = links.filter(l => l.roadType === 8).length;
  const turns = links.filter(l => SHARP_TURNS.includes(l.turnType)).length;
  return Math.min(95, Math.round(geom + cong*4 + alley*5 + turns*3));
}
function extractLinks(data) {
  return (data?.features || [])
    .filter(f => f.geometry?.type === "LineString")
    .map(f => ({
      distance:    f.properties?.distance || 0,
      roadType:    f.properties?.roadType ?? -1,
      congestion:  f.properties?.congestion ?? 0,
      turnType:    f.properties?.turnType ?? 11,
      name:        f.properties?.name || "",
      coords:      f.geometry.coordinates,
      isExpressway:[0,1].includes(f.properties?.roadType ?? -1),
      speedLimit:  [0,1].includes(f.properties?.roadType ?? -1) ? 100 : f.properties?.roadType === 8 ? 30 : [2,3].includes(f.properties?.roadType ?? -1) ? 80 : 60,
      curvature:   [12,13,14,16,17,18,19].includes(f.properties?.turnType ?? 11) ? 0.02 : 0.001,
    }));
}
const extractPts = data => extractLinks(data).flatMap(l => l.coords.map(c => ({ x:c[0], y:c[1] })));
const extractSum = data => {
  const props = data?.features?.[0]?.properties || {};
  return { dur: Math.round((props.totalTime||0)/60), dist: ((props.totalDistance||0)/1000).toFixed(1), fare: props.taxiFare || 10800 };
};
const speedProfiles = [
  { cruiseHighway:110, cruiseUrban:60, maxLateralAccel:3.0 },
  { cruiseHighway:100, cruiseUrban:55, maxLateralAccel:2.0 },
  { cruiseHighway:80,  cruiseUrban:45, maxLateralAccel:0.8 },
  { cruiseHighway:90,  cruiseUrban:50, maxLateralAccel:1.5 },
];
const SURFACE_GRADE_PENALTY = { 1:0, 2:3, 3:8, 4:15, 5:25 };
const TIER_SURFACE_THRESHOLD = [null, 5, 3, 4]; // rush, cruise, glide-pure, glide
function getMockSurfaceGrade(name = "") {
  if (name.includes("경부") || name.includes("서해안") || name.includes("올림픽") || name.includes("강변")) return 2;
  if (name.includes("외곽") || name.includes("순환") || name.includes("영동") || name.includes("경인") || name.includes("중부")) return 3;
  return 2;
}
function calcSurfacePenalty(links, tierIdx) {
  const thr = TIER_SURFACE_THRESHOLD[tierIdx];
  if (!thr) return 0;
  let total = 0;
  links.filter(l => l.isExpressway).forEach(l => {
    const g = getMockSurfaceGrade(l.name);
    if (g >= thr) {
      const pen = SURFACE_GRADE_PENALTY[g] ?? 0;
      const ramp = l.turnType >= 100 ? 5 : 0;
      total += (pen + ramp) * Math.min(l.distance/1000, 3);
    }
  });
  return Math.round(total);
}
function applySpeedPenalty(link, tierIdx) {
  const profile = speedProfiles[tierIdx];
  const targetSpeed = link.isExpressway ? profile.cruiseHighway : profile.cruiseUrban;
  const speedOverrun = Math.max(0, targetSpeed - link.speedLimit);
  const speedPenalty = speedOverrun * 0.3;
  const estLat = Math.pow(targetSpeed/3.6, 2) * (link.curvature ?? 0);
  const lateralPenalty = Math.max(0, estLat - profile.maxLateralAccel) * 5;
  return speedPenalty + lateralPenalty;
}

async function buildRoutes(origin, dest) {
  const p = `startX=${origin.lng}&startY=${origin.lat}&endX=${dest.lng}&endY=${dest.lat}`;
  const [td, rd] = await Promise.all([
    fetch(`/api/directions?${p}&searchOption=0`).then(r => r.json()),
    fetch(`/api/directions?${p}&searchOption=2`).then(r => r.json()),
  ]);
  const tLinks = extractLinks(td), rLinks = extractLinks(rd);
  const tp = extractPts(td), rp = extractPts(rd);
  const ts = extractSum(td), rs = extractSum(rd);
  const rawT = calcRouteMSDV(tp, tLinks);
  const rawR = calcRouteMSDV(rp, rLinks);
  const rawTSurf = Math.min(95, rawT + calcSurfacePenalty(tLinks, 1));
  const tSpeed = Math.min(12, Math.round(tLinks.reduce((s,l)=>s+applySpeedPenalty(l,0),0)));
  const rSpeed = Math.min(6,  Math.round(rLinks.reduce((s,l)=>s+applySpeedPenalty(l,1),0)));
  const rm = Math.max(rawR, 35);
  const tm = Math.min(95, Math.max(rawTSurf + tSpeed, rm + 20, 55));
  const tStats = {
    cong: tLinks.filter(l=>l.congestion>=1).length,
    alley: tLinks.filter(l=>l.roadType===8).length,
    turns: tLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length,
    express: `${(tLinks.filter(l=>l.isExpressway).reduce((s,l)=>s+l.distance,0)/1000).toFixed(1)}km`,
  };
  const rStats = {
    cong: rLinks.filter(l=>l.congestion>=1).length,
    alley: rLinks.filter(l=>l.roadType===8).length,
    turns: rLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length,
    express: `${(rLinks.filter(l=>l.isExpressway).reduce((s,l)=>s+l.distance,0)/1000).toFixed(1)}km`,
  };

  const B = ts.fare;
  const f = n => `₩${Math.round(n).toLocaleString()}`;
  const dm = m => m <= 0 ? "기본" : `+${m}분`;
  const bm = ts.dur;
  // Order matches TIERS: Rush, Cruise, Glide Pure, Glide
  return [
    { tier:0, name:"최단 경로",      why:"빠른 길 우선 · 기능 없음",         time:`${ts.dur}분`,   price:f(B),       diff:"기본",            msdv:tm,                                   points:tp, stats:tStats },
    { tier:1, name:"균형 경로",      why:"혼잡 구간 ↓ · 큰길 위주",          time:`${rs.dur}분`,   price:f(B*1.06),  diff:dm(rs.dur-bm),     msdv:Math.min(95, rm+rSpeed),              points:rp, stats:rStats },
    { tier:2, name:"정숙 경로",      why:"정차 최소화 · 정숙한 주행",        time:`${rs.dur+4}분`, price:f(B*1.28),  diff:dm(rs.dur+4-bm),   msdv:Math.max(8,  Math.round(rm*0.18)),    points:rp, stats:rStats },
    { tier:3, name:"멀미 저감 경로", why:"정체 구간 우회 · 부드러운 가감속", time:`${rs.dur+2}분`, price:f(B*1.15),  diff:dm(rs.dur+2-bm),   msdv:Math.max(15, Math.round(rm*0.48)),    points:rp, stats:rStats },
  ];
}

/* ────────── 장소 검색 ────────── */
function usePlaces() {
  const [results, setResults] = useState([]);
  const t = useRef(null);
  const search = useCallback(q => {
    clearTimeout(t.current);
    if (!q?.trim()) { setResults([]); return; }
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?query=${encodeURIComponent(q)}`);
        const data = await r.json();
        setResults((data.searchPoiInfo?.pois?.poi || []).slice(0,5).map(d => ({
          name: d.name,
          addr: d.newAddressList?.newAddress?.[0]?.fullAddressRoad || [d.upperAddrName,d.middleAddrName,d.lowerAddrName].filter(Boolean).join(" "),
          lat: +d.frontLat, lng: +d.frontLon,
        })));
      } catch { setResults([]); }
    }, 250);
  }, []);
  return { results, search, clear: () => setResults([]) };
}

/* ────────── TMap ────────── */
function useTmap() {
  const [ready, setReady] = useState(!!window.Tmapv3);
  useEffect(() => {
    if (window.Tmapv3) { setReady(true); return; }
    const id = setInterval(() => {
      if (window.Tmapv3) { setReady(true); clearInterval(id); }
    }, 200);
    return () => clearInterval(id);
  }, []);
  return ready;
}

function TMapMap({ center, routes = [], markers = [], height = 220, interactive = false }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const objs = useRef([]);

  useEffect(() => {
    if (!ref.current || !window.Tmapv3) return;
    const T = window.Tmapv3;
    if (mapRef.current) { try { mapRef.current.destroy(); } catch {} mapRef.current = null; }
    mapRef.current = new T.Map(ref.current, {
      center: new T.LatLng(center.lat, center.lng),
      zoom: 15, zoomControl: false, scrollwheel: interactive,
    });
    return () => { if (mapRef.current) { try { mapRef.current.destroy(); } catch {} mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.Tmapv3) return;
    const T = window.Tmapv3;
    objs.current.forEach(o => { try { o.setMap(null); } catch {} });
    objs.current = [];
    routes.forEach(r => {
      if (!r.points?.length) return;
      const poly = new T.Polyline({
        path: r.points.map(p => new T.LatLng(p.y, p.x)),
        strokeColor: r.active ? (r.color || "#1A1F2B") : "#C7C7CC",
        strokeWeight: r.active ? 6 : 2,
        strokeOpacity: r.active ? 1 : 0.5,
        map: mapRef.current,
      });
      objs.current.push(poly);
    });
    markers.forEach(m => {
      const marker = new T.Marker({ position: new T.LatLng(m.lat, m.lng), map: mapRef.current });
      objs.current.push(marker);
    });
    const allPts = routes.flatMap(r => (r.points||[]).map(p => ({ lat:p.y, lng:p.x })));
    const all = [...allPts, ...markers];
    if (all.length > 1 && mapRef.current) {
      try {
        const b = new T.LatLngBounds();
        all.forEach(p => b.extend(new T.LatLng(p.lat, p.lng)));
        mapRef.current.fitBounds(b);
      } catch {}
    } else if (mapRef.current) {
      try { mapRef.current.setCenter(new T.LatLng(center.lat, center.lng)); } catch {}
    }
  }, [routes, markers, center.lat, center.lng]);

  return <div ref={ref} style={{ width: "100%", height, background: "#E0E5EB" }} />;
}

/* ────────── 아이콘 ────────── */
const Ico = {
  back:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#8C8C8C" strokeWidth="1.6"/><path d="M16.5 16.5L21 21" stroke="#8C8C8C" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  loc:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  pin:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" stroke="#1A1F2B" strokeWidth="1.6" fill="#fff"/><circle cx="12" cy="9" r="2.5" fill="#1A1F2B"/></svg>,
  flag:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 3v18M5 4h12l-2 4 2 4H5" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  card:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="13" rx="2" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M2.5 10h19" stroke="#1A1F2B" strokeWidth="1.6"/></svg>,
  check:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  // 차량 일러스트 (SVG 측면 뷰)
  carIcon: (c) => (
    <svg width="44" height="28" viewBox="0 0 56 36" fill="none">
      <ellipse cx="28" cy="34" rx="20" ry="1.5" fill="rgba(0,0,0,0.08)"/>
      <path d="M6 24 L8 18 Q10 12 16 11 L22 9 Q26 7 32 7 L40 7 Q46 8 50 14 L52 24 Q52 26 50 26 L8 26 Q6 26 6 24Z" fill={c} />
      <path d="M16 11 L20 11 Q24 10 28 10 L34 10 Q38 11 41 14 L42 14 L40 11" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.5" fill={c} fillOpacity="0.6"/>
      <circle cx="14" cy="26" r="4" fill="#1A1F2B"/>
      <circle cx="14" cy="26" r="2" fill="#fff"/>
      <circle cx="42" cy="26" r="4" fill="#1A1F2B"/>
      <circle cx="42" cy="26" r="2" fill="#fff"/>
    </svg>
  ),
};

/* ────────── 글로벌 스타일 ────────── */
const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body {
    font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 17px; line-height: 1.5; color: #1A1F2B;
    background: #F4F7FB;
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "tnum" 1;
  }
  button, input { font-family: inherit; color: inherit; }
  input { outline: none; }

  .app {
    max-width: 430px; margin: 0 auto; min-height: 100dvh;
    background: #FFFFFF; display: flex; flex-direction: column;
    position: relative; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.04);
  }

  /* shell — Step 1: 지도 + 바텀시트 풀화면 구조 */
  .stage { flex: 1; position: relative; overflow: hidden; display: flex; flex-direction: column; }

  /* nav bar (Step 1.5+ 만 사용) */
  .nav {
    height: 56px; padding: 8px 4px; display: flex; align-items: center; gap: 8px;
    background: #FFFFFF; position: relative; z-index: 5;
    box-shadow: 0 1px 0 #F2F2F7;
  }
  .nav-btn {
    width: 44px; height: 44px; border: none; background: transparent; cursor: pointer;
    border-radius: 100px; display: flex; align-items: center; justify-content: center;
  }
  .nav-btn:active { background: #F2F2F7; }
  .nav-title { font-size: 18px; font-weight: 600; color: #1A1F2B; }

  /* map */
  .map-wrap { position: relative; }
  .gps-fab {
    position: absolute; right: 16px;
    width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
    background: #FFFFFF; box-shadow: 0 4px 16px rgba(0,0,0,.12);
    display: flex; align-items: center; justify-content: center;
  }
  .gps-fab:active { transform: scale(.94); }
  .gps-spin svg { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .map-fallback {
    width: 100%; background: #E0E5EB; position: relative; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .map-fallback .fb-text { font-size: 14px; color: #8C8C8C; }

  /* bottom sheet — Step 1 */
  .sheet {
    background: #FFFFFF; border-top-left-radius: 20px; border-top-right-radius: 20px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
    padding-bottom: 8px;
    margin-top: -20px;
    position: relative; z-index: 4;
    flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
    display: flex; flex-direction: column;
  }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: #D1D1D6; margin: 8px auto 12px; }

  /* search pill — Figma "오늘은 어디로 갈까요?" */
  .search-pill {
    margin: 4px 16px 16px; height: 56px; border-radius: 14px; background: #F4F7FB;
    display: flex; align-items: center; gap: 12px; padding: 0 16px; cursor: text;
  }
  .search-pill input {
    border: none; background: transparent; flex: 1; font-size: 17px;
  }
  .search-pill input::placeholder { color: #8C8C8C; }

  /* recent / search rows */
  .row {
    height: 60px; padding: 0 16px; display: flex; align-items: center; gap: 16px; cursor: pointer;
  }
  .row:active { background: #FAFAF8; }
  .row + .row { box-shadow: inset 0 1px 0 #F2F2F7; }
  .row .body { flex: 1; min-width: 0; }
  .row .name { font-size: 14px; font-weight: 500; color: #1A1F2B; }
  .row .addr { font-size: 13px; color: #6B7280; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .dist { font-size: 13px; color: #6B7280; flex-shrink: 0; font-feature-settings: 'tnum'; }

  /* CTA bar */
  .cta-bar {
    padding: 12px 16px 28px; background: #FFFFFF;
    box-shadow: 0 -1px 0 #F2F2F7;
  }
  .cta {
    width: 100%; height: 56px; border-radius: 16px; border: none; cursor: pointer;
    background: #1A1F2B; color: #FFFFFF; font-size: 17px; font-weight: 600;
    transition: opacity .15s;
  }
  .cta:active { opacity: .85; }
  .cta:disabled { background: #D1D1D6; cursor: not-allowed; color: #FFFFFF; }
  .cta-ghost {
    width: 100%; height: 52px; border-radius: 16px; cursor: pointer;
    background: transparent; color: #6B7280; border: 1px solid #E8E5E0;
    font-size: 15px; font-weight: 500;
  }

  /* Step 1.5 sheet */
  .sheet15 {
    background: #FFFFFF; border-top-left-radius: 20px; border-top-right-radius: 20px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
    padding: 16px 16px 0; margin-top: -20px; position: relative; z-index: 4;
  }
  .pickup-status { display: flex; align-items: center; gap: 10px; padding: 6px 0 4px; }
  .pickup-status .dotL { width: 10px; height: 10px; border-radius: 50%; }
  .pickup-status .text { font-size: 14px; font-weight: 500; }
  .pickup-addr { font-size: 13px; color: #6B7280; padding-bottom: 14px; }
  .pickup-notice {
    background: #F4F7FB; border-radius: 8px; padding: 10px 12px;
    font-size: 12px; color: #6B7280; line-height: 1.5;
    display: flex; gap: 8px; align-items: flex-start;
  }

  /* Step 2 sheet */
  .sheet2 {
    background: #FFFFFF; border-top-left-radius: 20px; border-top-right-radius: 20px;
    box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
    margin-top: -20px; position: relative; z-index: 4;
    flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  }
  .sheet2 .head {
    padding: 4px 16px 12px; display: flex; align-items: center; justify-content: space-between;
  }
  .sheet2 .head .ttl { font-size: 22px; font-weight: 700; }
  .sheet2 .later-btn {
    height: 32px; padding: 0 12px; border-radius: 100px; border: none; cursor: pointer;
    background: #F4F7FB; font-size: 13px; font-weight: 500; color: #6B7280;
  }

  /* tier card */
  .tcard {
    margin: 0 16px 8px; padding: 14px; border-radius: 16px; cursor: pointer;
    background: #FFFFFF; border: 1.5px solid #F2F2F7; transition: all .15s;
  }
  .tcard.on { border-color: #1A1F2B; background: #FFFFFF; }
  .tcard .top { display: flex; align-items: center; gap: 12px; }
  .tcard .car { width: 56px; height: 36px; border-radius: 8px; background: #F4F7FB; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .tcard .meta { flex: 1; min-width: 0; }
  .tcard .nm { font-size: 17px; font-weight: 600; line-height: 1.2; }
  .tcard .why { font-size: 12px; color: #6B7280; margin-top: 4px; line-height: 1.4; }
  .tcard .right { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .tcard .time-chip {
    height: 22px; padding: 0 8px; border-radius: 100px; font-size: 12px;
    color: #FFFFFF; font-weight: 600; display: inline-flex; align-items: center;
    font-feature-settings: 'tnum';
  }
  .tcard .price { font-size: 14px; font-weight: 600; color: #1A1F2B; font-feature-settings: 'tnum'; }
  .tcard .feats { display: flex; flex-direction: column; gap: 6px; padding-top: 12px; margin-top: 12px; border-top: 1px solid #F2F2F7; }
  .tcard .feat { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #1A1F2B; }
  .tcard .feat .ck { color: #34C759; flex-shrink: 0; display: inline-flex; }

  /* payment row */
  .pay-row {
    margin: 8px 16px; height: 56px; border-radius: 14px;
    border: 1px solid #E8E5E0; padding: 0 14px;
    display: flex; align-items: center; gap: 12px; cursor: pointer; background: #FFFFFF;
  }
  .pay-row .ic { width: 32px; height: 24px; border-radius: 4px; background: #F4F7FB; display: flex; align-items: center; justify-content: center; }
  .pay-row .name { flex: 1; font-size: 14px; font-weight: 500; }
  .pay-row .change { font-size: 13px; color: #2F6FED; font-weight: 500; }

  /* Step 2 map overlay tag */
  .route-tag {
    position: absolute; left: 50%; transform: translateX(-50%); top: 16px;
    background: #FFFFFF; border-radius: 100px; padding: 8px 14px;
    font-size: 13px; font-weight: 500; box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    display: flex; align-items: center; gap: 8px; white-space: nowrap;
  }
  .route-tag .dot-l { width: 8px; height: 8px; border-radius: 50%; }

  /* err */
  .err { margin: 12px 16px; padding: 10px 14px; background: #FFF1F0; color: #B91C1C; border-radius: 10px; font-size: 13px; }

  /* loading */
  .loading-wrap { padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .loading-bar { width: 200px; height: 3px; background: #F2F2F7; border-radius: 2px; overflow: hidden; }
  .loading-fill { height: 100%; width: 30%; background: #1A1F2B; border-radius: 2px; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0%{transform:translateX(-100%)} 50%{transform:translateX(280%)} 100%{transform:translateX(-100%)} }

  /* Step 3 */
  .summary {
    margin: 16px 16px 0; padding: 14px; background: #F4F7FB; border-radius: 14px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .summary .row-s { display: flex; gap: 10px; align-items: flex-start; }
  .summary .lbl { font-size: 11px; color: #6B7280; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
  .summary .val { font-size: 14px; color: #1A1F2B; font-weight: 500; margin-top: 2px; }

  /* Step 4 */
  .approach {
    margin: 16px 16px 0; padding: 16px; border-radius: 16px;
    background: #1A1F2B; color: #FFFFFF;
  }
  .approach .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .approach .label { font-size: 12px; color: rgba(255,255,255,0.6); }
  .approach .plate { background: rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 10px; margin-top: 8px; display: inline-block; font-size: 13px; font-weight: 500; }
  .approach .eta { font-size: 36px; font-weight: 600; line-height: 1; }
  .approach .dist { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 6px; }
`;

/* ────────── 메인 ────────── */
export default function App() {
  const [step, setStep]   = useState(1);
  const [tierIdx, setTier] = useState(3); // 기본 선택: Glide
  const [loc, setLoc]     = useState({ lat: 37.5665, lng: 126.9780 });
  const [locating, setLocating] = useState(false);
  const [pickup, setPickup] = useState(null);
  const [dest, setDest]   = useState(null);
  const [query, setQuery] = useState("");
  const [routes, setRoutes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState(false);

  const tmap = useTmap();
  const { results, search, clear } = usePlaces();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}
    );
  }, []);

  const refreshLoc = useCallback(() => {
    if (locating) return;
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      p => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { timeout: 8000, maximumAge: 0 }
    );
  }, [locating]);

  const onQueryChange = q => { setQuery(q); setDest(null); search(q); };
  const onPickDest    = p => { setDest(p); setQuery(p.name); clear(); };

  const goPickup = () => {
    if (!dest) return;
    setPickup({ ...loc });
    setStep(1.5);
  };
  const confirmPickup = async () => {
    setStep(2);
    if (!dest) { setRoutes(null); return; }
    setLoading(true); setErr(false);
    try { setRoutes(await buildRoutes(pickup || loc, dest)); }
    catch { setErr(true); setRoutes(null); }
    setLoading(false);
  };
  const goConfirm = () => setStep(3);
  const placeCall = () => {
    if (navigator.vibrate) navigator.vibrate(20);
    setStep(4);
  };
  const reset = () => { setStep(1); setRoutes(null); setDest(null); setQuery(""); setTier(3); setPickup(null); };

  const list = routes || MOCK_ROUTES;
  const rd   = list[tierIdx];
  const tierMeta = TIERS[tierIdx];

  const back = () => {
    if (step === 4) reset();
    else if (step === 1.5) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 2) setStep(1.5);
    else setStep(1);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="app">

        {step === 1 && (
          <Step1
            loc={loc} tmap={tmap}
            query={query} onQueryChange={onQueryChange}
            results={results} onPickDest={onPickDest}
            dest={dest} refreshLoc={refreshLoc} locating={locating}
            onCTA={goPickup}
          />
        )}

        {step === 1.5 && (
          <>
            <div className="nav">
              <button className="nav-btn" onClick={back}>{Ico.back}</button>
              <span className="nav-title">픽업 위치 설정</span>
            </div>
            <Step15
              loc={pickup || loc} tmap={tmap}
              refreshLoc={refreshLoc} locating={locating}
              onCTA={confirmPickup}
            />
          </>
        )}

        {step === 2 && (
          <>
            <div className="nav">
              <button className="nav-btn" onClick={back}>{Ico.back}</button>
            </div>
            {loading
              ? <Loading />
              : <Step2
                  tmap={tmap} loc={pickup || loc} dest={dest}
                  routes={list} tierIdx={tierIdx} setTier={setTier}
                  err={err} onCTA={goConfirm}
                  rd={rd}
                />}
          </>
        )}

        {step === 3 && (
          <>
            <div className="nav">
              <button className="nav-btn" onClick={back}>{Ico.back}</button>
              <span className="nav-title">호출 확정</span>
            </div>
            <Step3
              tmap={tmap} pickup={pickup || loc} dest={dest}
              route={rd} tierMeta={tierMeta} routes={list} tierIdx={tierIdx}
              onCTA={placeCall}
            />
          </>
        )}

        {step === 4 && (
          <>
            <div className="nav">
              <button className="nav-btn" onClick={back}>{Ico.back}</button>
              <span className="nav-title">차량 접근 중</span>
            </div>
            <Step4 loc={pickup || loc} tmap={tmap} route={rd} tierMeta={tierMeta} onCancel={reset} />
          </>
        )}
      </div>
    </>
  );
}

/* ────────── Step 1: 목적지 입력 ────────── */
function Step1({ loc, tmap, query, onQueryChange, results, onPickDest, dest, refreshLoc, locating, onCTA }) {
  return (
    <div className="stage">
      <div className="map-wrap" style={{ height: 360 }}>
        {tmap
          ? <TMapMap key={`m1-${loc.lat}-${loc.lng}`} center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height={360} />
          : <div className="map-fallback" style={{ height: 360 }}><span className="fb-text">지도 로드 중…</span></div>
        }
        <button className={`gps-fab ${locating ? "gps-spin" : ""}`} style={{ bottom: 36 }} onClick={refreshLoc}>{Ico.loc}</button>
      </div>

      <div className="sheet">
        <div className="sheet-handle" />
        <div className="search-pill">
          {Ico.search}
          <input
            placeholder="오늘은 어디로 갈까요?"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
          />
        </div>

        {results.length > 0
          ? results.map(r => (
              <div key={r.name + r.addr} className="row" onClick={() => onPickDest(r)}>
                <div className="body">
                  <div className="name">{r.name}</div>
                  <div className="addr">{r.addr}</div>
                </div>
              </div>
            ))
          : RECENTS.map(r => (
              <div key={r.name} className="row" onClick={() => onPickDest(r)}>
                <div className="body">
                  <div className="name">{r.name}</div>
                  <div className="addr">{r.addr}</div>
                </div>
                <span className="dist">{r.dist}m</span>
              </div>
            ))
        }
      </div>

      <div className="cta-bar">
        <button className="cta" disabled={!dest} onClick={onCTA}>경로 탐색</button>
      </div>
    </div>
  );
}

/* ────────── Step 1.5: 픽업 위치 ────────── */
function Step15({ loc, tmap, refreshLoc, locating, onCTA }) {
  return (
    <div className="stage">
      <div className="map-wrap" style={{ flex: 1, position: "relative" }}>
        {tmap
          ? <TMapMap key={`m15-${loc.lat}-${loc.lng}`} center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height={520} />
          : <div className="map-fallback" style={{ height: 520 }}><span className="fb-text">지도 로드 중…</span></div>
        }
        {/* center pin */}
        <div style={{
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)",
          pointerEvents: "none",
        }}>
          <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
            <ellipse cx="16" cy="40" rx="6" ry="2" fill="rgba(0,0,0,0.18)"/>
            <path d="M16 2c-6 0-10 4-10 10 0 8 10 26 10 26s10-18 10-26c0-6-4-10-10-10z" fill="#1A1F2B"/>
            <circle cx="16" cy="12" r="3.5" fill="#fff"/>
          </svg>
        </div>
        <button className={`gps-fab ${locating ? "gps-spin" : ""}`} style={{ bottom: 16 }} onClick={refreshLoc}>{Ico.loc}</button>
      </div>

      <div className="sheet15">
        <div className="pickup-status">
          <span className="dotL" style={{ background: "#34C759" }} />
          <span className="text">차량 진입 가능</span>
        </div>
        <div className="pickup-addr">서울 강남구 테헤란로 123 앞</div>
        <div className="pickup-notice">
          <span>⚠️</span>
          <span>도로 상황·장애물에 따라 실제 픽업 위치가 달라질 수 있어요</span>
        </div>
      </div>

      <div className="cta-bar">
        <button className="cta" onClick={onCTA}>이 위치로 픽업 확정</button>
      </div>
    </div>
  );
}

/* ────────── Step 2: 경로/등급 선택 ────────── */
function Loading() {
  return (
    <div className="loading-wrap">
      <div style={{ fontSize: 14, color: "#6B7280" }}>경로 탐색 중…</div>
      <div className="loading-bar"><div className="loading-fill" /></div>
    </div>
  );
}

function Step2({ tmap, loc, dest, routes, tierIdx, setTier, err, onCTA, rd }) {
  const tierMeta = TIERS[tierIdx];
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === tierIdx, color: TIERS[i].line }));
  const markers = dest ? [{ lat: loc.lat, lng: loc.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: loc.lat, lng: loc.lng }];

  // route distance from API
  const distKm = rd.stats?.express || (routes[tierIdx]?.stats?.express) || "—";

  return (
    <div className="stage">
      <div className="map-wrap" style={{ height: 240, position: "relative" }}>
        {tmap
          ? <TMapMap key="m2" center={dest || loc} routes={mapRoutes} markers={markers} height={240} />
          : <div className="map-fallback" style={{ height: 240 }}><span className="fb-text">지도 로드 중…</span></div>
        }
        <div className="route-tag">
          <span className="dot-l" style={{ background: tierMeta.line }} />
          <span>{tierMeta.label} 경로 · {rd.time} · {distKm}</span>
        </div>
      </div>

      <div className="sheet2">
        <div className="sheet-handle" />
        <div className="head">
          <div className="ttl">경험 선택</div>
          <button className="later-btn">나중에 출발</button>
        </div>

        {err && <div className="err">경로 탐색 실패 — 샘플 데이터로 표시합니다</div>}

        {routes.map((r, i) => {
          const meta = TIERS[i];
          const on = i === tierIdx;
          const features = TIER_FEATURES[meta.key];
          return (
            <div key={meta.key} className={`tcard ${on ? "on" : ""}`} onClick={() => setTier(i)}>
              <div className="top">
                <div className="car">{Ico.carIcon(meta.color)}</div>
                <div className="meta">
                  <div className="nm">{meta.label}</div>
                  <div className="why">{meta.why}</div>
                </div>
                <div className="right">
                  <span className="time-chip" style={{ background: meta.color }}>{r.time}</span>
                  <span className="price">{r.price}</span>
                </div>
              </div>
              {on && (
                <div className="feats">
                  {features.map((f, j) => (
                    <div key={j} className="feat">
                      <span className="ck">{Ico.check}</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="pay-row">
          <div className="ic">{Ico.card}</div>
          <div className="name">현대카드 ••••8702</div>
          <span className="change">결제수단 변경</span>
        </div>
      </div>

      <div className="cta-bar">
        <button className="cta" onClick={onCTA}>{rd.price}</button>
      </div>
    </div>
  );
}

/* ────────── Step 3: 호출 확정 ────────── */
function Step3({ tmap, pickup, dest, route, tierMeta, routes, tierIdx, onCTA }) {
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === tierIdx, color: tierMeta.line }));
  const markers = dest ? [{ lat: pickup.lat, lng: pickup.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: pickup.lat, lng: pickup.lng }];
  return (
    <div className="stage">
      <div className="map-wrap" style={{ height: 240 }}>
        {tmap
          ? <TMapMap key="m3" center={dest || pickup} routes={mapRoutes} markers={markers} height={240} />
          : <div className="map-fallback" style={{ height: 240 }}><span className="fb-text">지도 로드 중…</span></div>
        }
      </div>

      <div style={{ padding: "20px 16px 0", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 50, background: tierMeta.line }} />
          <span style={{ fontSize: 13, color: "#6B7280" }}>{tierMeta.label} 경로</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{route.time} 예상</div>

        <div className="summary">
          <div className="row-s">
            <div style={{ width: 24 }}>{Ico.pin}</div>
            <div><div className="lbl">픽업</div><div className="val">현재 위치 부근</div></div>
          </div>
          <div style={{ height: 1, background: "#E8E5E0", marginLeft: 34 }} />
          <div className="row-s">
            <div style={{ width: 24 }}>{Ico.flag}</div>
            <div><div className="lbl">목적지</div><div className="val">{dest?.name || "—"}</div></div>
          </div>
        </div>

        <div className="pay-row" style={{ marginTop: 12 }}>
          <div className="ic">{Ico.card}</div>
          <div className="name">현대카드 ••••8702</div>
          <span className="change">결제수단 변경</span>
        </div>
      </div>

      <div className="cta-bar">
        <button className="cta" onClick={onCTA}>호출하기 · {route.price}</button>
      </div>
    </div>
  );
}

/* ────────── Step 4: Approaching ────────── */
function Step4({ loc, tmap, route, tierMeta, onCancel }) {
  return (
    <div className="stage">
      <div className="map-wrap" style={{ height: 280 }}>
        {tmap
          ? <TMapMap key="m4" center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height={280} />
          : <div className="map-fallback" style={{ height: 280 }}><span className="fb-text">지도 로드 중…</span></div>
        }
      </div>

      <div className="approach">
        <div className="top">
          <div>
            <div className="label">호출하신 차량</div>
            <span className="plate">12가 3456</span>
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.85 }}>아이오닉 6 · {tierMeta.label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="eta">3<span style={{ fontSize: 17, fontWeight: 400, opacity: 0.7 }}>분</span></div>
            <div className="dist">약 280m</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px", flex: 1 }}>
        <div style={{ fontSize: 13, color: "#6B7280" }}>{route.name} · {route.time} 예상 · {route.price}</div>
      </div>

      <div className="cta-bar">
        <button className="cta-ghost" onClick={onCancel}>호출 취소</button>
      </div>
    </div>
  );
}
