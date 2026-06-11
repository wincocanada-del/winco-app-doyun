import { useEffect, useState } from "react";

export default function OrdersPage({
  toast,
  SUPA_ON,
  supabase,
  supaFetchServerJobs,
  supaDeleteServerJob,
  computeTotals,
  computeLine,
  normalizeItem,
  TitleCustomer,
  canonicalFabricNo,
  titleOf,
  normalizeCordType,
  lrValue,
  lenValue,
  mm1FromIn,
  AccessoriesSummaryCard,
  TotalsCard,
  HW_COLOR_LABELS,
  in2,
  splitFtIn32,
  inToMm,
  fracLabel,
  round2,
  XLS_WITH_SQFT_SUM,
  appendSqftTotalRow,
  buildSplitSummary,
  calcAccessoriesLines,
  XL_STYLE,
  sectionTitleHTML,
  makeOptionsLabelRow,
  esc,
  sanitizeFileName,
}){
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
