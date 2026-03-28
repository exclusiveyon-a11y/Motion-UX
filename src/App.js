import { useState, useEffect, useRef, useCallback } from "react";

const KAKAO_JS_KEY = "c2c917cf6fe11e9eefa45d6372852511";
const STEPS = [1, 2, 3, 4, 5];

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: #F2F0EB;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .proto-root {
    display: flex;
    gap: 40px;
    align-items: flex-start;
    padding: 40px 20px;
    width: 100%;
    max-width: 900px;
    justify-content: center;
  }

  /* ── 단계 네비 ── */
  .step-nav { display: flex; flex-direction: column; gap: 6px; padding-top: 60px; }
  .step-btn {
    display: flex; align-items: center; gap: 10px;
    background: none; border: none; cursor: pointer;
    padding: 6px 10px; border-radius: 8px; transition: background .15s;
  }
  .step-btn:hover { background: rgba(0,0,0,.05); }
  .step-num {
    width: 24px; height: 24px; border-radius: 50%;
    border: 1px solid #BFBDB4;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 500; color: #888;
    transition: all .2s; font-family: 'DM Mono', monospace;
  }
  .step-btn.active .step-num { background: #0A0A0A; border-color: #0A0A0A; color: #fff; }
  .step-btn.done .step-num   { background: #E8E6E0; border-color: #BFBDB4; color: #555; }
  .step-label { font-size: 12px; color: #888; font-weight: 400; }
  .step-btn.active .step-label { color: #0A0A0A; font-weight: 500; }

  /* ── 폰 프레임 ── */
  .phone-wrap { position: relative; }
  .phone {
    width: 300px; background: #fff;
    border-radius: 44px; border: 2px solid #0A0A0A;
    overflow: hidden; box-shadow: 6px 6px 0 #0A0A0A; position: relative;
  }
  .status-bar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 24px 10px;
    font-size: 11px; font-weight: 500; font-family: 'DM Mono', monospace;
  }
  .notch { width: 72px; height: 6px; background: #0A0A0A; border-radius: 3px; }
  .screen { padding: 0 18px 24px; }

  /* ── 로딩 ── */
  .loading-wrap { padding: 24px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .loading-bar { width: 100%; height: 2px; background: #E8E6E0; border-radius: 2px; overflow: hidden; }
  .loading-bar-fill {
    height: 100%; width: 40%; background: #0A0A0A; border-radius: 2px;
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }

  /* ── 검색 드롭다운 ── */
  .search-dropdown {
    position: absolute; top: calc(100% + 2px); left: 0; right: 0;
    background: #fff; border: 1px solid #E0DED8; border-radius: 12px;
    z-index: 100; box-shadow: 0 4px 16px rgba(0,0,0,.10); overflow: hidden;
  }
  .search-item { padding: 9px 12px; cursor: pointer; border-bottom: 1px solid #F0EEE8; transition: background .1s; }
  .search-item:last-child { border-bottom: none; }
  .search-item:hover { background: #F5F3EE; }
  .search-item-name { font-size: 12px; font-weight: 500; }
  .search-item-addr { font-size: 10px; color: #888; margin-top: 1px; }

  /* ── 지도 (mock fallback) ── */
  .map {
    background: #E8E6E0; border-radius: 14px;
    position: relative; overflow: hidden; margin-bottom: 14px;
  }
  .map-grid-h { position: absolute; left: 0; right: 0; height: 1px; background: #D0CEC8; }
  .map-grid-v { position: absolute; top: 0; bottom: 0; width: 1px; background: #D0CEC8; }
  .map-route { position: absolute; background: #0A0A0A; border-radius: 2px; transition: all .4s ease; }
  .map-dot {
    position: absolute; width: 8px; height: 8px;
    background: #0A0A0A; border-radius: 50%; transform: translate(-50%, -50%);
  }
  .map-dot-end {
    position: absolute; width: 8px; height: 8px;
    border: 2px solid #0A0A0A; background: #fff;
    border-radius: 50%; transform: translate(-50%, -50%);
  }
  .map-car { position: absolute; transform: translate(-50%, -50%); transition: left .8s linear; }
  .map-tag { position: absolute; bottom: 7px; left: 10px; font-size: 10px; color: #888; font-family: 'DM Mono', monospace; }
  .map-chip {
    position: absolute; top: 8px; right: 9px;
    background: #fff; border: 1px solid #D0CEC8; border-radius: 20px;
    padding: 3px 9px; font-size: 10px; font-weight: 500;
    display: flex; align-items: center; gap: 4px;
  }
  .pulse-dot { width: 5px; height: 5px; border-radius: 50%; background: #0A0A0A; animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.2} }

  /* ── 링 애니메이션 ── */
  .ring {
    position: absolute; border-radius: 50%; border: 1px solid #0A0A0A;
    transform: translate(-50%, -50%); opacity: 0;
    animation: ringout 2.4s ease-out infinite;
  }
  @keyframes ringout { 0%{width:14px;height:14px;opacity:.7} 100%{width:80px;height:80px;opacity:0} }

  /* ── 공통 컴포넌트 ── */
  .section-label {
    font-size: 10px; font-weight: 500; color: #888;
    letter-spacing: .06em; text-transform: uppercase;
    margin-bottom: 7px; font-family: 'DM Mono', monospace;
  }
  .card { border: 1px solid #E0DED8; border-radius: 14px; padding: 12px 13px; margin-bottom: 10px; background: #fff; }
  .divider { border: none; border-top: 1px solid #E8E6E0; margin: 10px 0; }

  /* ── 입력 필드 ── */
  .input-group {
    background: #F5F3EE; border-radius: 12px;
    margin-bottom: 12px; border: 1px solid #E0DED8;
    overflow: visible; position: relative;
  }
  .input-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
  .input-row + .input-row { border-top: 1px solid #E0DED8; }
  .input-dot-filled { width: 8px; height: 8px; background: #0A0A0A; border-radius: 50%; flex-shrink: 0; }
  .input-dot-empty  { width: 8px; height: 8px; border: 2px solid #0A0A0A; border-radius: 50%; flex-shrink: 0; }
  .field-label { font-size: 10px; color: #888; margin-bottom: 1px; }
  .field-val { font-size: 13px; font-weight: 500; }
  .dest-input {
    border: none; background: transparent;
    font-size: 13px; font-family: 'DM Sans', sans-serif; font-weight: 500;
    outline: none; width: 100%; padding: 0;
  }
  .dest-input::placeholder { color: #B0AEA8; font-weight: 400; }

  /* ── 최근 목적지 ── */
  .recent-item { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid #F0EEE8; cursor: pointer; }
  .recent-item:last-child { border-bottom: none; }
  .recent-icon { width: 30px; height: 30px; border-radius: 8px; background: #F5F3EE; border: 1px solid #E0DED8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .recent-name { font-size: 12px; font-weight: 500; }
  .recent-addr { font-size: 10px; color: #888; margin-top: 1px; }

  /* ── 슬라이더 ── */
  .slider-unit { border: 1px solid #E0DED8; border-radius: 14px; padding: 12px 13px; margin-bottom: 10px; background: #fff; }
  .slider-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .slider-title { font-size: 12px; font-weight: 500; }
  .slider-badge { font-size: 10px; padding: 2px 9px; border-radius: 20px; background: #0A0A0A; color: #fff; font-family: 'DM Mono', monospace; }
  .slider-ticks { display: flex; justify-content: space-between; margin-top: 4px; }
  .tick { font-size: 9px; color: #B0AEA8; cursor: pointer; transition: color .15s; }
  .tick.active { color: #0A0A0A; font-weight: 500; }
  input[type=range] { width: 100%; accent-color: #0A0A0A; cursor: pointer; }

  /* ── MSDV 지수 바 ── */
  .msdv-row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .msdv-label { font-size: 9px; color: #888; font-family: 'DM Mono', monospace; white-space: nowrap; }
  .msdv-bar-bg { flex: 1; height: 3px; background: #E0DED8; border-radius: 2px; }
  .msdv-bar-fill { height: 3px; border-radius: 2px; transition: width .4s, background .4s; }
  .msdv-score { font-size: 9px; font-weight: 500; font-family: 'DM Mono', monospace; white-space: nowrap; }

  /* ── 경로 결과 카드 ── */
  .result-card { background: #F5F3EE; border-radius: 12px; padding: 11px 12px; margin-bottom: 10px; }
  .rc-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
  .rc-name { font-size: 13px; font-weight: 500; }
  .rc-why { font-size: 10px; color: #666; margin-top: 2px; line-height: 1.4; }
  .rc-time { font-size: 17px; font-weight: 500; line-height: 1; font-family: 'DM Mono', monospace; }
  .rc-diff { font-size: 10px; color: #888; margin-top: 2px; text-align: right; font-family: 'DM Mono', monospace; }
  .pills { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
  .pill { font-size: 10px; padding: 3px 7px; border-radius: 20px; border: 1px solid #0A0A0A; color: #0A0A0A; }
  .pill-muted { font-size: 10px; padding: 3px 7px; border-radius: 20px; border: 1px solid #D0CEC8; color: #888; }

  /* ── 가격 블록 ── */
  .price-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #fff; border-radius: 8px; border: 1px solid #E0DED8; margin-bottom: 7px; }
  .price-main { font-size: 16px; font-weight: 500; font-family: 'DM Mono', monospace; }
  .price-base { font-size: 10px; color: #888; margin-top: 1px; font-family: 'DM Mono', monospace; }
  .price-diff { font-size: 11px; font-weight: 500; color: #555; }
  .price-reason { font-size: 9px; color: #888; margin-top: 2px; text-align: right; }

  /* ── 트레이드오프 바 ── */
  .tradeoff { display: flex; align-items: center; gap: 7px; }
  .to-label { font-size: 9px; color: #888; white-space: nowrap; font-family: 'DM Mono', monospace; }
  .to-bg { flex: 1; height: 4px; background: #E0DED8; border-radius: 2px; }
  .to-fill { height: 4px; background: #0A0A0A; border-radius: 2px; transition: width .35s; }

  /* ── 토글 ── */
  .master-toggle { display: flex; align-items: center; justify-content: space-between; padding: 12px 13px; border: 2px solid #0A0A0A; border-radius: 14px; margin-bottom: 10px; cursor: pointer; background: #fff; }
  .toggle-pill { width: 38px; height: 22px; border-radius: 11px; position: relative; flex-shrink: 0; transition: background .2s; cursor: pointer; }
  .toggle-pill.on { background: #0A0A0A; }
  .toggle-pill.off { background: #D0CEC8; }
  .toggle-knob { position: absolute; top: 2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: left .2s; }
  .toggle-pill.on .toggle-knob { left: 18px; }
  .toggle-pill.off .toggle-knob { left: 2px; }
  .toggle-sm { width: 30px; height: 18px; border-radius: 9px; position: relative; flex-shrink: 0; transition: background .2s; cursor: pointer; }
  .toggle-sm.on { background: #0A0A0A; }
  .toggle-sm.off { background: #D0CEC8; }
  .knob-sm { position: absolute; top: 2px; width: 14px; height: 14px; background: #fff; border-radius: 50%; transition: left .2s; }
  .toggle-sm.on .knob-sm { left: 14px; }
  .toggle-sm.off .knob-sm { left: 2px; }

  .items-wrap { border: 1px solid #E0DED8; border-radius: 14px; overflow: hidden; margin-bottom: 10px; }
  .items-wrap.disabled { opacity: .4; pointer-events: none; }
  .setting-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #F0EEE8; }
  .setting-row:last-child { border-bottom: none; }
  .setting-icon { width: 28px; height: 28px; border-radius: 7px; background: #F5F3EE; border: 1px solid #E0DED8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .setting-name { font-size: 12px; font-weight: 500; }
  .setting-val { font-size: 10px; color: #888; margin-top: 1px; }
  .preview-box { background: #F5F3EE; border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; border: 1px solid #E0DED8; }
  .p-item { font-size: 10px; padding: 3px 7px; border-radius: 20px; border: 1px solid #0A0A0A; color: #0A0A0A; transition: opacity .3s; }
  .p-item.off { opacity: .25; border-color: #D0CEC8; color: #888; }

  /* ── 도착 ── */
  .arrival-card { background: #F5F3EE; border-radius: 12px; padding: 11px 12px; margin-bottom: 10px; }
  .arrival-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
  .arrival-title { font-size: 13px; font-weight: 500; }
  .car-plate { font-size: 11px; font-weight: 500; background: #fff; border: 1px solid #D0CEC8; border-radius: 4px; padding: 2px 6px; font-family: 'DM Mono', monospace; }
  .eta-big { font-size: 26px; font-weight: 500; line-height: 1; font-family: 'DM Mono', monospace; }
  .progress-bg { height: 3px; background: #E0DED8; border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 3px; background: #0A0A0A; border-radius: 2px; animation: prog 8s linear infinite; }
  @keyframes prog { 0%{width:8%} 100%{width:88%} }

  /* ── 햅틱 ── */
  .haptic-panel { border: 1px solid #E0DED8; border-radius: 14px; padding: 11px 12px; margin-bottom: 10px; background: #fff; }
  .hp-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .timeline { display: flex; flex-direction: column; gap: 7px; }
  .tl-row { display: flex; align-items: center; gap: 8px; }
  .tl-dist { font-size: 10px; color: #B0AEA8; width: 32px; text-align: right; font-family: 'DM Mono', monospace; flex-shrink: 0; }
  .tl-row.active .tl-dist { color: #0A0A0A; font-weight: 500; }
  .tl-bars { display: flex; gap: 2px; align-items: center; }
  .tl-bar { border-radius: 2px; background: #D0CEC8; width: 3px; transition: background .3s; }
  .tl-row.active .tl-bar { background: #0A0A0A; animation: barbeat .35s ease-in-out infinite alternate; }
  .tl-bar:nth-child(2) { animation-delay: .1s !important; }
  .tl-bar:nth-child(3) { animation-delay: .2s !important; }
  @keyframes barbeat { from{transform:scaleY(.5)} to{transform:scaleY(1)} }
  .tl-desc { font-size: 10px; color: #888; margin-left: 4px; }
  .tl-row.active .tl-desc { color: #0A0A0A; font-weight: 500; }

  .ready-card { background: #F5F3EE; border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
  .ready-icon { width: 24px; height: 24px; border-radius: 6px; background: #fff; border: 1px solid #D0CEC8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .check-chip { margin-left: auto; font-size: 10px; padding: 2px 7px; border-radius: 20px; border: 1px solid #0A0A0A; color: #0A0A0A; font-family: 'DM Mono', monospace; }
  .board-guide { border: 1px solid #E0DED8; border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; background: #fff; }
  .bg-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .bg-row:last-child { margin-bottom: 0; }
  .bg-num { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #D0CEC8; font-size: 9px; display: flex; align-items: center; justify-content: center; color: #888; flex-shrink: 0; margin-top: 1px; font-family: 'DM Mono', monospace; }
  .bg-text { font-size: 11px; color: #666; line-height: 1.4; }

  /* ── CTA 버튼 ── */
  .btn-primary { width: 100%; padding: 13px; background: #0A0A0A; color: #fff; border: none; border-radius: 14px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: opacity .15s; margin-top: 2px; }
  .btn-primary:active { opacity: .8; }
  .btn-cancel { width: 100%; padding: 11px; background: transparent; color: #888; border: 1px solid #D0CEC8; border-radius: 14px; font-size: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; }

  .screen-title { font-size: 16px; font-weight: 500; margin-bottom: 14px; color: #0A0A0A; letter-spacing: -.01em; }
  .route-summary { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: #F5F3EE; border-radius: 10px; margin-bottom: 10px; }

  /* ── 에러 배너 ── */
  .error-banner { background: #FFF3F3; border: 1px solid #FFCDD2; border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; font-size: 11px; color: #C62828; }
`;

// ─────────────────────────────────────────────
// Mock fallback (API 실패 시)
// ─────────────────────────────────────────────
const MOCK_ROUTES = [
  { badge:"Sport",       name:"최단 경로",      why:"도심 경유 · 빠른 이동",              time:"23분", diff:"기본",   pills:[{t:"도심 경유",m:true},{t:"정체 구간",m:true}], price:"₩10,800", pdiff:"기본 요금",          preason:"추가 가산 없음",   bar:12, msdv:72, points:[], mapTag:"최단 경로 — 도심 경유" },
  { badge:"Natural",     name:"일반 경로",      why:"간선도로 위주 · 무난한 이동",         time:"25분", diff:"+2분",  pills:[{t:"간선도로 위주"},{t:"도심 일부",m:true}],   price:"₩11,500", pdiff:"+₩700 (+6%)",       preason:"간선도로 가산",    bar:36, msdv:55, points:[], mapTag:"일반 경로 — 간선도로" },
  { badge:"Comfort",     name:"멀미 저감 경로", why:"완만한 커브 · 큰길 위주로 이동",      time:"27분", diff:"+4분",  pills:[{t:"급정거 3회 감소"},{t:"큰길 위주"},{t:"완만한 커브"}], price:"₩12,400", pdiff:"+₩1,600 (+15%)", preason:"편안함 경로 가산", bar:65, msdv:36, points:[], mapTag:"멀미 저감 경로 — 큰길 위주" },
  { badge:"Anti-nausea", name:"최적 편안 경로", why:"저주파 진동 최소 · 큰길 + 완만한 커브", time:"29분", diff:"+6분", pills:[{t:"저주파 진동 최소"},{t:"큰길 위주"},{t:"완만한 커브"},{t:"급정거 최소화"}], price:"₩13,800", pdiff:"+₩3,000 (+28%)", preason:"최적 편안 가산", bar:90, msdv:18, points:[], mapTag:"최적 편안 경로 — 저주파 최소" },
];

// ─────────────────────────────────────────────
// 차량 세팅 항목
// ─────────────────────────────────────────────
const settingItems = [
  { icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 9Q3 4 6.5 4Q10 4 11.5 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/><circle cx="6.5" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>, name:"액티브 서스펜션",   val:"커브 틸팅 · 수직 모션 최소화",    previewLabel:"서스펜션 안정화" },
  { icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="4" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4V2.5a2 2 0 014 0V4" stroke="currentColor" strokeWidth="1.2"/></svg>, name:"시트 포지션",       val:"순방향 고정 · 등받이 38° 눕힘",   previewLabel:"시트 38°" },
  { icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 3.5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>, name:"실내 온도 · 환기", val:"20°C 사전 냉방 · 환기 가동",       previewLabel:"20°C 냉방" },
  { icon: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 2.5V1.5M8.5 2.5V1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1.5 5.5h10" stroke="currentColor" strokeWidth="1.2"/></svg>, name:"창문 블라인드 개방", val:"시야 확보 · 탑승 전 자동 개방", previewLabel:"블라인드 개방" },
];

// ─────────────────────────────────────────────
// MSDV 계산 (방향 변화량 기반)
// ─────────────────────────────────────────────
function calcMSDV(points) {
  if (!points || points.length < 3) return 50;
  let totalAngle = 0, sharpCount = 0, validN = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i-1], p2 = points[i], p3 = points[i+1];
    const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
    const dx2 = p3.x - p2.x, dy2 = p3.y - p2.y;
    const len1 = Math.sqrt(dx1*dx1 + dy1*dy1);
    const len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
    if (len1 < 1e-10 || len2 < 1e-10) continue;

    const cosA  = Math.max(-1, Math.min(1, (dx1*dx2 + dy1*dy2) / (len1 * len2)));
    const angle = Math.acos(cosA) * (180 / Math.PI);
    totalAngle += angle;
    if (angle > 25) sharpCount++;
    validN++;
  }
  if (validN === 0) return 50;
  return Math.round(Math.min(100, (totalAngle / validN) * 1.8 + (sharpCount / validN) * 45));
}

function extractPoints(data) {
  const points = [];
  for (const sec of (data?.routes?.[0]?.sections || [])) {
    for (const road of (sec.roads || [])) {
      const vx = road.vertexes || [];
      for (let i = 0; i < vx.length - 1; i += 2) points.push({ x: vx[i], y: vx[i+1] });
    }
  }
  return points;
}

function extractSummary(data) {
  const s = data?.routes?.[0]?.summary || {};
  return {
    duration: Math.round((s.duration || 0) / 60),
    distance: ((s.distance || 0) / 1000).toFixed(1),
    fare: s.fare?.taxi || 10800,
  };
}

// ─────────────────────────────────────────────
// Kakao SDK 로더 훅
// ─────────────────────────────────────────────
function useKakaoSDK() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.kakao?.maps) { setReady(true); return; }
    if (document.getElementById("kakao-sdk")) return;
    const script = document.createElement("script");
    script.id = "kakao-sdk";
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => setReady(true));
    document.head.appendChild(script);
  }, []);
  return ready;
}

// ─────────────────────────────────────────────
// Places 검색 훅
// ─────────────────────────────────────────────
function usePlacesSearch() {
  const [results, setResults] = useState([]);
  const timerRef = useRef(null);

  const search = useCallback((query) => {
    clearTimeout(timerRef.current);
    if (!query?.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(() => {
      if (!window.kakao?.maps?.services) return;
      const ps = new window.kakao.maps.services.Places();
      ps.keywordSearch(query, (data, status) => {
        if (status === window.kakao.maps.services.Status.OK) {
          setResults(data.slice(0, 5).map(r => ({
            name: r.place_name,
            address: r.road_address_name || r.address_name,
            lat: parseFloat(r.y),
            lng: parseFloat(r.x),
          })));
        } else {
          setResults([]);
        }
      });
    }, 250);
  }, []);

  return { results, search, clear: () => setResults([]) };
}

// ─────────────────────────────────────────────
// 실제 경로 탐색 + MSDV 스코어링
// ─────────────────────────────────────────────
async function buildRoutes(origin, destination) {
  const orig = `${origin.lng},${origin.lat}`;
  const dest = `${destination.lng},${destination.lat}`;

  const [timeData, recData] = await Promise.all([
    fetch(`/api/directions?origin=${orig}&destination=${dest}&priority=TIME`).then(r => r.json()),
    fetch(`/api/directions?origin=${orig}&destination=${dest}&priority=RECOMMEND`).then(r => r.json()),
  ]);

  const timePoints = extractPoints(timeData);
  const recPoints  = extractPoints(recData);
  const timeSum    = extractSummary(timeData);
  const recSum     = extractSummary(recData);
  const timeMSDV   = calcMSDV(timePoints);
  const recMSDV    = calcMSDV(recPoints);
  const base       = timeSum.fare;
  const baseMin    = timeSum.duration;
  const fmt        = n => `₩${Math.round(n).toLocaleString()}`;
  const diffMin    = m => m <= 0 ? "기본" : `+${m}분`;

  return [
    {
      badge: "Sport", name: "최단 경로", why: "도심 경유 · 빠른 이동",
      time: `${timeSum.duration}분`, diff: "기본",
      pills: [{ t: `${timeSum.distance}km` }, { t: "급정거 多", m: true }],
      price: fmt(base), pdiff: "기본 요금", preason: "추가 가산 없음",
      bar: 10, msdv: timeMSDV, points: timePoints, mapTag: `최단 경로 — ${timeSum.duration}분`,
    },
    {
      badge: "Natural", name: "일반 경로", why: "간선도로 위주 · 무난한 이동",
      time: `${recSum.duration}분`, diff: diffMin(recSum.duration - baseMin),
      pills: [{ t: "간선도로 위주" }, { t: `${recSum.distance}km` }],
      price: fmt(base * 1.06), pdiff: `+${fmt(base * 0.06)} (+6%)`, preason: "간선도로 가산",
      bar: 38, msdv: recMSDV, points: recPoints, mapTag: `일반 경로 — ${recSum.duration}분`,
    },
    {
      badge: "Comfort", name: "멀미 저감 경로", why: "완만한 커브 · 큰길 위주로 이동",
      time: `${recSum.duration + 2}분`, diff: diffMin(recSum.duration + 2 - baseMin),
      pills: [{ t: "급정거 3회 감소" }, { t: "큰길 위주" }, { t: "완만한 커브" }],
      price: fmt(base * 1.15), pdiff: `+${fmt(base * 0.15)} (+15%)`, preason: "편안함 경로 가산",
      bar: 65, msdv: Math.round(recMSDV * 0.62), points: recPoints, mapTag: "멀미 저감 경로 — 큰길 위주",
    },
    {
      badge: "Anti-nausea", name: "최적 편안 경로", why: "저주파 진동 최소 · 큰길 + 완만한 커브",
      time: `${recSum.duration + 4}분`, diff: diffMin(recSum.duration + 4 - baseMin),
      pills: [{ t: "저주파 진동 최소" }, { t: "큰길 위주" }, { t: "급정거 최소화" }],
      price: fmt(base * 1.28), pdiff: `+${fmt(base * 0.28)} (+28%)`, preason: "최적 편안 가산",
      bar: 90, msdv: Math.round(recMSDV * 0.30), points: recPoints, mapTag: "최적 편안 경로 — 저주파 최소",
    },
  ];
}

// ─────────────────────────────────────────────
// KakaoMap 컴포넌트
// ─────────────────────────────────────────────
function KakaoMap({ center, zoom = 5, routes = [], markers = [], style }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const overlaysRef  = useRef([]);

  useEffect(() => {
    if (!containerRef.current || !window.kakao?.maps) return;
    const kakao = window.kakao.maps;
    const map = new kakao.Map(containerRef.current, {
      center: new kakao.LatLng(center.lat, center.lng),
      level: zoom,
    });
    map.setDraggable(false);
    map.setZoomable(false);
    mapRef.current = map;
    return () => { mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
  }, [center]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const kakao = window.kakao.maps;
    overlaysRef.current.forEach(o => o.setMap(null));
    overlaysRef.current = [];

    routes.forEach(r => {
      if (!r.points?.length) return;
      const poly = new kakao.Polyline({
        path: r.points.map(p => new kakao.LatLng(p.y, p.x)),
        strokeWeight: r.active ? 5 : 2,
        strokeColor:  r.active ? "#0A0A0A" : "#BFBDB4",
        strokeOpacity: r.active ? 1 : 0.45,
        strokeStyle: "solid",
      });
      poly.setMap(mapRef.current);
      overlaysRef.current.push(poly);
    });

    markers.forEach(m => {
      const marker = new kakao.Marker({ position: new kakao.LatLng(m.lat, m.lng), map: mapRef.current });
      overlaysRef.current.push(marker);
    });

    const allPts = routes.flatMap(r => r.points || []);
    if (allPts.length > 0) {
      const bounds = new kakao.LatLngBounds();
      allPts.forEach(p => bounds.extend(new kakao.LatLng(p.y, p.x)));
      mapRef.current.setBounds(bounds, 30);
    }
  }, [routes, markers]);

  return <div ref={containerRef} style={style} />;
}

// ─────────────────────────────────────────────
// MSDV 색상 / 레이블
// ─────────────────────────────────────────────
const msdvColor = s => s < 25 ? "#2E7D32" : s < 50 ? "#F57F17" : "#C62828";
const msdvLabel = s => s < 25 ? "매우 편안" : s < 45 ? "편안" : s < 65 ? "보통" : "불편";

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function CallingPrototype() {
  const [step, setStep]           = useState(1);
  const [sliderVal, setSliderVal] = useState(2);
  const [masterOn, setMasterOn]   = useState(true);
  const [rowStates, setRowStates] = useState([true, true, true, true]);
  const [carX, setCarX]           = useState(20);
  const carDir = useRef(1);

  const [currentLoc, setCurrentLoc]       = useState({ lat: 37.5665, lng: 126.9780 });
  const [destination, setDestination]     = useState(null);
  const [searchQuery, setSearchQuery]     = useState("");
  const [routes, setRoutes]               = useState(null);
  const [routeLoading, setRouteLoading]   = useState(false);
  const [routeError, setRouteError]       = useState(false);

  const kakaoReady = useKakaoSDK();
  const { results: searchResults, search, clear: clearSearch } = usePlacesSearch();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setCurrentLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  useEffect(() => {
    if (step !== 4 && step !== 5) return;
    const limit = step === 5 ? 42 : 55;
    const startX = step === 5 ? 28 : 20;
    setCarX(startX);
    const iv = setInterval(() => {
      setCarX(x => {
        const next = x + carDir.current * 0.5;
        if (next > limit)  { carDir.current = -1; return limit; }
        if (next < startX) { carDir.current =  1; return startX; }
        return next;
      });
    }, 80);
    return () => clearInterval(iv);
  }, [step]);

  const handleSearchInput = (q) => {
    setSearchQuery(q);
    setDestination(null);
    if (kakaoReady) search(q);
  };

  const handleSelectDest = (place) => {
    setDestination(place);
    setSearchQuery(place.name);
    clearSearch();
  };

  const handleFetchRoutes = async () => {
    setStep(2);
    if (!destination) { setRoutes(null); return; }
    setRouteLoading(true);
    setRouteError(false);
    try {
      const built = await buildRoutes(currentLoc, destination);
      setRoutes(built);
    } catch {
      setRouteError(true);
      setRoutes(null);
    }
    setRouteLoading(false);
  };

  const activeRoutes = routes || MOCK_ROUTES;
  const rd = activeRoutes[sliderVal];

  const toggleRow = (i) => setRowStates(s => s.map((v, idx) => idx === i ? !v : v));
  const stepLabels = ["목적지 입력", "경로 선택", "차량 세팅", "호출 완료", "차량 접근"];

  const mapRoutes  = (routes || []).map((r, i) => ({ points: r.points, active: i === sliderVal }));
  const mapMarkers = destination
    ? [{ lat: currentLoc.lat, lng: currentLoc.lng }, { lat: destination.lat, lng: destination.lng }]
    : [];

  return (
    <>
      <style>{styles}</style>
      <div className="proto-root">

        {/* 스텝 네비 */}
        <div className="step-nav">
          {STEPS.map(s => (
            <button key={s} className={`step-btn ${step===s?"active":step>s?"done":""}`} onClick={() => setStep(s)}>
              <div className="step-num">{step > s ? "✓" : s}</div>
              <span className="step-label">{stepLabels[s-1]}</span>
            </button>
          ))}
        </div>

        {/* 폰 */}
        <div className="phone-wrap">
          <div className="phone">
            <div className="status-bar">
              <span>9:41</span>
              <div className="notch" />
              <span>●●●</span>
            </div>
            <div className="screen">

              {/* ── STEP 1 ── */}
              {step === 1 && <>
                <div className="screen-title">어디로 가시나요?</div>

                {kakaoReady ? (
                  <KakaoMap
                    center={currentLoc}
                    zoom={5}
                    markers={[{ lat: currentLoc.lat, lng: currentLoc.lng }]}
                    style={{ height: 150, borderRadius: 14, marginBottom: 14 }}
                  />
                ) : (
                  <div className="map" style={{ height: 150 }}>
                    <div className="map-grid-h" style={{ top:"38%" }} /><div className="map-grid-h" style={{ top:"68%" }} />
                    <div className="map-grid-v" style={{ left:"30%" }} /><div className="map-grid-v" style={{ left:"65%" }} />
                    <div className="map-dot" style={{ top:"50%", left:"50%" }} />
                    <div style={{ position:"absolute", top:"calc(50% - 14px)", left:"calc(50% - 14px)", width:28, height:28, border:"1.5px solid #0A0A0A", borderRadius:"50%", opacity:.2 }} />
                    <div className="map-tag">현재 위치</div>
                  </div>
                )}

                <div className="input-group">
                  <div className="input-row">
                    <div className="input-dot-filled" />
                    <div><div className="field-label">출발지</div><div className="field-val">현재 위치</div></div>
                  </div>
                  <div className="input-row" style={{ position:"relative" }}>
                    <div className="input-dot-empty" />
                    <div style={{ flex:1 }}>
                      <div className="field-label">목적지</div>
                      <input className="dest-input" placeholder="어디로 가시나요?" value={searchQuery}
                        onChange={e => handleSearchInput(e.target.value)} />
                    </div>
                    {searchResults.length > 0 && (
                      <div className="search-dropdown">
                        {searchResults.map(r => (
                          <div key={r.name+r.address} className="search-item" onClick={() => handleSelectDest(r)}>
                            <div className="search-item-name">{r.name}</div>
                            <div className="search-item-addr">{r.address}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="section-label">최근 목적지</div>
                {[
                  { name:"회사",          address:"서울시 강남구 테헤란로 427",    lat:37.5064, lng:127.0536 },
                  { name:"코엑스몰",      address:"서울시 강남구 봉은사로 524",    lat:37.5127, lng:127.0594 },
                  { name:"잠실역 2번 출구", address:"서울시 송파구 올림픽로 240", lat:37.5133, lng:127.1001 },
                ].map(p => (
                  <div key={p.name} className="recent-item" onClick={() => handleSelectDest(p)}>
                    <div className="recent-icon">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M6.5 1C4.3 1 2.5 2.8 2.5 5c0 3.2 4 7 4 7s4-3.8 4-7c0-2.2-1.8-4-4-4z" stroke="currentColor" strokeWidth="1.2"/>
                        <circle cx="6.5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <div><div className="recent-name">{p.name}</div><div className="recent-addr">{p.address}</div></div>
                  </div>
                ))}
                <button className="btn-primary" style={{ marginTop:14 }} onClick={handleFetchRoutes}>경로 탐색</button>
              </>}

              {/* ── STEP 2 ── */}
              {step === 2 && <>
                {routeLoading ? (
                  <div className="loading-wrap">
                    <div style={{ fontSize:12, color:"#888" }}>멀미 저감 경로 탐색 중…</div>
                    <div className="loading-bar"><div className="loading-bar-fill" /></div>
                    <div style={{ fontSize:10, color:"#B0AEA8", fontFamily:"'DM Mono',monospace" }}>MSDV 지수 계산 중</div>
                  </div>
                ) : <>
                  {routeError && <div className="error-banner">경로 탐색 실패 — 샘플 데이터로 표시합니다</div>}

                  {kakaoReady && routes && routes[0].points.length > 0 ? (
                    <KakaoMap
                      center={destination || currentLoc}
                      zoom={6}
                      routes={mapRoutes}
                      markers={mapMarkers}
                      style={{ height:110, borderRadius:14, marginBottom:14 }}
                    />
                  ) : (
                    <div className="map" style={{ height:110 }}>
                      <div className="map-grid-h" style={{ top:"40%" }} />
                      <div className="map-grid-v" style={{ left:"28%" }} /><div className="map-grid-v" style={{ left:"63%" }} />
                      <div style={{ position:"absolute", height: sliderVal < 2 ? 1.5 : 3, background:"#0A0A0A", borderRadius:2, top:"calc(42% - 1px)", left:"14%", width:"72%", transition:"all .3s" }} />
                      <div className="map-dot" style={{ top:"42%", left:"14%" }} />
                      <div className="map-dot-end" style={{ top:"42%", left:"86%" }} />
                      <div className="map-tag">{rd.mapTag}</div>
                    </div>
                  )}

                  <div className="slider-unit">
                    <div className="slider-top">
                      <span className="slider-title">어떻게 타고 싶으세요?</span>
                      <span className="slider-badge">{rd.badge}</span>
                    </div>
                    <input type="range" min={0} max={3} value={sliderVal} step={1}
                      onChange={e => setSliderVal(+e.target.value)} />
                    <div className="slider-ticks">
                      {["Sport","Natural","Comfort","Anti-nausea"].map((l,i) => (
                        <span key={l} className={`tick${i===sliderVal?" active":""}`} onClick={() => setSliderVal(i)}>{l}</span>
                      ))}
                    </div>
                    {/* MSDV 지수 바 */}
                    <div className="msdv-row">
                      <span className="msdv-label">MSDV</span>
                      <div className="msdv-bar-bg">
                        <div className="msdv-bar-fill" style={{ width:`${rd.msdv}%`, background: msdvColor(rd.msdv) }} />
                      </div>
                      <span className="msdv-score" style={{ color: msdvColor(rd.msdv) }}>
                        {rd.msdv} — {msdvLabel(rd.msdv)}
                      </span>
                    </div>
                  </div>

                  <hr className="divider" />
                  <div className="section-label">추천 경로</div>
                  <div className="result-card">
                    <div className="rc-top">
                      <div><div className="rc-name">{rd.name}</div><div className="rc-why">{rd.why}</div></div>
                      <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                        <div className="rc-time">{rd.time}</div>
                        <div className="rc-diff">{rd.diff}</div>
                      </div>
                    </div>
                    <div className="pills">
                      {rd.pills.map(p => <span key={p.t} className={p.m?"pill-muted":"pill"}>{p.t}</span>)}
                    </div>
                    <div className="price-row">
                      <div>
                        <div className="price-main">{rd.price}</div>
                        <div className="price-base">기본 요금 {activeRoutes[0].price}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div className="price-diff">{rd.pdiff}</div>
                        <div className="price-reason">{rd.preason}</div>
                      </div>
                    </div>
                    <div className="tradeoff">
                      <span className="to-label">빠름·저렴</span>
                      <div className="to-bg"><div className="to-fill" style={{ width:`${rd.bar}%` }} /></div>
                      <span className="to-label">편안함·고가</span>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => setStep(3)}>다음 — 차량 세팅 · {rd.price}</button>
                </>}
              </>}

              {/* ── STEP 3 ── */}
              {step === 3 && <>
                <div className="screen-title">차량 세팅</div>
                <div className="master-toggle" onClick={() => setMasterOn(v => !v)}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>멀미 방지 세팅 적용</div>
                    <div style={{ fontSize:10, color:"#888", marginTop:2 }}>
                      {masterOn ? "서스펜션 · 시트 · 온도 자동 설정" : "세팅이 적용되지 않습니다"}
                    </div>
                  </div>
                  <div className={`toggle-pill ${masterOn?"on":"off"}`}><div className="toggle-knob" /></div>
                </div>
                <div className={`items-wrap${masterOn?"":" disabled"}`}>
                  {settingItems.map((s, i) => (
                    <div key={i} className="setting-row">
                      <div className="setting-icon">{s.icon}</div>
                      <div style={{ flex:1 }}>
                        <div className="setting-name">{s.name}</div>
                        <div className="setting-val">{s.val}</div>
                      </div>
                      <div className={`toggle-sm ${rowStates[i]?"on":"off"}`} onClick={() => toggleRow(i)}>
                        <div className="knob-sm" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="preview-box">
                  <div className="section-label" style={{ marginBottom:7 }}>차량 도착 전 적용될 설정</div>
                  <div className="pills">
                    {settingItems.map((s, i) => (
                      <span key={i} className={`p-item${masterOn&&rowStates[i]?"":" off"}`}>{s.previewLabel}</span>
                    ))}
                  </div>
                </div>
                <button className="btn-primary" onClick={() => setStep(4)}>호출하기 · {rd.price}</button>
              </>}

              {/* ── STEP 4 ── */}
              {step === 4 && <>
                {kakaoReady && destination ? (
                  <KakaoMap
                    center={destination}
                    zoom={4}
                    markers={[{ lat: destination.lat, lng: destination.lng }]}
                    style={{ height:130, borderRadius:14, marginBottom:14 }}
                  />
                ) : (
                  <div className="map" style={{ height:130 }}>
                    <div className="map-grid-h" style={{ top:"40%" }} /><div className="map-grid-h" style={{ top:"68%" }} />
                    <div className="map-grid-v" style={{ left:"28%" }} /><div className="map-grid-v" style={{ left:"65%" }} />
                    <div style={{ position:"absolute", height:2, background:"#0A0A0A", borderRadius:2, opacity:.3, top:"calc(40% - 1px)", left:"12%", width:"76%" }} />
                    <div className="map-dot" style={{ top:"40%", left:"12%" }} />
                    <div className="map-dot-end" style={{ top:"40%", left:"88%" }} />
                    <div className="map-car" style={{ top:"40%", left:`${carX}%` }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <rect x="1" y="5" width="16" height="9" rx="3" fill="#0A0A0A"/>
                        <rect x="4" y="3" width="10" height="5" rx="2" fill="#0A0A0A" opacity=".6"/>
                        <circle cx="4.5" cy="14" r="1.5" fill="#fff" stroke="#0A0A0A" strokeWidth="1"/>
                        <circle cx="13.5" cy="14" r="1.5" fill="#fff" stroke="#0A0A0A" strokeWidth="1"/>
                      </svg>
                    </div>
                    <div className="map-chip"><div className="pulse-dot" /><span>3분 후 도착</span></div>
                  </div>
                )}
                <div className="arrival-card">
                  <div className="arrival-top">
                    <div>
                      <div className="arrival-title">차량 접근 중</div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
                        <span className="car-plate">12가 3456</span>
                        <span style={{ fontSize:11, color:"#888" }}>아이오닉 6</span>
                      </div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div className="eta-big">3<span style={{ fontSize:13, fontWeight:400, color:"#888" }}>분</span></div>
                      <div style={{ fontSize:10, color:"#888", marginTop:2 }}>약 280m</div>
                    </div>
                  </div>
                  <div className="progress-bg"><div className="progress-fill" /></div>
                </div>
                <div className="card">
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:7 }}>
                    <span className="section-label" style={{ margin:0 }}>차량 세팅 적용 중</span>
                    <span style={{ fontSize:10, color:"#888", display:"flex", alignItems:"center", gap:4 }}><span className="pulse-dot" />준비 중</span>
                  </div>
                  <div className="pills">
                    {settingItems.filter((_, i) => rowStates[i]).map((s, i) => <span key={i} className="pill">{s.previewLabel}</span>)}
                  </div>
                </div>
                <div className="route-summary">
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>{rd.name}</div>
                    <div style={{ fontSize:10, color:"#888", marginTop:1 }}>{rd.time} 예상 · {rd.badge}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:14, fontWeight:500, fontFamily:"'DM Mono',monospace" }}>{rd.price}</div>
                  </div>
                </div>
                <button className="btn-cancel" onClick={() => setStep(1)}>호출 취소</button>
              </>}

              {/* ── STEP 5 ── */}
              {step === 5 && <>
                <div className="map" style={{ height:120 }}>
                  <div className="map-grid-h" style={{ top:"40%" }} />
                  <div className="map-grid-v" style={{ left:"30%" }} /><div className="map-grid-v" style={{ left:"65%" }} />
                  {[0,.8,1.6].map(d => <div key={d} className="ring" style={{ left:"55%", top:"50%", animationDelay:`${d}s` }} />)}
                  <div className="map-dot" style={{ top:"50%", left:"55%" }} />
                  <div className="map-car" style={{ top:"50%", left:`${carX}%` }}>
                    <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                      <rect x="1" y="5" width="16" height="9" rx="3" fill="#0A0A0A"/>
                      <rect x="4" y="3" width="10" height="5" rx="2" fill="#0A0A0A" opacity=".6"/>
                      <circle cx="4.5" cy="14" r="1.5" fill="#fff" stroke="#0A0A0A" strokeWidth="1"/>
                      <circle cx="13.5" cy="14" r="1.5" fill="#fff" stroke="#0A0A0A" strokeWidth="1"/>
                    </svg>
                  </div>
                  <div className="map-tag">차량 50m 전방</div>
                  <div className="map-chip"><div className="pulse-dot" /><span>곧 도착</span></div>
                </div>

                <div style={{ border:"2px solid #0A0A0A", borderRadius:14, padding:"11px 12px", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:500 }}>차량이 도착합니다</div>
                      <div style={{ fontSize:10, color:"#888", marginTop:2 }}>12가 3456 · 아이오닉 6</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div className="eta-big">1<span style={{ fontSize:12, fontWeight:400, color:"#888" }}>분</span></div>
                      <div style={{ fontSize:10, color:"#888", marginTop:1 }}>약 50m</div>
                    </div>
                  </div>
                  <div className="progress-bg">
                    <div style={{ height:3, background:"#0A0A0A", borderRadius:2, width:"88%" }} />
                  </div>
                </div>

                <div className="haptic-panel">
                  <div className="hp-top">
                    <span className="section-label" style={{ margin:0 }}>햅틱 피드백 패턴</span>
                    <span style={{ fontSize:10, color:"#888", display:"flex", alignItems:"center", gap:4 }}><span className="pulse-dot" />진행 중</span>
                  </div>
                  <div className="timeline">
                    {[
                      { dist:"300m", bars:[8],           desc:"약한 1회",        active:false },
                      { dist:"150m", bars:[8,8],          desc:"중간 2회",        active:false },
                      { dist:"50m",  bars:[10,14,10],     desc:"강한 3회 · 현재", active:true  },
                      { dist:"도착", bars:[8,14,18,14,8], desc:"롱 버즈 1회",     active:false },
                    ].map(row => (
                      <div key={row.dist} className={`tl-row${row.active?" active":""}`}>
                        <span className="tl-dist">{row.dist}</span>
                        <div className="tl-bars">{row.bars.map((h,i) => <div key={i} className="tl-bar" style={{ height:h }} />)}</div>
                        <span className="tl-desc">{row.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ready-card">
                  <div className="ready-icon">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:500 }}>차량 세팅 완료</div>
                    <div style={{ fontSize:10, color:"#888", marginTop:1 }}>서스펜션 · 시트 38° · 20°C · 블라인드</div>
                  </div>
                  <span className="check-chip">준비됨</span>
                </div>

                <div className="board-guide">
                  {[
                    ["차량 번호 확인",   "12가 3456 · 흰색 아이오닉 6"],
                    ["블라인드 개방 확인", "탑승 전 시야 확보 완료"],
                    ["탑승 후 자세 유지", "등받이 38° 유지해 주세요"],
                  ].map(([t,d],i) => (
                    <div key={i} className="bg-row">
                      <div className="bg-num">{i+1}</div>
                      <div className="bg-text"><strong style={{ color:"#0A0A0A", fontWeight:500 }}>{t}</strong> — {d}</div>
                    </div>
                  ))}
                </div>
              </>}

            </div>
          </div>
        </div>

        {/* 우측 설명 패널 */}
        <div style={{ paddingTop:60, minWidth:160, maxWidth:180 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#888", letterSpacing:".06em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace", marginBottom:12 }}>
            {stepLabels[step-1]}
          </div>
          {step===1 && [["지도","GPS 현재 위치 실시간"],["검색","카카오 Places API"],["최근 목적지","탭 → 자동 입력"],["CTA","경로 탐색 트리거"]].map(([t,d])=>(
            <div key={t} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:2 }}>{t}</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.4 }}>{d}</div>
            </div>
          ))}
          {step===2 && [["지도","실제 폴리라인 2개"],["MSDV","꺾임각 기반 산출"],["슬라이더","4단계 가중치"],["가격","실제 택시 요금"]].map(([t,d])=>(
            <div key={t} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:2 }}>{t}</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.4 }}>{d}</div>
            </div>
          ))}
          {step===3 && [["마스터 토글","전체 ON/OFF"],["개별 토글","항목별 제어"],["pill 미리보기","적용될 항목"],["CTA","최종가 유지"]].map(([t,d])=>(
            <div key={t} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:2 }}>{t}</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.4 }}>{d}</div>
            </div>
          ))}
          {step===4 && [["실시간 핀","목적지 표시"],["ETA + 바","접근 진행도"],["세팅 카드","준비 중 상태"],["취소","낮은 강조"]].map(([t,d])=>(
            <div key={t} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:2 }}>{t}</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.4 }}>{d}</div>
            </div>
          ))}
          {step===5 && [["링 애니","100m 이내 전환"],["햅틱 타임라인","4단계 강도"],["세팅 완료","체크 확정"],["탑승 안내","3단계 지침"]].map(([t,d])=>(
            <div key={t} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:500, marginBottom:2 }}>{t}</div>
              <div style={{ fontSize:11, color:"#888", lineHeight:1.4 }}>{d}</div>
            </div>
          ))}
          <div style={{ marginTop:20, paddingTop:16, borderTop:"1px solid #D0CEC8" }}>
            {step > 1 && <button onClick={() => setStep(s=>s-1)} style={{ fontSize:11, padding:"5px 10px", borderRadius:6, border:"1px solid #D0CEC8", background:"transparent", cursor:"pointer", marginRight:6, color:"#888" }}>← 이전</button>}
            {step < 5 && <button onClick={() => setStep(s=>s+1)} style={{ fontSize:11, padding:"5px 10px", borderRadius:6, border:"1px solid #0A0A0A", background:"transparent", cursor:"pointer", color:"#0A0A0A" }}>다음 →</button>}
          </div>
        </div>

      </div>
    </>
  );
}
