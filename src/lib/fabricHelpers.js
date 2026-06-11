import {
  FABRIC_DELETE_CODES,
  FABRIC_REMOVE_FAMILIES,
  FABRIC_SALES_HIDDEN_CODES,
  FABRIC_SEED,
  FAMILY_SHORT_MAP,
} from "../data/fabrics";
import { LS_AUTH, LS_FABRIC, getLS, setLS } from "./storage";
import { prettyCode } from "./formatters";

export function extractCodeKey(s){
  const str = String(s||"");
  if (/^\s*1SUN\s+DN\d+\s*$/i.test(str)) return str.trim().toUpperCase();
  const m = str.match(/^([A-Za-z0-9]+)\s*\d+/);
  if(!m) return (str.split("(")[0]).trim();
  const head = m[1].toUpperCase();
  const num = (str.match(/\d+/)||[""])[0];
  return `${head} ${num}`.trim();
}

function seedPriceByName() {
  const m = new Map();
  for (const fam of (FABRIC_SEED.families||[])) m.set(fam.name, fam.price);
  return m;
}

function placeFamilyAfter(families, familyName, anchorName) {
  const moving = (families||[]).find(f => f?.name === familyName);
  if (!moving) return families || [];

  const rest = (families||[]).filter(f => f?.name !== familyName);
  const anchorIndex = rest.findIndex(f => f?.name === anchorName);
  if (anchorIndex < 0) return [...rest, moving];

  return [
    ...rest.slice(0, anchorIndex + 1),
    moving,
    ...rest.slice(anchorIndex + 1),
  ];
}

export function runFabricPatches(){
  const cur  = getLS(LS_FABRIC, FABRIC_SEED);
  const seed = FABRIC_SEED;
  const seedPrice = seedPriceByName();

  const next = { ...cur, families: [] };
  const existingNames = new Set();

  for (const fam of (cur.families||[])) {
    if (FABRIC_REMOVE_FAMILIES.has(fam.name)) continue;

    const codes = Array.isArray(fam.codes)
      ? fam.codes.filter(c => !FABRIC_DELETE_CODES.has(extractCodeKey(c)))
      : [];

    let price = fam.price;
    const seedP = seedPrice.get(fam.name);
    if (price == null || price === 0) price = seedP != null ? seedP : 0;

    next.families.push({ ...fam, price, codes });
    existingNames.add(fam.name);
  }

  for (const fam of (seed.families||[])) {
    if (FABRIC_REMOVE_FAMILIES.has(fam.name)) continue;
    if (existingNames.has(fam.name)) continue;
    next.families.push(fam);
  }

  next.families = placeFamilyAfter(next.families, "DN-D", "DN (Single)");

  setLS(LS_FABRIC, next);
}

function filterCodesForRole(codes){
  const role = (getLS(LS_AUTH,null)?.role) || "worker";
  if(role !== "sales") return codes || [];
  return (codes||[]).filter(c => !FABRIC_SALES_HIDDEN_CODES.has(extractCodeKey(c)));
}

function colorSortKey(code){
  const s = String(code || "");
  const dn = s.match(/\bDN(\d{1,4})\b/i);
  const numMatch = s.match(/\b(\d{1,4})\b/);
  const num = dn ? parseInt(dn[1],10) : (numMatch ? parseInt(numMatch[1],10) : 99999);
  const isDN = !!dn;
  const stable = extractCodeKey(s);
  return [isDN ? 1 : 0, num, stable];
}

function compareColorCodes(a, b){
  const ka = colorSortKey(a), kb = colorSortKey(b);
  return (ka[0]-kb[0]) || (ka[1]-kb[1]) || ka[2].localeCompare(kb[2]);
}

function formatFamilyLabel(familyName) {
  const m = String(familyName||"").match(/^(.*?)(\s*\(B\/O\))?$/);
  const base = (m?.[1]||"").trim();
  const bo   = (m?.[2]||"").trim();
  const short = FAMILY_SHORT_MAP.get(base) || base.toUpperCase();
  return bo ? `${short} ${bo}` : short;
}

function formatColorLabel(raw) {
  const s = String(raw||"");
  const key = extractCodeKey(s);

  if (key === "1SUN DN300") return "DN300 (Grey)";
  if (key === "1SUN DN500") return "DN500 (Black)";

  const num = (s.match(/\b(\d{1,4})\b/) || [,""])[1];
  let name = (s.match(/\(([^)]+)\)/) || [,""])[1] || "";

  name = name.replace(/\s*\/\s*(Plain|Eva|Natural|Eco)\b/i, "").trim();

  if (name.includes("/")) {
    const parts = name.split("/");
    name = parts[parts.length-1].trim();
  }

  name = name.replace(/^[A-Z]{2,}\d+\s*[â€“-]\s*/,"").trim();

  if (!name) return num || s;
  if (/^\s*brown\s*$/i.test(name)) name = "Brown";

  return `${num} (${name})`;
}

function shortCodeForFamilyName(name){
  const raw = String(name||"").trim();
  const isBO = /\s*\(B\/O\)\s*$/i.test(raw);
  const base = raw.replace(/\s*\(B\/O\)\s*$/i,"").trim();
  const short = (FAMILY_SHORT_MAP.get(base) || base.toUpperCase()).split(" ")[0];
  return isBO ? `${short} B/O` : short;
}

function extractColorToken(color){
  const s = String(color||"");
  if (s.toUpperCase() === "TBD") return "TBD";
  const dn = s.match(/\bDN(300|500)\b/i);
  if (dn) return dn[0].toUpperCase();
  const n = s.match(/\b\d{1,4}\b/);
  return n ? n[0] : "";
}

export function canonicalFabricNo(it){
  const isDuo = it?.upType === "4FA(Duo)";

  let a = "";
  if (it?.fabric === "MANUAL") {
    a = prettyCode(it.fabricName || it.color || "");
  } else {
    const famA = shortCodeForFamilyName(it?.fabric);
    const tokA = extractColorToken(it?.color);
    a = tokA ? `${famA} ${tokA}` : famA;
  }

  let b = "";
  if (isDuo) {
    if (it?.fabricB === "MANUAL") {
      b = prettyCode(it.fabricNameB || it.colorB || "");
    } else if (it?.fabricB || it?.colorB) {
      const famB = shortCodeForFamilyName(it?.fabricB || it?.fabric);
      const tokB = extractColorToken(it?.colorB);
      b = tokB ? `${famB} ${tokB}` : famB;
    }
  }

  if (b) return a ? `${a} / ${b}` : b;
  return a;
}

export function buildColorOptionsForDisplay(codes){
  const visible = (filterCodesForRole(codes||[]) || []).slice().sort(compareColorCodes);
  const labels = {};
  for (const c of visible) labels[c] = formatColorLabel(c);
  const options = [...visible, "TBD"];
  labels["TBD"] = "TBD (decide later)";
  return { options, labels };
}

export function buildFamilyOptionsForDisplay(families){
  const options = (families||[]).map(f => f.name).concat(["MANUAL"]);
  const labels = { MANUAL: "Manual input" };
  for (const f of (families||[])) labels[f.name] = formatFamilyLabel(f.name);
  return { options, labels };
}

