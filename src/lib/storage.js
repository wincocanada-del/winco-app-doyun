export const LS_AUTH         = "winco_auth";
export const LS_JOBS         = "winco_jobs";
export const LS_FABRIC       = "winco_fabric";
export const LS_MEASURE_AUTO = "winco_measure_auto";

export function getLS(k,d){ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):d; }catch(_){ return d; } }
export function setLS(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){} }
export function getSS(k,d){ try{ const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : d; }catch(_){ return d; } }
export function setSS(k,v){ try{ if(v==null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); }catch{} }

