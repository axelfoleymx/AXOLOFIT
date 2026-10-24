/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { serverApiPlugin } from './server/vitePlugin.ts'

// Las claves privadas (ANTHROPIC_API_KEY, USDA_API_KEY) solo se leen en el servidor de desarrollo;
// nunca llevan el prefijo VITE_ y por lo tanto nunca llegan al bundle del navegador.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      serverApiPlugin(env),
      // PWA: la app (código, catálogos e imágenes) queda en caché para abrir y registrar sin conexión.
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'ATHLETIQ', short_name: 'ATHLETIQ', lang: 'es', start_url: '/', display: 'standalone',
          background_color: '#0e0f11', theme_color: '#0e0f11',
          icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,webp,svg}'],
          maximumFileSizeToCacheInBytes: 3_000_000,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'fonts' } },
          ],
        },
      }),
    ],
    resolve: { alias: { '@': '/src' } },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    },
  }
})
