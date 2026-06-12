import {
  ACCESSORY_PRICE_MAP,
  CONTROL_OPTS,
  CONTROL_SUR,
  HEADRAIL_OPTS,
  HDR_TBL,
  MOTOR_PRICE,
  SPRING_ASSIST_PRICE,
} from "../../data/options";
import { round2 } from "../../lib/formatters";

export function normalizeCordType(v){
  const s = String(v || "").trim();
  const u = s.toUpperCase();
  if (u === "STRING" || u === "STR") return "STR";
  if (u === "CHAIN" || u === "CH") return "CH";
  if (u === "CORDLESS") return "CLF";
  if (u === "MOTOR") return "Motor";
  return s;
}

/* === Compatibility resolver (fix for #1, #4-2) === */
export function resolveItem(draft){
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
export function headrailCategory(upType){
  if (HR_ROLLER_ONLY.includes(upType)) return "Roller"; // 전용 → Roller 강제
  if (HR_COMMON.includes(upType)) return null;           // 공통 → 강제 안 함
  return null;
}

// 카테고리에 따른 노출 가능 Headrail 목록
export function allowedHeadrailsForCategory(cat){
  if (cat === "Dual")   return HR_COMMON;                             // Dual: 공통 HR만
  if (cat === "Roller") return [...HR_COMMON, ...HR_ROLLER_ONLY];     // Roller: 풀셋
  return HEADRAIL_OPTS;                                               // 미정: 전부
}

export function isMotorAllowedByHeadrail(upType){
  return HR_MOTOR_OK.has(upType);
}

// 카테고리/HR 조합으로 Control 필터
export function filterControlsBy(cat, upType){
  return CONTROL_OPTS.filter(c=>{
    if (["CLS","CLF","CLO"].includes(c) && cat === "Dual") return false;

    // ✅ upType이 아직 비어있으면 Motor를 표시(선택 가능).
    // HR을 고른 뒤 모터 불가 HR이면 Motor는 사라짐.
    if (c === "Motor" && upType && !isMotorAllowedByHeadrail(upType)) return false;

    return true;
  });
}

// ▼▼ Bottom 허용 규칙 (최종)
export function allowedBottomsFor(cat, upType){
  if (!cat) return ["OP","ES","NB"];       // 카테고리 미정: 모두 노출
  if (cat === "Dual")   return ["OP"];     // 듀얼은 OP만
  if (cat === "Roller") return ["ES","NB"]; // ✅ Roller는 OP 금지 (HR 무관)
  return ["OP","ES","NB"];
}

// 선택값이 허용 목록에 없으면 빈값
export function ensureAllowedBottom(cat, upType, cur){
  if (!cat) return cur || ""; // ⟵ 자동선택 금지
  const allowed = allowedBottomsFor(cat, upType);
  return allowed.includes(cur) ? cur : allowed[0];
}


// Bottom 자동 교정 (카테고리 + 헤드레일 고려)
export function normalizeBottomBy(cat, upType, cur){
  if (!cat) return cur || ""; // ⟵ 자동선택 금지
  const allowed = allowedBottomsFor(cat, upType);
  return allowed.includes(cur) ? cur : allowed[0];
}

export function lrValue(it) {
  const ct = normalizeCordType(it?.cordType || "");
  if (ct === "CH" || ct === "STR" || ct === "Motor") {
    return it?.cordSide || "-";
  }
  return "-";
}

export function lenValue(it) {
  const ct = normalizeCordType(it?.cordType || "");
  if (ct === "CH" || ct === "STR") {
    return it?.cordLenText || "";
  }
  return "";
}
export function calcAccessoriesLines(header = {}, items = []) {
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

/* ---------------- Measure helpers (ABOVE Measure) ---------------- */
export function isControlNeedsSideLen(ct){ return ct==="CH" || ct==="STR"; }

export function headrailSurcharge(upType, wIn){
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
 export function sideChannelPrice(hIn){
   // 가격 규칙: L채널(H 기준) 가격의 2배 = 사이드채널 1세트
   const base = 2 * lChannelPrice(hIn);
   return base;
 }

// L channel (bottom horizontal) : base 24" -> $26, +$6.5 per 6"
export function lChannelPrice(wIn){
  const W = Math.max(24, Number(wIn)||0);
  if(W<=0) return 0;
  const steps = Math.ceil((W - 24) / 6);
  const unit = 26 + 6.5 * steps; // 1pc
  return unit;
}

export function computeLine(it){
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

export function computeTotals(items, discountPct, fees){
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