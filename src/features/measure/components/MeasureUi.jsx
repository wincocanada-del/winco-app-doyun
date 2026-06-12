import { fracLabel, round2 } from "../../../lib/formatters";

function asInputValue(v){ return (v == null || v === "") ? "" : String(v); }
function selectAll(e){ e.target.select(); }

export const COL={ 1:"col-span-1 md:col-span-1", 2:"col-span-2 md:col-span-2", 3:"col-span-3 md:col-span-3", 4:"col-span-4 md:col-span-4", 5:"col-span-5 md:col-span-5", 6:"col-span-6 md:col-span-6", 7:"col-span-7 md:col-span-7", 8:"col-span-8 md:col-span-8", 9:"col-span-9 md:col-span-9", 10:"col-span-10 md:col-span-10", 11:"col-span-11 md:col-span-11", 12:"col-span-12 md:col-span-12" };

export const NUM = [
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
export const NUM_GRAND = [
  NUM,
  "font-bold",
  "text-lg",
  "max-w-[16ch]"       // GRAND은 조금 더 넓게
].join(" ");
/* ---------------- Small UI helpers ---------------- */
export function NumberL({ id, col=3, label, value, onChange, step="1", placeholder, disabled, keepBlank=false }) {
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

export function InputL({ col=3, id, label, value, onChange, placeholder, disabled, type="text", lang }){
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
export function TitleCustomer({ header }) {
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
export function TotalsCard({ totals, header }) {
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

/* ---- SelectL: iPad에서도 항상 화살표 보이도록 커스텀 아이콘 추가 ---- */
export function SelectL({ col=3, id, label, value, onChange, options, labels, disabled }){
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
export function FeetInches({ id, col=2, label, valueInches, onChange, disabled }) {
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