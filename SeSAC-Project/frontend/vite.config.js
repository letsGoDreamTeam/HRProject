import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
  '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    /** 0.0.0.0 바인딩 — LAN(예: http://192.168.x.x:5173)에서 접속 가능 */
    host: true,
    proxy: { ...apiProxy },
  },
  /** `npm run preview`에도 동일 프록시 (기본값은 dev만 적용됨) */
  preview: {
    host: true,
    proxy: { ...apiProxy },
  },
})
