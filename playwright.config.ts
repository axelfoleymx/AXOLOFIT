import { defineConfig, devices } from '@playwright/test'

// Pruebas de interfaz de extremo a extremo en móvil y escritorio (modo local, sin servidor externo).
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  // En CI los runners son más lentos: se reintenta una prueba fallida antes de darla por mala
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: 'http://localhost:5188', trace: 'retain-on-failure' },
  expect: { timeout: 20_000 },
  webServer: { command: 'npx vite build && npx vite preview --port 5188 --strictPort', url: 'http://localhost:5188', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
  ],
})
