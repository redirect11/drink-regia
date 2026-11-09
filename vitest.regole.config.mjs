import { defineConfig } from 'vitest/config'

// I TEST DELLE REGOLE FIRESTORE STANNO PER CONTO LORO (REQ-DEV-007).
//
// Girano contro l'emulatore Firestore con le regole vere del progetto
// (firestore.rules): senza emulatore acceso non partono, e dentro `npm test`
// renderebbero rossa la CI per un motivo che non è un difetto del codice. Da
// qui la configurazione separata e lo script dedicato, che accende
// l'emulatore, lancia vitest e lo spegne:
//
//   npm run test:regole
//
// Con l'emulatore già acceso a parte (firebase.collaudo.json, porta 8082):
//
//   npm run test:regole:vitest
//
// Non contano per la copertura: quello che misurano non è codice nostro, è
// firestore.rules. Stesso impianto di tana-drink (vitest.regole.config.mjs).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: { TZ: 'Europe/Rome' },
    include: ['tests/regole/**/*.test.js'],
    // Un emulatore solo, e ogni file si azzera il database prima di ogni
    // prova: in fila indiana, non in parallelo.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
