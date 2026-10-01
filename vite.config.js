import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inline-svg-loader',
      transformIndexHtml(html) {
        const svg = readFileSync('public/favicon.svg', 'utf-8')
        return html.replace('<!-- SVG-LOADER -->', svg)
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
