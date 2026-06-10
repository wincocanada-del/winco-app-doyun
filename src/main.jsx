import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // Tailwind 로드

import { registerSW } from 'virtual:pwa-register'

// 새 버전 배포되면 즉시 새로고침 + 주기적으로 업데이트 체크
registerSW({
  immediate: true,
  onNeedRefresh() {
    // 새 서비스워커가 대기 상태일 때 자동 갱신
    window.location.reload()
  },
  onRegistered(reg) {
    // 20초마다 새 버전 확인 (필요시 숫자 조정)
    if (reg && reg.update) {
      setInterval(() => reg.update(), 20000)
    }
  },
  onRegisterError(err) {
    console.error('Service Worker registration failed:', err)
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
