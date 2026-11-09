import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  // La versione che il sito mostra nel piè di pagina: nei test è quella di
  // package.json, come nel build senza VITE_APP_VERSION (vite.config.js).
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  test: {
    environment: 'node',
    globals: true,
    env: { TZ: 'Europe/Rome' },
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
    // Fuori i test delle REGOLE Firestore (REQ-DEV-007): vogliono l'emulatore
    // acceso e hanno una configurazione loro (vitest.regole.config.mjs, `npm
    // run test:regole`). Qui dentro renderebbero rossa la CI senza che ci
    // sia niente di rotto, e rallenterebbero i test unitari.
    exclude: [...configDefaults.exclude, 'tests/regole/**'],
    // I test delle pagine compilano i moduli lettera per lettera: con tutta
    // la suite e la copertura, su una macchina carica, i 5 secondi di partenza
    // non bastavano, e scadeva ogni volta un test diverso (02/11/2026).
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['functions/lib/**/*.js', 'src/**/*.js', 'src/**/*.jsx'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // IL CANCELLO (REQ-DEV-002): sotto queste soglie `npm run
      // test:coverage` fallisce, e con lui la CI delle pull request. Ogni
      // area ha la sua soglia, appena sotto il misurato del 22/10/2026
      // (functions/lib 98,9/73,4/100; src 88,9/95,8/66,7; src/lib
      // 60,0/83,9/93,1; src/pages 82,6/82,4/73,7). Un cricchetto, come in
      // tana-drink: si alzano quando la copertura cresce, non si abbassano
      // mai per far passare un merge.
      thresholds: {
        'functions/lib/**/*.js': { statements: 96, branches: 70, functions: 95, lines: 96 },
        'src/*.{js,jsx}': { statements: 85, branches: 90, functions: 60, lines: 85 },
        // 30/10/2026: db.js ha il suo test (tests/db.test.js), src/lib misura
        // 97,3/88,1/98,9/97,3.
        'src/lib/**': { statements: 96, branches: 86, functions: 97, lines: 96 },
        'src/pages/**': { statements: 80, branches: 80, functions: 70, lines: 80 },
      },
    },
  },
})
