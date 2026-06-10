import React, { useEffect, useState } from "react";

/** 클릭 시 최상단/최하단으로 스무스 이동하는 플로팅 내비게이션 */
export default function ScrollNav({
  center = true, // true면 화면 가로 중앙, false면 오른쪽 정렬
}) {
  const [showUp, setShowUp] = useState(false);
  const [showDown, setShowDown] = useState(false);

  const atTop = () => window.scrollY <= 2;
  const atBottom = () =>
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

  useEffect(() => {
    const onScroll = () => {
      setShowUp(!atTop());
      setShowDown(!atBottom());
    };
    onScroll(); // 초기 상태 반영
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const smoothTop = () =>
    window.scrollTo({ top: 0, behavior: "smooth" });

  const smoothBottom = () =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });

  // 위치 프리셋
  const posTop = center
    ? "fixed top-4 left-1/2 -translate-x-1/2"
    : "fixed top-4 right-4";
  const posBottom = center
    ? "fixed bottom-4 left-1/2 -translate-x-1/2"
    : "fixed bottom-4 right-4";

  // ✅ 크기 1/2 & 색상 반전: 흰색 원 + 검은 화살표
  const btnCls =
    "pointer-events-auto inline-flex items-center justify-center " +
    "w-11 h-11 md:w-12 md:h-12 rounded-full shadow border border-black/15 " +
    "bg-white text-black hover:bg-white active:scale-95 transition";

  const ArrowUp = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 19V5" strokeLinecap="round" />
      <path d="M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const ArrowDown = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 5v14" strokeLinecap="round" />
      <path d="M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="pointer-events-none z-[1000]">
      {/* Up */}
      <div className={`${posTop} transition-opacity ${showUp ? "opacity-100" : "opacity-0"} duration-200`}>
        <button
          aria-label="Scroll to top"
          className={btnCls}
          onClick={smoothTop}
        >
          <ArrowUp />
        </button>
      </div>
      {/* Down */}
      <div className={`${posBottom} transition-opacity ${showDown ? "opacity-100" : "opacity-0"} duration-200`}>
        <button
          aria-label="Scroll to bottom"
          className={btnCls}
          onClick={smoothBottom}
        >
          <ArrowDown />
        </button>
      </div>
    </div>
  );
}
