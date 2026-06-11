import { useState } from "react";

export default function AdminPage({
  SUPA_ON,
  supaFetchTemplates,
  supaUpsertTemplate,
  supaDeleteTemplate,
}) {
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
          <div className="text-sm text-gray-600">Loadingâ€¦</div>
        ) : forms.length===0 ? (
          <div className="text-sm text-gray-600">No templates. Use â€œSave as Templateâ€ in Measure (admin only).</div>
        ) : (
          <div className="grid gap-2">
            {forms.map(f=>(
              <div key={f.id} className="border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-gray-500">
                    {f.updated_at?.slice(0,19).replace("T"," ")} Â· {f.note||"-"}
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

