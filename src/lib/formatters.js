export const pad = n=>String(n).padStart(2,"0");
export function nowStamp(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function nowLocalForInput(){ const d=new Date(); const y=d.getFullYear(), m=pad(d.getMonth()+1), day=pad(d.getDate()); const hh=pad(d.getHours()), mm=pad(d.getMinutes()); return `${y}-${m}-${day}T${hh}:${mm}`; }
export function round2(n){ return Math.round((Number(n)||0)*100)/100; }
export function inToMm(inch){ return Math.round((Number(inch)||0)*25.4); }
export function mmToIn(mm){ return (Number(mm)||0)/25.4; }
export function round1(n){ return Math.round((Number(n)||0)*10)/10; }
export function mm1FromIn(inch){ return round1((Number(inch)||0)*25.4); }
export function in2(nInch){ return round2(Number(nInch)||0); }
export function gcd(a,b){ a=Math.abs(a); b=Math.abs(b); while(b){ const t=a%b; a=b; b=t; } return a||1; }
export function splitInches(totalIn){
  let t=Number(totalIn)||0, ft=Math.floor(t/12), rem=t-ft*12, inch=Math.floor(rem), frac32=Math.round((rem-inch)*32);
  if(frac32===32){ frac32=0; inch+=1; } if(inch===12){ inch=0; ft+=1; }
  return { ft, inch, frac32 };
}
export function fracLabel(n){
  n = Number(n) || 0;
  if (n <= 0)  return "0";
  if (n >= 32) return "1";
  const g = gcd(n, 32);
  return `${n/g}/${32/g}`;
}
export function sanitizeFileName(s){ return String(s||"JOB").replace(/[\/:*?"<>|]/g,"_"); }
export function prettyCode(code){ if(!code) return ""; const s=String(code).replace(/\s+/g," ").trim(); const m=s.match(/^([A-Za-z]+)\s*(\d+)/); return m?(m[1].toUpperCase()+" "+m[2]):s.toUpperCase(); }

