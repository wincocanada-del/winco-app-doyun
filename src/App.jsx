import React, { useEffect, useMemo, useState } from "react";
import ScrollNav from "./lib/ScrollNav";
import QuotesPage from "./features/quotes/QuotesPage";
import { APP_VERSION, SHOW_SQFT_FOOTER, XLS_WITH_SQFT_SUM } from "./data/appConfig";
import { ACCOUNT_PIN_MAP, ACCOUNTS, ROLE_LABELS } from "./data/accounts";
import {
  ACC_CAT_OPTS,
  ACC_TYPE_OPTS,
  ACCESSORY_CATALOG,
  ACCESSORY_PRICE_MAP,
  BOTTOM_TYPES,
  COLOR_COMMON,
  CONTROL_OPTS,
  CONTROL_SUR,
  HEADRAIL_OPTS,
  HDR_TBL,
  HW_COLOR_LABELS,
  MOTOR_PRICE,
  MOTORS,
  MOUNT_OPTS,
  REMOTE_DETAIL_OPTS,
  SPACE_LABELS,
  SPACE_OPTS,
  SPRING_ASSIST_PRICE,
} from "./data/options";
import {
  FABRIC_SEED,
} from "./data/fabrics";
import { LS_AUTH, LS_FABRIC, LS_JOBS, LS_MEASURE_AUTO, getLS, getSS, setLS, setSS } from "./lib/storage";
import { SUPA_ON, supabase } from "./lib/supabaseClient";
import {
  buildColorOptionsForDisplay,
  buildFamilyOptionsForDisplay,
  canonicalFabricNo,
  runFabricPatches,
} from "./lib/fabricHelpers";
import {
  fracLabel,
  in2,
  inToMm,
  mm1FromIn,
  mmToIn,
  nowLocalForInput,
  nowStamp,
  round1,
  round2,
  sanitizeFileName,
  splitInches,
} from "./lib/formatters";

/* ───────────────────────────── Supabase Client ───────────────────────────── */

/* App version */

/* ---------------- Storage Keys (simple) ---------------- */

/* ===================== NEW / UPDATED CONSTANTS (Headrail/Control/Duo) ===================== */
// Headrail 옵션 (표기는 약어만)

// Control 옵션 (라벨상 Control, 기능적으로 cordType 그대로 사용)

// Control 서브차지 ($)

// Spring Assist ($)

// ── Feature toggles (쉽게 on/off)

// Motor 라인업
// Headrail 폭별 서브차지 테이블 (3FA/4FA(ZSL/ZST 포함), in → $)
// Remote 세부

const COL={ 1:"col-span-1 md:col-span-1", 2:"col-span-2 md:col-span-2", 3:"col-span-3 md:col-span-3", 4:"col-span-4 md:col-span-4", 5:"col-span-5 md:col-span-5", 6:"col-span-6 md:col-span-6", 7:"col-span-7 md:col-span-7", 8:"col-span-8 md:col-span-8", 9:"col-span-9 md:col-span-9", 10:"col-span-10 md:col-span-10", 11:"col-span-11 md:col-span-11", 12:"col-span-12 md:col-span-12" };

function accUnitOf(code){
  const row = ACCESSORY_CATALOG.find(a=>a.code===code);
  return row ? row.unit : "ea";
}
function accPriceOf(code){
  const row = ACCESSORY_CATALOG.find(a=>a.code===code);
  return row ? (row.price||0) : 0;
}
// Type/세부 → 내부 code 매핑
function codeFrom(type, detail){
  if(type==="Remote")  return `REMOTE_${detail||"1CH"}`;
  if(type==="Charger") return "CHARGER";
  if(type==="Hub")     return "HUB";
  return "";
}

function normalizeCordType(v){
  const s = String(v || "").trim();
  const u = s.toUpperCase();
  if (u === "STRING" || u === "STR") return "STR";
  if (u === "CHAIN" || u === "CH") return "CH";
  if (u === "CORDLESS") return "CLF";
  if (u === "MOTOR") return "Motor";
  return s;
}

/* === Compatibility resolver (fix for #1, #4-2) === */
function resolveItem(draft){
  const cur = { ...draft };

  // 현재 선택 상태
  const up  = cur.upType || "";
  const ct  = normalizeCordType(cur.cordType || "");     // ⬅️ 컨트롤 타입 먼저 확보
  const forcedCat = headrailCategory(up);                // "Roller" | null
  let cat = cur.category || null;

  /* (1) 헤드레일이 Roller 전용이면 카테고리 강제 */
  if (forcedCat && forcedCat !== cat) {
    cat = forcedCat;
    cur.category = forcedCat;
  }

  /* (2) 컨트롤 타입에 따른 카테고리 제한
     - CLF/CLS/CLO(코드리스)는 Dual 불가 → Roller만 허용
     - Motor 는 카테고리 제한 없음(다만 HR은 모터 가능한 것만)
  */
  const allowedCatsBase = forcedCat ? ["Roller"] : ["Dual","Roller"];
  let allowedCats = [...allowedCatsBase];

  if (["CLF","CLS","CLO"].includes(ct)) {
    allowedCats = ["Roller"];
    if (cat === "Dual") { cat = "Roller"; cur.category = "Roller"; }
  }

  /* (3) 허용 HR/Control/Bottom 계산
     - Motor 선택 시 HR은 모터 가능한 HR만 노출
  */
  const allowedHeadrails0 = allowedHeadrailsForCategory(cat);
  const allowedHeadrails  = (ct === "Motor")
    ? allowedHeadrails0.filter(isMotorAllowedByHeadrail)
    : allowedHeadrails0;

  const allowedControls  = filterControlsBy(cat, up);
  const allowedBottoms   = allowedBottomsFor(cat, up);

  /* (1-보정) 선택된 HR이 현재 허용 목록에서 벗어나면 교체 */
  if (up && !allowedHeadrails.includes(up)) {
    const patched = allowedHeadrails[0] || "";
    cur.upType = patched;
  }

  /* (4-2) 듀얼이면 Side/L 채널 금지 + 바텀 OP 강제는
     → normalizeBottomBy가 이미 OP로 교정, 여기서는 체크박스만 정리
  */
  const isDual = (cat === "Dual");
  if (isDual) {
    if (cur.sideChannel) cur.sideChannel = false;
    if (cur.lChannel)    cur.lChannel    = false;
  }

  /* 바텀 자동 교정 (카테고리/HR 반영) */
  cur.btType = normalizeBottomBy(cat, cur.upType, cur.btType || "");

  /* 컨트롤 교정 */
  const okC = allowedControls.includes(ct);
  const motorOK = isMotorAllowedByHeadrail(cur.upType);

    if (!okC) {
    cur.cordType = "";
    cur.cordSide = "-";
    cur.cordLenText = "";
    cur.motorCode = "";
  } else {
    // 길이/사이드 필드 정리
    if (ct === "CH" || ct === "STR") {
      // 그대로 (L/R + Len 둘 다 사용)
    } else if (ct === "Motor") {
      // Motor: L/R은 허용, Len은 항상 비움
      if (cur.cordLenText) cur.cordLenText = "";
      if (!cur.cordSide)   cur.cordSide = "-"; // 초기값 방지
    } else {
      // 그 외 컨트롤은 사이드/길이 모두 미사용
      if (cur.cordSide !== "-") cur.cordSide = "-";
      if (cur.cordLenText)      cur.cordLenText = "";
    }
    // ✅ 모터 제약: HR이 '선택되어 있고' 모터 불가일 때만 리셋
    if (ct === "Motor" && cur.upType && !motorOK) {
      cur.cordType = "";
      cur.motorCode = "";
    }
  }

  const allowed = {
    allowedCats,
    allowedHeadrails,
    allowedControls,
    allowedBottoms,
    sideLDisabled: isDual,   // 듀얼이면 Side/L 채널 UI 비활성
    motorUIOk: motorOK,
  };

  return { next: cur, allowed };
}

// Headrail: 공통 vs Roller전용
const HR_COMMON       = ["SL","ZSL","ZST"];                         // Dual/Roller 공통(카테고리 강제 X)
const HR_ROLLER_ONLY  = ["OR","3FA","4FA(Duo)","ZRO"];              // Roller 전용
const HR_MOTOR_OK     = new Set(["ZSL","ZST","3FA","4FA(Duo)","ZRO"]); // 모터 허용 HR

// 선택한 Headrail이 카테고리를 “강제”하는지 판단
function headrailCategory(upType){
  if (HR_ROLLER_ONLY.includes(upType)) return "Roller"; // 전용 → Roller 강제
  if (HR_COMMON.includes(upType)) return null;           // 공통 → 강제 안 함
  return null;
}

// 카테고리에 따른 노출 가능 Headrail 목록
function allowedHeadrailsForCategory(cat){
  if (cat === "Dual")   return HR_COMMON;                             // Dual: 공통 HR만
  if (cat === "Roller") return [...HR_COMMON, ...HR_ROLLER_ONLY];     // Roller: 풀셋
  return HEADRAIL_OPTS;                                               // 미정: 전부
}

function isMotorAllowedByHeadrail(upType){
  return HR_MOTOR_OK.has(upType);
}

// 카테고리/HR 조합으로 Control 필터
function filterControlsBy(cat, upType){
  return CONTROL_OPTS.filter(c=>{
    if (["CLS","CLF","CLO"].includes(c) && cat === "Dual") return false;

    // ✅ upType이 아직 비어있으면 Motor를 표시(선택 가능).
    // HR을 고른 뒤 모터 불가 HR이면 Motor는 사라짐.
    if (c === "Motor" && upType && !isMotorAllowedByHeadrail(upType)) return false;

    return true;
  });
}

// ▼▼ Bottom 허용 규칙 (최종)
function allowedBottomsFor(cat, upType){
  if (!cat) return ["OP","ES","NB"];       // 카테고리 미정: 모두 노출
  if (cat === "Dual")   return ["OP"];     // 듀얼은 OP만
  if (cat === "Roller") return ["ES","NB"]; // ✅ Roller는 OP 금지 (HR 무관)
  return ["OP","ES","NB"];
}

// 선택값이 허용 목록에 없으면 빈값
function ensureAllowedBottom(cat, upType, cur){
  if (!cat) return cur || ""; // ⟵ 자동선택 금지
  const allowed = allowedBottomsFor(cat, upType);
  return allowed.includes(cur) ? cur : allowed[0];
}


// Bottom 자동 교정 (카테고리 + 헤드레일 고려)
function normalizeBottomBy(cat, upType, cur){
  if (!cat) return cur || ""; // ⟵ 자동선택 금지
  const allowed = allowedBottomsFor(cat, upType);
  return allowed.includes(cur) ? cur : allowed[0];
}


function persistMeasure(header, items){
  try{
    setSS(LS_MEASURE_AUTO, { header, items, savedAt: Date.now() });
  }catch{}
}

// ── Motor Type 경고 및 안내 문구
const TIP_SHORT = "Select headrail first";

// ── Input UX helpers (0 → 빈칸, 포커스 시 전체 선택)
function asInputValue(v){ return (v == null || v === "") ? "" : String(v); }
function selectAll(e){ e.target.select(); }

// 숫자 텍스트 정리: "001.20" -> "1.2", "000" -> "0", 숫자 아니면 ""
function normNumText(raw){
  const s = String(raw ?? "").trim();
  if(!s) return "";
  if(!/^[0-9.]+$/.test(s)) return "";   // 숫자/점 말고 들어오면 버림

  // 점 여러 개면 첫 번째만 살리고 나머지는 제거
  const parts = s.split(".");
  let intPart = parts[0] || "0";
  const fracPart = parts.slice(1).join(""); // 두 번째 점부터는 전부 이어붙임

  // 앞자리 0 정리: "000", "00" => "0", "007" => "7"
  intPart = intPart.replace(/^0+(\d)/, "$1").replace(/^0+$/, "0");

  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

// blur 시 숫자로 확정: "" -> "", 그 외는 Number로(소수 1자리까지)
function toNumberOrEmpty(raw){
  const s = normNumText(raw);
  if(!s) return "";
  const n = Number(s);
  if(!Number.isFinite(n)) return "";
  return Math.round(n * 10) / 10; // 0.1 단위
}

// ── Control 표시 유틸 (Review 테이블 등에서 사용)
function lrValue(it) {
  const ct = normalizeCordType(it?.cordType || "");
  // CH/STR은 L/R 필요, Motor도 L/R 가능
  if (ct === "CH" || ct === "STR" || ct === "Motor") {
    return it?.cordSide || "-";
  }
  return "-";
}
function lenValue(it) {
  const ct = normalizeCordType(it?.cordType || "");
  // CH/STR만 길이 사용, Motor/기타는 항상 공란
  if (ct === "CH" || ct === "STR") {
    return it?.cordLenText || "";
  }
  return "";
}

/* ── Numeric typography (iPad 숫자폭 깨짐 대응) ───────────────── */
function getVisibleById(id){
  const safe = String(id).replace(/"/g, '\\"');
  const list = Array.from(document.querySelectorAll(`[id="${safe}"]`));

  const visible = list.filter(node => {
    const s = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return (
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  });

  return visible[0] || list[0] || null;
}

function focusAndScrollTo(id){
  const el = getVisibleById(id);
  if(!el) return;

  el.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });

  let focusTarget = el;
  if (!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.tabIndex < 0) {
    const child = el.querySelector('input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (child) focusTarget = child;
  }
  requestAnimationFrame(()=>{
    if (typeof focusTarget.focus === "function") {
      try{ focusTarget.focus({ preventScroll:true }); }catch{}
    }
  });

  const scroller = el.closest('[data-scrollable="x"], .overflow-x-auto, .horizontal-scroll');
  if(scroller){
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    scroller.scrollBy({ left: (r.left - s.left) - 24, behavior:"smooth" });
  }

  const prevOutline = el.style.outline, prevOffset = el.style.outlineOffset, prevShadow = el.style.boxShadow;
  el.style.outline = "3px solid #e11d48";
  el.style.outlineOffset = "2px";
  el.style.boxShadow = "0 0 0 4px rgba(225,29,72,.25)";
  setTimeout(()=>{ el.style.outline = prevOutline; el.style.outlineOffset = prevOffset; el.style.boxShadow = prevShadow; }, 1600);
}

function normalizeItem(it){
  if(!it) return it;
  const ct = normalizeCordType(it.cordType);
  return { ...it, cordType: ct, include: it?.include !== false };
}
const NUM = [
  "text-right",
  "font-medium",
  "tabular-nums",
  "leading-tight",
  "whitespace-nowrap", // 줄바꿈 금지
  "overflow-hidden",   // 넘침 숨김
  "text-ellipsis",     // … 처리 (truncate 유사)
  "inline-block",
  "max-w-[14ch]"       // 필요시 12~16ch로 조정
].join(" ");

// GRAND 전용(굵고 크게)
const NUM_GRAND = [
  NUM,
  "font-bold",
  "text-lg",
  "max-w-[16ch]"       // GRAND은 조금 더 넓게
].join(" ");

/* ---------------- Small UI helpers ---------------- */
function NumberL({ id, col=3, label, value, onChange, step="1", placeholder, disabled, keepBlank=false }) {
  // 0은 그대로 보여주고, 진짜 빈칸만 비워서 보여주기
  const display = asInputValue(value);

  function handleChange(e){
    const raw = e.target.value;
    if (keepBlank) onChange(raw === "" ? "" : Number(raw));
    else           onChange(Number(raw || 0));
  }
  function handleBlur(e){
    if (!keepBlank) {
      const raw = e.target.value;
      if (raw === "") onChange(0);
    }
  }

  return (
    <div id={id} className={`${COL[col] || "col-span-12"} min-w-0`}>
      <div className="text-sm text-gray-600 mb-1 whitespace-nowrap">{label}</div>
      <input
        /* ★ input에는 id를 주지 않는다 (중복 id 방지) */
        data-field={id ? `${id}-input` : undefined}
        type="number"
        inputMode="decimal"
        step={step}
        className="w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
        value={display}
        placeholder={placeholder || "0"}
        disabled={!!disabled}
        onFocus={(e)=> e.target.select()}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}

function InputL({ col=3, id, label, value, onChange, placeholder, disabled, type="text", lang }){
  return (
    <div id={id} className={`${COL[col] || "col-span-12"} min-w-0`}>
      <div className="text-sm text-gray-600 mb-1 whitespace-nowrap">{label}</div>
      <input
        type={type}
        lang={lang}
        className="w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
        value={value}
        placeholder={placeholder||""}
        onChange={onChange}
        disabled={!!disabled}
      />
    </div>
  );
}

/** Compact header: Title / Customer */
function TitleCustomer({ header }) {
  const t = (header?.title || "").trim();
  const c = (header?.customer || "").trim();
  if (t && c) {
    return (
      <>
        <span className="font-semibold">{t}</span>{" "}
        <span className="text-gray-500">/ {c}</span>
      </>
    );
  }
  return <span className="font-semibold">{t || c || "-"}</span>;
}

/* ============ Shared compact cards ============ */
function TotalsCard({ totals, header }) {
  const numCls = NUM;         // 숫자 셀 공통 클래스
  const grandCls = NUM_GRAND; // GRAND 전용 클래스
  const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="rounded-xl border p-4 bg-gray-50">
      <div className="grid [grid-template-columns:minmax(120px,1fr)_max-content] gap-y-1 gap-x-3 items-center">
        <div className="text-right pr-3">Blind</div><div className={numCls}>{fmt(totals.blind)}</div>
        <div className="text-right pr-3">Surcharge</div><div className={numCls}>{fmt(totals.sub)}</div>
        <div className="col-span-2 my-1 border-t border-gray-200" />
        <div className="text-right pr-3">Subtotal</div><div className={numCls}>{fmt(totals.subtotal)}</div>
        <div className="text-right pr-3">Discount</div><div className={numCls}>− {fmt(totals.discount)}</div>
        <div className="text-right pr-3">Fees (Install+Extra)</div><div className={numCls}>{fmt(Number(header.installFee||0)+Number(header.extraFee||0))}</div>
        <div className="text-right pr-3">Motor</div><div className={numCls}>{fmt(totals.motor)}</div>
        <div className="text-right pr-3">Accessories</div><div className={numCls}>{fmt(totals.accessories)}</div>
        <div className="col-span-2 my-1 border-t border-gray-200" />
        <div className="text-right pr-3 text-lg font-bold">Total</div>
        <div className={grandCls}>{fmt(totals.grand)}</div>
         {/* Total(+tax) = GRAND * 1.05 */}
        <div className="text-right pr-3 text-lg font-bold">Total(+tax)</div>
        <div className={grandCls}>{fmt(round2((Number(totals.grand)||0) * 1.05))}</div>
      </div>
    </div>
  );
}

/* ── Accessories 계산 (전역) ────────────────────────── */
/** 헤더/아이템 기반 악세서리 라인 계산: CHARGER 1개 무료 포함 처리 */
function calcAccessoriesLines(header = {}, items = []) {
  // 모터가 1개 이상이면 Charger 1개 포함
const hasAnyMotor = (items || []).some(
  it => normalizeCordType(it.cordType) === "Motor"
);
const includedChargers = hasAnyMotor ? 1 : 0; // ← 여기 숫자/규칙 바꾸면 됨

  // 소스: 새 구조 accItems + (레거시) accRemoteType/accRemoteQty, accChargerQty
  const raw = Array.isArray(header.accItems) ? [...header.accItems] : [];

  // 동일 코드 합치기
  const mergedMap = new Map();
  for (const r of raw) {
    if (!r || !r.code) continue;
    const cur = mergedMap.get(r.code) || 0;
    mergedMap.set(r.code, cur + Math.max(0, Number(r.qty) || 0));
  }
  const merged = Array.from(mergedMap.entries()).map(([code, qty]) => ({ code, qty }));

  // 단가 조회 테이블 (이미 파일 상단에 있음)
  const unitPriceOf = (code) => (ACCESSORY_PRICE_MAP[code] || 0);

  // Charger는 포함 1개 무료 → billable만 비용
  const totalChargers = merged
    .filter(x => x.code === "CHARGER")
    .reduce((s, x) => s + (Number(x.qty) || 0), 0);

  const billableChargers = Math.max(0, totalChargers - includedChargers);

  // 라인 산출(Charger는 billable 개수만 비용 반영; 표시는 비례 분배)
  let lines = merged.map(row => {
    const unit = unitPriceOf(row.code);
    let billableQty = Number(row.qty) || 0;

    if (row.code === "CHARGER" && totalChargers > 0) {
      const share = billableChargers * (billableQty / totalChargers);
      billableQty = Math.round(share * 100) / 100; // 표시용 비례 분배(소수2자리)
    }

    const line$ = row.code === "CHARGER"
      ? Math.round(unit * billableQty * 100) / 100
      : Math.round(unit * (Number(row.qty) || 0) * 100) / 100;

    return {
      code: row.code,
      qty: Number(row.qty) || 0,
      unit,
      billableQty: row.code === "CHARGER" ? billableQty : undefined,
      line$
    };
  });

  // 소수점 보정(총액 기준으로 마지막 라인에서 ±1센트 조정)
  let total$ = lines.reduce((s, r) => s + (Number(r.line$) || 0), 0);
  total$ = Math.round(total$ * 100) / 100;
  const drift = total$ - lines.reduce((s,r)=>s + (r.line$||0), 0);
  if (Math.abs(drift) >= 0.01) {
    const last = lines.length - 1;
    lines[last] = { ...lines[last], line$: Math.round((lines[last].line$ + drift) * 100)/100 };
  }

  return {
    includedChargers,
    totalChargers,
    billableChargers,
    lines,
    total$: Math.round(total$ * 100) / 100
  };
}

function AccessoriesSummaryCard({ header, items }) {
  const accView = calcAccessoriesLines(header||{}, items||[]);
  if (!accView.lines.length) {
    return (
      <div className="rounded-xl border p-4">
        <div className="text-sm font-semibold mb-1">Accessories</div>
        <div className="text-sm text-gray-600">No accessories.</div>
        <div className="mt-1 text-xs text-gray-600">
          Chargers: included <b>{accView.includedChargers}</b> · total <b>{accView.totalChargers}</b> · billable <b>{accView.billableChargers}</b>
        </div>
        <div className="mt-2 text-right text-sm">Accessories total: <b>${accView.total$.toFixed(2)}</b></div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border p-4 overflow-auto">
      <div className="text-sm font-semibold mb-2">Accessories</div>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Item</th>
            <th className="p-2">Qty</th>
            <th className="p-2">Unit $</th>
            <th className="p-2">Billable Qty</th>
            <th className="p-2">Line $</th>
          </tr>
        </thead>
        <tbody>
          {accView.lines.map((r,i)=>(
            <tr key={i} className="border-b">
              <td className="p-2">{r.code}</td>
              <td className="p-2">{r.qty}</td>
              <td className="p-2">${(r.unit||0).toFixed(2)}</td>
              <td className="p-2">{r.code==="CHARGER" ? r.billableQty : "-"}</td>
              <td className="p-2 font-medium">${(r.line$||0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-xs text-gray-600">
        Chargers: included <b>{accView.includedChargers}</b> · total <b>{accView.totalChargers}</b> · billable <b>{accView.billableChargers}</b>
      </div>
      <div className="mt-1 text-right text-sm">Accessories total: <b>${accView.total$.toFixed(2)}</b></div>
    </div>
  );
}

/* ---- SelectL: iPad에서도 항상 화살표 보이도록 커스텀 아이콘 추가 ---- */
function SelectL({ col=3, id, label, value, onChange, options, labels, disabled }){
  return (
    <div id={id} className={`${COL[col] || "col-span-12"} min-w-0`}>
      <div className="text-sm text-gray-600 mb-1 whitespace-nowrap">{label}</div>

      <div className="relative">
        {/* native 화살표 숨기고 여백(pr-10) 확보 */}
        <select
          className="w-full border rounded px-3 py-2 pr-10 disabled:bg-gray-100 disabled:cursor-not-allowed appearance-none"
          value={value}
          onChange={e=>onChange(e.target.value)}
          disabled={!!disabled}
        >
          <option value="">Select</option>
          {options.map(opt=>(
            <option key={opt} value={opt}>
              {labels ? (labels[opt] || opt) : opt}
            </option>
          ))}
        </select>

        {/* 항상 보이는 커스텀 화살표 (터치 차단) */}
        <svg
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 1 1 .94 1.16l-4.24 3.36a.75.75 0 0 1-.94 0L5.21 8.39a.75.75 0 0 1 .02-1.18z"/>
        </svg>
      </div>
    </div>
  );
}

/* ---- Feet+Inches (1/32) ---- */
function FeetInches({ id, col=2, label, valueInches, onChange, disabled }) {
  const isEmpty = (valueInches === "" || valueInches == null);
 const totalIn = isEmpty ? null : Number(valueInches);
 const ft   = isEmpty ? "" : Math.floor(totalIn/12);
 const rem  = isEmpty ? 0  : (totalIn - Math.floor(totalIn/12)*12);
 const inch = isEmpty ? 0  : Math.floor(rem);
 const frac = isEmpty ? 0  : Math.round((rem - Math.floor(rem)) * 32);

  function update(next){
    const vfRaw = (next.ft   ?? ft);
    const viRaw = (next.inch ?? inch);
    const vnRaw = (next.frac ?? frac);

    const ftEmpty = (vfRaw === "" || vfRaw == null);
    const viNum   = Number(viRaw) || 0;
    const vnNum   = Number(vnRaw) || 0;

    // 모두 비었으면 진짜 "빈칸"으로 저장 → 검증에서 잡히게
    if (ftEmpty && viNum === 0 && vnNum === 0) {
      onChange("");
      return;
    }

    // 그 외에는 숫자 계산(빈 ft는 0으로 간주)
    const ftNum = ftEmpty ? 0 : Number(vfRaw);
    const inches = ftNum * 12 + viNum + vnNum / 32;
    onChange(inches);
  }

  return (
    <div id={id} className={`${COL[col] || "col-span-12"} min-w-0`}>
      <div className="text-sm text-gray-600 mb-1 whitespace-nowrap">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        <input
          type="number"
          className="w-full border rounded px-2 py-2 disabled:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
          value={asInputValue(ft)}       // ➊ 0은 '0'로 보이고, 빈칸은 빈칸
          placeholder="0"
          onFocus={selectAll}
          onChange={(e)=>{
           const raw = e.target.value;  // ➋ 빈칸은 "" 유지(검증에서 미입력으로 처리)
           update({ ft: raw === "" ? "" : Number(raw) });
         }}
          disabled={!!disabled}
        />
        <select
          className="w-full border rounded px-2 py-2 disabled:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
          value={String(inch)}
          onChange={e=>update({ inch:Number(e.target.value) })}
          disabled={!!disabled}
        >
          {Array.from({length:12},(_,i)=>i).map(n=>(
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </select>
        <select
          className="w-full border rounded px-2 py-2 disabled:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
          value={String(frac)}
          onChange={e=>update({ frac:Number(e.target.value) })}
          disabled={!!disabled}
        >
          {Array.from({length:33},(_,i)=>i).map(n=>(
   <option key={n} value={String(n)}>{fracLabel(n)}</option>
 ))}
        </select>
      </div>
    </div>
  );
}

/* ---------------- Toast ---------------- */
function useToast(){
  const [toasts,set]=useState([]);
  function push(text,type){ const id=Date.now()+Math.random(); set(t=>[...t,{id,text,type}]); setTimeout(()=>set(t=>t.filter(x=>x.id!==id)),2300); }
  const api=useMemo(()=>({ ok:t=>push(t,"ok"), err:t=>push(t,"err") }),[]);
  const UI=(<div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
    {toasts.map(t=><div key={t.id} className={`px-3 py-2 rounded shadow text-white ${t.type==="ok"?"bg-emerald-600":"bg-rose-600"}`}>{t.text}</div>)}
  </div>);
  return [UI,api];
}

/* ---------------- Supabase helpers ---------------- */
async function supaInsertJob(job){
  if(!SUPA_ON) throw new Error("Supabase is not configured");
  const auth = getLS(LS_AUTH,null);
  const deviceId = localStorage.getItem("winco_device") || "dev-manual";
  const ownerEmail = auth?.email || null;
  const { error } = await supabase.from("jobs").insert({
    payload: job, owner: ownerEmail, device_id: deviceId, version: APP_VERSION
  });
  if(error) throw error;
}
async function supaFetchServerJobs(){
  if(!SUPA_ON) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select("id, created_at, payload")
    .order("created_at", { ascending: false });
  if(error){ console.error(error); return []; }
  return (data||[]).map(r => ({ ...(r.payload||{}), id: r.id, createdAt: (r.payload?.createdAt)||r.created_at }));
}
async function supaDeleteServerJob(id){ if(!SUPA_ON) return; await supabase.from("jobs").delete().eq("id", id); }

// ── Templates (Forms)
async function supaFetchTemplates(){
  if(!SUPA_ON) return [];
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, note, payload, updated_at")
    .order("updated_at", { ascending:false });
  if(error){ console.error(error); return []; }
  return data||[];
}

async function supaUpsertTemplate({ id, name, note, payload }){
  if(!SUPA_ON) throw new Error("Supabase not configured");
  if(id){
    const { error } = await supabase.from("templates").update({ name, note, payload }).eq("id", id);
    if(error) throw error;
  }else{
    const { error } = await supabase.from("templates").insert({ name, note, payload });
    if(error) throw error;
  }
}

async function supaDeleteTemplate(id){
  if(!SUPA_ON) throw new Error("Supabase not configured");
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if(error) throw error;
}

/* ---------------- Error Boundary ---------------- */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false, err:null}; }
  static getDerivedStateFromError(e){ return {hasError:true, err:e}; }
  componentDidCatch(e, info){ console.error("UI Error:", e, info); }
  render(){
    if(this.state.hasError){
      return <div className="p-6 text-red-700">
        <div className="text-xl font-semibold mb-2">Render error occurred.</div>
        <div className="text-sm whitespace-pre-wrap">{String(this.state.err)}</div>
      </div>;
    }
    return this.props.children;
  }
}


/* ===== Export helpers (Office > Export??? ??) ===== */
const XL_STYLE = {
  fontFamily: "font-family: Calibri, 'Malgun Gothic', Arial, sans-serif;",
  headBg: "background:#eef2f7;",
  infoBg: "background:#f5f6f8;",
  totalBg: "background:#f9fafb;",
  border: "border:1px solid #c9d2e0;",
  th: "font-weight:700;text-align:center;",
  td: "font-weight:400;text-align:left;",
  tdCenter: "text-align:center;",
  tdRight: "text-align:right;",
  h1: "font-weight:700;font-size:14px;padding:6px 8px;",
  h2: "font-weight:600;font-size:12px;padding:4px 6px;",
  cell: "padding:4px 6px;",
  money: "mso-number-format:'\\0022$\\0022#,##0.00';",
  int: "mso-number-format:'0';",
  dec1: "mso-number-format:'0.0';",
  dec2: "mso-number-format:'0.00';",
};

function appendSqftTotalRow(headers, body, excludedFlags = []) {
  const idx = headers.indexOf("Sqft");
  if (idx < 0) return;

  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const isExcluded = excludedFlags[i] === true;
    const v = Number(body[i][idx]);
    if (!isExcluded && Number.isFinite(v)) sum += v;
  }

  const total = Array(headers.length).fill("");
  total[idx] = sum;
  body.push(total);
}

function sectionTitleHTML(title, colSpan){
  return `<tr><td colspan="${colSpan}" style="${XL_STYLE.h1}${XL_STYLE.border}${XL_STYLE.headBg}">${esc(title)}</td></tr>`;
}

function esc(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function makeOptionsLabelRow(headers){
  const optStartIdx = headers.indexOf("Spring Assist");
  if (optStartIdx < 0) return "";

  const optSpan = headers.length - optStartIdx;
  const blanks = Array(optStartIdx)
    .fill(`<td style="${XL_STYLE.cell}${XL_STYLE.border}"></td>`)
    .join("");

  const mergedStyle =
    `font-family:'Malgun Gothic','?? ??',Calibri,Arial,sans-serif;` +
    `font-size:9pt;font-weight:700;` +
    XL_STYLE.cell + XL_STYLE.headBg + XL_STYLE.border;

  const merged = `<td colspan="${optSpan}" style="${mergedStyle}">Options / Extras</td>`;
  return `<tr>${blanks}${merged}</tr>`;
}

function splitFtIn32(totalIn){
  const r = splitInches(totalIn);
  return { ft:r.ft, inch:r.inch, frac32:r.frac32 };
}

function buildSplitSummary(it, headerUnit){
  const N = Number(it?.splitN || 0);
  if (!N || N < 2) return null;

  const LABELS = {
    2: ["1L","2R"],
    3: ["1L","2M","3R"],
    4: ["1LL","1L","2R","2RR"],
    5: ["1LL","2L","3M","4R","5RR"],
    6: ["1LLL","2LL","3L","4R","5RR","6RRR"],
    7: ["1LLL","2LL","3L","4M","5R","6RR","7RRR"],
  };

  const unitDefault =
    headerUnit === "mm" ? "mm"
    : headerUnit === "in" ? "in"
    : "ft-in";

  const unit = it.splitUnit || unitDefault;
  const labels = (LABELS[N] || []).slice(0, N);
  const srcLens = (it.splitLens || []).slice(0, N);

  const lensTexts = srcLens.map((raw) => {
    if (raw === "" || raw == null) return "";
    if (unit === "ft-in") {
      const n = in2(raw);
      return Number.isFinite(n) ? String(n) : "";
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n)) return "";
      return String(round1(n));
    }
  });

  return {
    count: N,
    unit,
    labels,
    lensTexts,
    ctrls: Array.from({length: N}, (_,i)=> String(it.splitCtrl?.[i] ?? "-").toUpperCase()),
    labelsJoined: labels.join("|"),
    lensJoined:  lensTexts.join("|"),
  };
}
/* ---------------- Root ---------------- */
export default function App(){
  const [UIToasts,toast]=useToast();
  const [stage,setStage]=useState("splash");
  const [auth,setAuth]=useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(()=>{
    const f=getLS(LS_FABRIC,null);
    if(!f || !Array.isArray(f.families) || f.families.length<5){
      setLS(LS_FABRIC, FABRIC_SEED);
    }
    runFabricPatches();
  },[]);

  // 🔑 App boot: restore auth from localStorage
useEffect(() => {
  const timer = setTimeout(() => {
    try {
      const saved = getLS(LS_AUTH, null);
      if (saved && typeof saved === "object") {
        setAuth(saved);
        setStage("tabs");
      } else {
        setStage("login");
      }
    } catch (e) {
      setStage("login");
    } finally {
      setBooted(true);
    }
  }, 2000); // ✅ 2초

  return () => clearTimeout(timer);
}, []);

  function onLoggedIn(obj){ 
    setAuth(obj); 
    setLS(LS_AUTH,obj); 
    setStage("tabs"); 
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <style>{`input[type="checkbox"].cbx-25{width:2.5em;height:2.5em;}`}</style>

      {!booted && <Splash/>}

      {stage==="login" && (
        <div className="min-h-screen flex items-center justify-center">
          <Login onLoggedIn={onLoggedIn}/>
        </div>
      )}

      {stage==="tabs" && (
        <>
          <ErrorBoundary>
            <Tabs auth={auth} toast={toast}/>
          </ErrorBoundary>
          <ScrollNav center />
        </>
      )}

      {UIToasts}
    </div>
  );
}

/* ---------------- Splash ---------------- */
function Splash(){
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <img src="/winco-logo.png" alt="WINCO" style={{ height: 72, display: "block", margin: "0 auto 12px" }}/>
        <div style={{ color: "#6b7280" }}>v {APP_VERSION}</div>
      </div>
    </div>
  );
}

/* ---------------- Login ---------------- */
function Login({ onLoggedIn }){
  const [accIdx,setAccIdx]=useState(0);
  const [pin,setPin]=useState("");
  function submit(){
  const acc = ACCOUNTS[accIdx];
  const want = ACCOUNT_PIN_MAP[acc.email];  // ★ 계정별 PIN 맵 사용
  if (String(want) === String(pin)) {
    onLoggedIn({ email: acc.email, role: acc.role, at: Date.now() });
  } else {
    alert("Wrong PIN.");
  }
}
  return (
    <div className="w-full max-w-md rounded-2xl p-6 shadow-lg bg-white border">
      <div className="text-xl font-bold mb-4">Login</div>
      <div className="flex flex-nowrap gap-2 mb-3 overflow-x-auto whitespace-nowrap">
        {ACCOUNTS.map((a,i)=>(
          <label key={a.email} className={`px-3 py-2 rounded border cursor-pointer ${i===accIdx?"bg-black text-white":"bg-white"}`}>
            <input type="radio" className="hidden" checked={i===accIdx} onChange={()=>setAccIdx(i)}/>
            {ROLE_LABELS[a.role] || a.role}
          </label>
        ))}
      </div>
      <div className="mb-3">
        <div className="text-sm text-gray-600 mb-1">PIN</div>
        <input
  type="password"             // ← 마스킹(****)
  inputMode="numeric"         // ← 숫자 키패드 힌트(iPad)
  autoComplete="one-time-code"// ← iOS에서 숫자 입력 편의
  className="w-full border rounded px-3 py-2"
  value={pin}
  onChange={e=>setPin(e.target.value)}
  placeholder="PIN"
/>

      </div>
      <button className="w-full bg-black text-white rounded-lg py-2" onClick={submit}>Enter</button>
    </div>
  );
}

/* ---------------- Admin ---------------- */
function Admin(){
  // Forms (Supabase)
  const [forms,setForms]=useState([]);
  const [busy,setBusy]=useState(false);

  async function refreshForms(){
    if(!SUPA_ON){ alert("Supabase not configured."); return; }
    setBusy(true);
    try{
      const rows = await supaFetchTemplates();
      setForms(rows||[]);
    }catch(e){ console.error(e); alert("Failed to fetch."); }
    setBusy(false);
  }

  async function deleteForm(id){
    if(!SUPA_ON){ alert("Supabase not configured."); return; }
    if(!confirm("Delete this template?")) return;
    try{
      await supaDeleteTemplate(id);
      await refreshForms();
    }catch(e){
      console.error(e);
      alert("Delete failed.");
    }
  }

  async function updateNote(f){
    if(!SUPA_ON){ alert("Supabase not configured."); return; }
    const newNote = prompt("Note", f.note || "");
    if(newNote===null) return;
    try{
      await supaUpsertTemplate({ id:f.id, name:f.name, note:newNote, payload:f.payload });
      await refreshForms();
    }catch(e){ console.error(e); alert("Update failed."); }
  }

  async function renameForm(f){
    if(!SUPA_ON){ alert("Supabase not configured."); return; }
    const newName = prompt("New template name", f.name || "");
    if(newName==null) return;
    try{
      await supaUpsertTemplate({ id:f.id, name:newName, note:f.note, payload:f.payload });
      await refreshForms();
    }catch(e){ console.error(e); alert("Rename failed."); }
  }

  function loadTemplateToMeasure(f){
    try{
      document.dispatchEvent(new CustomEvent("winco_load_measure",{
        detail:{
          header: f.payload?.header,
          items: (f.payload?.items)||[],
          __tplId: f.id,
          __tplName: f.name,
          __tplNote: f.note
        }
      }));
      document.dispatchEvent(new CustomEvent("winco_go_tab",{ detail: "Measure" }));
    }catch(e){ console.error(e); alert("Failed to load."); }
  }

  return (
    <div className="grid gap-4">
      {/* Forms (Templates) */}
      <div className="border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Forms / Templates (server)</div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded border" onClick={refreshForms}>Refresh</button>
          </div>
        </div>
        {!SUPA_ON ? (
          <div className="text-sm text-gray-600">Supabase not configured.</div>
        ) : busy ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : forms.length===0 ? (
          <div className="text-sm text-gray-600">No templates. Use “Save as Template” in Measure (admin only).</div>
        ) : (
          <div className="grid gap-2">
            {forms.map(f=>(
              <div key={f.id} className="border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-gray-500">
                    {f.updated_at?.slice(0,19).replace("T"," ")} · {f.note||"-"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded border" onClick={()=>loadTemplateToMeasure(f)}>Load</button>
                  <button className="px-3 py-1.5 rounded border" onClick={()=>renameForm(f)}>Rename</button>
                  <button className="px-3 py-1.5 rounded border" onClick={()=>updateNote(f)}>Note</button>
                  <button className="px-3 py-1.5 rounded border border-rose-500 text-rose-600" onClick={()=>deleteForm(f.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */
function Tabs({ auth, toast }) {
  const [tab, setTab] = useState("Measure");
  const role = (auth && auth.role) || "worker";

  useEffect(()=>{
    function onGo(e){ const t=e?.detail||"Measure"; setTab(t); }
    document.addEventListener("winco_go_tab", onGo);
    return ()=>document.removeEventListener("winco_go_tab", onGo);
  },[]);

  function logout() {
    try { localStorage.removeItem(LS_AUTH); sessionStorage.clear(); } catch (_) {}
    window.location.reload();
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-3">
        {/* 상단: 탭 1줄 + Logout 오른쪽 끝 */}
        <div className="flex items-center gap-1 mb-3 w-full flex-nowrap">
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <button
              className={`px-2 py-1 rounded-lg text-xs sm:text-sm ${tab==="Measure" ? "bg-black text-white" : "border"}`}
              onClick={() => setTab("Measure")}
            >Measure</button>

            <button
              className={`px-2 py-1 rounded-lg text-xs sm:text-sm ${tab==="Drafts" ? "bg-black text-white" : "border"}`}
              onClick={() => setTab("Drafts")}
            >Drafts</button>

            {(role === "admin" || role === "worker") && (
              <button
                className={`px-2 py-1 rounded-lg text-xs sm:text-sm ${tab==="Office" ? "bg-black text-white" : "border"}`}
                onClick={() => setTab("Office")}
              >Office</button>
            )}

            {role === "admin" && (
              <button
                className={`px-2 py-1 rounded-lg text-xs sm:text-sm ${tab==="Admin" ? "bg-black text-white" : "border"}`}
                onClick={() => setTab("Admin")}
              >Admin</button>
            )}
          </div>

          {/* Logout */}
          <button
            className="ml-auto px-3 py-1.5 rounded-lg border shrink-0"
            onClick={logout}
          >
            Logout
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        <div className={tab==="Measure" ? "block" : "hidden"}><Measure toast={toast} /></div>
        <div className={tab==="Drafts"  ? "block" : "hidden"}>
          <QuotesPage
            toast={toast}
            canSendToOffice={SUPA_ON}
            sendJobToOffice={supaInsertJob}
            computeTotals={computeTotals}
            computeLine={computeLine}
            normalizeItem={normalizeItem}
            TitleCustomer={TitleCustomer}
            canonicalFabricNo={canonicalFabricNo}
            titleOf={titleOf}
            normalizeCordType={normalizeCordType}
            lrValue={lrValue}
            lenValue={lenValue}
            mm1FromIn={mm1FromIn}
            AccessoriesSummaryCard={AccessoriesSummaryCard}
            TotalsCard={TotalsCard}
          />
        </div>
        {(role==="admin" || role==="worker") && (
          <div className={tab==="Office" ? "block" : "hidden"}><OfficeCloud toast={toast} /></div>
        )}
        {role==="admin" && (
          <div className={tab==="Admin"  ? "block" : "hidden"}><Admin /></div>
        )}
      </main>
    </div>
  );
}

/* ---------------- Measure helpers (ABOVE Measure) ---------------- */
function isControlNeedsSideLen(ct){ return ct==="CH" || ct==="STR"; }

function headrailSurcharge(upType, wIn){
  const row = HDR_TBL[upType];
  if(!row) return 0; // SL/OR/ZRO 등 0
  const w = Math.max(30, Math.ceil(Number(wIn)||0));
  let price = row.tiers[row.tiers.length-1][1];
  for(const [limit, p] of row.tiers){
    if(w <= limit){ price = p; break; }
  }
  if(w > 108){
    const over = w - 108;
    const steps = Math.ceil(over/6);
    price += steps * row.per6;
  }
  return price;
}

/* === Side/L Channel pricing (최종 규칙)
   - L 채널: W 기준 (기존)
   - 사이드채널: H 기준, 금액은 "L채널 가격의 2배", 듀오도 1세트만 계산
*/

// ❗듀오 여부와 무관하게 "항상 1세트"만 계산
 function sideChannelPrice(hIn){
   // 가격 규칙: L채널(H 기준) 가격의 2배 = 사이드채널 1세트
   const base = 2 * lChannelPrice(hIn);
   return base;
 }

// L channel (bottom horizontal) : base 24" -> $26, +$6.5 per 6"
function lChannelPrice(wIn){
  const W = Math.max(24, Number(wIn)||0);
  if(W<=0) return 0;
  const steps = Math.ceil((W - 24) / 6);
  const unit = 26 + 6.5 * steps; // 1pc
  return unit;
}

function blankItem(){
  return {
    // 위치
    locArea:"1F", locAreaText:"",
    locSpace:"Living", locSpaceText:"", locDetail:"",

    // 사이즈/마운트
    wIn:"", hIn:"", install:"IN",

    // 하드웨어 (라벨만 Headrail/Bottom/Color)
    upType:"", upClr:"",         // 🔸 HR 비움 (A/B5)
    btType:"", btClr:"01",       // 🔸 Bottom 비움 (A/B5)

    // 컨트롤
    cordType:"", cordSide:"-", cordLenText:"",

    // Fabric A
    category:"", fabric:"", fabricName:"", color:"", price:0,

    // Fabric B (Duo일 때만 사용)
    categoryB:"", fabricB:"", fabricNameB:"", colorB:"", priceB:0,

    // 옵션/기타
    springAssist:false,
    sideChannel:false,
    lChannel:false,
    motorCode:"",
    extra:0, memo:"",
    include: true,   // ⬅️ 기본은 '적용'

    // deck door
    deckPairId:null, deckRole:null, deckTotalIn:0
  };
}

function blankHeader(){
  return {
    title:"",
    customerType:"House",
    customerTypeText:"",
    customer:"",
    phone:"",
    visitAt: nowLocalForInput(),
    unit:"mm",
    address:"",
    email:"",
    discountPct:0,
    installFee:0,
    extraFee:0,
    memo:"",
  };
}
function titleOf(it){
  const a=it.locArea==="MANUAL"?(it.locAreaText||""):it.locArea;
  const s=(it.locSpace==="MANUAL"?(it.locSpaceText||""):it.locSpace) || "";
  const d=it.locDetail||"";
  return `${a} ${s} ${d}`.trim();
}
function fabricFamiliesFor(category){
  const fab=getLS(LS_FABRIC,{families:[]});
  return (fab.families||[]).filter(f=>!category || f.category===category);
}
function isEditableFamily(name){
  // 카탈로그 패밀리는 전부 고정가(수정 불가). 수동입력은 "MANUAL"로 처리.
  return false;
}
function FabricSelect({ id, col=3, item, setItem }){
  const families = fabricFamiliesFor(item.category);

  // 🔁 바뀐 부분: 표시 전용 옵션/라벨 생성
  const { options, labels } = buildFamilyOptionsForDisplay(families);

  function onSel(v){
    if (v==="") {
      // 완전 리셋
      setItem("fabric",""); setItem("fabricName",""); setItem("price",0); setItem("color","");
      return;
    }
    if (v==="MANUAL"){
      setItem("fabric","MANUAL"); setItem("fabricName",""); setItem("price",0); setItem("color",""); 
      return;
    }
    const fam = families.find(f=>f.name===v); 
    if(!fam) return;
    // 저장값은 원문 그대로 유지 (예: "Pluto (B/O)")
    setItem("fabric", v); 
    setItem("fabricName",""); 
    setItem("price", fam.price==null ? 0 : fam.price);
    setItem("color","");
  }

  return (
    <SelectL 
      id={id} col={col} 
      label="Fabric" 
      value={item.fabric} 
      onChange={onSel} 
      options={options} 
      labels={labels}
    />
  );
}

function ColorSelect({ id, col=3, item, setItem }){
  const families = fabricFamiliesFor(item.category);
  const fam = families.find(f=>f.name===item.fabric);

  // 🔁 바뀐 부분: 세일즈 숨김 적용 + 표시라벨 생성
  const { options, labels } = fam 
    ? buildColorOptionsForDisplay(fam.codes || []) 
    : { options: [], labels: {} };

  return (
    <SelectL 
      id={id} col={col} 
      label="Color" 
      value={item.color||""} 
      onChange={v=>setItem("color",v)} 
      options={options} 
      labels={labels}
    />
  );
}

function fmtDimCells(unit, wIn, hIn){
  if(unit === "ft"){
    const w = splitInches(wIn||0);
    const h = splitInches(hIn||0);
    return {
      head: ["W(ft)","W(in)","W(/32)","H(ft)","H(in)","H(/32)"],
      cells: [w.ft, w.inch, w.frac32, h.ft, h.inch, h.frac32]
    };
  }
  return {
    head: ["W(mm)","H(mm)"],
    cells: [inToMm(wIn)||0, inToMm(hIn)||0]
  };
}

/* === 가격 계산 (새 규칙) === */
function computeLine(it){
  const w = Number(it.wIn)||0;
  const h = Number(it.hIn)||0;
  let sqft = (w>0 && h>0) ? Math.ceil((w*h)/144) : 0;
  if (sqft > 0 && sqft < 6) sqft = 6;

  const isDuo  = it.upType === "4FA(Duo)";
  const priceA = Number(it.price)||0;
  const priceB = isDuo ? Number(it.priceB)||0 : 0;

  const blind = round2(sqft*priceA + sqft*priceB);

  const surHead = headrailSurcharge(it.upType, it.wIn);
  const ct = normalizeCordType(it.cordType || "");
  const surCtrl = CONTROL_SUR[ct] ? Number(CONTROL_SUR[ct]) : 0;

  const surSC = it.sideChannel ? sideChannelPrice(it.hIn) : 0;
  const surLC = it.lChannel    ? lChannelPrice(it.wIn)    : 0;

  // 스프링: Motor면 0, Duo면 1~2, 일반이면 1
  const isMotor = (ct === "Motor");
  const isDuoHeadrail = isDuo;
  let springQty = 0;
  if (!isMotor) {
    if (isDuoHeadrail) {
      const qRaw = Number(it.springQty);
      const q = Number.isFinite(qRaw) ? qRaw : 1;
      springQty = it.springAssist ? Math.max(1, Math.min(2, q)) : 0;
    } else {
      springQty = it.springAssist ? 1 : 0;
    }
  }
  const surSpr   = (SPRING_ASSIST_PRICE||0) * springQty;

  const surExtra = Number(it.extra)||0;

  const surcharge = round2(surHead + surCtrl + surSC + surLC + surSpr + surExtra);

  const motor = (ct === "Motor" && it.motorCode)
    ? (MOTOR_PRICE[it.motorCode]||0) : 0;

  const lineTotal = round2(blind + surcharge); // 모터는 별도
  return { sqft, blind, surcharge, motor, lineTotal };
}

/* === 전체 합계 === */
function computeTotals(items, discountPct, fees){
  // 제외(Include=false) 행 제거
  const rows = (items||[]).filter(it => it?.include !== false);

  // 라인 합계
  let blind=0, sub=0, motor=0;
  for(const it of rows){
    const c = computeLine(it);
    blind += c.blind; sub += c.surcharge; motor += c.motor;
  }
  blind=round2(blind); sub=round2(sub); motor=round2(motor);

  // 할인/수수료
  const subtotal = round2(blind + sub);
  const discount = round2(subtotal*((Number(discountPct)||0)/100));
  const install  = Number(fees?.installFee)||0;
  const extraFee = Number(fees?.extraFee)||0;

  // 악세서리
  const accView = calcAccessoriesLines(fees || {}, rows);
  const accessories = round2(accView.total$);

  // GRAND
  const grand = round2(subtotal - discount + install + extraFee + motor + accessories);

  const accessoriesBreakdown = {
    included: accView.includedChargers,
    billable: accView.billableChargers,
    lines: accView.lines
  };

  return { blind, sub, motor, subtotal, discount, accessories, grand, accessoriesBreakdown };
}


/* ====== Helpers missing above (pairing & validation) ====== */
function validateHeader(h){
  const errs = [];
  if(!String(h.title||"").trim())
    errs.push({ kind:"header", id:"fld-title",  msg:"Title (REP) is required." });

  if(!h.customerType)
    errs.push({ kind:"header", id:"fld-type",   msg:"Select Type." });

  if(h.customerType==="Other (Manual)" && !String(h.customerTypeText||"").trim())
    errs.push({ kind:"header", id:"fld-type-manual", msg:"Enter Type (manual)." });

  if(!h.visitAt)
    errs.push({ kind:"header", id:"fld-visit",  msg:"Enter Visit date/time." });

  if(!h.unit)
    errs.push({ kind:"header", id:"fld-unit",   msg:"Select Measurement Unit." });

  return errs;
}

function validateAll(items){
  const errs = [];
  for(let i=0;i<items.length;i++){
    const it = items[i], n = i+1;

    // W/H
    const wEmpty = (it.wIn === "" || it.wIn == null);
    const hEmpty = (it.hIn === "" || it.hIn == null);
    if (wEmpty && hEmpty){ errs.push({kind:"row",row:n,field:"w", msg:`#${n} Enter W/H.`}); break; }
    if (wEmpty)          { errs.push({kind:"row",row:n,field:"w", msg:`#${n} Enter W.`});   break; }
    if (hEmpty)          { errs.push({kind:"row",row:n,field:"h", msg:`#${n} Enter H.`});   break; }

    const wNum = Number(it.wIn), hNum = Number(it.hIn);
    if (!Number.isFinite(wNum) || !Number.isFinite(hNum)){
      errs.push({kind:"row",row:n,field:"w", msg:`#${n} Enter valid W/H.`}); break;
    }
    if (wNum < 0 || hNum < 0){
      errs.push({kind:"row",row:n,field:"w", msg:`#${n} W/H cannot be negative.`}); break;
    }

    // Mount
    if(!it.install){ errs.push({kind:"row",row:n,field:"mount", msg:`#${n} Select Mount.`}); break; }

    // Control
    const ct = normalizeCordType(it.cordType||"");
    if(!ct){ errs.push({kind:"row",row:n,field:"cord", msg:`#${n} Select Control.`}); break; }

    if (ct === "Motor"){
      if (!it.motorCode){
        errs.push({kind:"row",row:n,field:"motor", msg:`#${n} Select Motor.`}); break;
      }
      if (!isMotorAllowedByHeadrail(it.upType)){
        errs.push({kind:"row",row:n,field:"cord", msg:`#${n} Selected headrail does not allow Motor.`}); break;
      }
      if (!(it.cordSide === "L" || it.cordSide === "R")){
        errs.push({kind:"row",row:n,field:"lr", msg:`#${n} Choose Side L/R.`}); break;
      }
      if ((it.cordLenText ?? "").trim() !== ""){
        errs.push({kind:"row",row:n,field:"len", msg:`#${n} Motor: Cord Length must be empty.`}); break;
      }
    } else if (ct === "CH" || ct === "STR"){
      if (!(it.cordSide === "L" || it.cordSide === "R")){
        errs.push({kind:"row",row:n,field:"lr", msg:`#${n} Select Side.`}); break;
      }
      if (!String(it.cordLenText||"").trim()){
        errs.push({kind:"row",row:n,field:"len", msg:`#${n} Enter Cord Length.`}); break;
      }
    } else {
      if (it.cordSide !== "-"){
        errs.push({kind:"row",row:n,field:"lr", msg:`#${n} Control(${ct}) → Side must be '-'.`}); break;
      }
      if (String(it.cordLenText||"").trim() !== ""){
        errs.push({kind:"row",row:n,field:"len", msg:`#${n} Control(${ct}) → Len must be empty.`}); break;
      }
    }

     // ── Fabric / Color / Price — A측(항상)
if (!it.category) {
  errs.push({ kind:"row", row:n, field:"category", msg:`#${n} Select Category.` }); break;
}

// DUO면 스크롤 타겟을 A용 id로 바꿔주기
const isDuo = it.upType === "4FA(Duo)";
const fieldFabA = isDuo ? "fabricA" : "fabric";
const fieldColA = isDuo ? "colorA"  : "color";

if (!it.fabric) {
  errs.push({ kind:"row", row:n, field: fieldFabA, msg:`#${n} Select Fabric.` });
  break;
}

const aIsManual = it.fabric === "MANUAL";
if (!aIsManual && !it.color) {
  errs.push({ kind:"row", row:n, field: fieldColA, msg:`#${n} Select Color.` });
  break;
}

if ((aIsManual || isEditableFamily(it.fabric)) &&
    !(Number.isFinite(Number(it.price)) && Number(it.price) >= 0)) {
  errs.push({ kind:"row", row:n, field:"price", msg:`#${n} Enter valid price A (≥ 0).` });
  break;
}

    // ── B측: Duo 헤드레일이면 필수
    if (it.upType === "4FA(Duo)") {
      if (!it.categoryB) {
        errs.push({ kind:"row", row:n, field:"categoryB", msg:`#${n} Select Cat B.` }); break;
      }
      if (!it.fabricB) {
        errs.push({ kind:"row", row:n, field:"fabricB", msg:`#${n} Select Fabric B.` }); break;
      }
      const bIsManual = it.fabricB === "MANUAL";
      if (!bIsManual && !it.colorB) {
        errs.push({ kind:"row", row:n, field:"colorB", msg:`#${n} Select Color B.` }); break;
      }
      if ((bIsManual || isEditableFamily(it.fabricB)) &&
    !(Number.isFinite(Number(it.priceB)) && Number(it.priceB) >= 0)) {
  errs.push({ kind:"row", row:n, field:"priceB", msg:`#${n} Enter valid price B (≥ 0).` });
  break;
}
    }
  }

// Deck Door pair 검증 — 정확히 2행, 합계폭 일치, 각 측 폭 범위, 포커스 일관
{
  // 같은 pairId 묶기 (Deck Door 행만)
  const pairs = {};
  for (const it of items) {
    if (it.space === "Deck Door" && it.deckPairId) {
      (pairs[it.deckPairId] ||= []).push(it);
    }
  }

  // pair별 검증
  for (const [pid, rows] of Object.entries(pairs)) {
    // 행 인덱스(표시용) 안전하게 가져오기
    const rowIndex = (r) => (Number.isFinite(r?.rowIndex) ? r.rowIndex : (r?.n ?? 1));

    // 1) 정확히 2행
    if (rows.length !== 2) {
      const focus = rows[0] ?? null;
      errs.push({
        kind: "row",
        row: focus ? rowIndex(focus) : 1,
        field: "w",
        msg: `Deck Door pair (${pid}) must have exactly 2 rows.`,
      });
      break;
    }

    // 2) 역할 L/R 구성
    const roles = new Set(rows.map(r => r.deckRole));
    if (!(roles.has("L") && roles.has("R"))) {
      const focus = rows[0];
      errs.push({
        kind: "row",
        row: rowIndex(focus),
        field: "w",
        msg: `Deck Door pair (${pid}) must include Left(L) and Right(R).`,
      });
      break;
    }

    // L/R 식별
    const left = rows.find(r => r.deckRole === "L");
    const right = rows.find(r => r.deckRole === "R");

    // 3) 공유 Total W 존재
    const total = Number(left.deckTotalW ?? right.deckTotalW);
    if (!(Number.isFinite(total) && total > 0)) {
      // Total 자체 문제 → Total에 포커스
      const focus = left ?? right;
      errs.push({
        kind: "row",
        row: rowIndex(focus),
        field: "deckTotalW",
        msg: `Enter a valid Total W (> 0) for Deck Door pair (${pid}).`,
      });
      break;
    }

    // 4) 각 측 W 유효성
    const wL = Number(left.w);
    const wR = Number(right.w);
    if (!(Number.isFinite(wL) && wL > 0)) {
      errs.push({
        kind: "row",
        row: rowIndex(left),
        field: "w",
        msg: `Left width must be > 0 (pair ${pid}).`,
      });
      break;
    }
    if (!(Number.isFinite(wR) && wR > 0)) {
      errs.push({
        kind: "row",
        row: rowIndex(right),
        field: "w",
        msg: `Right width must be > 0 (pair ${pid}).`,
      });
      break;
    }

    // 5) 합계 일치(허용 오차 1mm ≈ 0.04in)
    const EPS = 0.04;
    const sum = wL + wR;
    if (Math.abs(sum - total) > EPS) {
      // 합계 문제 → Total에 포커스 주는 게 사용자 경험상 가장 직관적
      const focus = left ?? right;
      errs.push({
        kind: "row",
        row: rowIndex(focus),
        field: "deckTotalW",
        msg: `Left + Right (${sum.toFixed(2)}) must equal Total W (${total.toFixed(2)}).`,
      });
      break;
    }

    // 6) 각 측이 Total 초과/음수 아님
    if (wL > total || wL <= 0) {
      errs.push({
        kind: "row",
        row: rowIndex(left),
        field: "w",
        msg: `Left width must be within (0, Total].`,
      });
      break;
    }
    if (wR > total || wR <= 0) {
      errs.push({
        kind: "row",
        row: rowIndex(right),
        field: "w",
        msg: `Right width must be within (0, Total].`,
      });
      break;
    }
  }
}
  return errs;
}

function createDeckPairFrom(single){
  const id = "deck-"+(crypto.randomUUID?.()||Math.random().toString(36).slice(2));
  const left =  { ...single, deckPairId:id, deckRole:"L", locDetail:"1/2" };
  const right = { ...single, deckPairId:id, deckRole:"R", locDetail:"2/2" };
  right.cordSide="-"; right.cordLenText="";
  return [left,right];
}

/* ====== Measure Items block ====== */
function MeasureItemsBlock({ header, items, setItemField, updateItem, addRow, delRow, dupRow, onOpenBulk }){
  // ---- Split helpers ----
const SPLIT_LABELS = {
  2: ["1L","2R"],
  3: ["1L","2M","3R"],
  4: ["1LL","1L","2R","2RR"],
  5: ["1LL","2L","3M","4R","5RR"],
  6: ["1LLL","2LL","3L","4R","5RR","6RRR"],
  7: ["1LLL","2LL","3L","4M","5R","6RR","7RRR"],
};
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const numOr = (v,def)=>{ const n=Number(v); return Number.isFinite(n)?n:def; };

  const unit = header.unit;
  // 각 아이템별 호환 옵션 계산 (렌더 내에서 캐시)
  const _compatCacheRef = React.useRef(new WeakMap());
  const _compatCache = _compatCacheRef.current;
  const compatFor = (it) => {
    let cached = _compatCache.get(it);
    if (cached) return cached;
    const { allowed } = resolveItem(it);
    cached = {
      allowedCats:      allowed.allowedCats,
      allowedHeadrails: allowed.allowedHeadrails,
      allowedBottoms:   allowed.allowedBottoms,
      sideDisabled:     allowed.sideLDisabled,
      lDisabled:        allowed.sideLDisabled, // L채널도 Dual에서 금지
      bottomFixed:      normalizeBottomBy(it.category, it.upType, it.btType),
      controls:         allowed.allowedControls,
      motorOK:          allowed.motorUIOk,
    };
    _compatCache.set(it, cached);
    return cached;
  };

  return (
    <>
      {items.map((it,idx)=>(
        <div key={idx} id={`item-${idx+1}`} className="border rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-3">
   <div className="font-semibold">#{idx+1} — {titleOf(it)||"Location"}</div>
   <label className="ml-auto flex items-center gap-2 text-sm">
     <input
       type="checkbox"
       className="h-4 w-4"
       checked={it.include !== false}
       onChange={e=>setItemField(idx,"include", e.target.checked)}
     />
     <span>Include</span>
   </label>
 </div>

          {/* Desktop */}
          <div className="hidden md:block">
            <div className="grid grid-cols-12 gap-3 mb-3">
              <SelectL col={2} label="Area" value={it.locArea} onChange={v=>setItemField(idx,"locArea",v)} options={["1F","2F","3F","B1","B2"]}/>

              {(() => {
                const isDeck = !!it.deckPairId;
                const isManualSpace = it.locSpace==="MANUAL";
                const spaceCol = isDeck ? 2 : (isManualSpace ? 2 : 3);
                const detailCol = (isDeck || isManualSpace) ? 2 : 3;
                return (
                  <>
                    <SelectL col={spaceCol} label="Space" value={it.locSpace}
                     onChange={v=>setItemField(idx,"locSpace",v)}
                     options={SPACE_OPTS}
                     labels={SPACE_LABELS}
                     />
                    {isManualSpace && (<InputL col={2} label="Space (text)" value={it.locSpaceText||""} onChange={e=>setItemField(idx,"locSpaceText", e.target.value)} />)}
                    <InputL col={detailCol} label="Detail" value={it.locDetail} onChange={e=>setItemField(idx,"locDetail",e.target.value)} placeholder="e.g., 1L" disabled={isDeck}/>

                    {isDeck && (
                      unit==="ft"
                        ? <FeetInches col={2} label="Total W (ft/in)" valueInches={it.deckTotalIn} onChange={v=>updateItem(idx,{deckTotalIn:v})} disabled={it.deckRole==="R"}/>
                        : <NumberL   col={2} label={`Total W (${unit})`}
   value={unit==="mm" ? (it.deckTotalIn===""||it.deckTotalIn==null? "" : Math.round(it.deckTotalIn*25.4)) : it.deckTotalIn}
   onChange={(v)=>updateItem(idx,{ deckTotalIn: unit==="mm" ? (v===""? "" : mmToIn(v)) : v })}
   keepBlank step="1" disabled={it.deckRole==="R"}/>
                    )}

                    {unit==="ft"
                      ? <FeetInches id={`row-${idx+1}-w`} col={2} label={it.deckPairId ? `W (${it.deckRole})` : "W (ft/in)"} valueInches={it.wIn} onChange={v=>updateItem(idx,{wIn:v})}/>
                      : <NumberL   id={`row-${idx+1}-w`} col={2} label={`W (${unit})`} value={unit==="mm"
   ? (it.wIn==="" || it.wIn==null ? "" : Math.round(it.wIn*25.4))
   : it.wIn}
 onChange={(v)=>updateItem(idx,{
   wIn: unit==="mm" ? (v==="" ? "" : mmToIn(v)) : v
 })} step="1" keepBlank />}

                    {unit==="ft"
                      ? <FeetInches id={`row-${idx+1}-h`} col={2} label="H (ft/in)" valueInches={it.hIn} onChange={v=>updateItem(idx,{hIn:v})}/>
                      : <NumberL   id={`row-${idx+1}-h`} col={2} label={`H (${unit})`} value={unit==="mm"
   ? (it.hIn==="" || it.hIn==null ? "" : Math.round(it.hIn*25.4))
   : it.hIn}
 onChange={(v)=>updateItem(idx,{
   hIn: unit==="mm" ? (v==="" ? "" : mmToIn(v)) : v
 })} step="1" keepBlank />}
                  </>
                );
              })()}
            </div>

{/* ---- Split Editor: line1(Area/Space/Detail/W/H)와 line2 사이 ---- */}
{ !String(it.locSpace||"").startsWith("Deck Door") && it.uiSplitOpen && (
  <div
    className="mt-2 mb-2 p-3 rounded-lg border bg-white/60"
    tabIndex={0}
    onKeyDown={(e)=>{ if(e.key==="Escape"){ updateItem(idx,{ uiSplitOpen:false }); } }}
  >
    {/* 헤더 라인: Pieces(개수) → Unit → N 선택 → × 닫기 */}
    <div
      className="flex flex-wrap items-center gap-3"
      onDoubleClick={()=>updateItem(idx,{ uiSplitOpen: !it.uiSplitOpen })}
    >
      {/* Pieces 라벨 */}
      <label className="text-sm font-medium">Pieces</label>

      {/* 개수 선택 (2~7) — ★ Pieces 바로 옆으로 이동 */}
      <select
        className="px-2 py-1 border rounded"
        value={Math.max(2, Math.min(7, Number(it.splitN ?? 2)))}
        onChange={e=>{
          const nextN = Math.max(2, Math.min(7, Number(e.target.value||2)));
          const lens = Array.from({length: nextN}, (_,i)=> {
  const cur = it.splitLens?.[i];
  return (cur === 0 || cur == null) ? "" : String(cur);
});
          const ftIn = Array.from({length: nextN}, (_,i)=> ({
            ft: it.splitFtIn?.[i]?.ft ?? "",
            in: it.splitFtIn?.[i]?.in ?? "",
            fr: it.splitFtIn?.[i]?.fr ?? "0"
          }));
          const ctrls = Array.from({length: nextN}, (_,i)=> {
            const cur = String(it.splitCtrl?.[i] ?? "-").toUpperCase();
            return (cur==="L" || cur==="R" || cur==="-" ? cur : "-");
          });
          updateItem(idx,{ splitN: nextN, splitLens: lens, splitFtIn: ftIn, splitCtrl: ctrls });
        }}
      >
        {[2,3,4,5,6,7].map(k=><option key={k} value={k}>{k}</option>)}
      </select>

      {/* Unit 선택 (mm / in / ft-in) */}
      <label className="ml-2 text-sm flex items-center gap-2">
        <span>Unit</span>
        <select
          className="px-2 py-1 border rounded"
          value={it.splitUnit || (header?.unit==="mm" ? "mm" : "in")}
          onChange={(e)=>updateItem(idx,{ splitUnit: e.target.value })}
        >
          <option value="mm">mm</option>
          <option value="in">in</option>
          <option value="ft-in">ft+in</option>
        </select>
      </label>

      {/* 단위 안내 */}
      <span className="text-xs text-gray-500">
        {(()=>{
          const u = it.splitUnit || (header?.unit==="mm" ? "mm" : "in");
          if(u==="mm") return "mm (0.1 step)";
          if(u==="in") return "in (0.1 step)";
          return "ft+in (1/32 fraction, saved as inches)";
        })()}
      </span>

      {/* 닫기 X 버튼 */}
      <button
        type="button"
        aria-label="Close split"
        className="ml-auto px-2 py-1 border border-black text-black rounded text-sm hover:bg-black/5"
        onClick={()=>updateItem(idx,{ uiSplitOpen:false })}
      >×</button>
    </div>

    {/* 라벨 프리셋 + 입력칸들 */}
    {(() => {
      const LABELS = {
        2: ["1L","2R"],
        3: ["1L","2M","3R"],
        4: ["1LL","1L","2R","2RR"],
        5: ["1LL","2L","3M","4R","5RR"],
        6: ["1LLL","2LL","3L","4R","5RR","6RRR"],
        7: ["1LLL","2LL","3L","4M","5R","6RR","7RRR"],
      };
      const N = Math.max(2, Math.min(7, Number(it.splitN ?? 2)));
      const labs = LABELS[N] || [];
      const unitNow = it.splitUnit || (header?.unit==="mm" ? "mm" : "in");

      return (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {labs.map((lab, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-sm text-gray-600">{lab}</span>

              {unitNow !== "ft-in" ? (
  // mm / in 공통: 숫자 한 칸 (0.1)
  <input
  // text 로 바꿔야 타이핑 흐름이 끊기지 않음(하이라이트/포커스 점프 방지)
  type="text"
  inputMode="decimal"
  placeholder="0"
  className="flex-1 px-2 py-1 border rounded"
  value={String(it.splitLens?.[i] ?? "")}
  onChange={(e)=>{
    const raw = e.target.value;
    const cleaned = normNumText(raw);   // 앞자리 0 정리, 다중 '.' 정리
    const next = Array.from({length: N}, (_,k)=> (it.splitLens?.[k] ?? ""));
    next[i] = cleaned;
    updateItem(idx,{
      splitLens: next,
      splitUnit: (unit==="mm" ? "mm" : "in")
    });
  }}
  onBlur={(e)=>{
    // 포커스 빠질 때 숫자로 한 번 정리 (""는 그대로 둠)
    const val = toNumberOrEmpty(e.target.value);
    const next = Array.from({length: N}, (_,k)=> (it.splitLens?.[k] ?? ""));
    next[i] = (val === "" ? "" : String(val));
    updateItem(idx,{ splitLens: next });
  }}
/>
) : (
  // ft-in 모드: ft / in / fraction(1/32) 셀렉트 → 총 인치로 저장
  <div className="flex items-center gap-2">
    {(() => {
      const MAX_FT = 40; // 필요시 조정
      const inchOpts = Array.from({length:12},(_,k)=>k); // 0..11
      const fracList = [
        "0","1/32","1/16","3/32","1/8","5/32","3/16","7/32","1/4","9/32","5/16","11/32",
        "3/8","13/32","7/16","15/32","1/2","17/32","9/16","19/32","5/8","21/32","11/16",
        "23/32","3/4","25/32","13/16","27/32","7/8","29/32","15/16","31/32"
      ];
      const cur = it.splitFtIn?.[i] || { ft:"", in:"", fr:"0" };

      const toInches = (ft,in_,fr) => {
        const f = Number(ft)||0;
        const ii = Number(in_)||0;
        let frac = 0;
        if(fr && fr!=="0"){
          const [a,b] = fr.split("/").map(Number);
          if(a && b) frac = a/b;
        }
        // 총 인치(소수 1)로 저장
        return Math.round((f*12 + ii + frac)*10)/10;
      };

      return (
        <>
          {/* ft */}
          <select
            className="w-20 px-2 py-1 border rounded"
            value={cur.ft}
            onChange={(e)=>{
              const nextFtIn = Array.from({length:N}, (_,k)=> ({
                ft: it.splitFtIn?.[k]?.ft ?? "",
                in: it.splitFtIn?.[k]?.in ?? "",
                fr: it.splitFtIn?.[k]?.fr ?? "0"
              }));
              nextFtIn[i] = { ...nextFtIn[i], ft: e.target.value };
              const total = toInches(nextFtIn[i].ft, nextFtIn[i].in, nextFtIn[i].fr);
              const nextLens = Array.from({length:N}, (_,k)=> Number(it.splitLens?.[k] ?? 0));
              nextLens[i] = total;
              updateItem(idx,{ splitFtIn: nextFtIn, splitLens: nextLens, splitUnit:"ft-in" });
            }}
          >
            <option value=""></option>
            {Array.from({length:MAX_FT+1},(_,k)=>(
              <option key={k} value={k}>{k}</option>
            ))}
          </select>

          {/* in (0..11) */}
          <select
            className="w-20 px-2 py-1 border rounded"
            value={cur.in}
            onChange={(e)=>{
              const nextFtIn = Array.from({length:N}, (_,k)=> ({
                ft: it.splitFtIn?.[k]?.ft ?? "",
                in: it.splitFtIn?.[k]?.in ?? "",
                fr: it.splitFtIn?.[k]?.fr ?? "0"
              }));
              nextFtIn[i] = { ...nextFtIn[i], in: e.target.value };
              const total = toInches(nextFtIn[i].ft, nextFtIn[i].in, nextFtIn[i].fr);
              const nextLens = Array.from({length:N}, (_,k)=> Number(it.splitLens?.[k] ?? 0));
              nextLens[i] = total;
              updateItem(idx,{ splitFtIn: nextFtIn, splitLens: nextLens, splitUnit:"ft-in" });
            }}
          >
            <option value=""></option>
            {inchOpts.map(v=><option key={v} value={v}>{v}</option>)}
          </select>

          {/* fraction (1/32 단위) */}
          <select
            className="w-24 px-2 py-1 border rounded"
            value={cur.fr ?? "0"}
            onChange={(e)=>{
              const nextFtIn = Array.from({length:N}, (_,k)=> ({
                ft: it.splitFtIn?.[k]?.ft ?? "",
                in: it.splitFtIn?.[k]?.in ?? "",
                fr: it.splitFtIn?.[k]?.fr ?? "0"
              }));
              nextFtIn[i] = { ...nextFtIn[i], fr: e.target.value };
              const total = toInches(nextFtIn[i].ft, nextFtIn[i].in, nextFtIn[i].fr);
              const nextLens = Array.from({length:N}, (_,k)=> Number(it.splitLens?.[k] ?? 0));
              nextLens[i] = total;
              updateItem(idx,{ splitFtIn: nextFtIn, splitLens: nextLens, splitUnit:"ft-in" });
            }}
          >
            {fracList.map(f=><option key={f} value={f}>{f}</option>)}
          </select>
        </>
      );
    })()}
  </div>
)}
            {/* Control (L / R / -) */}
              <select
                className="w-16 px-2 py-1 border rounded text-xs"
                value={String(it.splitCtrl?.[i] ?? "-")}
                onChange={(e)=>{
                  const next = Array.from({length:N}, (_,k)=> {
                    const cur = String(it.splitCtrl?.[k] ?? "-").toUpperCase();
                    return (cur==="L" || cur==="R" || cur==="-" ? cur : "-");
                  });
                  next[i] = e.target.value;
                  updateItem(idx,{ splitCtrl: next });
                }}
              >
                <option value="L">L</option>
                <option value="R">R</option>
                <option value="-">-</option>
              </select>
            </label>
          ))}
        </div>
      );
    })()}

    <div className="mt-3 flex items-center justify-between">
  <span className="text-xs text-gray-500">
    Values are saved automatically. Click <b>Save</b> to close.
  </span>
  <button
    type="button"
    className="px-3 py-1.5 rounded border border-black text-black text-xs hover:bg-black/5"
    onClick={()=>updateItem(idx,{ uiSplitOpen:false })}
  >
    Save
  </button>
</div>
  </div>
)}

            {/* Hardware / Control (Desktop) */}
<div className="grid grid-cols-12 gap-3 mb-3 items-end">
  {(() => {
    const ct = normalizeCordType(it.cordType||"");
    const compat   = compatFor(it);
    const isMotor  = (ct === "Motor");
    const isDuo    = (it.upType === "4FA(Duo)");
    const needsSL  = (ct==="CH" || ct==="STR"); // side/len 필요

    return (
      <>
        {/* 1~5: 고정 5칸 */}
        <SelectL id={`row-${idx+1}-mount`} col={1} label="Mount" value={it.install}
                 onChange={v=>setItemField(idx,"install",v)} options={MOUNT_OPTS}/>
        <SelectL col={1} label="Headrail" value={it.upType}
                 onChange={v=>setItemField(idx,"upType",v)} options={compat.allowedHeadrails}/>
        <SelectL col={1} label="Color" value={it.upClr}
                 onChange={v=>setItemField(idx,"upClr",v)} options={COLOR_COMMON}/>
        <SelectL col={1} label="Bottom" value={compat.bottomFixed}
                 onChange={v=>setItemField(idx,"btType",v)} options={compat.allowedBottoms}/>
        <SelectL col={1} label="Color" value={it.btClr}
                 onChange={v=>setItemField(idx,"btClr",v)} options={COLOR_COMMON}/>

        {/* ───────── 분기 영역 ───────── */}
        {/* Control: Motor면 col=1, 아니면 col=2 */}
        <SelectL id={`row-${idx+1}-cord`} col={isMotor ? 1 : 2} label="Control"
          value={ct} onChange={v=>{
            setItemField(idx,"cordType",v);
            const nct = normalizeCordType(v);
            if (nct==="CH" || nct==="STR") {
              // 그대로 (L/R, Len 사용)
            } else if (nct==="Motor") {
              setItemField(idx,"cordLenText","");
              if (!it.cordSide) setItemField(idx,"cordSide","-");
            } else {
              setItemField(idx,"cordSide","-");
              setItemField(idx,"cordLenText","");
              setItemField(idx,"motorCode","");
            }
          }}
                 options={compat.controls}/>

        {isMotor ? (
          <>
            {/* 7~9칸: Motor Type(3) + L/R(1) */}
            <div className="col-span-3 relative group">
              <SelectL id={`row-${idx+1}-motor`} col={12} label="Motor Type"
                       value={it.motorCode||""}
                       onChange={v=>setItemField(idx,"motorCode",v)}
                       options={MOTORS.map(m=>m.code)}
                       labels={Object.fromEntries(MOTORS.map(m=>[m.code,m.label]))}
                       disabled={!compat.motorOK}/>
              {!compat.motorOK && (
                <div className="absolute -top-7 left-0 px-2 py-1 text-xs rounded bg-black text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                  {TIP_SHORT}
                </div>
              )}
            </div>
            <SelectL id={`row-${idx+1}-lr`} col={1} label="L/R"
                     value={it.cordSide || "-"}
                     onChange={v=>setItemField(idx,"cordSide",v)}
                     options={["-","L","R"]} disabled={!compat.motorOK}/>

            {/* 10~11칸: Spring Assist(2) — Motor일 땐 비활성화 */}
<div className="col-span-1">
  <div className="text-sm text-gray-600 mb-1">Spring Assist</div>
  <input type="checkbox" className="cbx-25" checked={!!it.springAssist} disabled />
</div>
<div className="col-span-1">
  <div className="text-sm text-gray-600 mb-1">Price</div>
  <div className="px-3 py-2 border rounded bg-gray-50 text-right">
    {(0).toFixed(2)}
  </div>
</div>

            {/* 합계: 12칸 유지 */}
          </>
        ) : (
          <>
            {/* 비-Motor 분기 */}
            {/* Side(1) */}
            <SelectL id={`row-${idx+1}-lr`} col={1} label="Side"
                     value={needsSL ? (it.cordSide||"-") : "-"}
                     onChange={v=>setItemField(idx,"cordSide",v)}
                     options={["-","L","R"]} disabled={!needsSL}/>

            {/* Len: Duo면 1칸, 아니면 2칸 */}
<InputL
  id={`row-${idx+1}-len`}
  col={isDuo ? 1 : 2}
  label="Len"
  value={needsSL ? (it.cordLenText||"") : ""}
  onChange={e=>setItemField(idx,"cordLenText",e.target.value)}
  placeholder={unit==="mm" ? "900mm, N-30" : "in (e.g., 36) or H-30"}
  disabled={!needsSL}
/>

{/* Spring Assist: 체크(1) + 가격(1) (+ Duo면 Qty 1칸) */}
{(() => {
  const qty = isDuo
    ? (it.springAssist ? Math.max(1, Math.min(2, Number(it.springQty)||1)) : 0)
    : (it.springAssist ? 1 : 0);
  const price = (SPRING_ASSIST_PRICE || 0) * qty;

  return (
    <>
      {/* 체크(1칸) — Side/L과 동일 구조 */}
      <div className="col-span-1">
        <div className="text-sm text-gray-600 mb-1">Spring Assist</div>
        <input
          type="checkbox"
          className="cbx-25"
          checked={!!it.springAssist}
          onChange={e=>{
            const on = e.target.checked;
            setItemField(idx,"springAssist", on);
            if (isDuo) setItemField(idx,"springQty", on ? (Number(it.springQty)||1) : 0);
          }}
        />
      </div>

      {/* 가격(1칸) — Side/L과 동일 박스 */}
      <div className="col-span-1">
        <div className="text-sm text-gray-600 mb-1">Price</div>
        <div className="px-3 py-2 border rounded bg-gray-50 text-right">
          {price.toFixed(2)}
        </div>
      </div>

      {/* Duo면 수량(1칸) */}
      {isDuo && (
        <SelectL
          col={1}
          label="Spring Qty"
          value={String(it.springAssist ? (it.springQty||1) : 0)}
          onChange={v=>{
            const q = Math.max(0, Math.min(2, Number(v)||0));
            setItemField(idx, "springQty", q);
            if (q===0 && it.springAssist) setItemField(idx,"springAssist", false);
            if (q>0 && !it.springAssist) setItemField(idx,"springAssist", true);
          }}
          options={["0","1","2"]}
          labels={{"0":"0","1":"1","2":"2"}}
        />
      )}
    </>
  );
})()}
            {/* 합계: 비-Motor 일반=12, 비-Motor Duo=12 */}
          </>
        )}
      </>
    );
  })()}
</div>

            {/* Fabric (ONE-LINE) */}
{it.upType !== "4FA(Duo)" ? (
  // ── 일반(비 Duo) : Category(2) + Fabric(4 or 3) + Color(3 or 2) + Price(3 or 2)
  <div className="grid grid-cols-12 gap-3 mb-3 items-end">
    <SelectL id={`row-${idx+1}-category`} col={2} label="Category" value={it.category}
  onChange={v=>setItemField(idx,"category",v)} options={compatFor(it).allowedCats}/>

    {it.fabric==="MANUAL" ? (
      <>
        <FabricSelect id={`row-${idx+1}-fabric`} col={3} item={it} setItem={(k,v)=>setItemField(idx,k,v)} />
        <InputL  col={3} label="Fabric (manual)" value={it.fabricName||""} onChange={e=>setItemField(idx,"fabricName",e.target.value)} />
        <InputL  col={2} label="Color" value={it.color||""} onChange={e=>setItemField(idx,"color",e.target.value)} />
        <NumberL id={`row-${idx+1}-price`} col={2} label="Price A ($/sqft)" step="0.1" value={it.price||0} onChange={v=>setItemField(idx,"price",v)} />
      </>
    ) : (
      <>
        <FabricSelect id={`row-${idx+1}-fabric`} col={4} item={it} setItem={(k,v)=>setItemField(idx,k,v)} />
        <ColorSelect  id={`row-${idx+1}-color`}  col={3} item={it} setItem={(k,v)=>setItemField(idx,"color",v)} />
        <NumberL id={`row-${idx+1}-price`} col={3} label="Price A ($/sqft)" step="0.1" value={it.price||0} onChange={v=>setItemField(idx,"price",v)} disabled={!isEditableFamily(it.fabric)} />
      </>
    )}
  </div>
) : (
  // ── Duo : [CatA(1) FabA(2) ColA(2) PriA(1)] + [CatB(1) FabB(2) ColB(2) PriB(1)]
  <div className="grid grid-cols-12 gap-3 mb-3 items-end">
    <SelectL id={`row-${idx+1}-category`} col={1} label="Cat A" value={it.category}
  onChange={v=>setItemField(idx,"category",v)} options={compatFor(it).allowedCats}/>
    <FabricSelect col={2} id={`row-${idx+1}-fabricA`} item={it} setItem={(k,v)=>setItemField(idx,k,v)} />

    {it.fabric==="MANUAL" ? (
      <InputL col={2} label="Col A" value={it.color||""} onChange={e=>setItemField(idx,"color",e.target.value)} />
    ) : (
      <ColorSelect col={2} id={`row-${idx+1}-colorA`} item={it} setItem={(k,v)=>setItemField(idx,"color",v)} />
    )}

    <NumberL id={`row-${idx+1}-price`} col={1} label="$/A" step="0.1" value={it.price||0} onChange={v=>setItemField(idx,"price",v)} disabled={!isEditableFamily(it.fabric) && it.fabric!=="MANUAL"} />

    <SelectL id={`row-${idx+1}-categoryB`} col={1} label="Cat B" value={it.categoryB}
  onChange={v=>setItemField(idx,"categoryB",v)} options={compatFor(it).allowedCats}/>
    <FabricSelect
      col={2}
      id={`row-${idx+1}-fabricB`}
      item={{ ...it, category: it.categoryB, fabric: it.fabricB }}
      setItem={(k, v) => {
        const map = { fabric:"fabricB", fabricName:"fabricNameB", price:"priceB", color:"colorB", category:"categoryB" };
        setItemField(idx, map[k] || k, v);
      }}
    />

    {it.fabricB==="MANUAL" ? (
      <InputL col={2} label="Col B" value={it.colorB||""} onChange={e=>setItemField(idx,"colorB",e.target.value)} />
    ) : (
      <ColorSelect col={2} id={`row-${idx+1}-colorB`} item={{...it, category:it.categoryB, fabric:it.fabricB, color:it.colorB}} setItem={(k,v)=>setItemField(idx,"colorB",v)} />
    )}

    <NumberL id={`row-${idx+1}-priceB`} col={1} label="$/B" step="0.1" value={it.priceB||0} onChange={v=>setItemField(idx,"priceB",v)} disabled={!isEditableFamily(it.fabricB) && it.fabricB!=="MANUAL"} />
  </div>
)}

            {/* Options: Side/L channel / Extra / Memo — 12칸 한 줄 */}
<div className="grid grid-cols-12 gap-3 mt-3 items-end">
  {(() => {
    const compat = compatFor(it);
    const isDuoHeadrail = it.upType==="4FA(Duo)";

    const sideDisabled = compat.sideDisabled;
    const lDisabled    = compat.lDisabled; // 🔧

    const sidePrice = (!sideDisabled && it.sideChannel)
      ? sideChannelPrice(it.hIn)
      : 0;

    const lPrice = (!lDisabled && it.lChannel)
      ? lChannelPrice(it.wIn)
      : 0;

    return (
      <>
        {/* Side channel */}
        <div className="col-span-1">
          <div className="text-sm text-gray-600 mb-1">Side Channels</div>
          <input
            className="cbx-25"
            type="checkbox"
            checked={!!it.sideChannel}
            onChange={e=>setItemField(idx,"sideChannel", e.target.checked)}
            disabled={sideDisabled}
          />
        </div>
        <div className="col-span-1">
          <div className="text-sm text-gray-600 mb-1">Price</div>
          <div className="px-3 py-2 border rounded bg-gray-50 text-right">
            ${sidePrice.toFixed(2)}
          </div>
        </div>

        {/* L Channel */}
        <div className="col-span-1">
          <div className="text-sm text-gray-600 mb-1">L Channels</div>
          <input
            className="cbx-25"
            type="checkbox"
            checked={!!it.lChannel}
            onChange={e=>setItemField(idx,"lChannel", e.target.checked)}
            disabled={lDisabled}  /* 🔧 Dual이면 체크 불가 */
          />
        </div>
        <div className="col-span-1">
          <div className="text-sm text-gray-600 mb-1">Price</div>
          <div className="px-3 py-2 border rounded bg-gray-50 text-right">
            ${lPrice.toFixed(2)}
          </div>
        </div>

        <NumberL col={2} label="Extra ($)" value={it.extra||0} onChange={v=>setItemField(idx,"extra",v)} />
        <InputL  col={6} label="Memo" value={it.memo||""} onChange={e=>setItemField(idx,"memo",e.target.value)} />
      </>
    );
  })()}
</div>
          </div>

          {/* Mobile */}
          <div className="md:hidden">
            <div className="grid grid-cols-12 gap-3 mb-3">
              {(() => {
                const isAreaManual  = it.locArea === "MANUAL";
                const isSpaceManual = it.locSpace === "MANUAL";
                const bothManual    = isAreaManual && isSpaceManual;

                const colArea      = bothManual ? 2 : 3;
                const colAreaText  = isAreaManual ? 3 : 0;
                const colSpace     = bothManual ? 2 : 3;
                const colSpaceText = isSpaceManual ? 3 : 0;
                const colDetail    = bothManual ? 2 : 3;

                return (
                  <>
                    <SelectL col={colArea} label="Area" value={it.locArea} onChange={v=>setItemField(idx,"locArea",v)} options={["1F","2F","3F","B1","B2","MANUAL"]} labels={{ MANUAL:"Manual input" }}/>
                    {isAreaManual && (<InputL col={colAreaText} label="Area (text)" value={it.locAreaText||""} onChange={e=>setItemField(idx,"locAreaText",e.target.value)} />)}

                              <SelectL col={colSpace} label="Space" value={it.locSpace}
            onChange={v=>setItemField(idx,"locSpace",v)}
            options={SPACE_OPTS}
            labels={SPACE_LABELS}
          />

                    {isSpaceManual && (<InputL col={colSpaceText} label="Space (text)" value={it.locSpaceText||""} onChange={e=>setItemField(idx,"locSpaceText",e.target.value)} />)}

                    <InputL col={colDetail} label="Detail" value={it.locDetail} onChange={e=>setItemField(idx,"locDetail",e.target.value)} placeholder="e.g., 1L" disabled={!!it.deckPairId}/>
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-12 gap-3 mb-3">
              <SelectL id={`row-${idx+1}-mount`} col={3} label="Mount" value={it.install} onChange={v=>setItemField(idx,"install",v)} options={MOUNT_OPTS}/>

              {it.deckPairId && (
                unit==="ft"
                  ? <FeetInches col={3} label="Total W (ft/in)" valueInches={it.deckTotalIn} onChange={v=>updateItem(idx,{deckTotalIn:v})} disabled={it.deckRole==="R"}/>
                  : <NumberL   col={3} label={`Total W (${unit})`} value={unit==="mm"? Math.round((it.deckTotalIn||0)*25.4) : it.deckTotalIn} onChange={v=>updateItem(idx,{deckTotalIn: unit==="mm"? mmToIn(v): v})} step="1" disabled={it.deckRole==="R"}/>
              )}

              {unit==="ft"
                ? <FeetInches id={`row-${idx+1}-w`} col={3} label={it.deckPairId ? `W (${it.deckRole})` : "W (ft/in)"} valueInches={it.wIn} onChange={v=>updateItem(idx,{wIn:v})}/>
                : <NumberL   id={`row-${idx+1}-w`} col={3} label={`W (${unit})`} value={unit==="mm" ? (it.wIn===""||it.wIn==null? "" : Math.round(it.wIn*25.4)) : it.wIn}
 onChange={(v)=>updateItem(idx,{ wIn: unit==="mm" ? (v===""? "" : mmToIn(v)) : v })}
 step="1" keepBlank/>}

              {unit==="ft"
                ? <FeetInches id={`row-${idx+1}-h`} col={3} label="H (ft/in)" valueInches={it.hIn} onChange={v=>updateItem(idx,{hIn:v})}/>
                : <NumberL   id={`row-${idx+1}-h`} col={3} label={`H (${unit})`} value={unit==="mm" ? (it.hIn===""||it.hIn==null? "" : Math.round(it.hIn*25.4)) : it.hIn}
 onChange={(v)=>updateItem(idx,{ hIn: unit==="mm" ? (v===""? "" : mmToIn(v)) : v })} step="1" keepBlank />}
            </div>

            <div className="grid grid-cols-12 gap-3 mb-3">
  {(() => {
    const compat = compatFor(it);
    return (
      <>
        <SelectL col={3} label="Headrail" value={it.upType}
         onChange={v=>setItemField(idx,"upType",v)}
         options={compat.allowedHeadrails}/>
<SelectL col={3} label="Color"  value={it.upClr} onChange={v=>setItemField(idx,"upClr",v)} options={COLOR_COMMON}/>

<SelectL col={3} label="Bottom" value={compat.bottomFixed}
         onChange={v=>setItemField(idx,"btType",v)}
         options={compat.allowedBottoms}/>

<SelectL col={3} label="Color" value={it.btClr}  onChange={v=>setItemField(idx,"btClr",v)} options={COLOR_COMMON}/>
      </>
    );
  })()}
</div>

            <div className="grid grid-cols-12 gap-3 mb-3">
  {(() => {
    const ct = normalizeCordType(it.cordType||"");
    const compat = compatFor(it);
    const needs = (ct==="CH" || ct==="STR");
    return (
      <>
        <SelectL id={`row-${idx+1}-cord`} col={4} label="Control"
          value={ct} onChange={v=>{
            setItemField(idx,"cordType",v);
            const nct = normalizeCordType(v);
            if (nct==="CH" || nct==="STR") { /* keep */ }
            else if (nct==="Motor") { setItemField(idx,"cordLenText",""); if(!it.cordSide) setItemField(idx,"cordSide","-"); }
            else { setItemField(idx,"cordSide","-"); setItemField(idx,"cordLenText",""); setItemField(idx,"motorCode",""); }
          }}
                 options={compat.controls}/>
        {needs && (
          <>
            <SelectL id={`row-${idx+1}-lr`} col={4} label="Side"
                     value={it.cordSide || "-"}
                     onChange={v=>setItemField(idx,"cordSide",v)}
                     options={["-","L","R"]}/>
            <InputL id={`row-${idx+1}-len`} col={4}
                    label={`Len (${unit==="mm" ? "mm" : "in"} or H-30)`}
                    value={it.cordLenText || ""}
                    onChange={e=>setItemField(idx,"cordLenText",e.target.value)}
                    placeholder={unit==="mm" ? "e.g., 900 or H-30" : "e.g., 36 or H-30"}/>
          </>
        )}
        {ct==="Motor" ? (
  <>
    <div className="col-span-6 relative group">
      <SelectL
        id={`row-${idx+1}-motor`}
        col={12}
        label="Motor Type"
        value={it.motorCode||""}
        onChange={v=>setItemField(idx,"motorCode",v)}
        options={MOTORS.map(m=>m.code)}
        labels={Object.fromEntries(MOTORS.map(m=>[m.code,m.label]))}
        disabled={!compat.motorOK}
      />
      {!compat.motorOK && (
        <div className="absolute -top-7 left-0 px-2 py-1 text-xs rounded bg-black text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
          {TIP_SHORT /* "Select headrail first" */}
        </div>
      )}
    </div>

    <SelectL
      id={`row-${idx+1}-lr`}
      col={6}
      label="L/R"
      value={it.cordSide || "-"}
      onChange={v=>setItemField(idx,"cordSide",v)}
      options={["-","L","R"]}
      disabled={!compat.motorOK}
    />
  </>
) : null}
      </>
    );
  })()}
</div>

{/* ▼ Mobile: Spring Assist row */}
<div className="grid grid-cols-12 gap-3 mb-3">
  {(() => {
    const ct    = normalizeCordType(it.cordType||"");
    const isMotor = (ct === "Motor");
    const isDuo   = (it.upType === "4FA(Duo)");
    const qty     = isDuo
      ? (it.springAssist ? Math.max(1, Math.min(2, Number(it.springQty)||1)) : 0)
      : (it.springAssist ? 1 : 0);
    const price   = (SPRING_ASSIST_PRICE || 0) * qty;

    if (isMotor) {
      // Motor: 비활성 표시
      return (
        <>
          <div className="col-span-6 opacity-50">
            <div className="text-sm text-gray-600 mb-1">Spring Assist</div>
            <input type="checkbox" className="h-5 w-5 accent-gray-800" checked={!!it.springAssist} disabled />
          </div>
          <div className="col-span-6 opacity-50">
            <div className="text-sm text-gray-600 mb-1">Price</div>
            <div className="px-3 py-2 border rounded bg-gray-50 text-right">
              ${ (0).toFixed(2) }
            </div>
          </div>
        </>
      );
    }

    // 비-Motor
    return (
      <>
        {/* 체크(6) + 가격(6) */}
        <div className="col-span-6">
          <div className="text-sm text-gray-600 mb-1">Spring Assist</div>
          <input
   type="checkbox"
   className="h-5 w-5 accent-gray-800"
   checked={!!it.springAssist}
   onChange={e=>{
     const on = e.target.checked;
     setItemField(idx,"springAssist", on);
     if (isDuo) setItemField(idx,"springQty", on ? (Number(it.springQty)||1) : 0);
   }}
 />
        </div>
        <div className="col-span-6">
          <div className="text-sm text-gray-600 mb-1">Price</div>
          <div className="px-3 py-2 border rounded bg-gray-50 text-right">
            ${ price.toFixed(2) }
          </div>
        </div>

        {/* Duo면 수량 선택(한 줄 더 써도 되고, 아래처럼 같은 줄에서 6칸 써도 됨) */}
        {isDuo && (
          <div className="col-span-12">
            <SelectL
              col={4}
              label="Spring Qty"
              value={String(it.springAssist ? (it.springQty||1) : 0)}
              onChange={v=>{
                const q = Math.max(0, Math.min(2, Number(v)||0));
                setItemField(idx, "springQty", q);
                if (q===0 && it.springAssist) setItemField(idx,"springAssist", false);
                if (q>0 && !it.springAssist) setItemField(idx,"springAssist", true);
              }}
              options={["0","1","2"]}
              labels={{"0":"0","1":"1","2":"2"}}
            />
          </div>
        )}
      </>
    );
  })()}
</div>

            {/* Fabric (mobile, readable 2-line layout) */}
{it.upType !== "4FA(Duo)" ? (
  // ── 일반(비 Duo)
  <div className="grid grid-cols-12 gap-3 mb-3">
    {/* 1행: Category + Fabric */}
    <SelectL id={`row-${idx+1}-category`} col={4} label="Category" value={it.category}
  onChange={v=>setItemField(idx,"category",v)} options={compatFor(it).allowedCats}/>
    <FabricSelect col={8} id={`row-${idx+1}-fabric`}
      item={it}
      setItem={(k,v)=>setItemField(idx,k,v)}
    />

    {/* 2행: Color + Price (MANUAL이면 Color는 입력, Catalog면 ColorSelect) */}
    {it.fabric === "MANUAL" ? (
      <>
        <InputL  col={12} label="Fabric (manual)" value={it.fabricName||""}
          onChange={e=>setItemField(idx,"fabricName",e.target.value)}
        />
        <InputL  col={6} label="Color" value={it.color||""}
          onChange={e=>setItemField(idx,"color",e.target.value)}
        />
        <NumberL col={6} id={`row-${idx+1}-price`} label="Price A ($/sqft)" step="0.1"
          value={it.price||0}
          onChange={v=>setItemField(idx,"price",v)}
        />
      </>
    ) : (
      <>
        <ColorSelect col={6} id={`row-${idx+1}-color`}
          item={it}
          setItem={(k,v)=>setItemField(idx,"color",v)}
        />
        <NumberL col={6} id={`row-${idx+1}-price`} label="Price A ($/sqft)" step="0.1"
          value={it.price||0}
          onChange={v=>setItemField(idx,"price",v)}
          disabled={!isEditableFamily(it.fabric)}
        />
      </>
    )}
  </div>
) : (
  // ── Duo: A/B 각각 두 줄 구성
  <div className="grid grid-cols-12 gap-3 mb-3">
    {/* A 라인 */}
    <div className="col-span-12 grid grid-cols-12 gap-3">
      {/* 1행: Cat A + Fab A */}
      <SelectL id={`row-${idx+1}-category`} col={4} label="Cat A" value={it.category}
  onChange={v=>setItemField(idx,"category",v)} options={compatFor(it).allowedCats}/>
      <FabricSelect col={8} id={`row-${idx+1}-fabricA`}
        item={it}
        setItem={(k,v)=>setItemField(idx,k,v)}
      />

      {/* 2행: Col A + Pri A (MANUAL이면 Color=입력) */}
      {it.fabric === "MANUAL" ? (
        <InputL col={6} label="Col A" value={it.color||""}
          onChange={e=>setItemField(idx,"color",e.target.value)}
        />
      ) : (
        <ColorSelect col={6} id={`row-${idx+1}-colorA`}
          item={it}
          setItem={(k,v)=>setItemField(idx,"color",v)}
        />
      )}
      <NumberL id={`row-${idx+1}-price`} col={6} label="$/A" step="0.1"
        value={it.price||0}
        onChange={v=>setItemField(idx,"price",v)}
        disabled={!isEditableFamily(it.fabric) && it.fabric!=="MANUAL"}
      />
    </div>

    {/* B 라인 */}
    <div className="col-span-12 grid grid-cols-12 gap-3">
      {/* 1행: Cat B + Fab B */}
      <SelectL id={`row-${idx+1}-categoryB`} col={4} label="Cat B" value={it.categoryB}
  onChange={v=>setItemField(idx,"categoryB",v)}
  options={compatFor(it).allowedCats}/>
      <FabricSelect col={8} id={`row-${idx+1}-fabricB`}
        item={{ ...it, category: it.categoryB, fabric: it.fabricB }}
        setItem={(k, v) => {
          const map = { fabric:"fabricB", fabricName:"fabricNameB", price:"priceB", color:"colorB", category:"categoryB" };
          setItemField(idx, map[k] || k, v);
        }}
      />

      {/* 2행: Col B + Pri B (MANUAL이면 Color=입력) */}
      {it.fabricB === "MANUAL" ? (
        <InputL col={6} label="Col B" value={it.colorB||""}
          onChange={e=>setItemField(idx,"colorB",e.target.value)}
        />
      ) : (
        <ColorSelect col={6} id={`row-${idx+1}-colorB`}
          item={{...it, category:it.categoryB, fabric:it.fabricB, color:it.colorB}}
          setItem={(k,v)=>setItemField(idx,"colorB",v)}
        />
      )}
      <NumberL id={`row-${idx+1}-priceB`} col={6} label="$/B" step="0.1"
        value={it.priceB||0}
        onChange={v=>setItemField(idx,"priceB",v)}
        disabled={!isEditableFamily(it.fabricB) && it.fabricB!=="MANUAL"}
      />
    </div>
  </div>
)}

            <div className="grid grid-cols-12 gap-3 mb-3 items-end">
  {/* Side channel */}
  <div className="col-span-6">
    <div className="text-sm text-gray-600 mb-1">Side channel</div>
    <div className="flex items-center gap-3">
      <input type="checkbox" className="cbx-25"
             checked={!!it.sideChannel}
             onChange={e=>setItemField(idx,"sideChannel", e.target.checked)}
             disabled={compatFor(it).sideDisabled}/>
      <div className="px-3 py-2 border rounded bg-gray-50">
        ${(!compatFor(it).sideDisabled && it.sideChannel ? sideChannelPrice(it.hIn) : 0).toFixed(2)}
      </div>
    </div>
  </div>
  {/* NEW: L Channel */}
  <div className="col-span-6">
    <div className="text-sm text-gray-600 mb-1">L Channel</div>
    <div className="flex items-center gap-3">
      <input type="checkbox" className="cbx-25"
             checked={!!it.lChannel}
             onChange={e=>setItemField(idx,"lChannel", e.target.checked)}
             disabled={compatFor(it).lDisabled}/>
      <div className="px-3 py-2 border rounded bg-gray-50">
        ${(!compatFor(it).lDisabled && it.lChannel ? lChannelPrice(it.wIn) : 0).toFixed(2)}
      </div>
    </div>
  </div>
</div>
<div className="grid grid-cols-12 gap-3 mb-3 items-end">
  <NumberL col={3} label="Extra ($)"
           value={it.extra||0} onChange={v=>setItemField(idx,"extra",v)} />
  <InputL  col={9} label="Memo"
           value={it.memo||""} onChange={e=>setItemField(idx,"memo",e.target.value)} />
</div>
          </div> {/* end .md:hidden */}
          {/* Row actions + line total */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded border" onClick={()=>dupRow(idx)}>Duplicate</button>
              {/* Split 버튼: Deck Door* 에서는 비활성 */}
<button
  type="button"
  className={`px-3 py-2 rounded border ${
    String(it.locSpace||"").startsWith("Deck Door")
      ? "opacity-50 cursor-not-allowed border-gray-300 text-gray-400"
      : "border-black text-black hover:bg-black/5"
  }`}
  disabled={String(it.locSpace||"").startsWith("Deck Door")}
  title={String(it.locSpace||"").startsWith("Deck Door") ? "Deck Door에서는 Split 불가" : "Split sections"}
  onClick={()=>{
    if (String(it.locSpace||"").startsWith("Deck Door")) return; // locSpace로 일관화
    const unitNow = header?.unit==="mm" ? "mm" : "in"; // 앱 단위 기반 기본값
    const nextN = clamp(numOr(it.splitN,2),2,7);
    updateItem(idx,{
      uiSplitOpen: !it.uiSplitOpen,
      splitN: nextN,
      splitUnit: it.splitUnit || unitNow,
      // 기존 값 유지, 없으면 0으로 초기화
      splitLens: Array.from({length: clamp(numOr(it.splitN,2),2,7)}, (_,i)=> {
  const cur = it.splitLens?.[i];
  // 기존 값이 있으면 보존, 없으면 빈칸으로
  return (cur === 0 || cur === "" || cur == null) ? "" : cur;}),
      // ft-in 보조 상태도 길이만 맞춰 초기화(있으면 유지)
      splitFtIn: Array.from({length: nextN}, (_,i)=> ({
        ft: it.splitFtIn?.[i]?.ft ?? "",
        in: it.splitFtIn?.[i]?.in ?? "",
        fr: it.splitFtIn?.[i]?.fr ?? "0"
      })),
      // Control(L/R/-) 기본값도 길이에 맞춤
      splitCtrl: Array.from({length: nextN}, (_,i)=> {
        const cur = String(it.splitCtrl?.[i] ?? "-").toUpperCase();
        return (cur==="L" || cur==="R" || cur==="-" ? cur : "-");
      }),
    });
  }}
>
  Split
</button>

              <button className="px-3 py-2 rounded border border-rose-500 text-rose-600 hover:bg-rose-50" onClick={()=>delRow(idx)}>Delete</button>
            </div>

            <div className="ml-auto px-3 py-2 rounded border bg-gray-50 whitespace-nowrap min-w-[320px] text-right">
              {(() => {
                const c = computeLine(it);
                return (
                  <div>
                    <div className="text-xs text-gray-600">
                      Blind: <b>{c.blind.toFixed(2)}</b> · Surcharge: <b>{c.surcharge.toFixed(2)}</b>
                      {c.motor > 0 && <> · Motor: <b>{c.motor.toFixed(2)}</b></>}
                    </div>
                    <div>
                      <span className="mr-1">Line Total:</span> <b>{c.lineTotal.toFixed(2)}</b>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded border" onClick={addRow}>Add row</button>
          <button className="px-4 py-2 rounded border" onClick={onOpenBulk}>Bulk apply</button>
        </div>
      </div>
    </>
  );
}

function AccessoriesRowsEditor({ header, setHeaderField, items }) {
  const rows = Array.isArray(header.accItems) ? header.accItems : [];
  const hasAnyMotor = (items || []).some(it => normalizeCordType(it.cordType) === "Motor");
  const includedChargers = hasAnyMotor ? 1 : 0;

  // ── helpers
  function addRow() {
    const draft = {
      cat: "Motor",                 // 새 UI 필드(계산에는 영향 X)
      type: "Remote",
      detail: "1CH",
      code: "REMOTE_1CH",           // ← 계산용
      qty: 1
    };
    setHeaderField("accItems", [...rows, draft]);
  }
  function updateRow(i, patch) {
    const cur = rows[i] || {};
    const next = rows.map((r, idx) => {
      if (idx !== i) return r;
      const base = { ...cur, ...patch };

      // type/detail 변경 시 code 재계산
      const t = base.type || cur.type;
      const d = base.detail || cur.detail;
      if ("type" in patch || "detail" in patch) {
        base.code = codeFrom(t, d);
        // Remote가 아니면 detail 초기화
        if (t !== "Remote") base.detail = "";
      }
      return base;
    }).filter(r => r && r.code);
    setHeaderField("accItems", next);
  }
  function removeRow(i) {
    setHeaderField("accItems", rows.filter((_, idx) => idx !== i));
  }

  // ── 비용(충전기 포함 1개 무료)
  function lineCost(r) {
    const unit = accPriceOf(r.code);
    if (r.code === "CHARGER") {
      const total = rows.filter(x => x.code === "CHARGER")
                        .reduce((s, x) => s + (Number(x.qty)||0), 0);
      const billable = Math.max(0, total - includedChargers);
      const share = (Number(r.qty)||0) / Math.max(1, total);
      return round2(unit * billable * share);
    }
    return round2(unit * (Number(r.qty)||0));
  }
  const preview = round2(rows.reduce((s,r)=>s+lineCost(r),0));
  const totalChargers = rows.filter(x=>x.code==="CHARGER").reduce((s,x)=>s+(Number(x.qty)||0),0);
  const billableChargers = Math.max(0, totalChargers - includedChargers);

  return (
    <div className="border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Accessories</div>
        <button className="px-3 py-1.5 rounded border" onClick={addRow}>Add row</button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">No accessories. Add a row.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Category</th>
                <th className="p-2">Type</th>
                <th className="p-2">Detail</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Unit</th>
                <th className="p-2">Unit $</th>
                <th className="p-2">Line $</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const unit = accPriceOf(r.code);
                const line = lineCost(r);
                const type = r.type || (r.code?.startsWith("REMOTE") ? "Remote" : (r.code==="CHARGER"?"Charger":"Hub"));
                const detail = r.detail || (r.code?.startsWith("REMOTE_") ? r.code.replace("REMOTE_","") : "");
                return (
                  <tr key={i} className="border-b">
                    {/* Category */}
                    <td className="p-2">
                      <select
                        className="border rounded px-2 py-1"
                        value={r.cat || "Motor"}
                        onChange={e=>updateRow(i,{ cat:e.target.value })}
                      >
                        {ACC_CAT_OPTS.map(x=><option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>

                    {/* Type */}
                    <td className="p-2">
                      <select
                        className="border rounded px-2 py-1"
                        value={type}
                        onChange={e=>{
                          const nt = e.target.value;
                          const nd = nt==="Remote" ? (detail || "1CH") : "";
                          updateRow(i, { type: nt, detail: nd }); // code 자동 재계산됨
                        }}
                      >
                        {ACC_TYPE_OPTS.map(x=><option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>

                    {/* 세부종류 (Remote일 때만) */}
                    <td className="p-2">
                      {type==="Remote" ? (
                        <select
                          className="border rounded px-2 py-1"
                          value={detail || "1CH"}
                          onChange={e=>updateRow(i,{ detail:e.target.value })}
                        >
                          {REMOTE_DETAIL_OPTS.map(x=><option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : (
                        <div className="text-gray-400">-</div>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        className="w-20 border rounded px-2 py-1 text-right"
                        value={Number(r.qty)||0}
                        onChange={e=>updateRow(i,{ qty: e.target.value===""?0:Number(e.target.value) })}
                      />
                    </td>

                    {/* Unit / $ / Line $ */}
                    <td className="p-2">{accUnitOf(r.code)}</td>
                    <td className="p-2">${unit.toFixed(2)}</td>
                    <td className="p-2 font-medium">${line.toFixed(2)}</td>

                    <td className="p-2">
                      <button className="px-2 py-1 rounded border border-rose-500 text-rose-600 hover:bg-rose-50" onClick={()=>removeRow(i)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 하단 안내/요약 */}
      <div className="mt-2 text-xs text-gray-600">
        {hasAnyMotor
          ? <>Chargers: included <b>{includedChargers}</b> · billable <b>{billableChargers}</b></>
          : <>Chargers: included <b>0</b> · billable <b>{totalChargers}</b></>}
      </div>
      <div className="mt-1 text-right text-sm tabular-nums">
        Accessories preview: <b>${preview.toFixed(2)}</b>
      </div>
    </div>
  );
}

/* Measure Review / Totals subcomponent (A안: 표 아래 정리) */
function MeasureReviewTotals({ header, items, totals, setHeaderField, onSaveLocal, role, saveAsTemplate }) {
  const [memoOpen, setMemoOpen] = React.useState(false);
  const [showExcluded, setShowExcluded] = React.useState(false);

  const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const feesSum = (Number(header.installFee || 0) + Number(header.extraFee || 0));
  const acc = totals.accessoriesBreakdown || { remoteCost: 0, chargerCost: 0, chargerIncluded: 0, chargerBillable: 0 };
  const hasDuo = items.some(it => it.upType === "4FA(Duo)");
  const numCls   = NUM;
  const grandCls = NUM_GRAND;

  // Accessories 요약 텍스트(텍스트만, 아이콘 X)
const accessoriesNote = (() => {
  const items = Array.isArray(header.accItems) ? header.accItems : [];
  if (!items.length) return "No accessories";
  return items.map(r => `${r.code} ×${r.qty}`).join(" · ");
})();

  return (
    <div className="border rounded-2xl p-4">
      {/* ── 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-lg font-semibold">Review</div>
        <div className="flex items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4"
               checked={showExcluded}
               onChange={e=>setShowExcluded(e.target.checked)} />
        <span>Show excluded</span>
      </label>
      <span className="text-gray-500">Review excluded lines before saving</span>
    </div>
      </div>

      {/* ── 표 그대로 노출 */}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left bg-gray-50">
  <tr>
    <th className="p-2">No</th>
    <th className="p-2">Loc</th>
    <th className="p-2">Fab</th>
    <th className="p-2">MT</th>
    <th className="p-2">HR</th>
    <th className="p-2">BT</th>
    <th className="p-2">Ctrl</th>
    <th className="p-2">L/R</th>
    <th className="p-2">Len</th>
    <th className="p-2">W(mm)</th>
    <th className="p-2">H(mm)</th>
    <th className="p-2">Sqft</th>
    {/* 듀오 여부에 따라 $/Sqft or A/B */}
    {!hasDuo ? (
      <th className="p-2">$/Sqft</th>
    ) : (
      <>
        <th className="p-2">$/Sqft A</th>
        <th className="p-2">$/Sqft B</th>
      </>
    )}
    <th className="p-2">BLIND</th>
    <th className="p-2">SUR</th>
    <th className="p-2">MOT</th>
    <th className="p-2">LINE</th>
  </tr>
</thead>
          <tbody>
            {(showExcluded ? items : items.filter(r=>r?.include!==false)).map((it,i)=>{
              const excluded = it?.include === false;
              const c = computeLine(it);
              const fabricNo = canonicalFabricNo(it);
              return (
                <tr key={i}
        className={`border-b ${excluded ? "bg-gray-100 text-gray-400" : ""}`}>
                  <td className="p-2">{i+1}</td>
                  <td className="p-2">{titleOf(it)||"Location"}</td>
                  <td className="p-2">{fabricNo}</td>
                  <td className="p-2">{it.install||""}</td>
                  <td className="p-2">{it.upType ? `${it.upType} ${it.upClr}` : ""}</td>
                  <td className="p-2">{it.btType ? `${it.btType} ${it.btClr}` : ""}</td>
                  <td className="p-2">{normalizeCordType(it.cordType||"")}</td>
                  <td className="p-2">{lrValue(it)}</td>
                  <td className="p-2">{lenValue(it)}</td>
                  <td className="p-2">{mm1FromIn(it.wIn).toFixed(1)}</td>
                  <td className="p-2">{mm1FromIn(it.hIn).toFixed(1)}</td>
                  <td className="p-2">{c.sqft}</td>
                  {!hasDuo ? (
  <td className="p-2">{excluded ? "-" : Number(it.price || 0).toFixed(2)}</td>
) : (
  <>
    <td className="p-2">{excluded ? "-" : Number(it.price || 0).toFixed(2)}</td>
          <td className="p-2">{excluded ? "-" : (it.upType==="4FA(Duo)" ? Number(it.priceB||0).toFixed(2) : "-")}</td>
  </>
)}
                  <td className="p-2">{excluded ? "-" : fmt(c.blind)}</td>
      <td className="p-2">{excluded ? "-" : fmt(c.surcharge)}</td>
      <td className="p-2">{excluded ? "-" : (c.motor?fmt(c.motor):"-")}</td>
      <td className="p-2 font-semibold">{excluded ? "-" : fmt(c.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
                {/* ---- Split summary list (each blind, one extra line) ---- */}
        {items.some(it => Array.isArray(it.splitLens) && it.splitLens.some(n => Number(n) > 0)) && (
          <div className="mt-2 mb-2 text-[11px] text-gray-700 px-2">
            {items.map((it, i) => {
              const info = buildSplitSummary(it, header?.unit);
              if (!info) return null;

              const pieces = info.labels
                .map((lab, idx) => {
                  const len = info.lensTexts[idx];
                  if (!len) return "";
                  const ctrl = (info.ctrls?.[idx] || "").toUpperCase();
                  const ctrlText = (ctrl === "L" || ctrl === "R") ? ` (${ctrl})` : "";
                  return `${lab} ${len}${ctrlText}`;
                })
                .filter(Boolean);

              if (!pieces.length) return null;

              const title =
                `${it.area || ""} ${it.space || ""} ${it.detail || ""}`.trim() || `#${i + 1}`;

              return (
                <div key={`split-summary-${i}`}>
                  <span className="font-semibold">{title}</span>
                  <span className="ml-1">
                    · Split ({info.unit}): {pieces.join(" / ")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {/* Total Sqft footer */}
      {SHOW_SQFT_FOOTER && (
        <div className="mt-2 text-right text-sm tabular-nums">
          {(() => {
            const rows = (items || []).filter(r => r?.include === true);
            const sumSqft = rows.reduce((s, it) => s + computeLine(it).sqft, 0);
            return <>Total Sqft: <b>{sumSqft}</b></>;
          })()}
        </div>
      )}
      </div>

      {/* ── Adjustments Bar : 항상 노출 */}
      <div className="mt-4 grid grid-cols-12 gap-3 items-end">
        {/* Discount % */}
<div className="col-span-12 md:col-span-2">
  <div className="text-sm text-gray-600 mb-1">Discount %</div>
  <input
    type="number"
    className="w-full border rounded px-3 py-2"
    value={asInputValue(header.discountPct)}
    placeholder="0"
    onFocus={selectAll}
    onChange={(e) =>
      setHeaderField("discountPct", e.target.value === "" ? 0 : Number(e.target.value))
    }
  />
</div>

        {/* Install / Extra */}
    <NumberL
     col={2}
     label="Install Fee ($)"
     value={header.installFee || 0}
     onChange={(v)=>setHeaderField("installFee", v)}
     step="1"
    />
    <NumberL
      col={2}
      label="Extra Fee ($)"
      value={header.extraFee || 0}
     onChange={(v)=>setHeaderField("extraFee", v)}
      step="1"
    />

        {/* 메모 요약/토글 */}
        <div className="col-span-12 md:col-span-3">
          <div className="text-sm text-gray-600 mb-1">Memo (job)</div>
          <button
            className="w-full border rounded px-3 py-2 text-left hover:bg-gray-50"
            onClick={()=>setMemoOpen(v=>!v)}
            title="Toggle memo editor"
          >
            {(header.memo || "").trim() ? (header.memo.trim().slice(0, 50) + (header.memo.trim().length > 50 ? "…" : "")) : "메모 없음 (클릭하여 입력)"}
          </button>
        </div>
      </div>

      {/* 메모 확장 패널 */}
      {memoOpen && (
        <div className="mt-3">
          <textarea
            className="w-full border rounded px-3 py-2"
            rows={4}
            value={header.memo || ""}
            onChange={(e)=>setHeaderField("memo", e.target.value)}
            placeholder="현장/설치 특이사항 등"
          />
        </div>
      )}

      {/* ── Totals + Accessories(왼쪽) */}
<div className="mt-4 grid grid-cols-12 gap-3">
  {/* ← 왼쪽: 악세서리 Add-row 에디터 */}
<div className="col-span-12 md:col-span-8">
  <AccessoriesRowsEditor
    header={header}
    setHeaderField={setHeaderField}
    items={items}
  />
</div>

  {/* → 오른쪽: Totals 카드 (아래 3번에서 내용 교체) */}
  <div className="col-span-12 md:col-span-4">
    <div className="rounded-xl border p-4 bg-gray-50">
  {/* 금액들: 라벨/값 2열 그리드, 컴팩트 */}
  {/** 5자리(11111.11) 1줄, 초과는 줄바꿈 */}
  <div className="grid [grid-template-columns:minmax(120px,1fr)_max-content] gap-y-1 gap-x-3 items-center">
    <div className="text-right pr-3">Blind</div>
    <div className={numCls}>{fmt(totals.blind)}</div>

    <div className="text-right pr-3">Surcharge</div>
    <div className={numCls}>{fmt(totals.sub)}</div>

    {/* 구분선은 한 줄만 */}
    <div className="col-span-2 my-1 border-t border-gray-200" />

    <div className="text-right pr-3 whitespace-nowrap">Subtotal</div>
    <div className={numCls}>{fmt(totals.subtotal)}</div>

    <div className="text-right pr-3 whitespace-nowrap">Discount</div>
    <div className={numCls}>− {fmt(totals.discount)}</div>

    <div className="text-right pr-3 whitespace-nowrap">Fees (Install+Extra)</div>
    <div className={numCls}>{fmt(Number(header.installFee||0)+Number(header.extraFee||0))}</div>

    <div className="text-right pr-3">Motor</div>
    <div className={numCls}>{fmt(totals.motor)}</div>

    <div className="text-right pr-3">Accessories</div>
    <div className={numCls}>{fmt(totals.accessories)}</div>

    <div className="col-span-2 my-1 border-t border-gray-200" />

    <div className="text-right pr-3 text-lg font-bold">Total</div>
    <div className={grandCls}>{fmt(totals.grand)}</div>
    {/* Total(+tax) = GRAND * 1.05 */}
    <div className="text-right pr-3 text-lg font-bold">Total(+tax)</div>
    <div className={grandCls}>{fmt(round2((Number(totals.grand)||0) * 1.05))}</div>
  </div>
</div>
  </div>
</div>
    {/* Actions */}
    <div className="mt-3 flex justify-end gap-2">
      <button
    className="px-3 py-1.5 rounded-lg border bg-black text-white hover:bg-gray-900"
    onClick={onSaveLocal}
    title="Save to local drafts (브라우저)"
  >
    Save to Drafts
  </button>

      {role === "admin" && (
        <button
  className="px-3 py-1.5 rounded-lg border text-gray-600 border-gray-300 hover:bg-gray-50"
  onClick={saveAsTemplate}
  title="Save as Template (Supabase)"
>
  Save as Template
</button>
      )}
    </div>
    </div>
  );
}

/* ===== Bulk Apply ===== */

/** "1-8,10,12-15" → [0,1,2,...] 인덱스 배열 */
function parseRowSpec(spec, max){
  const set=new Set();
  const s=String(spec||"").replace(/\s/g,"");
  if(!s){ return []; }
  for(const part of s.split(",")){
    if(!part) continue;
    const m=/^(\d+)(?:-(\d+))?$/.exec(part);
    if(!m) continue;
    let a=Math.max(1,Math.min(max,parseInt(m[1],10)));
    let b=m[2]?Math.max(1,Math.min(max,parseInt(m[2],10))):a;
    if(a>b) [a,b]=[b,a];
    for(let n=a;n<=b;n++) set.add(n-1);
  }
  return Array.from(set).sort((x,y)=>x-y);
}

/** 선택한 카테고리/패밀리에서 price와 color 목록을 얻기 */
function findFamily(category, familyName){
  const fams=fabricFamiliesFor(category);
  return fams.find(f=>f.name===familyName)||null;
}

/** 모달 */
function BulkApplyModal({ items, onClose, updateItem }){
  const [rowsSpec, setRowsSpec] = React.useState(items.length?`1-${items.length}`:"");
  const idxs = parseRowSpec(rowsSpec, items.length);

  // 적용 스위치
  const [applyHR, setApplyHR]   = React.useState(false);
  const [applyBT, setApplyBT]   = React.useState(false);
  const [applyFabA, setApplyFabA] = React.useState(true);   // 기본: A 적용 ON
  const [applyFabB, setApplyFabB] = React.useState(false);  // 기본: B 적용 OFF
  // 선택된 행들 중 Duo 유무(행 선택이 바뀔 때마다 계산)
const hasDuo = React.useMemo(
  () => idxs.some(i => (items[i]?.upType === "4FA(Duo)")),
  [idxs, items]
);

  // HR
  const [hrType, setHrType]   = React.useState("SL");
  const [hrClr,  setHrClr]    = React.useState("01");

  // Bottom
  const [btType, setBtType]   = React.useState("OP");
  const [btClr,  setBtClr]    = React.useState("01");

  // Fabric(A)
const [cat, setCat] = React.useState("Roller"); // Dual | Roller

// 카테고리별 패밀리 가져와서 "표시 라벨(약칭)" 생성
const families = fabricFamiliesFor(cat);

// Family 셀렉트용 원문/라벨
const { options: famOptions, labels: famLabels } = buildFamilyOptionsForDisplay(families);

// 선택된 패밀리 (저장값은 원문 fam.name)
const [fam, setFam] = React.useState(famOptions[0] || "");
React.useEffect(() => {
  const fs = fabricFamiliesFor(cat);
  const { options } = buildFamilyOptionsForDisplay(fs);
  setFam(options[0] || "");
}, [cat]);

// 선택된 Family 객체
const famObj = families.find(f => f.name === fam);

// 세일즈 숨김 + 숫자 오름차순 정렬 + 표시라벨 생성
const { options: colorOptions, labels: colorLabels } = famObj
  ? buildColorOptionsForDisplay(famObj.codes || [])
  : { options: [], labels: {} };

const [col, setCol] = React.useState(""); // 선택 컬러(저장값은 원문)
React.useEffect(() => { setCol(colorOptions[0] || ""); }, [fam, colorOptions.length]);

  // MANUAL 지원(필요시)
  const isManual = fam==="MANUAL";
  const [manualName, setManualName] = React.useState("");
  const [manualColor,setManualColor]= React.useState("");
  const [manualPrice,setManualPrice]= React.useState(0);

  function applyNow(){
  if(!idxs.length){ alert("Rows is empty."); return; }

  for(const idx of idxs){
    const patch = {};
    const row = items[idx] || {};

    // HR
    if(applyHR){
      patch.upType = hrType;
      patch.upClr  = hrClr;
    }
    // Bottom
    if(applyBT){
      patch.btType = btType;
      patch.btClr  = btClr;
    }

    // ── 공통 준비: 선택된 Fabric 정보
    const usingManual = (fam === "MANUAL");
    let selPrice = 0;
    if(!usingManual){
      const f = findFamily(cat, fam);               // 이미 있는 헬퍼 그대로 사용
      selPrice = (f && f.price!=null) ? Number(f.price)||0 : 0;
    }else{
      selPrice = Number(manualPrice)||0;
    }

    // ── A 적용
    if(applyFabA){
      patch.category = cat;
      if(usingManual){
        patch.fabric     = "MANUAL";
        patch.fabricName = manualName || "";
        patch.color      = manualColor || "";
        patch.price      = selPrice;
      }else{
        patch.fabric     = fam;
        patch.fabricName = "";
        patch.color      = col || "";
        patch.price      = selPrice;
      }
    }

    // ── B 적용 (Duo 행에서만)
    if(applyFabB && row.upType === "4FA(Duo)"){
      patch.categoryB = cat;
      if(usingManual){
        patch.fabricB     = "MANUAL";
        patch.fabricNameB = manualName || "";
        patch.colorB      = manualColor || "";
        patch.priceB      = selPrice;
      }else{
        patch.fabricB     = fam;
        patch.fabricNameB = "";
        patch.colorB      = col || "";
        patch.priceB      = selPrice;
      }
    }

    // 행 업데이트 (기존과 동일: 내부에서 호환성 교정/검증 처리)
    updateItem(idx, patch);
  }
  onClose();
}

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 w-full max-w-2xl" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Bulk apply</div>
          <button className="px-3 py-1.5 rounded border" onClick={onClose}>Close</button>
        </div>

        {/* Row 선택 */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-9">
            <div className="text-sm text-gray-600 mb-1">Rows (e.g., 1-8,10,12-15)</div>
            <input className="w-full border rounded px-3 py-2" value={rowsSpec} onChange={e=>setRowsSpec(e.target.value)} />
          </div>
          <div className="col-span-3">
            <div className="text-sm text-gray-600 mb-1 invisible">.</div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded border" onClick={()=>setRowsSpec(items.length?`1-${items.length}`:"")}>All</button>
              <button className="px-3 py-2 rounded border" onClick={()=>setRowsSpec("")}>Clear</button>
            </div>
            <div className="mt-2 text-xs text-gray-600">Selected: <b>{idxs.length}</b> rows</div>
          </div>
        </div>

        {/* Fabric (A/B) */}
<div className="grid grid-cols-12 gap-3 mb-3">
  {/* 체크박스 줄 */}
  <div className="col-span-12 flex items-center gap-6 text-sm">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={applyFabA}
        onChange={e=>setApplyFabA(e.target.checked)}
      />
      <span>Fabric</span>
    </label>

    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={applyFabB}
        onChange={e=>setApplyFabB(e.target.checked)}
        disabled={!hasDuo}  // 선택된 행 중 Duo가 없으면 B 적용 불가
        title={!hasDuo ? "선택된 행 중 Duo가 없습니다 (B 적용은 Duo 행에만 가능)" : ""}
      />
      <span>Fabric B (If HR : Duo)</span>
    </label>
  </div>

  {/* Category */}
  <div className="col-span-4">
    <div className="text-sm text-gray-600 mb-1">Category</div>
    <select
      className="w-full border rounded px-3 py-2"
      value={cat}
      onChange={e=>setCat(e.target.value)}
      disabled={!applyFabA && !applyFabB}
    >
      {["Dual","Roller"].map(x => (
        <option key={x} value={x}>{x}</option>
      ))}
    </select>
  </div>

  {/* Family */}
  <div className="col-span-4">
    <div className="text-sm text-gray-600 mb-1">Family</div>
    <select
  className="w-full border rounded px-3 py-2"
  value={fam}
  onChange={e=>setFam(e.target.value)}
  disabled={!applyFabA && !applyFabB}
>
  {famOptions.map(opt => (
    <option key={opt} value={opt}>
      {opt === "MANUAL" ? "Manual input" : (famLabels[opt] || opt)}
    </option>
  ))}
</select>
  </div>

  {/* Color or MANUAL inputs */}
  {!isManual ? (
    <div className="col-span-4">
      <div className="text-sm text-gray-600 mb-1">Color</div>
      <select
        className="w-full border rounded px-3 py-2"
        value={col}
        onChange={e=>setCol(e.target.value)}
        disabled={!applyFabA && !applyFabB}
      >
        {colorOptions.map(code => (
          <option key={code} value={code}>
            {colorLabels[code] || code}
          </option>
        ))}
      </select>
    </div>
  ) : (
    <>
      <div className="col-span-4">
        <div className="text-sm text-gray-600 mb-1">Fabric (manual)</div>
        <input
          className="w-full border rounded px-3 py-2"
          value={manualName}
          onChange={e=>setManualName(e.target.value)}
          disabled={!applyFabA && !applyFabB}
        />
      </div>
      <div className="col-span-4">
        <div className="text-sm text-gray-600 mb-1">Color</div>
        <input
          className="w-full border rounded px-3 py-2"
          value={manualColor}
          onChange={e=>setManualColor(e.target.value)}
          disabled={!applyFabA && !applyFabB}
        />
      </div>
      <div className="col-span-4">
        <div className="text-sm text-gray-600 mb-1">Price ($/sqft)</div>
        <input
          type="number"
          step="0.1"
          className="w-full border rounded px-3 py-2"
          value={manualPrice}
          onChange={e=>setManualPrice(e.target.value)}
          disabled={!applyFabA && !applyFabB}
        />
      </div>
    </>
  )}
</div>

        {/* HR & Bottom */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          <label className="col-span-12 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={applyHR} onChange={e=>setApplyHR(e.target.checked)} />
            <span>Headrail</span>
          </label>
          <div className="col-span-6">
            <div className="text-sm text-gray-600 mb-1">Headrail</div>
            <select className="w-full border rounded px-3 py-2" value={hrType} onChange={e=>setHrType(e.target.value)} disabled={!applyHR}>
              {HEADRAIL_OPTS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="col-span-6">
            <div className="text-sm text-gray-600 mb-1">HR Color</div>
            <select className="w-full border rounded px-3 py-2" value={hrClr} onChange={e=>setHrClr(e.target.value)} disabled={!applyHR}>
              {COLOR_COMMON.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <label className="col-span-12 flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" className="h-4 w-4" checked={applyBT} onChange={e=>setApplyBT(e.target.checked)} />
            <span>Bottom</span>
          </label>
          <div className="col-span-6">
            <div className="text-sm text-gray-600 mb-1">Bottom</div>
            <select className="w-full border rounded px-3 py-2" value={btType} onChange={e=>setBtType(e.target.value)} disabled={!applyBT}>
              {BOTTOM_TYPES.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="col-span-6">
            <div className="text-sm text-gray-600 mb-1">BT Color</div>
            <select className="w-full border rounded px-3 py-2" value={btClr} onChange={e=>setBtClr(e.target.value)} disabled={!applyBT}>
              {COLOR_COMMON.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="text-right">
          <button className="px-4 py-2 rounded-lg bg-black text-white" onClick={applyNow}>Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Measure (FULL) ---------------- */
function Measure({ toast }){
  const [bulkOpen, setBulkOpen] = useState(false); 
  const [header,setHeader]=useState(blankHeader());
  const [items,setItems]=useState([blankItem()]);
  useEffect(() => {
  persistMeasure(header, items);
}, [header, items]);
  const [hydrated,setHydrated]=useState(false);
  const [undoSnap, setUndoSnap] = useState(null);

  // Measure 컴포넌트 내부, state 만든 뒤 한 번만 실행
useEffect(()=>{
  const saved = getSS(LS_MEASURE_AUTO, null);
  if (saved?.header && saved?.items) {
    setHeader(saved.header);
    setItems((saved.items||[]).map(normalizeItem));
  }
},[]);

useEffect(()=>{
  persistMeasure(header, items);
}, [header, items]);

  /* === Accessories UX helper: 모터 있으면 충전기 최소 1개 === */
  const role = (getLS(LS_AUTH,null)?.role) || "worker";

  // Template context
  const [currentTplId, setCurrentTplId] = useState(null);
  const [currentTplMeta, setCurrentTplMeta] = useState(null); // { name, note }

  // Drafts/Admin에서 이벤트로 주입 → 로드
  useEffect(()=>{
    function onLoad(e){
      const d = e.detail || {};
      const h = d.header || {};
      const itms = (d.items||[]).map(normalizeItem);

      const va = String(h.visitAt||"");
      const fixed = va.includes("T") ? va : va.replace(" ", "T");
      setHeader(prev=>({ ...prev, ...h, visitAt: fixed || nowLocalForInput() }));
      setItems(itms);

      if(d.__tplId){
        setCurrentTplId(d.__tplId);
        setCurrentTplMeta({ name: d.__tplName || "", note: d.__tplNote || "" });
      }else{
        setCurrentTplId(null);
        setCurrentTplMeta(null);
      }

      try{
        const saved = va.includes("T") ? va : va.replace(" ", "T");
        const finalVisit = saved || nowLocalForInput();
        setSS(LS_MEASURE_AUTO, { header: { ...h, visitAt: finalVisit }, items: itms, ts: Date.now() });
      }catch{}

      toast.ok("Loaded.");
    }
    document.addEventListener("winco_load_measure", onLoad);
    return ()=>document.removeEventListener("winco_load_measure", onLoad);
  },[]);

  // Templates UI state
  const [tplOpen, setTplOpen] = useState(false);
 const [tplList, setTplList] = useState([]);
 const [tplBusy, setTplBusy] = useState(false);
 const [useNowOnLoad, setUseNowOnLoad] = useState(true); // ⟵ 기본 ON 추천

  async function openTemplateList(){
    if(!SUPA_ON){ toast.err("Templates need Supabase config."); return; }
    setTplBusy(true);
    try{
      const rows = await supaFetchTemplates();
      setTplList(rows||[]);
      setTplOpen(true);
    }catch{ toast.err("Failed to fetch templates."); }
    setTplBusy(false);
  }

  async function saveAsTemplate(){
    if(role!=="admin"){ toast.err("Only admin can save templates."); return; }
    if(!SUPA_ON){ toast.err("Supabase config required."); return; }

    let mode = "new";
    let id   = undefined;
    let name = header.title?.trim() || currentTplMeta?.name || "Untitled";
    let note = currentTplMeta?.note || "";

    if(currentTplId){
      const ok = confirm("Overwrite the currently loaded template?\n취소 = Save as new template");
      if(ok){ mode="overwrite"; id=currentTplId; }
    }

    if(mode==="new"){
      const input = prompt("Template name?", name);
      if(!input) return;
      name = input.trim();
    }

    try{
      await supaUpsertTemplate({ id, name, note, payload:{ header, items } });
      toast.ok(mode==="overwrite" ? "Template updated." : "Template saved.");
      if(mode==="new"){
        setCurrentTplId(null);
        setCurrentTplMeta({ name, note });
      }
    }catch{ toast.err("Save failed."); }
  }

  function applyTemplate(t){
    if(!t?.payload) return;
    const h = t.payload.header || {};
    const its = (t.payload.items||[]).map(normalizeItem);
    const va = String(h.visitAt||"");
    const saved = va.includes("T") ? va : va.replace(" ", "T");
    const finalVisit = useNowOnLoad ? nowLocalForInput() : (saved || nowLocalForInput());
    setHeader(prev=>({ ...prev, ...h, visitAt: finalVisit }));
    setItems(its);

    setCurrentTplId(t.id || null);
    setCurrentTplMeta({ name: t.name || "", note: t.note || "" });

    try{
   setSS(LS_MEASURE_AUTO, {
     header: { ...h, visitAt: finalVisit },
     items: its,
     ts: Date.now()
   });
 }catch{}
    setTplOpen(false);
    toast.ok("Template loaded.");
  }

  function clearAll(){
    setUndoSnap({ header, items });
    setHeader(blankHeader());
    setItems([blankItem()]);
    setCurrentTplId(null);
    setCurrentTplMeta(null);
    try { setSS(LS_MEASURE_AUTO, null); } catch {}
    toast.ok("Cleared.");
  }
  function undoClear(){
    if(!undoSnap) return;
    setHeader(undoSnap.header);
    setItems((undoSnap.items||[]).map(normalizeItem));
    setUndoSnap(null);
    toast.ok("Restored.");
  }

  // auto restore
  useEffect(()=>{
    const saved=getSS(LS_MEASURE_AUTO,null);
    if(saved && typeof saved==="object"){
      if(saved.header){
        const h=saved.header;
        const va=String(h.visitAt||"");
        const fixed = va.includes("T") ? va : va.replace(" ", "T");
        setHeader(prev=>({ ...prev, ...h, visitAt: fixed || nowLocalForInput() }));
      }
      if(Array.isArray(saved.items) && saved.items.length>0) setItems(saved.items.map(normalizeItem));
    }
    setHydrated(true);
  },[]);
  useEffect(()=>{
  if(!hydrated) return;
 try {
   setSS(LS_MEASURE_AUTO, { header, items, ts: Date.now() });
 } catch {}
},[hydrated, header, items]);

  const totals = useMemo(
   () => computeTotals(items, header.discountPct, header),
   [
     items,
     header.discountPct,
     header.installFee,
     header.extraFee,
     header.accRemoteType,
     header.accRemoteQty,
     header.accChargerQty,
     header.accItems              // ← 추가
   ]
 );
  function setHeaderField(k,v){ setHeader(h=>({...h,[k]:v})); }

  function updateItem(idx, patch){
  setItems(prev=>{
    const arr=[...prev];
    const draft = { ...arr[idx], ...patch };
    const { next } = resolveItem(draft); // 자동 교정
    arr[idx] = next;

    // ▼ Deck Door 페어 동기화 (반대편 줄 보정)
    if (next.deckPairId){
      const pairIdx = arr.findIndex((x,i)=> i!==idx && x.deckPairId===next.deckPairId);
      if (pairIdx>=0){
        const other={...arr[pairIdx]};
        // H 보정
        if ("hIn" in patch) other.hIn = next.hIn;
        // Total W 보정 → 합폭 유지
        if ("deckTotalIn" in patch){
          other.deckTotalIn = next.deckTotalIn;
          if (next.deckTotalIn > 0){
            other.wIn = Math.max(0, round2((next.deckTotalIn||0) - (next.wIn||0)));
          }
        }
        if ("wIn" in patch && next.deckTotalIn > 0){
          other.wIn = Math.max(0, round2((next.deckTotalIn||0) - (next.wIn||0)));
        }
        arr[pairIdx]=other;
      }
    }
    return arr;
  });
}

  function setItemField(idx, key, val) {
    // --- Deck Door 트리거 (가장 먼저 처리) ---
  if (key === "locSpace") {
    // 값이 "Deck Door"일 때: 2행 분할
    if (val === "Deck Door") {
      setItems(prev => {
        const arr = [...prev];
        const cur = arr[idx];
        // 이미 페어면 양쪽 업데이트만
        if (cur.deckPairId) {
          const pid = cur.deckPairId;
          const mateIdx = arr.findIndex((x,i)=> i!==idx && x.deckPairId===pid);
          arr[idx] = { ...arr[idx], locSpace: val };
          if (mateIdx >= 0) arr[mateIdx] = { ...arr[mateIdx], locSpace: val };
          return arr;
        }
        // 단일행 → [L,R] 2행으로
        const [L, R] = createDeckPairFrom({ ...cur, locSpace: val });
        arr.splice(idx, 1, L, R);
        return arr;
      });
      return;
    }

    // Deck Door 해제: 페어 → 단일행으로 병합
    setItems(prev => {
      const arr = [...prev];
      const cur = arr[idx];
      if (!cur.deckPairId) {
        arr[idx] = { ...cur, locSpace: val };
        return arr;
      }
      const pid = cur.deckPairId;
      const aIdx = arr.findIndex(x => x.deckPairId === pid);
      const bIdx = arr.findIndex((x,i) => i !== aIdx && x.deckPairId === pid);

      // 기준행 하나만 남기고 deck 관련 필드 제거
      const base = {
        ...arr[aIdx],
        locSpace: val,
        deckPairId: null,
        deckRole: null,
        deckTotalIn: "",
        locDetail: "",
      };
      // 두 행 중 앞쪽 인덱스를 기준으로 정리
      const first = Math.min(aIdx, bIdx);
      const second = Math.max(aIdx, bIdx);
      if (second >= 0) arr.splice(second, 1); // 두 번째 제거
      if (first >= 0)  arr.splice(first, 1, base); // 첫 번째 교체
      return arr;
    });
    return;
  }
    // 카테고리 바뀌면 Fabric/Color/Price 리셋 (되돌리기 문제 해결)
 if (key === "category") {
   updateItem(idx, { category: val, fabric:"", fabricName:"", color:"", price:0 });
   return;
 }
 if (key === "categoryB") {
   updateItem(idx, { categoryB: val, fabricB:"", fabricNameB:"", colorB:"", priceB:0 });
   return;
 }
  // cordType은 CH/STR만 Side/Len을 쓰고, Motor는 Len 금지
  if (key === "cordType") {
    const nv = normalizeCordType(val);
    const needsSideLen = (nv === "CH" || nv === "STR");
    const patch = needsSideLen
      ? { cordType: nv }
      : (nv === "Motor"
          ? { cordType: nv, cordLenText: "" }       // Motor: Len 비움, L/R은 유지
          : { cordType: nv, cordSide: "-", cordLenText: "" }); // 나머지: 둘 다 비움
    updateItem(idx, patch);

      // ★ 추가: Motor면 스프링 비활성(수량 0)
  if (nv === "Motor") {
    setItems(prev => {
      const arr = [...prev];
      const it  = { ...arr[idx] };
      it.springAssist = false;
      it.springQty    = 0;     // 계산상 0개로 명확화
      arr[idx] = it;
      return arr;
    });
  }
    return;
  }

  // Headrail/Category/Bottom 변경은 resolveItem이 교정 처리
  if (key === "upType" || key === "category" || key === "btType") {
    updateItem(idx, { [key]: val });
      // ★ 추가: Duo 여부에 따라 springQty 정리
  setItems(prev => {
    const arr = [...prev];
    const it  = { ...arr[idx] };

    if (val === "4FA(Duo)") {
      // Duo인데 체크되어 있고 수량이 비어있거나 0이면 1로 기본 세팅
      if (it.springAssist && !Number(it.springQty)) it.springQty = 1;
    } else {
      // Duo가 아니면 수량 필드는 숨길 거라 깔끔히 비움
      it.springQty = null;
    }

    arr[idx] = it;
    return arr;
  });

    return;
  }

  // 치수/설치/기타 일반 필드
  if (key === "wIn" || key === "hIn" || key === "install" ||
      key === "motorCode" || key === "cordSide" || key === "cordLenText" ||
      key === "springAssist" || key === "sideChannel" || key === "lChannel" ||
      key === "extra" || key === "memo" || key === "include" ||
      key === "locArea" || key === "locAreaText" || key === "locSpace" ||
      key === "locSpaceText" || key === "locDetail" ||
      key === "upClr" || key === "btClr") {
    updateItem(idx, { [key]: val });
    return;
  }

  // Fabric A/B 관련 (MeasureItemsBlock에서 map으로 넘기는 케이스 포함)
  if (key === "categoryB" || key === "fabricB" || key === "fabricNameB" ||
      key === "colorB" || key === "priceB") {
    updateItem(idx, { [key]: val });
    return;
  }

  // Fabric A
  if (key === "fabric" || key === "fabricName" || key === "color" || key === "price") {
    updateItem(idx, { [key]: val });
    return;
  }

  // 그 외 키도 안전하게 반영
  updateItem(idx, { [key]: val });
}

  function addRow(){ setItems(a=>[...a, blankItem()]); }
  function delRow(i){
    setItems(a=>{
      if(a.length<=1) return a;
      const tgt=a[i];
      if(tgt.deckPairId){ return a.filter(x=>x.deckPairId!==tgt.deckPairId); }
      return a.filter((_,x)=>x!==i);
    });
  }
  function dupRow(i){
    setItems(a=>{
      const c=JSON.parse(JSON.stringify(a[i]));
      c.cordSide="-"; c.cordLenText="";
      c.deckPairId=null; c.deckRole=null; c.deckTotalIn=""; c.locDetail="";
      // Split 정보는 복제하지 않는다.
      c.splitN = undefined;
      c.splitLens = [];
      c.splitFtIn = [];
      c.splitUnit = undefined;
      c.splitCtrl = [];
      c.uiSplitOpen = false;
      return [...a.slice(0,i+1), c, ...a.slice(i+1)];
    });
  }

/* ▼▼ 에러 → 점프 + 빨간 테두리 하이라이트 */
function showWarn(err){
  try{
    const e = Array.isArray(err) ? err[0] : err;
    let msg = "", targetId = "";

    if (e && typeof e === "object"){
      msg = e.msg || "";
      if (e.kind === "header" && e.id) {
        targetId = e.id;                       // ex) fld-title
      } else if (e.kind === "row" && e.row && e.field) {
        targetId = `row-${e.row}-${e.field}`;  // ex) row-3-cord
      }
    } else {
      // (옵션) 옛날 문자열 에러 들어오면 최소한의 백업 처리
      const t = String(e ?? "").trim();
      msg = t;
      const m = /^#(\d+)/.exec(t);
      if (m) {
        const rowNo = parseInt(m[1],10);
        const map = [
          [/W\/H|Enter W|valid W/i, "w"],
          [/Enter H/i,              "h"],
          [/Mount/i,                "mount"],
          [/Control|Cord/i,         "cord"],
          [/Side/i,                 "lr"],
          [/Len|Length/i,           "len"],
          [/Motor/i,                "motor"],
          [/Category/i,             "category"],
          [/Fabric/i,               "fabric"],
          [/Color B/i,              "colorB"],
          [/Color/i,                "color"],
          [/price B/i,              "priceB"],
          [/price/i,                "price"],
        ];
        for (const [re, field] of map){
          if (re.test(t)){ targetId = `row-${rowNo}-${field}`; break; }
        }
      } else {
        const jumpMap = {
          "Title (REP) is required.": "fld-title",
          "Select Type.": "fld-type",
          "Enter Type (manual).": "fld-type-manual",
          "Enter Visit date/time.": "fld-visit",
          "Select Measurement Unit.": "fld-unit",
        };
        targetId = jumpMap[t] || "";
      }
    }

    if (msg) toast.err(msg);
    if (targetId){
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        focusAndScrollTo(targetId);
      }));
    }
  }catch(e){
    console.error("showWarn failed:", e);
  }
}

  // Save local draft
  function onSaveLocal(){
    const errs=[...validateHeader(header), ...validateAll(items)];
    if(errs.length){ showWarn(errs); return; }
    const job={
      id:Date.now(),
      name:header.title.trim(),
      createdAt:nowStamp(),
      unit:header.unit,
      header,
      items
    };
    const list=getLS(LS_JOBS,[]);
    list.unshift(job);
    setLS(LS_JOBS,list);
    toast.ok("Saved locally.");
  }

  const isManualType = header.customerType==="Other (Manual)";

  return (
    <>
      <div className="grid gap-4">
        {/* Information */}
        <div className="border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold">Information</div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded-lg border" onClick={openTemplateList}>Load Template</button>
              <button className="px-3 py-1.5 rounded-lg border border-rose-500 text-rose-600 hover:bg-rose-50" onClick={clearAll}>New (Clear)</button>
              {undoSnap && (<button className="px-3 py-1.5 rounded-lg border" onClick={undoClear}>Undo</button>)}
            </div>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-12 gap-3 mb-3">
            <InputL id="fld-title" col={isManualType?3:4} label="Title (REP) *" value={header.title} onChange={e=>setHeader(h=>({...h,title:e.target.value}))} placeholder="ex) Charles / Gem / Danahan" />
            <SelectL id="fld-type" col={isManualType?3:4} label="Type" value={header.customerType} onChange={v=>setHeader(h=>({...h,customerType:v}))} options={["House","Condo","Commercial","Other (Manual)"]} />
            {isManualType && (
              <InputL id="fld-type-manual" col={3} label="Type (manual)" value={header.customerTypeText||""} onChange={(e)=> setHeader(h=>({...h,customerTypeText:e.target.value}))} />
            )}
            <SelectL id="fld-unit" col={isManualType?3:4} label="Measurement Unit" value={header.unit} onChange={v=>setHeader(h=>({...h,unit:v}))} options={["mm","ft","inch"]} labels={{ mm:"mm", ft:"ft+inch", inch:"inch" }} />
          </div>

          {/* Row 2/3 */}
          <div className="grid grid-cols-12 gap-3">
            <InputL  col={4} label="Customer" value={header.customer} onChange={e=>setHeaderField("customer",e.target.value)}/>
            <InputL  col={4} label="Phone"    value={header.phone}    onChange={e=>setHeaderField("phone",e.target.value)}/>
            <div id="fld-visit" className={`${COL[4]} min-w-0`}>
   <div className="text-sm text-gray-600 mb-1">Visit at</div>
   <div className="flex gap-2">
     <input
       type="datetime-local"
       lang="en-GB"
       className="w-full border rounded px-3 py-2"
       value={header.visitAt}
       onChange={e=>setHeaderField("visitAt", e.target.value)}
     />
     <button
       type="button"
       className="px-2 py-2 border rounded"
       onClick={()=>setHeaderField("visitAt", nowLocalForInput())}
       title="Set current time"
     >
       Now
     </button>
   </div>
 </div>
            <InputL  col={4} label="Address" value={header.address}  onChange={e=>setHeaderField("address",e.target.value)}/>
            <InputL  col={4} label="E-mail"  value={header.email||""} onChange={e=>setHeaderField("email",e.target.value)}/>
            <InputL  col={4} label="Memo"    value={header.memo||""} onChange={e=>setHeaderField("memo",e.target.value)}/>
          </div>
        </div>

        {/* Items */}
        <MeasureItemsBlock
          header={header}
          items={items}
          setItemField={setItemField}
          updateItem={updateItem}
          addRow={addRow}
          delRow={delRow}
          dupRow={dupRow}
          onOpenBulk={()=>setBulkOpen(true)}
        />

        {/* Review / Totals */}
        <MeasureReviewTotals
          header={header}
          items={items}
          totals={totals}
          setHeaderField={setHeaderField}
          onSaveLocal={onSaveLocal}
          role={role}
          saveAsTemplate={saveAsTemplate}
        />
      </div>

{/* ▼ Bulk Apply Modal */}
{bulkOpen && (
  <BulkApplyModal
    items={items}
    onClose={()=>setBulkOpen(false)}
    updateItem={updateItem}
  />
)}

      {/* ▼ Templates Modal */}
      {tplOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={()=>setTplOpen(false)}
        >
          <div
            className="bg-white rounded-xl p-4 w-full max-w-md"
            onClick={(e)=>e.stopPropagation()}
          >
            <div className="font-semibold mb-2">Templates</div>

            {tplBusy ? (
  <div className="text-sm text-gray-600">Loading…</div>
) : (
  <>
    {/* 새 체크박스 */}
    <label className="mb-2 flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={useNowOnLoad}
        onChange={e=>setUseNowOnLoad(e.target.checked)}
      />
      <span>Use current time for “Visit at” when loading</span>
    </label>

    {tplList.length === 0 ? (
      <div className="text-sm text-gray-600">No templates.</div>
    ) : (
      <div className="grid gap-2 max-h-[50vh] overflow-auto">
        {tplList.map(t => (
          <div key={t.id} className="flex items-center justify-between border rounded p-2">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-gray-500">
                {t.updated_at?.slice(0,19).replace("T"," ")}
              </div>
            </div>
            <button className="px-3 py-1.5 rounded border" onClick={()=>applyTemplate(t)}>
              Load
            </button>
          </div>
        ))}
      </div>
    )}
  </>
)}

            <div className="mt-3 text-right">
              <button className="px-3 py-1.5 rounded border" onClick={()=>setTplOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- Office (server only, admin) ---------------- */
function OfficeCloud({ toast }){
  const [jobs,setJobs]=useState([]);
  const [openId,setOpenId]=useState(null);

  if (!SUPA_ON) {
    return (
      <div>
        <div className="text-lg font-semibold mb-2">Office (server)</div>
        <div className="text-sm text-gray-600">Supabase not configured.</div>
      </div>
    );
  }

  async function refresh(){ setJobs(await supaFetchServerJobs()); }

  useEffect(()=> {
    (async ()=>{ await refresh(); })();
    const ch = supabase.channel("jobs_rt")
      .on("postgres_changes",{ event:"*", schema:"public", table:"jobs" }, async ()=>{ await refresh(); })
      .subscribe();
    return ()=>{ try{ supabase.removeChannel(ch); }catch{} };
  },[]);

  function computeSummary(job){
    const totals = computeTotals(job.items||[], job.header?.discountPct, job.header||{});
    return {
      subtotal: totals.subtotal,
      discount: totals.discount,
      fees: Number(job.header?.installFee||0)+Number(job.header?.extraFee||0),
      motor: totals.motor,
      accessories: totals.accessories,
      grand: totals.grand
    };
  }
  
  // ▼ Office → Measure 로드 (Drafts와 동일한 형태)
function loadToMeasure(job){
  try{
    const payload = {
      header: job.header,
      items: (job.items || []).map(normalizeItem),
    };
    document.dispatchEvent(new CustomEvent("winco_load_measure", { detail: payload }));
    document.dispatchEvent(new CustomEvent("winco_go_tab", { detail: "Measure" }));
    try { toast?.ok?.("Loaded to Measure."); } catch(_) {}
  }catch(e){
    console.error(e);
    try { toast?.err?.("Failed to load."); } catch(_) { alert("Failed to load."); }
  }
}

  // ===== Export =====
  function buildExportRows(job){
    const unit   = job?.header?.unit || job?.unit || "mm";
    const items  = (job && job.items) || [];
    const header = job?.header || {};
    const hasDuo = items.some(it => it.upType === "4FA(Duo)");

    // 본표 헤더 (ft/in/32 + mm 모두 보유)
    const headers = [
      "No","Location","Fabric No.","Mount",
      "Headrail","Bottom","Tube",
      "Control","L/R","Len",
      "W(ft)","W(in)","W(/32)","W Total (in)",
      "H(ft)","H(in)","H(/32)","H Total (in)",
      "W(mm)","H(mm)","Sqft",
      ...(hasDuo ? ["$/Sqft A","$/Sqft B"] : ["$/Sqft"]),
      "Blind","Surcharge","Motor $","Line Total","Memo",
      // ▼ 여기부터 옵션 블록
      "Spring Assist","Side Ch","Side Ch H(mm)","L Ch","L Ch W(mm)","Surcharge $","Motor","Motor Model","Motor $"
    ];

    const body = [];
    const excludedFlags = []; // ← 각 행의 exclude 여부

    for (let i=0; i<items.length; i++){
      const it = items[i];
      const c  = computeLine(it);
      const excluded = it?.include === false;

      const loc = titleOf(it) || "";
      const fabNo = canonicalFabricNo(it);

      const headrailLbl = it.upType
        ? (it.upType + (it.upClr ? ` ${HW_COLOR_LABELS[it.upClr]||it.upClr}` : ""))
        : "";

      const bottomLbl = it.btType
        ? (it.btType + (it.btClr ? ` ${HW_COLOR_LABELS[it.btClr]||it.btClr}` : ""))
        : "";

      // 치수 파생값(내부 저장은 인치 기반) → ft/in/32 & mm
      const wTotalIn = in2(it.wIn);
      const hTotalIn = in2(it.hIn);
      const wmm = mm1FromIn(it.wIn);
      const hmm = mm1FromIn(it.hIn);
      const wf  = splitFtIn32(wTotalIn); // {ft, inch, frac32}
      const hf  = splitFtIn32(hTotalIn);

      // 컨트롤/모터
      const ct       = normalizeCordType(it.cordType || "");
      const ctrlSide = lrValue(it);
      const ctrlLen  = lenValue(it);


      // 가격
      const priceA = Number(it.price || 0); // 숫자 그대로
      const priceB = Number(it.priceB || 0); // 숫자 그대로

      // 옵션
      const springOn   = !!it.springAssist;
      const sideOn     = !!it.sideChannel;
      const lOn        = !!it.lChannel;

      const sideH_mm   = sideOn ? (inToMm(it.hIn)||0) : "-";
      const lW_mm      = lOn    ? (inToMm(it.wIn)||0) : "-";

      // 단위별 표기 규칙 (수정된 로직)
      const showFtInBreakdown = (unit === "ft");
      const showTotalIn = (unit === "ft" || unit === "inch");

      const wft = showFtInBreakdown ? wf.ft   : "-";
      const win = showFtInBreakdown ? wf.inch : "-";
      const w32 = showFtInBreakdown ? fracLabel(wf.frac32) : "-";
      const wti = showTotalIn ? round2(wTotalIn) : "-";

      const hft = showFtInBreakdown ? hf.ft   : "-";
      const hin = showFtInBreakdown ? hf.inch : "-";
      const h32 = showFtInBreakdown ? fracLabel(hf.frac32) : "-";
      const hti = showTotalIn ? round2(hTotalIn) : "-";

        // 제외행: 금액/단가 칼럼만 "-" 처리
  const dashIfExcluded = (v)=> excluded ? "-" : v;

      const row = [
        i+1,                                // No
        loc,                                // Location
        fabNo,                              // Fabric No.
        it.install||"",                     // Mount
        headrailLbl,                        // Headrail
        bottomLbl,                          // Bottom
        "-",                                // Tube (미사용)
        ct, ctrlSide, ctrlLen,              // Len: 데이터 유지
   wft, win, w32, wti,                 // 치수류 유지
   hft, hin, h32, hti,
   wmm, hmm,
   c.sqft,
   ...(hasDuo
   ? [
       dashIfExcluded(priceA),
       dashIfExcluded(it.upType === "4FA(Duo)" ? priceB : "-")
     ]
   : [dashIfExcluded(priceA)]),
   dashIfExcluded(c.blind),
   dashIfExcluded(c.surcharge),
   dashIfExcluded(c.motor || 0),
   dashIfExcluded(c.lineTotal),        // 금액류만 대시
        it.memo || "",                      // Memo
        // ▼ 옵션 블록
        springOn ? "Y" : "-",
        sideOn ? "Y" : "-",
        sideH_mm,                           // 데이터 유지
        lOn ? "Y" : "-",
        lW_mm,                              // 데이터 유지
   dashIfExcluded(c.surcharge),        // 옵션 금액만 대시
   (ct==="Motor" ? "Y" : "-"),
   (ct==="Motor" ? (it.motorCode || "") : ""),
   dashIfExcluded(c.motor || 0)
      ];
      body.push(row);
      excludedFlags.push(!!excluded);
          // --- Split summary row (optional, just under this blind) ---
    const splitInfo = buildSplitSummary(it, header?.unit);
    if (splitInfo) {
      const pieces = splitInfo.labels
        .map((lab, idx) => {
          const len = splitInfo.lensTexts[idx];
          if (!len) return "";
          const ctrl = (splitInfo.ctrls?.[idx] || "").toUpperCase();
          const ctrlText = (ctrl === "L" || ctrl === "R") ? ` (${ctrl})` : "";
          return `${lab} ${len}${ctrlText}`;
        })
        .filter(Boolean);

      if (pieces.length) {
        const splitText = `Split (${splitInfo.unit}): ${pieces.join(" / ")}`;

        // headers 개수만큼 빈 셀을 가진 행 하나 생성
        const splitRow = new Array(headers.length).fill("");
        // 두 번째/세 번째 칸에 표시 (예: Area/Space 자리)
        splitRow[1] = " * Split";
        splitRow[2] = splitText;

        body.push(splitRow);
        // 같은 include 상태로 플래그도 한 줄 추가
        excludedFlags.push(excluded);
      }
    }
    }

    return { headers, body, excludedFlags, meta:{
      title: (job?.name || "Export"),
      subtitle: (job?.createdAt || "")
    }};
  }

  function doExport(job){
  // ── 1) 메인 표 데이터(이미 쓰던 로직 재사용)
  const { headers, body, excludedFlags, meta } = buildExportRows(job);
  if (XLS_WITH_SQFT_SUM) appendSqftTotalRow(headers, body, excludedFlags);

  // ── 2) Information 섹션 (address/visit/phone/memo 등)
  const h = job?.header || {};
  const infoRows = [
    ["Title", job?.name || "-"],
    ["Customer", h.customer || "-"],
    ["Phone", h.phone || "-"],
    ["Address", h.address || "-"],
    ["E-mail", h.email || "-"],
    ["Visit at", h.visitAt || "-"],
    ["Memo", (h.memo||"").replace(/\n/g, " ") || "-"],
  ];

  // ── 3) Accessories 섹션 (무료 Charger 반영)
  const accView = calcAccessoriesLines(job.header||{}, job.items||[]);
  const accHeaders = ["Item","Qty","Unit $","Billable Qty","Line $"];
  const accBody = (accView.lines||[]).map(r=>[
    r.code, r.qty, r.unit, (r.code==="CHARGER"? r.billableQty : "-"), r.line$
  ]);

  // ── 4) Totals 섹션 (회사용 요약)
  const totals = computeTotals(job.items||[], job.header?.discountPct, job.header||{});
  const feesSum = Number(h.installFee||0)+Number(h.extraFee||0);
  const totRows = [
    ["Blind", totals.blind],
    ["Surcharge", totals.sub],
    ["Subtotal", totals.subtotal],
    ["Discount", totals.discount],
    ["Fees (Install+Extra)", feesSum],
    ["Motor", totals.motor],
    ["Accessories", totals.accessories],
    ["Total", totals.grand],
    ["Total(+tax)", round2((Number(totals.grand)||0) * 1.05)],
  ];

  // ── 5) HTML 조립 (엑셀에서 표 여러 개로 보이게)
  const hEsc = (s)=>esc(String(s??""));
  const td = (s)=>`<td style="${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.td}">${hEsc(s)}</td>`;
  const tdR = (n, money=false)=>{
    const base = `${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.tdRight}`;
    const fmt  = money ? XL_STYLE.money : XL_STYLE.int;
    return `<td style="${base}${fmt}">${hEsc(n)}</td>`;
  };
  const tr = (cells)=>`<tr>${cells.join("")}</tr>`;

  // 5-1) Information 테이블 (2열)
  const infoTable = `
  <table cellspacing="0" cellpadding="0" style="${XL_STYLE.fontFamily};border-collapse:collapse;margin-bottom:10px;">
    ${sectionTitleHTML("Information", 2)}
    <tr><td colspan="2" style="${XL_STYLE.h1}${XL_STYLE.border}${XL_STYLE.headBg}">${hEsc(meta.title||"Export")} — <span style="font-weight:400">${hEsc(meta.subtitle||"")}</span></td></tr>
    <tbody>
      ${infoRows.map(([k,v])=>tr([td(k), td(v)])).join("")}
    </tbody>
  </table>`;

// 5-2) 메인 표 (옵션 라벨 포함)
const optionsLabelRow = makeOptionsLabelRow(headers);
const headCells = headers
  .map(hd => `<th style="${XL_STYLE.th}${XL_STYLE.cell}${XL_STYLE.border}">${hEsc(hd)}</th>`)
  .join("");

// ▼ 추가: 헤더별 서식 집합
const moneyHeader = new Set(
  headers.filter(v =>
    /\$/.test(v) ||
    /^(Blind|BLIND|Surcharge|SUR|Line Total|LINE|Motor \$|Motor|MOT)$/i.test(v)
  )
);
const dec1Headers = new Set(["W(mm)","H(mm)"]);                 // 소수 1자리
const dec2Headers = new Set(["W Total (in)","H Total (in)"]);   // 소수 2자리
const fracHeaders = new Set(["W(/32)","H(/32)"]);               // 날짜 오인 방지(텍스트)

// ▼ 교체: 본문 셀 렌더링 (제외행은 회색 배경+글자색)
  const MUTED = "color:#9ca3af;background:#f3f4f6;"; // text-gray-400 + bg-gray-100
  const bodyHTML = body.map((row, ri) => {
  const muted = excludedFlags && excludedFlags[ri] ? MUTED : "";
  const tds = row.map((cell, ci) => {
    const hd = headers[ci] || "";

    // 분수 칼럼은 엑셀이 날짜로 바꾸지 않도록 "텍스트" 서식 강제
    if (fracHeaders.has(hd)) {
      const style = `${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.tdRight}${muted}mso-number-format:'\\@';`;
      return `<td style="${style}">${hEsc(String(cell))}</td>`;
    }

    // 숫자면 헤더별 서식 적용 (money / dec1 / dec2 / int)
    if (typeof cell === "number" && isFinite(cell)) {
      let fmt = XL_STYLE.int;
      if (moneyHeader.has(hd))      fmt = XL_STYLE.money;
      else if (dec1Headers.has(hd)) fmt = XL_STYLE.dec1;
      else if (dec2Headers.has(hd)) fmt = XL_STYLE.dec2;

      const style = `${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.tdRight}${muted}${fmt}`;
      return `<td style="${style}">${hEsc(cell)}</td>`;
    }

    // 그 외 텍스트
    return `<td style="${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.td}${muted}">${hEsc(cell)}</td>`;
  }).join("");

  return `<tr>${tds}</tr>`;
}).join("");

const mainTable = `
<table cellspacing="0" cellpadding="0" style="${XL_STYLE.fontFamily};border-collapse:collapse;margin-bottom:10px;">
  <thead>
    ${sectionTitleHTML("Items", headers.length)}
    ${optionsLabelRow}
    <tr>${headCells}</tr>
  </thead>
  <tbody>${bodyHTML}</tbody>
</table>`;

  // 5-3) Accessories 테이블
  const accHead = accHeaders.map(hd=>`<th style="${XL_STYLE.th}${XL_STYLE.cell}${XL_STYLE.border}">${hEsc(hd)}</th>`).join("");
  const accRows = accBody.map(r=>{
    return `<tr>${
      r.map((v,i)=>{
        if (i===1 || i===2 || i===4) { // Qty/Unit$/Line$ → 숫자 정렬
          return tdR(v, i!==1); // Unit$/Line$는 money, Qty는 정수
        }
        if (i===3) { // Billable Qty (소수 허용)
          const base = `${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.tdRight}`;
          return `<td style="${base}">${hEsc(v)}</td>`;
        }
        return td(v);
      }).join("")
    }</tr>`;
  }).join("");
  const accTailNote = `<tr><td colspan="${accHeaders.length}" style="${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.td}">Chargers: included <b>${hEsc(accView.includedChargers)}</b> · total <b>${hEsc(accView.totalChargers)}</b> · billable <b>${hEsc(accView.billableChargers)}</b></td></tr>`;
  const accTable = `
  <table cellspacing="0" cellpadding="0" style="${XL_STYLE.fontFamily};border-collapse:collapse;margin-bottom:10px;">
    ${sectionTitleHTML("Accessories", accHeaders.length)}
    <thead><tr>${accHead}</tr></thead>
    <tbody>${accRows}${accTailNote}</tbody>
  </table>`;

  // 5-4) Totals 테이블
  const totRowsHTML = totRows.map(([k,v],i)=>{
    const isGrand = (k==="Total" || k==="Total(+tax)");
    const keyCell = `<td style="${XL_STYLE.cell}${XL_STYLE.border}${isGrand?'font-weight:700;':''}">${hEsc(k)}</td>`;
    const valCell = `<td style="${XL_STYLE.cell}${XL_STYLE.border}${XL_STYLE.tdRight}${XL_STYLE.money}${isGrand?'font-weight:700;':''}">${hEsc(v)}</td>`;
    return `<tr>${keyCell}${valCell}</tr>`;
  }).join("");
  const totalsTable = `
  <table cellspacing="0" cellpadding="0" style="${XL_STYLE.fontFamily};border-collapse:collapse;">
   ${sectionTitleHTML("Totals", 2)}
    <tbody>${totRowsHTML}</tbody>
  </table>`;

  // 5-5) 최종 문서
  const html = `
  <!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
    ${infoTable}
    ${mainTable}
    ${accTable}
    ${totalsTable}
  </body></html>`;

  // ── 6) 다운로드
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const a = document.createElement("a");
  const customerName = (job?.header?.customer || "").trim();
  const safeFile = `${sanitizeFileName(customerName || job?.name || "Export")}.xls`;
  a.href = URL.createObjectURL(blob);
  a.download = safeFile;   // ★ 슬래시 제거된 파일명 사용
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch{} a.remove(); }, 0);
}

  async function removeJob(id){
    if(!confirm("Delete this job from server?")) return;
    try{
      await supaDeleteServerJob(id);
      await refresh();
      toast.ok("Deleted.");
    }catch{ toast.err("Delete failed."); }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-lg font-semibold">Office (server)</div>
        <button className="px-3 py-2 rounded border" onClick={refresh}>Refresh</button>
      </div>

      {jobs.length===0 ? (
        <div className="text-sm text-gray-600">No jobs.</div>
      ) : (
        <div className="grid gap-3">
          {jobs.map(job=>{
            const s=computeSummary(job);
            const open = openId===job.id;
            const hasDuo = (job.items||[]).some(it=>it.upType==="4FA(Duo)");
            return (
              <div key={job.id} className="border rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
  <div className="font-semibold">
    <TitleCustomer header={{ title: job.header?.title || job.name, customer: job.header?.customer }} />
  </div>
  <div className="text-sm text-gray-600">{job.createdAt}</div>
</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <div>Grand: <b>${Number(s.grand||0).toFixed(2)}</b></div>
                    <button className="px-3 py-2 rounded border" onClick={()=>setOpenId(open?null:job.id)}>
                      {open?"Hide details":"View details"}
                    </button>
                     {/* ★ 추가: Measure로 로드 */}
                    <button className="px-3 py-2 rounded border" onClick={()=>loadToMeasure(job)}>
                      Load to Measure
                     </button>
                    <button className="px-3 py-2 rounded bg-black text-white" onClick={()=>doExport(job)}>Export</button>
                    <button className="px-3 py-2 rounded border border-rose-500 text-rose-600" onClick={()=>removeJob(job.id)}>Delete</button>
                  </div>
                </div>

                {open && (
  <div className="mt-3 text-sm">

    {/* ▼ Information (Address / Visit at / Phone / Memo) */}
<div className="mb-2 grid grid-cols-12 gap-3 text-sm">
  <div className="col-span-12 md:col-span-6">
    <b>Address:</b> {job.header?.address || "-"}
  </div>
  <div className="col-span-12 md:col-span-6">
    <b>Visit at:</b> {String(job.header?.visitAt || "-").replace("T"," ")}
  </div>
   <div className="col-span-12 md:col-span-6">
    <b>Phone:</b> {job.header?.phone || "-"}
  </div>
  <div className="col-span-12 md:col-span-6"> 
    <b>E-mail:</b> {job.header?.email || "-"}
  </div>
  <div className="col-span-12 md:col-span-6">
    <b>Memo:</b> <span className="whitespace-pre-wrap">{job.header?.memo || "-"}</span>
  </div>
</div>

    {/* 본표 */}
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">No</th>
            <th className="p-2">Loc</th>
            <th className="p-2">Fab</th>
            <th className="p-2">MT</th>
            <th className="p-2">HR</th>
            <th className="p-2">BT</th>
            <th className="p-2">Ctrl</th>
            <th className="p-2">L/R</th>
            <th className="p-2">Len</th>
            <th className="p-2">W(mm)</th>
            <th className="p-2">H(mm)</th>
            <th className="p-2">Sqft</th>
            {!(job.items||[]).some(it=>it.upType==="4FA(Duo)")
              ? <th className="p-2">$/Sqft</th>
              : (<><th className="p-2">$/Sqft A</th><th className="p-2">$/Sqft B</th></>)
            }
            <th className="p-2">BLIND</th>
            <th className="p-2">SUR</th>
            <th className="p-2">MOT</th>
            <th className="p-2">LINE</th>
          </tr>
        </thead>
        <tbody>
      {(job.items||[]).map((it,i)=>{
        const excluded = it?.include === false;
        const c = computeLine(it);
            const fabricNo = canonicalFabricNo(it);
            return (
              <tr key={i} className={`border-b ${excluded ? "bg-gray-100 text-gray-400" : ""}`}>
                <td className="p-2">{i+1}</td>
                <td className="p-2">{titleOf(it)}</td>
                <td className="p-2">{fabricNo}</td>
                <td className="p-2">{it.install}</td>
                <td className="p-2">{it.upType} {it.upClr}</td>
                <td className="p-2">{it.btType} {it.btClr}</td>
                <td className="p-2">{normalizeCordType(it.cordType || "")}</td>
                <td className="p-2">{lrValue(it)}</td>
                <td className="p-2">{excluded ? "-" : lenValue(it)}</td>
                <td className="p-2">{excluded ? "-" : mm1FromIn(it.wIn).toFixed(1)}</td>
                <td className="p-2">{excluded ? "-" : mm1FromIn(it.hIn).toFixed(1)}</td>
                <td className="p-2">{excluded ? "-" : c.sqft}</td>
                {!(job.items||[]).some(x=>x.upType==="4FA(Duo)") ? (
                  <td className="p-2">{excluded ? "-" : Number(it.price||0).toFixed(2)}</td>
                ) : (
                  <>
                    <td className="p-2">{excluded ? "-" : Number(it.price||0).toFixed(2)}</td>
                    <td className="p-2">{excluded ? "-" : (it.upType==="4FA(Duo)" ? Number(it.priceB||0).toFixed(2) : "-")}</td>
                  </>
                )}
                <td className="p-2">{excluded ? "-" : `$${c.blind.toFixed(2)}`}</td>
                <td className="p-2">{excluded ? "-" : `$${c.surcharge.toFixed(2)}`}</td>
                <td className="p-2">{excluded ? "-" : (c.motor?`$${c.motor.toFixed(2)}`:"-")}</td>
                <td className="p-2 font-semibold">{excluded ? "-" : `$${c.lineTotal.toFixed(2)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* --- Total Sqft footer --- */}
{(() => {
  const rows = (job.items || []).filter(r => r?.include === true);
  const totalSqft = rows.reduce((s, it) => s + computeLine(it).sqft, 0);
  return (
    <div className="mt-2 text-right text-sm tabular-nums">
      Total Sqft: <b>{totalSqft}</b>
    </div>
  );
})()}
    </div>

    {/* Accessories + Totals (Drafts와 동일 레이아웃) */}
    <div className="mt-3 grid grid-cols-12 gap-3">
      <div className="col-span-12 md:col-span-8">
        <AccessoriesSummaryCard header={job.header} items={job.items} />
      </div>
      <div className="col-span-12 md:col-span-4">
        <TotalsCard totals={computeTotals(job.items||[], job.header?.discountPct, job.header||{})}
                    header={job.header} />
      </div>
    </div>
  </div>
)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
