/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Le site est publié sous https://alticoco.github.io/atelier-etageres/
export default defineConfig({
  base: '/atelier-etageres/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
