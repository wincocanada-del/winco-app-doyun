import { useState } from "react";
import { APP_VERSION } from "../../data/appConfig";
import { ACCOUNT_PIN_MAP, ACCOUNTS, ROLE_LABELS } from "../../data/accounts";

export function SplashScreen(){
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <img src="/winco-logo.png" alt="WINCO" style={{ height: 72, display: "block", margin: "0 auto 12px" }}/>
        <div style={{ color: "#6b7280" }}>v {APP_VERSION}</div>
      </div>
    </div>
  );
}

export function LoginScreen({ onLoggedIn }){
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
