import { useState, useEffect, useRef, useCallback } from "react";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; font-family: 'DM Sans', sans-serif; background: #fff; -webkit-tap-highlight-color: transparent; }
  .app { max-width: 430px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; background: #fff; }
  .header { padding: 16px 20px 12px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #F0EEE8; background: #fff; position: sticky; top: 0; z-index: 10; }
  .back-btn { width: 32px; height: 32px; border: none; background: #F5F3EE; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .header-title { font-size: 15px; font-weight: 600; color: #0A0A0A; flex: 1; }
  .step-dots { display: flex; gap: 4px; }
  .step-dot { width: 6px; height: 6px; border-radius: 50%; background: #E0DED8; transition: all .25s; }
  .step-dot.done { background: #0A0A0A; }
  .step-dot.active { width: 18px; border-radius: 3px; background: #0A0A0A; }
  .content { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .map-wrap { width: 100%; position: relative; }
  .map-fallback { width: 100%; background: #E8E6E0; position: relative; overflow: hidden; }
  .map-grid-h { position: absolute; left: 0; right: 0; height: 1px; background: #D0CEC8; }
  .map-grid-v { position: absolute; top: 0; bottom: 0; width: 1px; background: #D0CEC8; }
  .map-dot { position: absolute; width: 10px; height: 10px; background: #0A0A0A; border-radius: 50%; transform: translate(-50%,-50%); }
  .map-dot-end { position: absolute; width: 10px; height: 10px; border: 2px solid #0A0A0A; background: #fff; border-radius: 50%; transform: translate(-50%,-50%); }
  .map-car { position: absolute; transform: translate(-50%,-50%); transition: left .8s linear; }
  .map-tag { position: absolute; bottom: 10px; left: 14px; font-size: 10px; color: #888; font-family: 'DM Mono', monospace; }
  .map-chip { position: absolute; top: 10px; right: 12px; background: #fff; border: 1px solid #D0CEC8; border-radius: 20px; padding: 4px 10px; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 5px; }
  .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #0A0A0A; animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.2} }
  .ring { position: absolute; border-radius: 50%; border: 1.5px solid #0A0A0A; transform: translate(-50%,-50%); opacity: 0; animation: ringout 2.4s ease-out infinite; }
  @keyframes ringout { 0%{width:16px;height:16px;opacity:.7} 100%{width:90px;height:90px;opacity:0} }
  .pad { padding: 20px 20px 0; }
  .sec-label { font-size: 10px; font-weight: 500; color: #888; letter-spacing: .07em; text-transform: uppercase; margin-bottom: 8px; font-family: 'DM Mono', monospace; }
  .input-card { background: #F5F3EE; border-radius: 16px; border: 1px solid #E0DED8; margin-bottom: 16px; position: relative; overflow: visible; }
  .input-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
  .input-row + .input-row { border-top: 1px solid #E0DED8; }
  .dot-filled { width: 8px; height: 8px; background: #0A0A0A; border-radius: 50%; flex-shrink: 0; }
  .dot-empty  { width: 8px; height: 8px; border: 2px solid #0A0A0A; border-radius: 50%; flex-shrink: 0; }
  .f-label { font-size: 10px; color: #888; margin-bottom: 2px; }
  .f-val   { font-size: 14px; font-weight: 500; }
  .dest-input { border: none; background: transparent; font-size: 14px; font-family: 'DM Sans', sans-serif; font-weight: 500; outline: none; width: 100%; padding: 0; color: #0A0A0A; }
  .dest-input::placeholder { color: #B0AEA8; font-weight: 400; }
  .search-drop { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1px solid #E0DED8; border-radius: 14px; z-index: 200; box-shadow: 0 8px 24px rgba(0,0,0,.10); overflow: hidden; }
  .s-item { padding: 11px 14px; cursor: pointer; border-bottom: 1px solid #F0EEE8; transition: background .1s; }
  .s-item:last-child { border-bottom: none; }
  .s-item:hover { background: #F5F3EE; }
  .s-name { font-size: 13px; font-weight: 500; }
  .s-addr { font-size: 11px; color: #888; margin-top: 2px; }
  .recent-item { display: flex; align-items: center; gap: 12px; padding: 12px 2px; border-bottom: 1px solid #F0EEE8; cursor: pointer; }
  .recent-item:last-child { border-bottom: none; }
  .recent-icon { width: 36px; height: 36px; border-radius: 10px; background: #F5F3EE; border: 1px solid #E0DED8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .recent-name { font-size: 13px; font-weight: 500; }
  .recent-addr { font-size: 11px; color: #888; margin-top: 2px; }
  .loading-wrap { padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .loading-bar { width: 100%; height: 2px; background: #E8E6E0; border-radius: 2px; overflow: hidden; }
  .loading-fill { height: 100%; width: 45%; background: #0A0A0A; border-radius: 2px; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }
  .slider-card { background: #fff; border: 1px solid #E0DED8; border-radius: 16px; padding: 14px; margin-bottom: 12px; }
  .slider-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .slider-title { font-size: 13px; font-weight: 500; }
  .slider-badge { font-size: 10px; padding: 3px 10px; border-radius: 20px; background: #0A0A0A; color: #fff; font-family: 'DM Mono', monospace; }
  .slider-ticks { display: flex; justify-content: space-between; margin-top: 6px; }
  .tick { font-size: 10px; color: #B0AEA8; cursor: pointer; transition: color .15s; }
  .tick.on { color: #0A0A0A; font-weight: 600; }
  input[type=range] { width: 100%; accent-color: #0A0A0A; cursor: pointer; height: 20px; }
  .msdv-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #F0EEE8; }
  .msdv-lbl { font-size: 10px; color: #888; font-family: 'DM Mono', monospace; }
  .msdv-bg { flex: 1; height: 4px; background: #E0DED8; border-radius: 2px; }
  .msdv-fill { height: 4px; border-radius: 2px; transition: width .4s, background .4s; }
  .msdv-val { font-size: 10px; font-weight: 600; font-family: 'DM Mono', monospace; white-space: nowrap; }
  .route-card { background: #F5F3EE; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .rc-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
  .rc-name { font-size: 14px; font-weight: 600; }
  .rc-why  { font-size: 11px; color: #666; margin-top: 3px; line-height: 1.4; }
  .rc-time { font-size: 20px; font-weight: 600; line-height: 1; font-family: 'DM Mono', monospace; }
  .rc-diff { font-size: 11px; color: #888; margin-top: 3px; text-align: right; font-family: 'DM Mono', monospace; }
  .pills { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
  .pill       { font-size: 11px; padding: 4px 8px; border-radius: 20px; border: 1px solid #0A0A0A; color: #0A0A0A; }
  .pill-muted { font-size: 11px; padding: 4px 8px; border-radius: 20px; border: 1px solid #D0CEC8; color: #888; }
  .price-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #fff; border-radius: 10px; border: 1px solid #E0DED8; margin-bottom: 10px; }
  .price-main { font-size: 18px; font-weight: 600; font-family: 'DM Mono', monospace; }
  .price-base { font-size: 10px; color: #888; margin-top: 2px; font-family: 'DM Mono', monospace; }
  .price-diff { font-size: 12px; font-weight: 500; color: #555; }
  .price-rsn  { font-size: 10px; color: #888; margin-top: 2px; text-align: right; }
  .tradeoff { display: flex; align-items: center; gap: 8px; }
  .to-lbl { font-size: 10px; color: #888; white-space: nowrap; font-family: 'DM Mono', monospace; }
  .to-bg  { flex: 1; height: 4px; background: #E0DED8; border-radius: 2px; }
  .to-fill{ height: 4px; background: #0A0A0A; border-radius: 2px; transition: width .35s; }
  .master-row { display: flex; align-items: center; justify-content: space-between; padding: 14px; border: 2px solid #0A0A0A; border-radius: 16px; margin-bottom: 12px; cursor: pointer; background: #fff; }
  .toggle-pill { width: 42px; height: 24px; border-radius: 12px; position: relative; flex-shrink: 0; transition: background .2s; cursor: pointer; }
  .toggle-pill.on { background: #0A0A0A; } .toggle-pill.off { background: #D0CEC8; }
  .t-knob { position: absolute; top: 3px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: left .2s; }
  .toggle-pill.on .t-knob { left: 21px; } .toggle-pill.off .t-knob { left: 3px; }
  .toggle-sm { width: 32px; height: 20px; border-radius: 10px; position: relative; flex-shrink: 0; transition: background .2s; cursor: pointer; }
  .toggle-sm.on { background: #0A0A0A; } .toggle-sm.off { background: #D0CEC8; }
  .sm-knob { position: absolute; top: 3px; width: 14px; height: 14px; background: #fff; border-radius: 50%; transition: left .2s; }
  .toggle-sm.on .sm-knob { left: 15px; } .toggle-sm.off .sm-knob { left: 3px; }
  .items-card { border: 1px solid #E0DED8; border-radius: 16px; overflow: hidden; margin-bottom: 12px; }
  .items-card.off { opacity: .4; pointer-events: none; }
  .s-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #F0EEE8; }
  .s-row:last-child { border-bottom: none; }
  .s-icon { width: 32px; height: 32px; border-radius: 9px; background: #F5F3EE; border: 1px solid #E0DED8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .s-name { font-size: 13px; font-weight: 500; } .s-val { font-size: 11px; color: #888; margin-top: 2px; }
  .preview-box { background: #F5F3EE; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; border: 1px solid #E0DED8; }
  .p-pill { font-size: 11px; padding: 4px 9px; border-radius: 20px; border: 1px solid #0A0A0A; color: #0A0A0A; transition: opacity .3s; }
  .p-pill.off { opacity: .25; border-color: #D0CEC8; color: #888; }
  .arrival-card { background: #F5F3EE; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .car-plate { font-size: 12px; font-weight: 500; background: #fff; border: 1px solid #D0CEC8; border-radius: 5px; padding: 2px 7px; font-family: 'DM Mono', monospace; }
  .eta-big { font-size: 32px; font-weight: 600; line-height: 1; font-family: 'DM Mono', monospace; }
  .prog-bg { height: 3px; background: #E0DED8; border-radius: 2px; overflow: hidden; }
  .prog-fill { height: 3px; background: #0A0A0A; border-radius: 2px; animation: prog 8s linear infinite; }
  @keyframes prog { 0%{width:8%} 100%{width:90%} }
  .haptic-card { border: 1px solid #E0DED8; border-radius: 16px; padding: 14px; margin-bottom: 12px; background: #fff; }
  .tl-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .tl-row:last-child { margin-bottom: 0; }
  .tl-dist { font-size: 10px; color: #B0AEA8; width: 34px; text-align: right; font-family: 'DM Mono', monospace; flex-shrink: 0; }
  .tl-row.active .tl-dist { color: #0A0A0A; font-weight: 600; }
  .tl-bars { display: flex; gap: 3px; align-items: center; }
  .tl-bar { border-radius: 2px; background: #D0CEC8; width: 4px; }
  .tl-row.active .tl-bar { background: #0A0A0A; animation: bb .35s ease-in-out infinite alternate; }
  .tl-bar:nth-child(2){animation-delay:.1s!important} .tl-bar:nth-child(3){animation-delay:.2s!important}
  @keyframes bb { from{transform:scaleY(.5)} to{transform:scaleY(1)} }
  .tl-desc { font-size: 11px; color: #888; } .tl-row.active .tl-desc { color: #0A0A0A; font-weight: 500; }
  .ready-row { display: flex; align-items: center; gap: 10px; background: #F5F3EE; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
  .ready-icon { width: 28px; height: 28px; border-radius: 8px; background: #fff; border: 1px solid #D0CEC8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .check-chip { margin-left: auto; font-size: 11px; padding: 3px 9px; border-radius: 20px; border: 1px solid #0A0A0A; font-family: 'DM Mono', monospace; }
  .guide-card { border: 1px solid #E0DED8; border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; background: #fff; }
  .g-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; } .g-row:last-child { margin-bottom: 0; }
  .g-num { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #D0CEC8; font-size: 10px; display: flex; align-items: center; justify-content: center; color: #888; flex-shrink: 0; margin-top: 1px; font-family: 'DM Mono', monospace; }
  .g-text { font-size: 12px; color: #555; line-height: 1.5; }
  .bottom-bar { padding: 12px 20px 28px; background: #fff; border-top: 1px solid #F0EEE8; }
  .btn-primary { width: 100%; padding: 15px; background: #0A0A0A; color: #fff; border: none; border-radius: 16px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: opacity .15s; }
  .btn-primary:active { opacity: .8; }
  .btn-ghost { width: 100%; padding: 13px; background: transparent; color: #888; border: 1px solid #D0CEC8; border-radius: 16px; font-size: 14px; cursor: pointer; font-family: 'DM Sans', sans-serif; margin-top: 8px; }
  .err-banner { background: #FFF3F3; border: 1px solid #FFCDD2; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px; color: #C62828; }
  .route-summary-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #F5F3EE; border-radius: 12px; margin-bottom: 12px; }
  .setting-status { border: 1px solid #E0DED8; border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; background: #fff; }
`;

// ─── Mock fallback ───
const MOCK = [
  { badge:"Sport",       name:"최단 경로",      why:"도심 경유 · 빠른 이동",                  time:"23분", diff:"기본",  pills:[{t:"도심 경유",m:true},{t:"정체 구간",m:true}],                           price:"₩10,800", pdiff:"기본 요금",          preason:"추가 가산 없음",   bar:10, msdv:72, points:[] },
  { badge:"Natural",     name:"일반 경로",      why:"간선도로 위주 · 무난한 이동",             time:"25분", diff:"+2분", pills:[{t:"간선도로 위주"},{t:"도심 일부",m:true}],                               price:"₩11,500", pdiff:"+₩700 (+6%)",       preason:"간선도로 가산",    bar:36, msdv:55, points:[] },
  { badge:"Comfort",     name:"멀미 저감 경로", why:"완만한 커브 · 큰길 위주",                 time:"27분", diff:"+4분", pills:[{t:"급정거 3회 감소"},{t:"큰길 위주"},{t:"완만한 커브"}],                  price:"₩12,400", pdiff:"+₩1,600 (+15%)",    preason:"편안함 경로 가산", bar:65, msdv:36, points:[] },
  { badge:"Anti-nausea", name:"최적 편안 경로", why:"저주파 진동 최소 · 큰길 + 완만한 커브",   time:"29분", diff:"+6분", pills:[{t:"저주파 진동 최소"},{t:"큰길 위주"},{t:"급정거 최소화"}],               price:"₩13,800", pdiff:"+₩3,000 (+28%)",    preason:"최적 편안 가산",  bar:90, msdv:18, points:[] },
];

const SETTINGS = [
  { icon:<svg width="14" height="14" viewBox="0 0 13 13" fill="none"><path d="M1.5 9Q3 4 6.5 4Q10 4 11.5 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/><circle cx="6.5" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>, name:"액티브 서스펜션",   val:"커브 틸팅 · 수직 모션 최소화",    tag:"서스펜션 안정화" },
  { icon:<svg width="14" height="14" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="4" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4V2.5a2 2 0 014 0V4" stroke="currentColor" strokeWidth="1.2"/></svg>, name:"시트 포지션",       val:"순방향 고정 · 등받이 38° 눕힘",   tag:"시트 38°" },
  { icon:<svg width="14" height="14" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 3.5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>, name:"실내 온도 · 환기", val:"20°C 사전 냉방 · 환기 가동",       tag:"20°C 냉방" },
  { icon:<svg width="14" height="14" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 2.5V1.5M8.5 2.5V1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1.5 5.5h10" stroke="currentColor" strokeWidth="1.2"/></svg>, name:"창문 블라인드 개방", val:"시야 확보 · 탑승 전 자동 개방", tag:"블라인드 개방" },
];

// ─── MSDV ───
function calcMSDV(pts) {
  if (!pts || pts.length < 3) return 50;
  let total = 0, sharp = 0, n = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p1=pts[i-1], p2=pts[i], p3=pts[i+1];
    const dx1=p2.x-p1.x, dy1=p2.y-p1.y, dx2=p3.x-p2.x, dy2=p3.y-p2.y;
    const l1=Math.sqrt(dx1*dx1+dy1*dy1), l2=Math.sqrt(dx2*dx2+dy2*dy2);
    if (l1<1e-10||l2<1e-10) continue;
    const a = Math.acos(Math.max(-1,Math.min(1,(dx1*dx2+dy1*dy2)/(l1*l2)))) * 180/Math.PI;
    total+=a; if(a>25) sharp++; n++;
  }
  return n===0 ? 50 : Math.round(Math.min(100,(total/n)*1.8+(sharp/n)*45));
}
function extractPts(data) {
  const pts=[];
  for (const f of (data?.features||[])) {
    if (f.geometry?.type==="LineString") {
      for (const c of f.geometry.coordinates) pts.push({x:c[0],y:c[1]});
    }
  }
  return pts;
}
function extractSum(data) {
  const props=data?.features?.[0]?.properties||{};
  return { dur:Math.round((props.totalTime||0)/60), dist:((props.totalDistance||0)/1000).toFixed(1), fare:props.taxiFare||10800 };
}


// ─── 장소 검색 (서버 프록시) ───
function usePlaces() {
  const [results, setResults] = useState([]);
  const t = useRef(null);
  const search = useCallback((q) => {
    clearTimeout(t.current);
    if (!q?.trim()) { setResults([]); return; }
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?query=${encodeURIComponent(q)}`);
        const data = await r.json();
        setResults((data.searchPoiInfo?.pois?.poi||[]).slice(0,5).map(d=>({
          name: d.name,
          addr: d.newAddressList?.newAddress?.[0]?.fullAddressRoad || [d.upperAddrName,d.middleAddrName,d.lowerAddrName].filter(Boolean).join(" "),
          lat: +d.frontLat, lng: +d.frontLon,
        })));
      } catch { setResults([]); }
    }, 250);
  }, []);
  return { results, search, clear: ()=>setResults([]) };
}

// ─── 경로 탐색 ───
async function buildRoutes(origin, dest) {
  const p=`startX=${origin.lng}&startY=${origin.lat}&endX=${dest.lng}&endY=${dest.lat}`;
  const [td,rd] = await Promise.all([
    fetch(`/api/directions?${p}&searchOption=0`).then(r=>r.json()),
    fetch(`/api/directions?${p}&searchOption=2`).then(r=>r.json()),
  ]);
  const tp=extractPts(td), rp=extractPts(rd);
  const ts=extractSum(td), rs=extractSum(rd);
  const tm=calcMSDV(tp), rm=calcMSDV(rp);
  const B=ts.fare, bm=ts.dur;
  const f=n=>`₩${Math.round(n).toLocaleString()}`;
  const dm=m=>m<=0?"기본":`+${m}분`;
  return [
    { badge:"Sport",       name:"최단 경로",      why:"도심 경유 · 빠른 이동",                time:`${ts.dur}분`,   diff:"기본",          pills:[{t:`${ts.dist}km`},{t:"급정거 多",m:true}],            price:f(B),      pdiff:"기본 요금",         preason:"추가 가산 없음",  bar:10, msdv:tm,                   points:tp },
    { badge:"Natural",     name:"일반 경로",      why:"간선도로 위주 · 무난한 이동",           time:`${rs.dur}분`,   diff:dm(rs.dur-bm),   pills:[{t:"간선도로 위주"},{t:`${rs.dist}km`}],                price:f(B*1.06), pdiff:`+${f(B*0.06)} (+6%)`, preason:"간선도로 가산",   bar:36, msdv:rm,                   points:rp },
    { badge:"Comfort",     name:"멀미 저감 경로", why:"완만한 커브 · 큰길 위주",               time:`${rs.dur+2}분`, diff:dm(rs.dur+2-bm), pills:[{t:"급정거 3회 감소"},{t:"큰길 위주"},{t:"완만한 커브"}], price:f(B*1.15), pdiff:`+${f(B*0.15)} (+15%)`,preason:"편안함 경로 가산",bar:65, msdv:Math.round(rm*0.62),points:rp },
    { badge:"Anti-nausea", name:"최적 편안 경로", why:"저주파 진동 최소 · 큰길 + 완만한 커브", time:`${rs.dur+4}분`, diff:dm(rs.dur+4-bm), pills:[{t:"저주파 진동 최소"},{t:"큰길 위주"},{t:"급정거 최소화"}],price:f(B*1.28), pdiff:`+${f(B*0.28)} (+28%)`,preason:"최적 편안 가산",  bar:90, msdv:Math.round(rm*0.30),points:rp },
  ];
}

// ─── TMap SDK 로더 ───
const TMAP_KEY = "jd4lOOp2nI2dHWR4Rb2vE20d6C2fy4455wjVRVlu";
function useTmap() {
  const [ready, setReady] = useState(!!window.Tmapv3);
  useEffect(() => {
    if (window.Tmapv3) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = `https://apis.openapi.sk.com/tmap/vectorjs?version=1&appKey=${TMAP_KEY}`;
    s.onload = () => setReady(true);
    s.onerror = () => console.error("TMap SDK load failed");
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ─── TMapMap 컴포넌트 ───
function TMapMap({ center, routes=[], markers=[], height=220 }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const objs = useRef([]);

  useEffect(() => {
    if (!ref.current || !window.Tmapv3) return;
    const T = window.Tmapv3;
    if (mapRef.current) { try { mapRef.current.destroy(); } catch(e){} mapRef.current = null; }
    mapRef.current = new T.Map(ref.current, {
      center: new T.LatLng(center.lat, center.lng),
      zoom: 14,
      zoomControl: false,
      scrollwheel: false,
    });
    return () => { if (mapRef.current) { try { mapRef.current.destroy(); } catch(e){} mapRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.Tmapv3) return;
    const T = window.Tmapv3;
    objs.current.forEach(o => { try { o.setMap(null); } catch(e){} });
    objs.current = [];

    routes.forEach(r => {
      if (!r.points?.length) return;
      const poly = new T.Polyline({
        path: r.points.map(p => new T.LatLng(p.y, p.x)),
        strokeColor: r.active ? "#0A0A0A" : "#BFBDB4",
        strokeWeight: r.active ? 6 : 2,
        strokeOpacity: r.active ? 1 : 0.45,
        map: mapRef.current,
      });
      objs.current.push(poly);
    });

    markers.forEach((m, i) => {
      const svg = i===0
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="6" fill="#0A0A0A"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="5" fill="#fff" stroke="#0A0A0A" stroke-width="2"/></svg>`;
      const marker = new T.Marker({
        position: new T.LatLng(m.lat, m.lng),
        map: mapRef.current,
        icon: new T.Icon({
          url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
          size: new T.Size(12, 12),
          anchor: new T.Point(6, 6),
        }),
      });
      objs.current.push(marker);
    });

    const allPts = routes.flatMap(r=>(r.points||[]).map(p=>({lat:p.y,lng:p.x})));
    const all = [...allPts, ...markers];
    if (all.length > 1 && mapRef.current) {
      try {
        const bounds = new T.LatLngBounds();
        all.forEach(p => bounds.extend(new T.LatLng(p.lat, p.lng)));
        mapRef.current.fitBounds(bounds);
      } catch(e) {}
    }
  }, [routes, markers]);

  return <div ref={ref} style={{ width:"100%", height }} />;
}


const msdvColor = s => s<25?"#2E7D32":s<50?"#F57F17":"#C62828";
const msdvLabel = s => s<25?"매우 편안":s<45?"편안":s<65?"보통":"불편";

// ─── 메인 ───
export default function App() {
  const [step, setStep]       = useState(1);
  const [sliderVal, setSlider]= useState(2);
  const [masterOn, setMaster] = useState(true);
  const [rowOn, setRowOn]     = useState([true,true,true,true]);
  const [carX, setCarX]       = useState(20);
  const carDir = useRef(1);

  const [loc, setLoc]         = useState({ lat:37.5665, lng:126.9780 });
  const [dest, setDest]       = useState(null);
  const [query, setQuery]     = useState("");
  const [routes, setRoutes]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(false);

  const tmap = useTmap();
  const { results, search, clear } = usePlaces();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setLoc({ lat:p.coords.latitude, lng:p.coords.longitude }), ()=>{}
    );
  }, []);

  useEffect(() => {
    if (step!==4&&step!==5) return;
    const lim=step===5?42:55, sx=step===5?28:20;
    setCarX(sx);
    const iv=setInterval(()=>setCarX(x=>{ const n=x+carDir.current*.5; if(n>lim){carDir.current=-1;return lim;} if(n<sx){carDir.current=1;return sx;} return n; }),80);
    return ()=>clearInterval(iv);
  },[step]);

  const onQueryChange = q => { setQuery(q); setDest(null); search(q); };
  const onPickDest = p => { setDest(p); setQuery(p.name); clear(); };

  const onFetch = async () => {
    setStep(2);
    if (!dest) { setRoutes(null); return; }
    setLoading(true); setErr(false);
    try { setRoutes(await buildRoutes(loc, dest)); }
    catch { setErr(true); setRoutes(null); }
    setLoading(false);
  };

  const list = routes||MOCK;
  const rd   = list[sliderVal];
  const mapRoutes  = (routes||[]).map((r,i)=>({ points:r.points, active:i===sliderVal }));
  const mapMarkers = dest ? [{ lat:loc.lat, lng:loc.lng },{ lat:dest.lat, lng:dest.lng }] : [{ lat:loc.lat, lng:loc.lng }];
  const stepTitles = ["목적지 입력","경로 선택","차량 세팅","차량 호출 완료","차량 접근 중"];

  return (
    <>
      <style>{styles}</style>
      <div className="app">

        <div className="header">
          {step>1
            ? <button className="back-btn" onClick={()=>setStep(s=>s-1)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            : <div style={{width:32}}/>
          }
          <span className="header-title">{stepTitles[step-1]}</span>
          <div className="step-dots">
            {[1,2,3,4,5].map(s=>(
              <div key={s} className={`step-dot${s===step?" active":s<step?" done":""}`}/>
            ))}
          </div>
        </div>

        <div className="content">

          {/* ── STEP 1 ── */}
          {step===1 && <>
            {tmap
              ? <TMapMap key="map1" center={loc} markers={[{lat:loc.lat,lng:loc.lng}]} height={240}/>
              : <div className="map-fallback" style={{height:240}}>
                  <div className="map-grid-h" style={{top:"38%"}}/><div className="map-grid-h" style={{top:"65%"}}/>
                  <div className="map-grid-v" style={{left:"30%"}}/><div className="map-grid-v" style={{left:"65%"}}/>
                  <div className="map-dot" style={{top:"50%",left:"50%"}}/>
                  <div className="map-tag">현재 위치</div>
                </div>
            }
            <div className="pad">
              <div className="input-card">
                <div className="input-row">
                  <div className="dot-filled"/><div><div className="f-label">출발지</div><div className="f-val">현재 위치</div></div>
                </div>
                <div className="input-row" style={{position:"relative"}}>
                  <div className="dot-empty"/>
                  <div style={{flex:1}}>
                    <div className="f-label">목적지</div>
                    <input className="dest-input" placeholder="어디로 가시나요?" value={query}
                      onChange={e=>onQueryChange(e.target.value)}/>
                  </div>
                  {results.length>0 && (
                    <div className="search-drop">
                      {results.map(r=>(
                        <div key={r.name+r.addr} className="s-item" onClick={()=>onPickDest(r)}>
                          <div className="s-name">{r.name}</div><div className="s-addr">{r.addr}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="sec-label">최근 목적지</div>
              {[
                {name:"회사",           addr:"서울시 강남구 테헤란로 427",    lat:37.5064,lng:127.0536},
                {name:"코엑스몰",       addr:"서울시 강남구 봉은사로 524",    lat:37.5127,lng:127.0594},
                {name:"잠실역 2번 출구",addr:"서울시 송파구 올림픽로 240",   lat:37.5133,lng:127.1001},
              ].map(p=>(
                <div key={p.name} className="recent-item" onClick={()=>onPickDest(p)}>
                  <div className="recent-icon">
                    <svg width="14" height="14" viewBox="0 0 13 13" fill="none"><path d="M6.5 1C4.3 1 2.5 2.8 2.5 5c0 3.2 4 7 4 7s4-3.8 4-7c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.2"/><circle cx="6.5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                  </div>
                  <div><div className="recent-name">{p.name}</div><div className="recent-addr">{p.addr}</div></div>
                </div>
              ))}
            </div>
          </>}

          {/* ── STEP 2 ── */}
          {step===2 && <>
            {loading
              ? <div className="loading-wrap">
                  <div style={{fontSize:13,color:"#888"}}>멀미 저감 경로 탐색 중…</div>
                  <div className="loading-bar"><div className="loading-fill"/></div>
                  <div style={{fontSize:11,color:"#B0AEA8",fontFamily:"'DM Mono',monospace"}}>MSDV 지수 계산 중</div>
                </div>
              : <>
                  {tmap
                    ? <TMapMap key="map2" center={dest||loc} routes={mapRoutes} markers={mapMarkers} height={200}/>
                    : <div className="map-fallback" style={{height:200}}>
                        <div className="map-grid-h" style={{top:"40%"}}/><div className="map-grid-v" style={{left:"28%"}}/><div className="map-grid-v" style={{left:"63%"}}/>
                        <div className="map-dot" style={{top:"42%",left:"12%"}}/><div className="map-dot-end" style={{top:"42%",left:"88%"}}/>
                      </div>
                  }
                  <div className="pad">
                    {err && <div className="err-banner">경로 탐색 실패 — 샘플 데이터로 표시합니다</div>}
                    <div className="slider-card">
                      <div className="slider-top">
                        <span className="slider-title">어떻게 타고 싶으세요?</span>
                        <span className="slider-badge">{rd.badge}</span>
                      </div>
                      <input type="range" min={0} max={3} value={sliderVal} step={1} onChange={e=>setSlider(+e.target.value)}/>
                      <div className="slider-ticks">
                        {["Sport","Natural","Comfort","Anti-nausea"].map((l,i)=>(
                          <span key={l} className={`tick${i===sliderVal?" on":""}`} onClick={()=>setSlider(i)}>{l}</span>
                        ))}
                      </div>
                      <div className="msdv-row">
                        <span className="msdv-lbl">MSDV</span>
                        <div className="msdv-bg"><div className="msdv-fill" style={{width:`${rd.msdv}%`,background:msdvColor(rd.msdv)}}/></div>
                        <span className="msdv-val" style={{color:msdvColor(rd.msdv)}}>{rd.msdv} — {msdvLabel(rd.msdv)}</span>
                      </div>
                    </div>
                    <div className="route-card">
                      <div className="rc-top">
                        <div><div className="rc-name">{rd.name}</div><div className="rc-why">{rd.why}</div></div>
                        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                          <div className="rc-time">{rd.time}</div><div className="rc-diff">{rd.diff}</div>
                        </div>
                      </div>
                      <div className="pills">{rd.pills.map(p=><span key={p.t} className={p.m?"pill-muted":"pill"}>{p.t}</span>)}</div>
                      <div className="price-row">
                        <div><div className="price-main">{rd.price}</div><div className="price-base">기본 요금 {list[0].price}</div></div>
                        <div style={{textAlign:"right"}}><div className="price-diff">{rd.pdiff}</div><div className="price-rsn">{rd.preason}</div></div>
                      </div>
                      <div className="tradeoff">
                        <span className="to-lbl">빠름</span>
                        <div className="to-bg"><div className="to-fill" style={{width:`${rd.bar}%`}}/></div>
                        <span className="to-lbl">편안함</span>
                      </div>
                    </div>
                  </div>
                </>
            }
          </>}

          {/* ── STEP 3 ── */}
          {step===3 && <div className="pad">
            <div className="master-row" onClick={()=>setMaster(v=>!v)}>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>멀미 방지 세팅 적용</div>
                <div style={{fontSize:11,color:"#888",marginTop:3}}>{masterOn?"서스펜션 · 시트 · 온도 자동 설정":"세팅이 적용되지 않습니다"}</div>
              </div>
              <div className={`toggle-pill ${masterOn?"on":"off"}`}><div className="t-knob"/></div>
            </div>
            <div className={`items-card${masterOn?"":" off"}`}>
              {SETTINGS.map((s,i)=>(
                <div key={i} className="s-row">
                  <div className="s-icon">{s.icon}</div>
                  <div style={{flex:1}}><div className="s-name">{s.name}</div><div className="s-val">{s.val}</div></div>
                  <div className={`toggle-sm ${rowOn[i]?"on":"off"}`} onClick={()=>setRowOn(r=>r.map((v,j)=>j===i?!v:v))}><div className="sm-knob"/></div>
                </div>
              ))}
            </div>
            <div className="preview-box">
              <div className="sec-label" style={{marginBottom:8}}>차량 도착 전 적용될 설정</div>
              <div className="pills">{SETTINGS.map((s,i)=><span key={i} className={`p-pill${masterOn&&rowOn[i]?"":" off"}`}>{s.tag}</span>)}</div>
            </div>
          </div>}

          {/* ── STEP 4 ── */}
          {step===4 && <>
            <div style={{position:"relative"}}>
              {tmap
                ? <TMapMap key="map4" center={dest||loc} markers={dest?[{lat:loc.lat,lng:loc.lng},{lat:dest.lat,lng:dest.lng}]:[{lat:loc.lat,lng:loc.lng}]} height={220}/>
                : <div className="map-fallback" style={{height:220}}>
                    <div className="map-grid-h" style={{top:"40%"}}/><div className="map-grid-h" style={{top:"68%"}}/>
                    <div className="map-grid-v" style={{left:"28%"}}/><div className="map-grid-v" style={{left:"65%"}}/>
                    <div className="map-dot" style={{top:"40%",left:"10%"}}/><div className="map-dot-end" style={{top:"40%",left:"90%"}}/>
                  </div>
              }
              <div className="map-chip" style={{position:"absolute",top:10,right:12}}><div className="pulse-dot"/><span>3분 후 도착</span></div>
            </div>
            <div className="pad">
              <div className="arrival-card">
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:600}}>차량 접근 중</div>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginTop:6}}>
                      <span className="car-plate">12가 3456</span>
                      <span style={{fontSize:12,color:"#888"}}>아이오닉 6</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div className="eta-big">3<span style={{fontSize:16,fontWeight:400,color:"#888"}}>분</span></div>
                    <div style={{fontSize:11,color:"#888",marginTop:3}}>약 280m</div>
                  </div>
                </div>
                <div className="prog-bg"><div className="prog-fill"/></div>
              </div>
              <div className="setting-status">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <span className="sec-label" style={{margin:0}}>차량 세팅 적용 중</span>
                  <span style={{fontSize:11,color:"#888",display:"flex",alignItems:"center",gap:5}}><span className="pulse-dot"/>준비 중</span>
                </div>
                <div className="pills">{SETTINGS.filter((_,i)=>rowOn[i]).map((s,i)=><span key={i} className="pill">{s.tag}</span>)}</div>
              </div>
              <div className="route-summary-row">
                <div><div style={{fontSize:13,fontWeight:600}}>{rd.name}</div><div style={{fontSize:11,color:"#888",marginTop:2}}>{rd.time} 예상 · {rd.badge}</div></div>
                <div style={{fontSize:16,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{rd.price}</div>
              </div>
            </div>
          </>}

          {/* ── STEP 5 ── */}
          {step===5 && <>
            <div className="map-fallback" style={{height:200}}>
              <div className="map-grid-h" style={{top:"40%"}}/><div className="map-grid-v" style={{left:"30%"}}/><div className="map-grid-v" style={{left:"65%"}}/>
              {[0,.8,1.6].map(d=><div key={d} className="ring" style={{left:"55%",top:"50%",animationDelay:`${d}s`}}/>)}
              <div className="map-dot" style={{top:"50%",left:"55%"}}/>
              <div className="map-car" style={{top:"50%",left:`${carX}%`}}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><rect x="1" y="5" width="16" height="9" rx="3" fill="#0A0A0A"/><rect x="4" y="3" width="10" height="5" rx="2" fill="#0A0A0A" opacity=".6"/><circle cx="4.5" cy="14" r="1.5" fill="#fff" stroke="#0A0A0A" strokeWidth="1"/><circle cx="13.5" cy="14" r="1.5" fill="#fff" stroke="#0A0A0A" strokeWidth="1"/></svg>
              </div>
              <div className="map-tag">차량 50m 전방</div>
              <div className="map-chip"><div className="pulse-dot"/><span>곧 도착</span></div>
            </div>
            <div className="pad">
              <div style={{border:"2px solid #0A0A0A",borderRadius:16,padding:"14px",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                  <div><div style={{fontSize:15,fontWeight:600}}>차량이 도착합니다</div><div style={{fontSize:11,color:"#888",marginTop:3}}>12가 3456 · 아이오닉 6</div></div>
                  <div style={{textAlign:"right"}}><div className="eta-big">1<span style={{fontSize:15,fontWeight:400,color:"#888"}}>분</span></div><div style={{fontSize:11,color:"#888",marginTop:2}}>약 50m</div></div>
                </div>
                <div className="prog-bg"><div style={{height:3,background:"#0A0A0A",borderRadius:2,width:"88%"}}/></div>
              </div>
              <div className="haptic-card">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <span className="sec-label" style={{margin:0}}>햅틱 피드백 패턴</span>
                  <span style={{fontSize:11,color:"#888",display:"flex",alignItems:"center",gap:5}}><span className="pulse-dot"/>진행 중</span>
                </div>
                {[
                  {dist:"300m",bars:[8],       desc:"약한 1회",        active:false},
                  {dist:"150m",bars:[8,8],      desc:"중간 2회",        active:false},
                  {dist:"50m", bars:[10,14,10], desc:"강한 3회 · 현재", active:true},
                  {dist:"도착",bars:[8,14,18,14,8],desc:"롱 버즈 1회", active:false},
                ].map(row=>(
                  <div key={row.dist} className={`tl-row${row.active?" active":""}`}>
                    <span className="tl-dist">{row.dist}</span>
                    <div className="tl-bars">{row.bars.map((h,i)=><div key={i} className="tl-bar" style={{height:h}}/>)}</div>
                    <span className="tl-desc">{row.desc}</span>
                  </div>
                ))}
              </div>
              <div className="ready-row">
                <div className="ready-icon"><svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                <div><div style={{fontSize:13,fontWeight:600}}>차량 세팅 완료</div><div style={{fontSize:11,color:"#888",marginTop:2}}>서스펜션 · 시트 38° · 20°C · 블라인드</div></div>
                <span className="check-chip">준비됨</span>
              </div>
              <div className="guide-card">
                {[["차량 번호 확인","12가 3456 · 흰색 아이오닉 6"],["블라인드 개방 확인","탑승 전 시야 확보 완료"],["탑승 후 자세 유지","등받이 38° 유지해 주세요"]].map(([t,d],i)=>(
                  <div key={i} className="g-row">
                    <div className="g-num">{i+1}</div>
                    <div className="g-text"><strong style={{color:"#0A0A0A",fontWeight:600}}>{t}</strong> — {d}</div>
                  </div>
                ))}
              </div>
            </div>
          </>}

        </div>

        <div className="bottom-bar">
          {step===1 && <button className="btn-primary" onClick={onFetch}>경로 탐색</button>}
          {step===2 && !loading && <button className="btn-primary" onClick={()=>setStep(3)}>다음 — 차량 세팅 · {rd.price}</button>}
          {step===3 && <button className="btn-primary" onClick={()=>setStep(4)}>호출하기 · {rd.price}</button>}
          {step===4 && <button className="btn-ghost" onClick={()=>setStep(1)}>호출 취소</button>}
          {step===5 && <button className="btn-primary" onClick={()=>setStep(1)}>처음으로</button>}
        </div>

      </div>
    </>
  );
}
