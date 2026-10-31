import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The API host lives in vercel.json only; dev proxies to the same place.
const rewrite = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
  .rewrites.find((r: { source: string }) => r.source === '/api/:path*')
const apiOrigin = new URL(rewrite.destination.replace('/:path*', '')).origin

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: apiOrigin, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
})
