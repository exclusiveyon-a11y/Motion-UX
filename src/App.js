import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ─────────────────────────────────────────────────────────
   Glide — 자율주행 호출 프로토타입
   디자인 토큰: design/DESIGN.md (Pretendard / 무채색 + 4단계 등급)
   백엔드: api/directions.js, api/places.js (TMap proxy)
   ───────────────────────────────────────────────────────── */

const TIERS = [
  { key: "rush",       label: "Rush",       sub: "최단 경로",      color: "#A0AEC0", line: "#A0AEC0", short: "빠르고 직접적인 이동" },
  { key: "cruise",     label: "Cruise",     sub: "균형 경로",      color: "#E9A23B", line: "#E9A23B", short: "균형 잡힌 무난한 이동" },
  { key: "glide",      label: "Glide",      sub: "멀미 저감 경로", color: "#5FD3B3", line: "#34C759", short: "큰길 위주 · 부드러운 이동" },
  { key: "pure-glide", label: "Pure Glide", sub: "최적 편안 경로", color: "#2F6FED", line: "#2F6FED", short: "특수 차량 · 가장 부드러운 이동" },
];

// 등급별 차량 세팅 (Notion 검토 사항 반영)
const TIER_FEATURES = {
  rush:        ["최단 시간 우선", "법정 최고속도 운행"],
  cruise:      ["액티브 서스펜션", "IVIS ON/OFF", "시트 각도 90~135°", "블라인드 개방", "실내 온도·환기 조절"],
  glide:       ["액티브 서스펜션", "IVIS ON/OFF", "시트 각도 90~135°", "블라인드 개방", "실내 온도·환기 조절"],
  "pure-glide":["액티브 서스펜션 + 커브 틸팅", "IVIS 높이 슬라이더", "시트 각도 90~150° + 리클라이닝", "저소음 캐빈 · 파노라마 · 조명", "최고속도 사용자 조절"],
};

// 폴백 (TMap 실패/검색 안 함)
const MOCK_ROUTES = [
  { tier: 0, name: "최단 경로",       why: "도심 경유 · 빠른 이동",                  time: "23분", diff: "기본",  pills: [{t:"도심 경유"},{t:"정체 구간",m:true},{t:"법정 최고속도",m:true}], price:"₩10,800", pdiff:"기본",         preason:"추가 가산 없음",   bar:10, msdv:72, points:[], stats:{cong:9,alley:4,turns:14,express:"2.8km"} },
  { tier: 1, name: "균형 경로",       why: "간선도로 위주 · 무난한 이동",             time: "25분", diff: "+2분", pills: [{t:"간선도로 위주"},{t:"완만한 가감속"},{t:"도심 일부",m:true}], price:"₩11,500", pdiff:"+₩700",      preason:"간선도로 가산",    bar:36, msdv:55, points:[], stats:{cong:5,alley:2,turns:9, express:"4.1km"} },
  { tier: 2, name: "멀미 저감 경로",  why: "완만한 커브 · 큰길 위주",                 time: "27분", diff: "+4분", pills: [{t:"급정거 3회 감소"},{t:"큰길 위주"},{t:"부드러운 가감속"}],  price:"₩12,400", pdiff:"+₩1,600",    preason:"편안함 가산",      bar:65, msdv:36, points:[], stats:{cong:2,alley:0,turns:4, express:"4.1km"} },
  { tier: 3, name: "최적 편안 경로", why: "저주파 진동 최소 · 큰길 + 완만한 커브",   time: "29분", diff: "+6분", pills: [{t:"저주파 진동 최소"},{t:"저속 순항"},{t:"급가감속 없음"}],  price:"₩13,800", pdiff:"+₩3,000",    preason:"최적 편안 가산",   bar:90, msdv:18, points:[], stats:{cong:1,alley:0,turns:2, express:"4.1km"} },
];

const FAVORITES = [
  { name: "회사",     addr: "서울시 강남구 테헤란로 427",      lat: 37.5064, lng: 127.0536, kind: "work" },
  { name: "집",       addr: "서울시 마포구 와우산로 94",       lat: 37.5511, lng: 126.9233, kind: "home" },
];
const RECENTS = [
  { name: "코엑스몰",        addr: "서울시 강남구 봉은사로 524",  lat: 37.5127, lng: 127.0594 },
  { name: "잠실역 2번 출구", addr: "서울시 송파구 올림픽로 240", lat: 37.5133, lng: 127.1001 },
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
  return (data?.features||[])
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
  { maxSpeedRatio:1.0, cruiseHighway:110, cruiseUrban:60, maxAccel:3.0, maxDecel:4.0, maxLateralAccel:3.0, jerkLimit:null },
  { maxSpeedRatio:0.9, cruiseHighway:100, cruiseUrban:55, maxAccel:2.0, maxDecel:2.5, maxLateralAccel:2.0, jerkLimit:2.0 },
  { maxSpeedRatio:0.8, cruiseHighway:90,  cruiseUrban:50, maxAccel:1.2, maxDecel:1.5, maxLateralAccel:1.5, jerkLimit:1.0 },
  { maxSpeedRatio:0.7, cruiseHighway:80,  cruiseUrban:45, maxAccel:0.8, maxDecel:1.0, maxLateralAccel:0.8, jerkLimit:0.5 },
];
const SURFACE_GRADE_PENALTY = { 1:0, 2:3, 3:8, 4:15, 5:25 };
const TIER_SURFACE_THRESHOLD = [null, 5, 4, 3];
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
    const grade = getMockSurfaceGrade(l.name);
    if (grade >= thr) {
      const pen = SURFACE_GRADE_PENALTY[grade] ?? 0;
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
function analyzePills(fastLinks, comfortLinks) {
  const fCong=fastLinks.filter(l=>l.congestion>=1).length;
  const cCong=comfortLinks.filter(l=>l.congestion>=1).length;
  const fAlley=fastLinks.filter(l=>l.roadType===8).length;
  const cAlley=comfortLinks.filter(l=>l.roadType===8).length;
  const fTurns=fastLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length;
  const cTurns=comfortLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length;
  const congDiff=fCong-cCong, alleyDiff=fAlley-cAlley, turnDiff=fTurns-cTurns;
  return {
    congDiff, alleyDiff, turnDiff,
    comfortPills: [
      congDiff>0 ? {t:`급정거 ${congDiff}회 감소`} : null,
      alleyDiff>0 || cAlley<fAlley ? {t:"큰길 위주"} : null,
      turnDiff>0 ? {t:"완만한 커브"} : {t:"완만한 커브"},
    ].filter(Boolean).slice(0,3),
    why: [congDiff>0 ? "정체 구간 회피" : null, alleyDiff>0 ? "이면도로 최소화" : null, "완만한 커브 · 큰길 위주"].filter(Boolean)[0] || "완만한 커브 · 큰길 위주",
  };
}

async function buildRoutes(origin, dest) {
  const p = `startX=${origin.lng}&startY=${origin.lat}&endX=${dest.lng}&endY=${dest.lat}`;
  const [td, rd] = await Promise.all([
    fetch(`/api/directions?${p}&searchOption=0`).then(r => r.json()),
    fetch(`/api/directions?${p}&searchOption=2`).then(r => r.json()),
  ]);
  const tLinks=extractLinks(td), rLinks=extractLinks(rd);
  const tp=extractPts(td), rp=extractPts(rd);
  const ts=extractSum(td), rs=extractSum(rd);
  const rawT=calcRouteMSDV(tp, tLinks);
  const rawR=calcRouteMSDV(rp, rLinks);

  const tExpress=tLinks.filter(l=>l.isExpressway);
  const rExpress=rLinks.filter(l=>l.isExpressway);
  const tExpKm=+(tExpress.reduce((s,l)=>s+l.distance,0)/1000).toFixed(1);
  const rExpKm=+(rExpress.reduce((s,l)=>s+l.distance,0)/1000).toFixed(1);
  const tBadSurf=tExpress.filter(l=>getMockSurfaceGrade(l.name)>=4).length;
  const rBadSurf=rExpress.filter(l=>getMockSurfaceGrade(l.name)>=4).length;
  const rawT_sp=Math.min(95, rawT+calcSurfacePenalty(tLinks,1));
  const tSpeedPen=Math.min(12, Math.round(tLinks.reduce((s,l)=>s+applySpeedPenalty(l,0),0)));
  const rSpeedPen=Math.min(6,  Math.round(rLinks.reduce((s,l)=>s+applySpeedPenalty(l,1),0)));
  const rm=Math.max(rawR, 35);
  const tm=Math.min(95, Math.max(rawT_sp + tSpeedPen, rm + 20, 55));

  const tCong =tLinks.filter(l=>l.congestion>=1).length;
  const tAlley=tLinks.filter(l=>l.roadType===8).length;
  const tTurns=tLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length;
  const rCong =rLinks.filter(l=>l.congestion>=1).length;
  const rAlley=rLinks.filter(l=>l.roadType===8).length;
  const rTurns=rLinks.filter(l=>SHARP_TURNS.includes(l.turnType)).length;
  const tStats={cong:tCong,alley:tAlley,turns:tTurns,express:`${tExpKm}km`};
  const rStats={cong:rCong,alley:rAlley,turns:rTurns,express:`${rExpKm}km`};

  const { comfortPills, why: comfortWhy, congDiff } = analyzePills(tLinks, rLinks);
  if (tBadSurf>0 || tBadSurf>rBadSurf) comfortPills.push({t:"노면 불량 구간 우회"});
  const sportPills   = [{t:`${ts.dist}km`}, tCong>0?{t:`정체 ${tCong}구간`,m:true}:{t:"급정거 多",m:true}, {t:"법정 최고속도",m:true}];
  const naturalPills = [{t:"간선도로 위주"},{t:"완만한 가감속"},{t:`${rs.dist}km`}];
  if (comfortPills.length<3) comfortPills.push({t:"부드러운 가감속"});
  const antiPills = [
    {t:"저주파 진동 최소"},
    {t:"저속 순항"},
    rBadSurf===0&&tBadSurf>0 ? {t:"노면 불량 구간 우회"} : (congDiff>0 ? {t:`급정거 ${congDiff}회 최소화`} : {t:"급가감속 없음"}),
  ];

  const B = ts.fare;
  const f = n => `₩${Math.round(n).toLocaleString()}`;
  const dm = m => m<=0 ? "기본" : `+${m}분`;
  const bm = ts.dur;
  return [
    { tier:0, name:"최단 경로",       why:"도심 경유 · 빠른 이동",                  time:`${ts.dur}분`,    diff:"기본",          pills:sportPills,   price:f(B),       pdiff:"기본",            preason:"추가 가산 없음",  bar:10, msdv:tm,                                  points:tp, stats:tStats },
    { tier:1, name:"균형 경로",       why:"간선도로 위주 · 무난한 이동",             time:`${rs.dur}분`,    diff:dm(rs.dur-bm),   pills:naturalPills, price:f(B*1.06),  pdiff:`+${f(B*0.06)}`,    preason:"간선도로 가산",   bar:36, msdv:Math.min(95, rm+rSpeedPen),         points:rp, stats:rStats },
    { tier:2, name:"멀미 저감 경로",  why:comfortWhy,                                time:`${rs.dur+2}분`,  diff:dm(rs.dur+2-bm), pills:comfortPills, price:f(B*1.15),  pdiff:`+${f(B*0.15)}`,    preason:"편안함 가산",    bar:65, msdv:Math.max(15, Math.round(rm*0.48)),  points:rp, stats:rStats },
    { tier:3, name:"최적 편안 경로", why:"저주파 진동 최소 · 큰길 + 완만한 커브",   time:`${rs.dur+4}분`,  diff:dm(rs.dur+4-bm), pills:antiPills,    price:f(B*1.28),  pdiff:`+${f(B*0.28)}`,    preason:"최적 편안 가산", bar:90, msdv:Math.max(8,  Math.round(rm*0.18)),  points:rp, stats:rStats },
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
      zoom: 15,
      zoomControl: false,
      scrollwheel: interactive,
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

/* ────────── 라벨 (수치 → 자연어) ────────── */
function congestionLabel(msdv) {
  if (msdv < 30) return { dot: "🟢", text: "정체 없음",        color: "#34C759" };
  if (msdv < 55) return { dot: "🟡", text: "경미한 정체",      color: "#E9A23B" };
  return            { dot: "🔴", text: "정체 구간 포함",      color: "#E94B3B" };
}

/* ────────── 아이콘 ────────── */
const Ico = {
  back:   <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  close:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#6B7280" strokeWidth="1.6"/><path d="M16.5 16.5L21 21" stroke="#6B7280" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  loc:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  pin:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" stroke="#1A1F2B" strokeWidth="1.6" fill="#fff"/><circle cx="12" cy="9" r="2.5" fill="#1A1F2B"/></svg>,
  flag:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 3v18M5 4h12l-2 4 2 4H5" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  home:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9z" stroke="#1A1F2B" strokeWidth="1.6" strokeLinejoin="round"/></svg>,
  work:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="1.5" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="#1A1F2B" strokeWidth="1.6"/></svg>,
  clock:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M12 7v5l3 2" stroke="#1A1F2B" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  card:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="6" width="19" height="13" rx="2" stroke="#1A1F2B" strokeWidth="1.6"/><path d="M2.5 10h19" stroke="#1A1F2B" strokeWidth="1.6"/></svg>,
  chev:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#C7C7CC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
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
    max-width: 430px; margin: 0 auto;
    min-height: 100dvh; background: #FFFFFF;
    display: flex; flex-direction: column;
    position: relative; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.04);
  }

  /* status bar (cosmetic) */
  .statusbar {
    height: 44px; padding: 14px 24px 0; display: flex; justify-content: space-between; align-items: flex-start;
    font-size: 15px; font-weight: 600; color: #1A1F2B;
  }
  .statusbar .right { display: flex; gap: 6px; align-items: center; opacity: .85; }

  /* nav */
  .nav {
    height: 56px; padding: 0 8px 0 4px; display: flex; align-items: center; gap: 4px;
    background: #FFFFFF; position: relative; z-index: 5;
  }
  .nav-btn {
    width: 44px; height: 44px; border: none; background: transparent; cursor: pointer;
    border-radius: 100px; display: flex; align-items: center; justify-content: center;
  }
  .nav-btn:active { background: #F2F2F7; }
  .nav-title { font-size: 18px; font-weight: 600; color: #1A1F2B; flex: 1; padding-left: 4px; }
  .nav-dots { display: flex; gap: 5px; padding-right: 16px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #E8E5E0; transition: all .25s; }
  .dot.done { background: #1A1F2B; }
  .dot.active { width: 18px; border-radius: 3px; background: #1A1F2B; }

  /* content */
  .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; background: #FFFFFF; }

  /* map */
  .map-wrap { position: relative; }
  .map-overlay-chip {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(255,255,255,0.92); backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    box-shadow: 0 8px 40px rgba(0,0,0,.12); border-radius: 100px;
    padding: 8px 14px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;
  }
  .gps-fab {
    position: absolute; right: 16px; bottom: 16px;
    width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
    background: rgba(255,255,255,0.92); backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    box-shadow: 0 8px 40px rgba(0,0,0,.12);
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

  /* tabs */
  .tabs { display: flex; padding: 12px 16px 8px; gap: 8px; background: #FFFFFF; }
  .tab {
    height: 36px; padding: 0 16px; border-radius: 100px;
    font-size: 13px; font-weight: 500; color: #6B7280; background: #F4F7FB;
    border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  }
  .tab.on { background: #1A1F2B; color: #FFFFFF; }

  /* sections */
  .section { padding: 16px; }
  .section + .section { padding-top: 0; }
  .sec-h {
    font-size: 12px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase;
    color: #6B7280; padding: 8px 0 8px;
  }

  /* search input */
  .search-input {
    height: 56px; background: #F4F7FB; border-radius: 14px; padding: 0 16px;
    display: flex; align-items: center; gap: 10px;
  }
  .search-input input {
    border: none; background: transparent; width: 100%;
    font-size: 17px; color: #1A1F2B;
  }
  .search-input input::placeholder { color: #8C8C8C; }
  .search-results { padding-top: 4px; }
  .search-row {
    display: flex; gap: 12px; padding: 14px 4px; cursor: pointer;
    border-bottom: 1px solid #F2F2F7; align-items: flex-start;
  }
  .search-row:last-child { border-bottom: none; }
  .search-row:active { background: #FAFAF8; }
  .search-row .icon-box { width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; background: #F4F7FB; display: flex; align-items: center; justify-content: center; }
  .search-row .body { flex: 1; min-width: 0; }
  .search-row .title { font-size: 15px; font-weight: 500; color: #1A1F2B; }
  .search-row .addr { font-size: 13px; color: #6B7280; margin-top: 2px; }

  /* favorite chips */
  .fav-grid { display: flex; gap: 8px; padding: 4px 0 12px; }
  .fav-chip {
    flex: 1; min-width: 0; display: flex; gap: 8px; align-items: center;
    background: #F4F7FB; border-radius: 100px;
    height: 44px; padding: 0 14px; cursor: pointer;
  }
  .fav-chip:active { background: #E8EAF1; }
  .fav-chip .name { font-size: 13px; font-weight: 500; }
  .fav-chip .addr { font-size: 11px; color: #6B7280; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* later tab */
  .time-list { display: flex; flex-direction: column; gap: 8px; }
  .time-card {
    background: #FFFFFF; border: 1px solid #E8E5E0; border-radius: 14px;
    padding: 16px; cursor: pointer; transition: all .15s;
    display: flex; justify-content: space-between; align-items: center;
  }
  .time-card.on { background: #F4F7FB; border-color: #1A1F2B; }
  .time-card .label { font-size: 13px; color: #6B7280; }
  .time-card .when { font-size: 17px; font-weight: 600; }
  .time-card .badge-rec { font-size: 11px; color: #2F6FED; background: #EAF1FE; border-radius: 6px; padding: 4px 8px; font-weight: 600; letter-spacing: 0.06em; margin-left: 8px; }

  /* loading */
  .loading-wrap {
    padding: 80px 24px; display: flex; flex-direction: column; align-items: center; gap: 14px;
  }
  .loading-bar { width: 220px; height: 3px; background: #F2F2F7; border-radius: 2px; overflow: hidden; }
  .loading-fill { height: 100%; width: 30%; background: #1A1F2B; border-radius: 2px; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0%{transform:translateX(-100%)} 50%{transform:translateX(280%)} 100%{transform:translateX(-100%)} }
  .loading-msg { font-size: 14px; color: #6B7280; }

  /* tier list */
  .tier-list { display: flex; flex-direction: column; }
  .tier-row {
    border-bottom: 1px solid #F2F2F7;
    padding: 16px; cursor: pointer; transition: background .15s;
    display: flex; flex-direction: column; gap: 10px;
  }
  .tier-row:last-child { border-bottom: none; }
  .tier-row.on { background: #FAFAF8; }
  .tier-row .top { display: flex; gap: 12px; align-items: center; }
  .tier-row .left-bar { width: 4px; height: 36px; border-radius: 2px; }
  .tier-row .meta { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .tier-row .label { display: flex; align-items: center; gap: 8px; }
  .tier-row .label .nm { font-size: 17px; font-weight: 600; color: #1A1F2B; }
  .tier-pill {
    display: inline-flex; align-items: center; height: 22px; padding: 0 8px;
    border-radius: 100px; font-size: 11px; font-weight: 600; color: #FFFFFF;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .tier-row .why { font-size: 13px; color: #6B7280; line-height: 1.4; }
  .tier-row .right { text-align: right; flex-shrink: 0; }
  .tier-row .time { font-size: 22px; font-weight: 600; }
  .tier-row .price { font-size: 13px; color: #6B7280; margin-top: 2px; font-feature-settings: 'tnum'; }
  .tier-row .diff { font-size: 11px; color: #8C8C8C; margin-top: 1px; }

  .tier-row .status-row { display: flex; align-items: center; gap: 6px; }
  .tier-row .status-text { font-size: 13px; color: #6B7280; }

  /* expand */
  .tier-row .expand { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; border-top: 1px solid #F2F2F7; }
  .feat-list { display: flex; flex-direction: column; gap: 8px; }
  .feat { display: flex; gap: 10px; align-items: center; font-size: 14px; color: #1A1F2B; }
  .feat .ck { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #E8F8F2; color: #34C759; flex-shrink: 0; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .stat-cell { background: #F4F7FB; border-radius: 10px; padding: 10px 6px 8px; text-align: center; }
  .stat-num { display: block; font-size: 17px; font-weight: 600; line-height: 1.1; font-feature-settings: 'tnum'; }
  .stat-lbl { display: block; font-size: 11px; color: #6B7280; margin-top: 4px; }

  /* segment bar */
  .seg-strip { height: 16px; border-radius: 8px; overflow: hidden; display: flex; background: #F2F2F7; margin-top: 4px; }
  .seg { height: 100%; }

  /* pickup status banner */
  .status-banner {
    margin: 0 16px 12px; padding: 12px 14px; border-radius: 10px;
    display: flex; gap: 10px; align-items: center;
  }
  .status-banner.ok    { background: #E8F8F2; color: #1A1F2B; }
  .status-banner.bad   { background: #FBF1E0; color: #1A1F2B; }
  .status-banner .dot-light { width: 8px; height: 8px; border-radius: 50%; }

  /* notice */
  .notice {
    margin: 0 16px 12px; background: #FBF1E0; color: #1A1F2B;
    border-radius: 8px; padding: 12px; font-size: 13px; line-height: 1.5;
    display: flex; gap: 8px; align-items: flex-start;
  }
  .notice .ic { flex-shrink: 0; }

  /* summary rows (Step 3) */
  .summary-card {
    margin: 0 16px 12px; background: #FAFAF8; border-radius: 14px; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .summary-row { display: flex; gap: 12px; align-items: flex-start; }
  .summary-row .ic { width: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding-top: 1px; }
  .summary-row .lbl { font-size: 11px; color: #6B7280; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
  .summary-row .val { font-size: 14px; color: #1A1F2B; font-weight: 500; margin-top: 2px; }

  /* payment row */
  .pay-row {
    margin: 0 16px 16px; height: 56px; border-radius: 14px;
    border: 1px solid #E8E5E0; padding: 0 14px;
    display: flex; align-items: center; gap: 12px; cursor: pointer; background: #FFFFFF;
  }
  .pay-row .name { flex: 1; font-size: 14px; font-weight: 500; }
  .pay-row .change { font-size: 14px; color: #2F6FED; font-weight: 500; }

  /* CTA */
  .cta-bar {
    padding: 12px 16px 28px; background: #FFFFFF;
    box-shadow: 0 -1px 0 #F2F2F7;
  }
  .cta {
    width: 100%; height: 56px; border-radius: 16px; border: none; cursor: pointer;
    background: #1A1F2B; color: #FFFFFF; font-size: 17px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: opacity .15s;
  }
  .cta:active { opacity: .85; }
  .cta:disabled { background: #D1D1D6; cursor: not-allowed; }
  .cta-ghost {
    width: 100%; height: 52px; border-radius: 16px; cursor: pointer;
    background: transparent; color: #6B7280; border: 1px solid #E8E5E0;
    font-size: 15px; font-weight: 500; margin-top: 8px;
  }

  /* err */
  .err { margin: 12px 16px; padding: 10px 14px; background: #FFF1F0; color: #B91C1C; border-radius: 10px; font-size: 13px; }

  /* approaching */
  .approach-card {
    margin: 0 16px 12px; padding: 16px; border-radius: 14px;
    background: #1A1F2B; color: #FFFFFF;
  }
  .approach-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .approach-row .label { font-size: 13px; color: rgba(255,255,255,0.65); }
  .approach-row .plate { font-size: 13px; font-weight: 500; background: rgba(255,255,255,0.12); border-radius: 6px; padding: 3px 8px; margin-top: 6px; display: inline-block; }
  .approach-row .eta { font-size: 32px; font-weight: 600; line-height: 1; font-feature-settings: 'tnum'; }
  .approach-row .dist { font-size: 13px; color: rgba(255,255,255,0.65); margin-top: 4px; }

  .ready-grid { margin: 0 16px 12px; display: flex; flex-direction: column; gap: 8px; }
  .ready-pill {
    display: flex; align-items: center; gap: 10px; padding: 12px 14px;
    background: #F4F7FB; border-radius: 12px;
  }
  .ready-pill .ck-circle {
    width: 22px; height: 22px; border-radius: 50%;
    background: #34C759; color: #fff;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .ready-pill .text { font-size: 14px; font-weight: 500; }

  /* segment overlay (route comparison) */
  .seg-tag {
    position: absolute; left: 50%; transform: translateX(-50%); bottom: 12px;
    background: rgba(255,255,255,0.92); backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 100px; padding: 8px 14px; font-size: 12px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.12); display: flex; align-items: center; gap: 8px;
  }
  .seg-tag .dot-l { width: 8px; height: 8px; border-radius: 50%; }

  /* mini sheet handle */
  .sheet-handle {
    width: 36px; height: 4px; border-radius: 2px; background: #D1D1D6;
    margin: 8px auto 4px;
  }
`;

/* ────────── 메인 ────────── */
export default function App() {
  // 0=홈, 1=destination, 1.5=pickup, 2=routes, 3=confirm, 4=approaching
  const [step, setStep]   = useState(1);
  const [tab, setTab]     = useState("now"); // 'now' | 'later'
  const [whenIdx, setWhenIdx] = useState(0);

  const [tierIdx, setTier] = useState(2);
  const [expanded, setExpanded] = useState(2);

  const [loc, setLoc]       = useState({ lat: 37.5665, lng: 126.9780 });
  const [locating, setLocating] = useState(false);
  const [pickup, setPickup] = useState(null); // 픽업 위치 (Step 1.5)
  const [pickupOk, setPickupOk] = useState(true);

  const [dest, setDest]     = useState(null);
  const [query, setQuery]   = useState("");
  const [routes, setRoutes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(false);
  const [carX, setCarX]     = useState(20);
  const carDir = useRef(1);

  const tmap = useTmap();
  const { results, search, clear } = usePlaces();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}
    );
  }, []);

  useEffect(() => {
    if (step !== 4) return;
    const iv = setInterval(() => setCarX(x => {
      const n = x + carDir.current * 0.6;
      if (n > 78) { carDir.current = -1; return 78; }
      if (n < 14) { carDir.current = 1;  return 14; }
      return n;
    }), 80);
    return () => clearInterval(iv);
  }, [step]);

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
  const reset = () => {
    setStep(1); setRoutes(null); setDest(null); setQuery(""); setTier(2); setExpanded(2); setPickup(null);
  };

  const list = routes || MOCK_ROUTES;
  const rd   = list[tierIdx];
  const tierMeta = TIERS[tierIdx];

  const dotIdx = useMemo(() => {
    if (step === 1) return 0;
    if (step === 1.5) return 1;
    if (step === 2) return 2;
    if (step === 3) return 3;
    if (step === 4) return 4;
    return 0;
  }, [step]);

  /* ────────── render ────────── */
  return (
    <>
      <style>{styles}</style>
      <div className="app">

        <StatusBar />

        <NavBar
          showBack={step > 1}
          onBack={() => {
            if (step === 4) reset();
            else if (step === 1.5) setStep(1);
            else if (step === 3) setStep(2);
            else if (step === 2) setStep(1.5);
            else setStep(1);
          }}
          title={
            step === 1   ? "어디로 갈까요?" :
            step === 1.5 ? "픽업 위치 설정" :
            step === 2   ? "경험 선택" :
            step === 3   ? "호출 확정" :
                           "차량 접근 중"
          }
          activeIdx={dotIdx}
        />

        <div className="content">

          {/* STEP 1 — 목적지 입력 */}
          {step === 1 && (
            <Step1
              tab={tab} setTab={setTab}
              loc={loc} tmap={tmap}
              query={query} onQueryChange={onQueryChange}
              results={results} onPickDest={onPickDest}
              dest={dest} setDest={setDest}
              whenIdx={whenIdx} setWhenIdx={setWhenIdx}
              refreshLoc={refreshLoc} locating={locating}
            />
          )}

          {/* STEP 1.5 — 픽업 위치 확정 */}
          {step === 1.5 && (
            <Step15
              loc={pickup || loc} tmap={tmap} ok={pickupOk} setPickupOk={setPickupOk}
              refreshLoc={refreshLoc} locating={locating}
            />
          )}

          {/* STEP 2 — 경로/등급 선택 */}
          {step === 2 && (
            loading
              ? <Loading />
              : <Step2
                  tmap={tmap} center={dest || loc}
                  routes={list} tierIdx={tierIdx} setTier={setTier}
                  expanded={expanded} setExpanded={setExpanded}
                  pickup={pickup || loc} dest={dest}
                  err={err}
                />
          )}

          {/* STEP 3 — 호출 확정 */}
          {step === 3 && (
            <Step3
              tmap={tmap} pickup={pickup || loc} dest={dest}
              route={rd} tierMeta={tierMeta} routes={list} tierIdx={tierIdx}
            />
          )}

          {/* STEP 4 — 차량 접근 중 (Approaching) */}
          {step === 4 && (
            <Step4 tmap={tmap} loc={pickup || loc} dest={dest} carX={carX} route={rd} tierMeta={tierMeta} />
          )}
        </div>

        {/* CTA bar */}
        <div className="cta-bar">
          {step === 1 && (
            <button className="cta" disabled={tab === "now" ? !dest : (whenIdx == null)} onClick={goPickup}>
              {tab === "now" ? "픽업 위치 설정" : "이 시간으로 호출 준비"}
            </button>
          )}
          {step === 1.5 && (
            <button className="cta" disabled={!pickupOk} onClick={confirmPickup}>
              이 위치로 픽업 확정
            </button>
          )}
          {step === 2 && !loading && (
            <button className="cta" onClick={goConfirm}>
              {tierIdx === 0 ? "바로 호출" : "다음 — 호출 확정"} · {rd.price}
            </button>
          )}
          {step === 3 && (
            <button className="cta" onClick={placeCall}>
              호출하기 · {rd.price}
            </button>
          )}
          {step === 4 && (
            <button className="cta-ghost" onClick={reset}>호출 취소</button>
          )}
        </div>

      </div>
    </>
  );
}

/* ────────── Sub-components ────────── */
function StatusBar() {
  return (
    <div className="statusbar">
      <span>9:41</span>
      <span className="right">
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none"><rect x="0" y="2" width="3" height="7" rx="1" fill="#1A1F2B"/><rect x="5" y="0" width="3" height="9" rx="1" fill="#1A1F2B"/><rect x="10" y="-2" width="3" height="11" rx="1" fill="#1A1F2B" opacity=".8"/></svg>
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none"><rect x="0.5" y="0.5" width="14" height="9" rx="2" stroke="#1A1F2B"/><rect x="2" y="2" width="11" height="6" rx="1" fill="#1A1F2B"/><rect x="15.5" y="3.5" width="1.5" height="3" rx="0.5" fill="#1A1F2B"/></svg>
      </span>
    </div>
  );
}

function NavBar({ showBack, onBack, title, activeIdx }) {
  return (
    <div className="nav">
      {showBack
        ? <button className="nav-btn" onClick={onBack}>{Ico.back}</button>
        : <div style={{ width: 44 }} />
      }
      <span className="nav-title">{title}</span>
      <div className="nav-dots">
        {[0,1,2,3,4].map(i => (
          <div key={i} className={`dot${i === activeIdx ? " active" : i < activeIdx ? " done" : ""}`} />
        ))}
      </div>
    </div>
  );
}

function Step1({ tab, setTab, loc, tmap, query, onQueryChange, results, onPickDest, whenIdx, setWhenIdx, refreshLoc, locating }) {
  return (
    <>
      <div className="map-wrap">
        {tmap
          ? <TMapMap key={`m1-${loc.lat}-${loc.lng}`} center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height={150} />
          : <div className="map-fallback" style={{ height: 150 }}><span className="fb-text">지도 로드 중…</span></div>
        }
        <button className={`gps-fab ${locating ? "gps-spin" : ""}`} onClick={refreshLoc}>{Ico.loc}</button>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "now" ? "on" : ""}`} onClick={() => setTab("now")}>지금 출발</button>
        <button className={`tab ${tab === "later" ? "on" : ""}`} onClick={() => setTab("later")}>나중에 출발</button>
      </div>

      {tab === "now" ? (
        <>
          <div className="section">
            <div className="search-input">
              {Ico.search}
              <input
                placeholder="목적지를 검색해 보세요"
                value={query}
                onChange={e => onQueryChange(e.target.value)}
              />
            </div>
            {results.length > 0 && (
              <div className="search-results">
                {results.map(r => (
                  <div key={r.name + r.addr} className="search-row" onClick={() => onPickDest(r)}>
                    <div className="icon-box">{Ico.pin}</div>
                    <div className="body">
                      <div className="title">{r.name}</div>
                      <div className="addr">{r.addr}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {results.length === 0 && <>
            <div className="section">
              <div className="sec-h">즐겨찾기</div>
              <div className="fav-grid">
                {FAVORITES.map(f => (
                  <div key={f.name} className="fav-chip" onClick={() => onPickDest(f)}>
                    {f.kind === "home" ? Ico.home : Ico.work}
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
                      <span className="name">{f.name}</span>
                      <span className="addr">{f.addr}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section">
              <div className="sec-h">최근 목적지</div>
              {RECENTS.map(r => (
                <div key={r.name} className="search-row" onClick={() => onPickDest(r)}>
                  <div className="icon-box">{Ico.clock}</div>
                  <div className="body">
                    <div className="title">{r.name}</div>
                    <div className="addr">{r.addr}</div>
                  </div>
                </div>
              ))}
            </div>
          </>}
        </>
      ) : (
        <div className="section">
          <div className="sec-h" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#EAF1FE", color: "#2F6FED", padding: "4px 8px", borderRadius: 6, fontSize: 11 }}>추천</span>
            <span>Glide Route 추천 출발 시간</span>
          </div>
          <div className="time-list">
            {[
              { gap: "15분 후", at: "오후 2:15", label: "정체 없음", color: "#34C759", rec: true },
              { gap: "30분 후", at: "오후 2:30", label: "경미한 정체", color: "#E9A23B", rec: false },
              { gap: "1시간 후", at: "오후 3:00", label: "경미한 정체", color: "#E9A23B", rec: false },
            ].map((t, i) => (
              <div key={i} className={`time-card ${whenIdx === i ? "on" : ""}`} onClick={() => setWhenIdx(i)}>
                <div>
                  <div className="label">{t.gap}</div>
                  <div className="when" style={{ marginTop: 4 }}>{t.at}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 50, background: t.color }} />
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{t.label}</span>
                  {t.rec && <span className="badge-rec">추천</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Step15({ loc, tmap, ok, setPickupOk, refreshLoc, locating }) {
  // 임의로 토글: 핀이 도로 위면 ok, 인도/장애물이면 bad. 데모용 토글.
  return (
    <>
      <div className="map-wrap" style={{ position: "relative" }}>
        {tmap
          ? <TMapMap key={`m15-${loc.lat}-${loc.lng}`} center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height={320} />
          : <div className="map-fallback" style={{ height: 320 }}><span className="fb-text">지도 로드 중…</span></div>
        }
        {/* center pin overlay */}
        <div style={{
          position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)",
          pointerEvents: "none",
        }}>
          <svg width="40" height="48" viewBox="0 0 40 48" fill="none">
            <ellipse cx="20" cy="44" rx="6" ry="2" fill="rgba(0,0,0,0.18)"/>
            <path d="M20 4c-7 0-12 5-12 12 0 9 12 26 12 26s12-17 12-26c0-7-5-12-12-12z" fill="#1A1F2B"/>
            <circle cx="20" cy="16" r="4" fill="#fff"/>
          </svg>
        </div>
        <button className={`gps-fab ${locating ? "gps-spin" : ""}`} onClick={refreshLoc}>{Ico.loc}</button>
      </div>

      <div style={{ height: 16 }} />

      <div className={`status-banner ${ok ? "ok" : "bad"}`} onClick={() => setPickupOk(v => !v)}>
        <span className="dot-light" style={{ background: ok ? "#34C759" : "#E94B3B" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {ok ? "차량 진입 가능" : "차량 진입 불가"}
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            {ok ? "서울시 강남구 테헤란로 123 앞" : "이면도로 — 가까운 진입점을 추천드려요"}
          </div>
        </div>
      </div>

      <div className="notice">
        <span className="ic">⚠️</span>
        <span>
          <b>실제 픽업 위치 안내</b><br/>
          도로 상황과 장애물에 따라 표시된 위치와 실제 픽업 지점이 조금 달라질 수 있어요.
        </span>
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="loading-wrap">
      <div className="loading-msg">멀미 저감 경로 탐색 중…</div>
      <div className="loading-bar"><div className="loading-fill" /></div>
      <div style={{ fontSize: 12, color: "#8C8C8C", letterSpacing: "0.05em" }}>4개 경험 비교 중</div>
    </div>
  );
}

function Step2({ tmap, center, routes, tierIdx, setTier, expanded, setExpanded, pickup, dest, err }) {
  const tierMeta = TIERS[tierIdx];
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === tierIdx, color: TIERS[i].line }));
  const markers = dest ? [{ lat: pickup.lat, lng: pickup.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: pickup.lat, lng: pickup.lng }];
  const status = congestionLabel(routes[tierIdx].msdv);

  return (
    <>
      <div className="map-wrap" style={{ position: "relative" }}>
        {tmap
          ? <TMapMap key="m2" center={center} routes={mapRoutes} markers={markers} height={220} />
          : <div className="map-fallback" style={{ height: 220 }}><span className="fb-text">지도 로드 중…</span></div>
        }
        <div className="seg-tag">
          <span className="dot-l" style={{ background: tierMeta.line }} />
          <span>{tierMeta.label} · {routes[tierIdx].time}</span>
        </div>
      </div>

      {err && <div className="err">경로 탐색 실패 — 샘플 데이터로 표시합니다</div>}

      <div style={{ padding: "8px 16px 0" }}>
        <div style={{ fontSize: 13, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 50, background: status.color }} />
          <span>{status.text}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#8C8C8C" }}>4개 경험 비교</span>
        </div>
      </div>

      <div className="tier-list" style={{ marginTop: 4 }}>
        {routes.map((r, i) => {
          const meta = TIERS[i];
          const on = i === tierIdx;
          const open = i === expanded;
          const st = congestionLabel(r.msdv);
          const features = TIER_FEATURES[meta.key];
          return (
            <div key={meta.key} className={`tier-row ${on ? "on" : ""}`}
                 onClick={() => { setTier(i); setExpanded(i); }}>
              <div className="top">
                <div className="left-bar" style={{ background: meta.line }} />
                <div className="meta">
                  <div className="label">
                    <span className="tier-pill" style={{ background: meta.color }}>{meta.label}</span>
                    <span className="nm">{r.name}</span>
                  </div>
                  <div className="status-row">
                    <span style={{ width: 6, height: 6, borderRadius: 50, background: st.color }} />
                    <span className="status-text">{st.text}</span>
                  </div>
                </div>
                <div className="right">
                  <div className="time">{r.time}</div>
                  <div className="price">{r.price}</div>
                  {r.diff !== "기본" && <div className="diff">{r.diff}</div>}
                </div>
              </div>

              {open && (
                <div className="expand">
                  <div className="why" style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>{r.why}</div>

                  <div className="stat-grid">
                    <div className="stat-cell"><span className="stat-num">{r.stats.cong}</span><span className="stat-lbl">정체구간</span></div>
                    <div className="stat-cell"><span className="stat-num">{r.stats.alley}</span><span className="stat-lbl">이면도로</span></div>
                    <div className="stat-cell"><span className="stat-num">{r.stats.turns}</span><span className="stat-lbl">급회전</span></div>
                    <div className="stat-cell"><span className="stat-num" style={{ fontSize: 14 }}>{r.stats.express}</span><span className="stat-lbl">고속구간</span></div>
                  </div>

                  <div className="feat-list">
                    {features.map((f, j) => (
                      <div key={j} className="feat">
                        <span className="ck" style={{ background: meta.color + "22", color: meta.line }}>{Ico.check}</span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* payment row */}
      <div style={{ height: 12 }} />
      <PaymentRow />
    </>
  );
}

function Step3({ tmap, pickup, dest, route, tierMeta, routes, tierIdx }) {
  const mapRoutes = routes.map((r, i) => ({ points: r.points, active: i === tierIdx, color: tierMeta.line }));
  const markers = dest ? [{ lat: pickup.lat, lng: pickup.lng }, { lat: dest.lat, lng: dest.lng }] : [{ lat: pickup.lat, lng: pickup.lng }];
  const st = congestionLabel(route.msdv);
  return (
    <>
      <div className="map-wrap">
        {tmap
          ? <TMapMap key="m3" center={dest || pickup} routes={mapRoutes} markers={markers} height={220} />
          : <div className="map-fallback" style={{ height: 220 }}><span className="fb-text">지도 로드 중…</span></div>
        }
      </div>

      <div style={{ padding: "20px 16px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span className="tier-pill" style={{ background: tierMeta.color }}>{tierMeta.label}</span>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{route.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6B7280" }}>
          <span>{route.time} 예상</span>
          <span>·</span>
          <span style={{ width: 6, height: 6, borderRadius: 50, background: st.color, display: "inline-block" }} />
          <span>{st.text}</span>
        </div>
      </div>

      <div style={{ padding: 12 }} />
      <div className="summary-card">
        <div className="summary-row">
          <div className="ic">{Ico.pin}</div>
          <div style={{ flex: 1 }}>
            <div className="lbl">픽업</div>
            <div className="val">현재 위치 부근 · 테헤란로</div>
          </div>
        </div>
        <div style={{ height: 1, background: "#E8E5E0", marginLeft: 36 }} />
        <div className="summary-row">
          <div className="ic">{Ico.flag}</div>
          <div style={{ flex: 1 }}>
            <div className="lbl">목적지</div>
            <div className="val">{dest?.name || "—"}</div>
          </div>
        </div>
      </div>

      <PaymentRow />
    </>
  );
}

function PaymentRow() {
  return (
    <div className="pay-row">
      {Ico.card}
      <div className="name">현대카드 ••••8702</div>
      <span className="change">변경</span>
    </div>
  );
}

function Step4({ tmap, loc, dest, carX, route, tierMeta }) {
  return (
    <>
      <div className="map-wrap" style={{ position: "relative" }}>
        {tmap
          ? <TMapMap key="m4" center={loc} markers={[{ lat: loc.lat, lng: loc.lng }]} height={240} />
          : <div className="map-fallback" style={{ height: 240 }}>
              {/* 폴백 — 차량 모션 데모 */}
              <div style={{ position: "absolute", top: "50%", left: `${carX}%`, transform: "translate(-50%, -50%)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="6" width="20" height="11" rx="3" fill="#1A1F2B" />
                  <rect x="5" y="3" width="14" height="6" rx="2" fill="#1A1F2B" opacity=".5" />
                  <circle cx="6" cy="18" r="2" fill="#fff" stroke="#1A1F2B" strokeWidth="1" />
                  <circle cx="18" cy="18" r="2" fill="#fff" stroke="#1A1F2B" strokeWidth="1" />
                </svg>
              </div>
            </div>
        }
        <div className="map-overlay-chip">
          <span style={{ width: 6, height: 6, borderRadius: 50, background: "#34C759", animation: "pulse 1.2s infinite" }} />
          <span>3분 후 도착 · 약 280m</span>
        </div>
      </div>

      <div style={{ padding: "16px 0 8px" }} />
      <div className="approach-card">
        <div className="approach-row">
          <div>
            <div className="label">호출하신 차량</div>
            <span className="plate">12가 3456</span>
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.85 }}>아이오닉 6 · {tierMeta.label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="eta">3<span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}>분</span></div>
            <div className="dist">약 280m</div>
          </div>
        </div>
      </div>

      <div className="ready-grid">
        <div className="ready-pill">
          <span className="ck-circle">{Ico.check}</span>
          <span className="text">차량 세팅 완료 · {tierMeta.label} 모드</span>
        </div>
        <div className="ready-pill">
          <span className="ck-circle" style={{ background: "#E9A23B" }}>{Ico.check}</span>
          <span className="text">시트 38° · 20°C 사전 냉방 · 블라인드 개방</span>
        </div>
      </div>

      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontSize: 13, color: "#6B7280" }}>
          {route.name} · {route.time} 예상 · {route.price}
        </div>
      </div>
    </>
  );
}
