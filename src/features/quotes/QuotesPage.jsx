import { useState } from "react";
import { LS_JOBS, getLS, setLS } from "../../lib/storage";

export default function QuotesPage({
  toast,
  canSendToOffice,
  sendJobToOffice,
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
}) {
  const [list,setList]=useState(getLS(LS_JOBS,[]));
  const [openId,setOpenId]=useState(null);

  function refresh(){ setList(getLS(LS_JOBS,[])); }
  function removeDraft(id){
    if(!confirm("Delete this draft?")) return;
    const next=(getLS(LS_JOBS,[])).filter(j=>j.id!==id);
    setLS(LS_JOBS,next);
    setList(next);
  }

  async function sendToOffice(job){
    if(!canSendToOffice){ toast.err("Failed to send. Check connection/keys."); return; }
    if(typeof navigator!=="undefined" && "onLine" in navigator && !navigator.onLine){
      toast.err("Internet required to send."); return;
    }
    try{
      await sendJobToOffice(job);
      toast.ok("Sent to Office.");
    }catch(e){ console.error(e); toast.err("Failed to send."); }
  }

  function computeSummary(job){
    const totals = computeTotals(job.items||[], job.header?.discountPct, job.header||{});
    return { subtotal: totals.subtotal, discount: totals.discount, fees: Number(job.header?.installFee||0)+Number(job.header?.extraFee||0), motor: totals.motor, accessories: totals.accessories, grand: totals.grand };
  }

  function loadToMeasure(job){
    try{
      const payload = {
        header: job.header,
        items: (job.items||[]).map(normalizeItem)
      };
      document.dispatchEvent(new CustomEvent("winco_load_measure",{ detail: payload }));
      document.dispatchEvent(new CustomEvent("winco_go_tab",{ detail: "Measure" }));
      toast.ok("Loaded to Measure.");
    }catch{ toast.err("Failed to load."); }
  }

  if(!list || list.length===0){
   return (
     <div className="border rounded-2xl p-4">
       <div className="flex items-center justify-between mb-2">
         <div className="text-lg font-semibold">My Drafts (local)</div>
         <button className="px-3 py-2 rounded border" onClick={refresh}>Refresh</button>
       </div>
       <div className="text-sm text-gray-600">No drafts.</div>
     </div>
   );
 }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">My Drafts (local)</div>
        <button className="px-3 py-2 rounded border" onClick={refresh}>Refresh</button>
      </div>

      {list.map(job=>{
        const s=computeSummary(job);
        const isOpen=openId===job.id;
        const hasDuo = (job.items || []).some(it => it.upType === "4FA(Duo)");
        return (
          <div key={job.id} className="border rounded-2xl p-4">
            <div className="flex items-center justify-between gap-4">
  <div>
  <div className="font-semibold">
    <TitleCustomer header={job.header} />
  </div>
  <div className="text-sm text-gray-600">
    {String(job.createdAt || "").slice(0,16).replace("T"," ")}
  </div>
</div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <div>Grand: <b>${s.grand.toFixed(2)}</b></div>
                <button className="px-3 py-2 rounded border" onClick={()=>setOpenId(isOpen?null:job.id)}>{isOpen?"Hide details":"View details"}</button>
                <button className="px-3 py-2 rounded border" onClick={()=>loadToMeasure(job)}>Load to Measure</button>
                <button className="px-3 py-2 rounded border bg-black text-white" onClick={()=>sendToOffice(job)}>Send to Office</button>
                <button className="px-3 py-2 rounded border border-rose-500 text-rose-600" onClick={()=>removeDraft(job.id)}>Delete</button>
              </div>
            </div>

            {isOpen && (
              <div className="mt-3 text-sm">
                <div className="mb-2 grid grid-cols-12 gap-2 text-sm">
   <div className="col-span-12 md:col-span-6">
     <b>Address</b>: {job.header?.address || "-"}
   </div>
   <div className="col-span-12 md:col-span-6">
     <b>Visit at</b>: {job.header?.visitAt || "-"}
   </div>
   <div className="col-span-12 md:col-span-6">
     <b>Phone</b>: {job.header?.phone || "-"}
   </div>
   <div className="col-span-12 md:col-span-6">
     <b>E-mail</b>: {job.header?.email || "-"}
   </div>
   <div className="col-span-12 md:col-span-6">
     <b>Memo</b>: {job.header?.memo || "-"}
   </div>
 </div>
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
      {(job.items||[]).map((it,i)=>{
        const excluded = it?.include === false;     // â˜… ì¶”ê°€: ì œì™¸ í”Œëž˜ê·¸
        const c = computeLine(it);
        const fabricNo = canonicalFabricNo(it);

        return (
           <tr key={i}
              className={`border-b ${excluded ? "bg-gray-100 text-gray-400" : ""}`}>  {/* â˜… ì œì™¸í–‰ íšŒìƒ‰ ì²˜ë¦¬ */}
            <td className="p-2">{i+1}</td>
            <td className="p-2">{titleOf(it)}</td>
            <td className="p-2">{fabricNo}</td>
            <td className="p-2">{it.install}</td>
            <td className="p-2">{it.upType} {it.upClr}</td>
            <td className="p-2">{it.btType} {it.btClr}</td>

            {/* Ctrl â†’ L/R â†’ Len (ê°’ ë§¤í•‘ ìœ ì§€) */}
            <td className="p-2">{normalizeCordType(it.cordType || "")}</td>
            <td className="p-2">{lrValue(it)}</td>
            <td className="p-2">{excluded ? "-" : lenValue(it)}</td>

            <td className="p-2">{excluded ? "-" : mm1FromIn(it.wIn).toFixed(1)}</td>
            <td className="p-2">{excluded ? "-" : mm1FromIn(it.hIn).toFixed(1)}</td>

            <td className="p-2">{excluded ? "-" : c.sqft}</td>

            {!hasDuo ? (
              <td className="p-2">{excluded ? "-" : (Number(it.price)||0).toFixed(2)}</td>
            ) : (
              <>
                <td className="p-2">{excluded ? "-" : (Number(it.price)||0).toFixed(2)}</td>
                <td className="p-2">
                  {excluded ? "-" : (it.upType==="4FA(Duo)" ? (Number(it.priceB)||0).toFixed(2) : "-")}
                </td>
              </>
            )}

            <td className="p-2">{excluded ? "-" : `$${c.blind.toFixed(2)}`}</td>
            <td className="p-2">{excluded ? "-" : `$${c.surcharge.toFixed(2)}`}</td>
            <td className="p-2">{excluded ? "-" : (c.motor ? `$${c.motor.toFixed(2)}` : "-")}</td>
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
  );
}
