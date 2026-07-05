import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5174,
  },
  build: {
    rollupOptions: {
      output: {
        // Separa las dependencias grandes en chunks propios: se cachean entre
        // despliegues (no cambian con cada cambio de la app) y aligeran el
        // chunk principal. El código de la app se trocea además con React.lazy
        // (subsistema profesor y vista de esquema) en App.jsx.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('/react') || id.includes('/scheduler')) return 'react'
            return 'vendor'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
})
