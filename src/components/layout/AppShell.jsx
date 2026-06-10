export function AppShell({ children, toasts }) {
  return (
    <div className="winco-app min-h-screen text-slate-950">
      <style>{`input[type="checkbox"].cbx-25{width:2.5em;height:2.5em;}`}</style>
      {children}
      {toasts}
    </div>
  );
}

export function SplashScreen({ version }) {
  return (
    <div className="winco-splash">
      <div className="text-center">
        <img src="/winco-logo.png" alt="WINCO" className="mx-auto mb-3 block h-[72px]" />
        <div className="text-sm text-slate-500">v {version}</div>
      </div>
    </div>
  );
}

export function TabsFrame({ children }) {
  return (
    <div className="min-h-screen">
      <main className="winco-main mx-auto px-3 py-3 sm:px-4">
        {children}
      </main>
    </div>
  );
}

export function TopNavButton({ active, children, ...props }) {
  return (
    <button
      className={`winco-tab-button ${active ? "winco-tab-button-active" : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}

