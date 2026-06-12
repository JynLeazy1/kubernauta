import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

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
})
