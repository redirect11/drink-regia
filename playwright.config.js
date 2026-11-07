// I TEST END-TO-END CON PLAYWRIGHT (REQ-DEV-004). L'utente, 07/11/2026:
// «fare testing e2e con playwright per i casi d'uso comuni», sulla regia di
// test con i locali seminati da scripts/semina-test.mjs.
//
// DUE MODI DI GIRARE:
// - in locale, senza E2E_URL: il sito si compila con la configurazione del
//   progetto di test (`.env.e2e`, scritto dalla semina: Vite lo legge con
//   --mode e2e) e si serve con `vite preview`; i dati e le Functions sono
//   quelli di drink-regia-test. Così si prova anche quello che non è
//   ancora pubblicato sul test;
// - contro un sito pubblicato, con E2E_URL (la CI: https://drink-regia-test.web.app).
// In tutti e due i casi servono le persone seminate e la loro password
// (E2E_PASSWORD, in .env.e2e o nei segreti dell'environment GitHub).
import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

// .env.e2e, senza dipendenze: NOME=valore, una per riga, # per i commenti.
// Quello che è già nell'ambiente vince (la CI passa i suoi).
if (existsSync('.env.e2e')) {
  for (const riga of readFileSync('.env.e2e', 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(riga.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

// Non la 4173 di vite preview: su questa macchina era già occupata (07/11/2026).
const PORTA = 4317
// «localhost» e non 127.0.0.1: vite preview ascolta su ::1 (07/11/2026).
const URL = process.env.E2E_URL || `http://localhost:${PORTA}`

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/risultati',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/rapporto' }]],
  use: {
    baseURL: URL,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${PORTA} --strictPort`,
        url: URL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
})
