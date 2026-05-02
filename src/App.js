import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────
   Glide — 자율주행 호출 프로토타입
   디자인 정본: Figma "📱 Screens" (sQI9EmtFBeoDOc2hLQevXw)
   백엔드: api/directions.js, api/places.js (TMap proxy)
   ───────────────────────────────────────────────────────── */

// Figma 확장 시트 기준: Rush → Cruise → Glide(기본 선택) → Glide Pure
const TIERS = [
  { key: "rush",       label: "Rush",       why: "빠른 길 우선 · 기능 없음",        chip: "#A0AEC0", line: "#9CA3AF" },
  { key: "cruise",     label: "Cruise",     why: "혼잡 구간 일부 회피 · 시간 균형",  chip: "#E9A23B", line: "#E9A23B" },
  { key: "glide",      label: "Glide",      why: "급커브 회피 · 정체 구간 우회",    chip: "#5FD3B3", line: "#34C759" },
  { key: "glide-pure", label: "Glide Pure", why: "부드러운 경로 · 급정차 감소",     chip: "#2F6FED", line: "#2F6FED" },
];
// Figma "Step 2 — 시트 확장" 정본
const TIER_FEATURES = {
  "rush":       [],
  "cruise":     ["액티브 서스펜션", "블라인드 개방", "스마트 시트 (90~135°)", "실내 온도·환기 조절", "IVIS 눈높이 조절", "Glide Earpiece 제공"],
  "glide":      ["Cruise와 동일"],
  "glide-pure": ["액티브 서스펜션 + 커브 틸팅", "파노라마 뷰 · 저소음 캐빈", "스마트 리클라이닝 시트 (90~150°)", "실내 온도·환기·조명 조절", "IVIS 높이 슬라이더", "Glide Earpiece + Vision Band 제공"],
};

const MOCK_ROUTES = [
  { tier: 0, name: "최단 경로",       why: "빠른 길 우선",     time: "23분", price: "₩10,800", diff: "기본",  msdv: 72, points: [], stats: { cong: 9, alley: 4, turns: 14, express: "2.8km" } },
  { tier: 1, name: "균형 경로",       why: "혼잡 일부 회피",   time: "25분", price: "₩11,500", diff: "+2분", msdv: 55, points: [], stats: { cong: 5, alley: 2, turns: 9,  express: "4.1km" } },
  { tier: 2, name: "Glide 경로",      why: "정체 구간 우회",   time: "27분", price: "₩12,400", diff: "+4분", msdv: 36, points: [], stats: { cong: 2, alley: 0, turns: 4,  express: "4.1km" } },
  { tier: 3, name: "Glide Pure 경로", why: "급정차 감소",      time: "23분", price: "₩13,800", diff: "기본",  msdv: 18, points: [], stats: { cong: 1, alley: 0, turns: 2,  express: "4.1km" } },
];

const RECENTS = [
  { name: "집",     addr: "서울 서초구 서초대로 78길 24", lat: 37.5511, lng: 126.9233, dist: 432 },
  { name: "코엑스", addr: "서울 강남구 영동대로 513",     lat: 37.5127, lng: 127.0594, dist: 405 },
  { name: "잠실역", addr: "서울 송파구 올림픽로 240",     lat: 37.5133, lng: 127.1001, dist: 612 },
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
const TIER_SURFACE_THRESHOLD = [null, 5, 3, 4];
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

  const tStats = { cong: tLinks.filter(l=>l.congestion>=1).length, alley: tLinks.filter(l=>l.roadType===8).length, turns: tLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length, express: `${(tLinks.filter(l=>l.isExpressway).reduce((s,l)=>s+l.distance,0)/1000).toFixed(1)}km` };
  const rStats = { cong: rLinks.filter(l=>l.congestion>=1).length, alley: rLinks.filter(l=>l.roadType===8).length, turns: rLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length, express: `${(rLinks.filter(l=>l.isExpressway).reduce((s,l)=>s+l.distance,0)/1000).toFixed(1)}km` };

  const B = ts.fare;
  const f = n => `₩${Math.round(n).toLocaleString()}`;
  const dm = m => m <= 0 ? "기본" : `+${m}분`;
  const bm = ts.dur;
  return [
    { tier:0, name:"최단 경로",       why:"빠른 길 우선",     time:`${ts.dur}분`,   price:f(B),       diff:"기본",            msdv:tm,                                points:tp, stats:tStats },
    { tier:1, name:"균형 경로",       why:"혼잡 일부 회피",   time:`${rs.dur}분`,   price:f(B*1.06),  diff:dm(rs.dur-bm),     msdv:Math.min(95, rm+rSpeed),           points:rp, stats:rStats },
    { tier:2, name:"Glide 경로",      why:"정체 구간 우회",   time:`${rs.dur+2}분`, price:f(B*1.15),  diff:dm(rs.dur+2-bm),   msdv:Math.max(15, Math.round(rm*0.48)), points:rp, stats:rStats },
    { tier:3, name:"Glide Pure 경로", why:"급정차 감소",      time:`${rs.dur}분`,   price:f(B*1.28),  diff:dm(rs.dur-bm),     msdv:Math.max(8,  Math.round(rm*0.18)), points:rp, stats:rStats },
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
    mapRef.current = new T.Map(ref.current, { center: new T.LatLng(center.lat, center.lng), zoom: 15, zoomControl: false, scrollwheel: interactive });
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
        strokeColor: r.active ? (r.color || "#34C759") : "#C7C7CC",
        strokeWeight: r.active ? 6 : 3,
        strokeOpacity: r.active ? 1 : 0.5,
        map: mapRef.current,
      });
      objs.current.push(poly);
    });
    markers.forEach(m => objs.current.push(new T.Marker({ position: new T.LatLng(m.lat, m.lng), map: mapRef.current })));
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
  return <div ref={ref} style={{ width: "100%", height, background: "#DDE2E8" }} />;
}

/* ────────── Draggable Bottom Sheet ────────── */
// snapPoints: array of top-offsets (px from container top). Smaller = sheet covers more.
function DraggableSheet({ snapPoints = [60, 320, 600], initial = 1, children }) {
  const [snapIdx, setSnapIdx] = useState(initial);
  const [dragY, setDragY] = useState(null); // current top during drag (null = use snap)
  const startY = useRef(0);
  const startTop = useRef(0);

  const top = dragY !== null ? dragY : snapPoints[snapIdx];

  const onPointerDown = e => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startTop.current = snapPoints[snapIdx];
    setDragY(snapPoints[snapIdx]);
  };
  const onPointerMove = e => {
    if (dragY === null) return;
    const delta = e.clientY - startY.current;
    const next = Math.max(snapPoints[0], Math.min(snapPoints[snapPoints.length - 1], startTop.current + delta));
    setDragY(next);
  };
  const onPointerUp = () => {
    if (dragY === null) return;
    let nearest = 0, minD = Infinity;
    snapPoints.forEach((p, i) => { const d = Math.abs(p - dragY); if (d < minD) { minD = d; nearest = i; } });
    setSnapIdx(nearest);
    setDragY(null);
  };

  return (
    <div
      className="sheet"
      style={{
        top,
        transition: dragY === null ? "top .28s cubic-bezier(.32,.72,0,1)" : "none",
      }}
    >
      <div
        className="sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-handle" />
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

/* ────────── 아이콘 ────────── */
const Ico = {
  back:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#8C8C8C" strokeWidth="1.6"/><path d="M16.5 16.5L21 21" stroke="#8C8C8C" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  loc:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  pin:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" stroke="#1A1F2B" strokeWidth="1.6" fill="#fff"/><circle cx="12" cy="9" r="2.5" fill="#1A1F2B"/></svg>,
  flag:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 3v18M5 4h12l-2 4 2 4H5" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  // 카카오T 풍 측면 차량 일러스트 (40px)
  car: (color) => (
    <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
      <ellipse cx="20" cy="29" rx="14" ry="1.5" fill="rgba(0,0,0,0.08)"/>
      <path d="M5 19 L7 14 Q9 10 13 9 L17 7 Q20 6 24 6 L29 6 Q33 7 36 11 L37 19 Q37 21 35 21 L7 21 Q5 21 5 19Z" fill={color} />
      <rect x="11" y="9" width="6" height="5" rx="1" fill="#fff" fillOpacity="0.55"/>
      <rect x="19" y="9" width="6" height="5" rx="1" fill="#fff" fillOpacity="0.55"/>
      <rect x="27" y="9" width="6" height="5" rx="1" fill="#fff" fillOpacity="0.55"/>
      <circle cx="11" cy="22" r="3.5" fill="#1A1F2B"/>
      <circle cx="11" cy="22" r="1.6" fill="#fff"/>
      <circle cx="31" cy="22" r="3.5" fill="#1A1F2B"/>
      <circle cx="31" cy="22" r="1.6" fill="#fff"/>
    </svg>
  ),
};

/* ────────── 글로벌 스타일 ────────── */
const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; overscroll-behavior: none; }
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
    max-width: 430px; margin: 0 auto;
    height: 100dvh; overflow: hidden; background: #FFFFFF;
    position: relative;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.04);
  }

  /* 풀스크린 컨테이너 (지도 + 시트가 같이 오는 페이지) */
  .full {
    position: absolute; inset: 0;
  }

  /* 지도 영역 */
  .map-bg { position: absolute; inset: 0; }
  .map-fallback { width: 100%; height: 100%; background: #DDE2E8; display: flex; align-items: center; justify-content: center; color: #8C8C8C; font-size: 14px; }

  /* 네비 (Step 1.5+ 만 사용) */
  .nav {
    position: absolute; top: 0; left: 0; right: 0;
    height: 56px; padding: 8px 4px; display: flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    z-index: 6;
  }
  .nav-btn { width: 44px; height: 44px; border: none; background: transparent; cursor: pointer; border-radius: 100px; display: flex; align-items: center; justify-content: center; }
  .nav-btn:active { background: rgba(0,0,0,0.05); }
  .nav-title { font-size: 17px; font-weight: 600; }

  /* GPS FAB */
  .gps-fab {
    position: absolute; right: 16px;
    width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
    background: #FFFFFF; box-shadow: 0 4px 16px rgba(0,0,0,.12);
    display: flex; align-items: center; justify-content: center;
    z-index: 4;
  }
  .gps-fab:active { transform: scale(.94); }
  .gps-spin svg { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 라우트 정보 칩 (지도 위 오버레이) */
  .route-chip {
    position: absolute; top: 222px; right: 16px;
    background: #ECFAF6; border-radius: 20px;
    padding: 7px 12px; display: flex; align-items: center; gap: 6px;
    font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    z-index: 4;
  }
  .route-chip .nm { font-weight: 500; color: #1A1F2B; }
  .route-chip .dot-l { width: 6px; height: 6px; border-radius: 50%; }
  .route-chip .meta { color: #6B7280; }

  /* ────────── DRAGGABLE BOTTOM SHEET ────────── */
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: #FFFFFF;
    border-top-left-radius: 20px; border-top-right-radius: 20px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.08);
    display: flex; flex-direction: column;
    z-index: 5;
    touch-action: none;
    user-select: none;
    will-change: top;
  }
  .sheet-grip { padding: 10px 0 6px; cursor: grab; touch-action: none; }
  .sheet-grip:active { cursor: grabbing; }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: #D9D9D9; margin: 0 auto; }
  .sheet-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 0; }

  /* CTA bar 시트 안 고정 영역 */
  .sheet-cta {
    padding: 12px 20px 28px;
    background: #FFFFFF;
    box-shadow: 0 -1px 0 #F2F2F7;
  }
  .cta {
    width: 100%; height: 52px; border-radius: 14px; border: none; cursor: pointer;
    background: #1A1F2B; color: #FFFFFF; font-size: 17px; font-weight: 500;
    transition: opacity .15s;
  }
  .cta:active { opacity: .85; }
  .cta:disabled { background: #D1D1D6; color: #FFFFFF; cursor: not-allowed; }
  .cta-ghost { width: 100%; height: 48px; border-radius: 14px; cursor: pointer; background: transparent; color: #6B7280; border: 1px solid #E8E5E0; font-size: 15px; }

  /* ────────── STEP 1 — 검색 + 최근 ────────── */
  .search-pill {
    margin: 4px 16px 16px; height: 56px; border-radius: 14px; background: #F4F7FB;
    display: flex; align-items: center; gap: 12px; padding: 0 16px;
  }
  .search-pill input { border: none; background: transparent; flex: 1; font-size: 17px; }
  .search-pill input::placeholder { color: #8C8C8C; }

  .row {
    height: 60px; padding: 0 20px; display: flex; align-items: center; gap: 16px; cursor: pointer;
    box-shadow: inset 0 -1px 0 #F2F2F7;
  }
  .row:active { background: #FAFAF8; }
  .row .body { flex: 1; min-width: 0; }
  .row .name { font-size: 14px; font-weight: 500; }
  .row .addr { font-size: 13px; color: #6B7280; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .dist { font-size: 13px; color: #6B7280; flex-shrink: 0; font-feature-settings: 'tnum'; }

  /* ────────── STEP 1.5 — 픽업 위치 ────────── */
  .pickup-status { display: flex; align-items: center; gap: 10px; padding: 8px 20px 4px; }
  .pickup-status .dotL { width: 10px; height: 10px; border-radius: 50%; }
  .pickup-status .text { font-size: 14px; font-weight: 500; }
  .pickup-addr { font-size: 13px; color: #6B7280; padding: 0 20px 14px; }
  .pickup-notice {
    margin: 0 20px 12px;
    background: #F4F7FB; border-radius: 8px; padding: 10px 12px;
    font-size: 12px; color: #6B7280; line-height: 1.5;
    display: flex; gap: 8px; align-items: flex-start;
  }

  /* ────────── STEP 2 — 경험 선택 ────────── */
  .sheet-head {
    padding: 0 20px 12px; display: flex; align-items: center; gap: 8px;
  }
  .sheet-head .ttl { flex: 1; font-size: 22px; font-weight: 700; color: #1A1F2B; }
  .later-chip {
    height: 28px; padding: 0 12px; border-radius: 100px;
    background: #F4F7FB; border: none; cursor: pointer;
    font-size: 13px; color: #6B7280;
  }

  .divider-line { height: 1px; background: #E8E5E0; }

  .trow {
    background: #FFFFFF; padding: 14px 20px; cursor: pointer;
    display: flex; flex-direction: column; gap: 8px;
  }
  .trow.on { background: #F4F7FB; }
  .trow .top { display: flex; gap: 12px; align-items: center; }
  .trow .car-wrap { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .trow .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .trow .nm { font-size: 17px; font-weight: 700; line-height: 1.1; color: #1A1F2B; }
  .trow .why { font-size: 12px; color: #6B7280; }
  .time-pill {
    height: 24px; padding: 0 8px; border-radius: 100px;
    color: #FFFFFF; font-size: 12px; font-weight: 600;
    display: inline-flex; align-items: center; flex-shrink: 0;
  }
  .trow .price { font-size: 17px; font-weight: 600; color: #1A1F2B; min-width: 76px; text-align: right; }
  .feats { display: flex; flex-direction: column; gap: 3px; padding-left: 52px; }
  .feats .f { font-size: 13px; color: #6B7280; }

  .pay-row {
    display: flex; gap: 12px; align-items: center; padding: 14px 20px;
    background: #FFFFFF; cursor: pointer;
  }
  .pay-row .sq { width: 24px; height: 24px; background: #E8E5E0; border-radius: 6px; flex-shrink: 0; }
  .pay-row .body { flex: 1; min-width: 0; }
  .pay-row .name { font-size: 15px; color: #1A1F2B; }
  .pay-row .sub { font-size: 12px; color: #6B7280; margin-top: 2px; }
  .pay-row .chev { font-size: 18px; color: #6B7280; }

  /* err */
  .err { margin: 12px 20px; padding: 10px 14px; background: #FFF1F0; color: #B91C1C; border-radius: 10px; font-size: 13px; }

  /* loading */
  .loading-wrap { padding: 40px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .loading-bar { width: 200px; height: 3px; background: #F2F2F7; border-radius: 2px; overflow: hidden; }
  .loading-fill { height: 100%; width: 30%; background: #1A1F2B; border-radius: 2px; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0%{transform:translateX(-100%)} 50%{transform:translateX(280%)} 100%{transform:translateX(-100%)} }

  /* Step 3 summary */
  .summary {
    margin: 16px 20px 0; padding: 14px; background: #F4F7FB; border-radius: 14px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .summary .row-s { display: flex; gap: 10px; align-items: flex-start; }
  .summary .lbl { font-size: 11px; color: #6B7280; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
  .summary .val { font-size: 14px; color: #1A1F2B; font-weight: 500; margin-top: 2px; }

  /* Step 4 approach */
  .approach {
    margin: 12px 20px 0; padding: 16px; border-radius: 16px; background: #1A1F2B; color: #FFFFFF;
  }
  .approach .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .approach .label { font-size: 12px; color: rgba(255,255,255,0.6); }
  .approach .plate { background: rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 10px; margin-top: 8px; display: inline-block; font-size: 13px; font-weight: 500; }
  .approach .eta { font-size: 36px; font-weight: 600; line-height: 1; }
  .approach .dist { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 6px; }
`;

/* ────────── 메인 ────────── */
export default function App() {
  const [step, setStep]     = useState(1);
  const [tierIdx, setTier]  = useState(2); // 기본: Glide (Figma 확장 시트 정본)
  const [whenIdx, setWhen]  = useState(2); // Step 2.5 추천: 1시간 30분 후
  const [loc, setLoc]       = useState({ lat: 37.5665, lng: 126.9780 });
  const [locating, setLoc2] = useState(false);
  const [pickup, setPickup] = useState(null);
  const [dest, setDest]     = useState(null);
  const [query, setQuery]   = useState("");
  const [routes, setRoutes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(false);

  const tmap = useTmap();
  const { results, search, clear } = usePlaces();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}
    );
  }, []);

  const refreshLoc = useCallback(() => {
    if (locating) return;
    setLoc2(true);
    navigator.geolocation?.getCurrentPosition(
      p => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLoc2(false); },
      () => setLoc2(false), { timeout: 8000, maximumAge: 0 }
    );
  }, [locating]);

  const onQueryChange = q => { setQuery(q); setDest(null); search(q); };
  const onPickDest    = p => { setDest(p); setQuery(p.name); clear(); };

  const goPickup = () => { if (!dest) return; setPickup({ ...loc }); setStep(1.5); };
  const confirmPickup = async () => {
    setStep(2);
    if (!dest) { setRoutes(null); return; }
    setLoading(true); setErr(false);
    try { setRoutes(await buildRoutes(pickup || loc, dest)); }
    catch { setErr(true); setRoutes(null); }
    setLoading(false);
  };
  const goConfirm = () => setStep(3);
  const placeCall = () => { if (navigator.vibrate) navigator.vibrate(20); setStep(4); };
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
        {step === 1   && <Step1   loc={loc} tmap={tmap} query={query} onQueryChange={onQueryChange} results={results} onPickDest={onPickDest} dest={dest} refreshLoc={refreshLoc} locating={locating} onCTA={goPickup} />}
        {step === 1.5 && <Step15  loc={pickup || loc} tmap={tmap} refreshLoc={refreshLoc} locating={locating} onCTA={confirmPickup} onBack={back} />}
        {step === 2   && <Step2   tmap={tmap} loc={pickup || loc} dest={dest} routes={list} tierIdx={tierIdx} setTier={setTier} err={err} loading={loading} onCTA={goConfirm} rd={rd} tierMeta={tierMeta} onBack={back} onLater={() => setStep(2.5)} />}
        {step === 2.5 && <Step25 tmap={tmap} loc={pickup || loc} dest={dest} routes={list} tierMeta={tierMeta} whenIdx={whenIdx} setWhen={setWhen} onBack={() => setStep(2)} onCTA={goConfirm} />}
        {step === 3   && <Step3   tmap={tmap} pickup={pickup || loc} dest={dest} route={rd} tierMeta={tierMeta} routes={list} tierIdx={tierIdx} onCTA={placeCall} onBack={back} />}
        {step === 4   && <Step4   loc={pickup || loc} tmap={tmap} route={rd} tierMeta={tierMeta} onCancel={reset} onBack={back} />}
      </div>
    </>
  );
}

/* ────────── Step 1 — 목적지 입력 ────────── */
function Step1({ loc, tmap, query, onQueryChange, results, onPickDest, dest, refreshLoc, locating, onCTA }) {
  return (
    <div className="full">
      <div className="map-bg">
        {tmap
          ? <TMapMap key={`m1-${loc.lat}-${loc.lng}`} center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height="100%" />
          : <div className="map-fallback">지도 로드 중…</div>
        }
      </div>
      <button className={`gps-fab ${locating ? "gps-spin" : ""}`} style={{ bottom: 580 }} onClick={refreshLoc}>{Ico.loc}</button>

      <DraggableSheet snapPoints={[60, 380, 660]} initial={1}>
        <div className="search-pill">
          {Ico.search}
          <input placeholder="오늘은 어디로 갈까요?" value={query} onChange={e => onQueryChange(e.target.value)} />
        </div>

        {results.length > 0
          ? results.map(r => (
              <div key={r.name + r.addr} className="row" onClick={() => onPickDest(r)}>
                <div className="body"><div className="name">{r.name}</div><div className="addr">{r.addr}</div></div>
              </div>
            ))
          : RECENTS.map(r => (
              <div key={r.name} className="row" onClick={() => onPickDest(r)}>
                <div className="body"><div className="name">{r.name}</div><div className="addr">{r.addr}</div></div>
                <span className="dist">{r.dist}</span>
              </div>
            ))
        }

        <div className="sheet-cta">
          <button className="cta" disabled={!dest} onClick={onCTA}>경로 탐색</button>
        </div>
      </DraggableSheet>
    </div>
  );
}

/* ────────── Step 1.5 — 픽업 위치 ────────── */
function Step15({ loc, tmap, refreshLoc, locating, onCTA, onBack }) {
  return (
    <div className="full">
      <div className="map-bg">
        {tmap
          ? <TMapMap key={`m15-${loc.lat}-${loc.lng}`} center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height="100%" />
          : <div className="map-fallback">지도 로드 중…</div>
        }
      </div>
      <div className="nav">
        <button className="nav-btn" onClick={onBack}>{Ico.back}</button>
        <span className="nav-title">픽업 위치 설정</span>
      </div>
      {/* 중앙 핀 */}
      <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%, -100%)", pointerEvents: "none", zIndex: 3 }}>
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none">
          <ellipse cx="16" cy="40" rx="6" ry="2" fill="rgba(0,0,0,0.18)"/>
          <path d="M16 2c-6 0-10 4-10 10 0 8 10 26 10 26s10-18 10-26c0-6-4-10-10-10z" fill="#1A1F2B"/>
          <circle cx="16" cy="12" r="3.5" fill="#fff"/>
        </svg>
      </div>
      <button className={`gps-fab ${locating ? "gps-spin" : ""}`} style={{ bottom: 280 }} onClick={refreshLoc}>{Ico.loc}</button>

      <DraggableSheet snapPoints={[120, 580, 700]} initial={1}>
        <div className="pickup-status">
          <span className="dotL" style={{ background: "#34C759" }} />
          <span className="text">차량 진입 가능</span>
        </div>
        <div className="pickup-addr">서울 강남구 테헤란로 123 앞</div>
        <div className="pickup-notice">
          <span>⚠️</span>
          <span>도로 상황·장애물에 따라 실제 픽업 위치가 달라질 수 있어요</span>
        </div>
        <div className="sheet-cta">
          <button className="cta" onClick={onCTA}>이 위치로 픽업 확정</button>
        </div>
      </DraggableSheet>
    </div>
  );
}

/* ────────── Step 2 — 경험 선택 ────────── */
function Step2({ tmap, loc, dest, routes, tierIdx, setTier, err, loading, onCTA, rd, tierMeta, onBack, onLater }) {
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === tierIdx, color: TIERS[i].line }));
  const markers = dest ? [{ lat: loc.lat, lng: loc.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: loc.lat, lng: loc.lng }];
  const distKm = rd.stats?.express || "—";

  return (
    <div className="full">
      <div className="map-bg">
        {tmap
          ? <TMapMap key="m2" center={dest || loc} routes={mapRoutes} markers={markers} height="100%" />
          : <div className="map-fallback">지도 로드 중…</div>
        }
      </div>
      <div className="nav">
        <button className="nav-btn" onClick={onBack}>{Ico.back}</button>
      </div>

      {/* 라우트 정보 칩 (지도 위 mint chip) */}
      <div className="route-chip">
        <span className="nm">{tierMeta.label} 경로</span>
        <span className="dot-l" style={{ background: tierMeta.line }} />
        <span className="meta">{rd.time} · {distKm}</span>
      </div>

      <DraggableSheet snapPoints={[60, 320, 600]} initial={1}>
        <div className="sheet-head">
          <span className="ttl">경험 선택</span>
          <button className="later-chip" onClick={onLater}>나중에 출발</button>
        </div>
        <div className="divider-line" />

        {err && <div className="err">경로 탐색 실패 — 샘플 데이터로 표시합니다</div>}
        {loading && (
          <div className="loading-wrap">
            <div style={{ fontSize: 14, color: "#6B7280" }}>경로 탐색 중…</div>
            <div className="loading-bar"><div className="loading-fill" /></div>
          </div>
        )}

        {!loading && routes.map((r, i) => {
          const meta = TIERS[i];
          const on = i === tierIdx;
          const features = TIER_FEATURES[meta.key];
          return (
            <div key={meta.key}>
              {i > 0 && <div className="divider-line" />}
              <div className={`trow ${on ? "on" : ""}`} onClick={() => setTier(i)}>
                <div className="top">
                  <div className="car-wrap">{Ico.car(meta.chip)}</div>
                  <div className="meta">
                    <div className="nm">{meta.label}</div>
                    <div className="why">{meta.why}</div>
                  </div>
                  <span className="time-pill" style={{ background: meta.chip }}>{r.time}</span>
                  <div className="price">{r.price}</div>
                </div>
                {features.length > 0 && (
                  <div className="feats">
                    {features.map((f, j) => <div key={j} className="f">✔ {f}</div>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="divider-line" />
        <div className="pay-row">
          <div className="sq" />
          <div className="body">
            <div className="name">현대카드 ••••8702</div>
            <div className="sub">결제 수단</div>
          </div>
          <span className="chev">›</span>
        </div>

        <div className="sheet-cta">
          <button className="cta" onClick={onCTA}>다음 — {rd.price}</button>
        </div>
      </DraggableSheet>
    </div>
  );
}

/* ────────── Step 2.5 — 나중에 출발 (Notion) ────────── */
const LATER_TIMES = [
  { gap: "15분 후",      at: "오후 2:15", time: "27분", price: "₩12,400", label: "경미한 정체",   color: "#E9A23B" },
  { gap: "45분 후",      at: "오후 2:45", time: "29분", price: "₩15,500", label: "정체 구간 포함", color: "#E94B3B" },
  { gap: "1시간 30분 후", at: "오후 3:30", time: "24분", price: "₩13,800", label: "정체 없음",     color: "#34C759", recommend: true },
];

function Step25({ tmap, loc, dest, routes, tierMeta, whenIdx, setWhen, onBack, onCTA }) {
  const sel = LATER_TIMES[whenIdx];
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === 2, color: "#34C759" }));
  const markers = dest ? [{ lat: loc.lat, lng: loc.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: loc.lat, lng: loc.lng }];

  return (
    <div className="full">
      <div className="map-bg">
        {tmap
          ? <TMapMap key="m25" center={dest || loc} routes={mapRoutes} markers={markers} height="100%" />
          : <div className="map-fallback">지도 로드 중…</div>
        }
      </div>
      <div className="nav">
        <button className="nav-btn" onClick={onBack}>{Ico.back}</button>
      </div>

      <DraggableSheet snapPoints={[60, 320, 600]} initial={1}>
        <div className="sheet-head">
          <span className="ttl">나중에 출발</span>
        </div>
        <div style={{ padding: "0 20px 12px", fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
          출발 시간을 선택하면 정체가 가장 적은 시간을 추천해드려요
        </div>

        {/* 민트 배너: Glide · 27분 · 급커브 없음 */}
        <div style={{ margin: "0 20px 16px", background: "#ECFAF6", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>{tierMeta.label}</span>
          <span style={{ width: 4, height: 4, borderRadius: 50, background: "#6B7280" }} />
          <span style={{ color: "#6B7280" }}>27분 · 급커브 없음</span>
        </div>

        {/* 시간 카드 리스트 */}
        <div style={{ padding: "0 20px" }}>
          {LATER_TIMES.map((t, i) => {
            const on = i === whenIdx;
            return (
              <div key={i}
                onClick={() => setWhen(i)}
                style={{
                  padding: "14px 0", display: "flex", alignItems: "center", gap: 10,
                  borderBottom: "1px solid #F2F2F7", cursor: "pointer",
                }}
              >
                <span style={{ width: 18, color: on ? "#1A1F2B" : "#C7C7CC", fontSize: 14 }}>{on ? "✓" : ""}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 600 }}>{t.at}</span>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>({t.gap})</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 50, background: t.color }} />
                    <span>{t.label}</span>
                    {t.recommend && (
                      <span style={{ background: "#EAF1FE", color: "#2F6FED", fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 600, marginLeft: 4 }}>추천</span>
                    )}
                  </div>
                </div>
                <span className="time-pill" style={{ background: "#5FD3B3" }}>{t.time}</span>
                <span style={{ fontSize: 15, fontWeight: 600, minWidth: 70, textAlign: "right" }}>{t.price}</span>
              </div>
            );
          })}
        </div>

        {/* 직접 설정 dial */}
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1F2B", marginBottom: 8 }}>직접 설정</div>
          <div style={{ background: "#F4F7FB", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-around", fontSize: 17, fontWeight: 500 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", color: "#1A1F2B" }}>
              <span style={{ color: "#C7C7CC", fontSize: 14 }}>오전</span>
              <span style={{ fontWeight: 600 }}>오후</span>
            </div>
            <span style={{ fontWeight: 600 }}>3시</span>
            <span style={{ color: "#C7C7CC" }}>:</span>
            <span style={{ fontWeight: 600 }}>30분</span>
          </div>
        </div>

        <div className="sheet-cta" style={{ marginTop: 16 }}>
          <button className="cta" onClick={onCTA}>이 시간으로 예약 · {sel.price}</button>
        </div>
      </DraggableSheet>
    </div>
  );
}

/* ────────── Step 3 — 호출 확정 ────────── */
function Step3({ tmap, pickup, dest, route, tierMeta, routes, tierIdx, onCTA, onBack }) {
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === tierIdx, color: tierMeta.line }));
  const markers = dest ? [{ lat: pickup.lat, lng: pickup.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: pickup.lat, lng: pickup.lng }];
  return (
    <div className="full">
      <div className="map-bg">
        {tmap
          ? <TMapMap key="m3" center={dest || pickup} routes={mapRoutes} markers={markers} height="100%" />
          : <div className="map-fallback">지도 로드 중…</div>
        }
      </div>
      <div className="nav">
        <button className="nav-btn" onClick={onBack}>{Ico.back}</button>
        <span className="nav-title">호출 확정</span>
      </div>

      <DraggableSheet snapPoints={[60, 380, 600]} initial={1}>
        <div style={{ padding: "0 20px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 50, background: tierMeta.line }} />
            <span style={{ fontSize: 13, color: "#6B7280" }}>{tierMeta.label} 경로</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{route.time} 예상 도착</div>
        </div>

        <div className="summary">
          <div className="row-s">
            <div style={{ width: 20 }}>{Ico.pin}</div>
            <div><div className="lbl">픽업</div><div className="val">현재 위치 부근</div></div>
          </div>
          <div style={{ height: 1, background: "#E8E5E0", marginLeft: 30 }} />
          <div className="row-s">
            <div style={{ width: 20 }}>{Ico.flag}</div>
            <div><div className="lbl">목적지</div><div className="val">{dest?.name || "—"}</div></div>
          </div>
        </div>

        <div className="divider-line" style={{ marginTop: 16 }} />
        <div className="pay-row">
          <div className="sq" />
          <div className="body">
            <div className="name">현대카드 ••••8702</div>
            <div className="sub">결제 수단</div>
          </div>
          <span className="chev">›</span>
        </div>

        <div className="sheet-cta">
          <button className="cta" onClick={onCTA}>호출하기 · {route.price}</button>
        </div>
      </DraggableSheet>
    </div>
  );
}

/* ────────── Step 4 — Approaching ────────── */
function Step4({ loc, tmap, route, tierMeta, onCancel, onBack }) {
  return (
    <div className="full">
      <div className="map-bg">
        {tmap
          ? <TMapMap key="m4" center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height="100%" />
          : <div className="map-fallback">지도 로드 중…</div>
        }
      </div>
      <div className="nav">
        <button className="nav-btn" onClick={onBack}>{Ico.back}</button>
        <span className="nav-title">차량 접근 중</span>
      </div>

      <DraggableSheet snapPoints={[120, 480, 660]} initial={1}>
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

        <div style={{ padding: "16px 20px 0", fontSize: 13, color: "#6B7280" }}>
          {route.name} · {route.time} 예상 · {route.price}
        </div>

        <div className="sheet-cta">
          <button className="cta-ghost" onClick={onCancel}>호출 취소</button>
        </div>
      </DraggableSheet>
    </div>
  );
}
