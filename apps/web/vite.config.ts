import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/portrait': 'http://127.0.0.1:5188',
      '/pose': 'http://127.0.0.1:5188',
      '/depth': 'http://127.0.0.1:5188',
      '/costume': 'http://127.0.0.1:5188',
      '/config.json': 'http://127.0.0.1:5188',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../data/galleries'),
    emptyOutDir: false,
    assetsDir: 'assets',
  },
})
