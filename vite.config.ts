import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'

// BUILD_TARGET=singlefile → inline everything into one self-contained index.html
// (double-clickable, fully offline). Otherwise a normal static build.
const singlefile = process.env.BUILD_TARGET === 'singlefile'

export default defineConfig({
  base: singlefile ? './' : '/',
  plugins: [react(), ...(singlefile ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, open: true },
})
