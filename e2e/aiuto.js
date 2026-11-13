// Gli aiuti dei test end-to-end (REQ-DEV-004): le persone seminate e come
// si entra. Le persone sono le stesse di scripts/lib-semina.mjs, così un
// caso nuovo si aggiunge in un posto solo.
import { expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { ADMIN, emailDi, persona } from '../scripts/lib-semina.mjs'

// Il listino, letto come fanno gli script: src/lib/piani.js importa il JSON
// alla maniera di Vite, che Node da solo non accetta senza attributi.
const require = createRequire(import.meta.url)
export const LISTINO = require('../functions/piani.json')
export const PIANI = LISTINO.piani
export const MODULI = LISTINO.moduli
const alCentesimo = (n) => Math.round((Number(n) || 0) * 100) / 100
// Le stesse regole di src/lib/piani.js (euro, prezzoMensile).
export const euro = (n) => {
  const v = alCentesimo(n)
  const intero = String(Math.trunc(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const cent = Math.round(Math.abs(v) * 100) % 100
  return `${v < 0 ? '-' : ''}${intero}${cent ? ',' + String(cent).padStart(2, '0') : ''} €`
}
export function prezzoMensile({ piano = 'base', moduli = [], terminali = 1 } = {}) {
  const p = PIANI[piano] || PIANI.base
  const inclusi = new Set(p.include)
  const extra = MODULI.filter((m) => moduli.includes(m.id) && !inclusi.has(m.id))
  const terminaliExtra = Math.max(0, (Number(terminali) || 1) - (p.terminali || 1))
  return alCentesimo(p.prezzo + extra.reduce((s, m) => s + m.prezzo, 0) + terminaliExtra * LISTINO.terminale_in_piu)
}

export const PASSWORD = process.env.E2E_PASSWORD
// Il collaudo (REQ-DEV-009): le prove che scrivono sulla regia di test
// (e2e/collaudo-*.spec.js) girano solo quando lo si chiede, cioè quando un
// tag ha appena pubblicato sul test. Senza, si saltano e il giro resta in
// sola lettura.
export const COLLAUDO = process.env.E2E_COLLAUDO === 'true'
export const emailDiCaso = (caso) => (caso === 'admin' ? process.env.E2E_ADMIN || emailDi(ADMIN.slug) : emailDi(persona(caso).slug))
export const nomeDiCaso = (caso) => persona(caso).nome

// Senza la password non si entra da nessuna parte: lo si dice subito,
// invece di far fallire ogni test con un messaggio di accesso.
export function servePassword() {
  if (!PASSWORD) throw new Error('Manca E2E_PASSWORD: semina il progetto di test (npm run semina:test) o passa la password nell’ambiente.')
}

// Entra dalla pagina di accesso come una persona, e aspetta la dashboard.
export async function entra(page, caso) {
  servePassword()
  await page.goto('/accedi')
  await page.getByLabel('Email').fill(emailDiCaso(caso))
  await page.getByLabel('Password').fill(PASSWORD)
  // `exact`: c'è anche «Entra con Google».
  await page.getByRole('button', { name: 'Entra', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

// L'area del titolare è in sezioni (REQ-FLOTTA-084): ci si va dal suo
// sotto-menù, come farebbe il titolare. `exact`: «Il locale» è anche
// dentro «Chiudi il locale».
export async function sezione(page, nome) {
  await page.getByRole('navigation', { name: 'Sezioni dell’area del titolare' }).getByRole('link', { name: nome, exact: true }).click()
}

// Il menù principale: sul telefono sta dietro il tasto, sul desktop è aperto.
export const menu = (page) => page.getByRole('navigation', { name: 'Principale' })
