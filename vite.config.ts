/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { serverApiPlugin } from './server/vitePlugin.ts'

// Las claves privadas (ANTHROPIC_API_KEY, USDA_API_KEY) solo se leen en el servidor de desarrollo;
// nunca llevan el prefijo VITE_ y por lo tanto nunca llegan al bundle del navegador.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), serverApiPlugin(env)],
    resolve: { alias: { '@': '/src' } },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    },
  }
})
