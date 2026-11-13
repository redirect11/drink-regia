// IL COLLAUDO DELLA LICENZA E DELL'AGGIORNAMENTO (REQ-DEV-009). Scrive sul
// test: sul locale di prova (prova-bar, o E2E_LOCALE_COLLAUDO) l'admin
// sospende e riattiva la licenza, e poi lancia «Aggiorna subito». Gira solo
// con E2E_COLLAUDO=true, dopo che un tag ha pubblicato sul test.
//
// Cosa prova: la licenza scritta dalla regia nel Firestore del locale, con
// l'account con cui girano le Functions (finding 3 dell'audit del
// 09/11/2026: è il permesso più delicato, datastore.user sul progetto del
// locale), e che l'app del locale la legga; poi la catena intera
// dell'aggiornamento: la Function, il dispatch a GitHub, il Terraform con
// l'account della regia, il deploy dell'app, il callback con il segreto
// della flotta. Il Terraform e il deploy vogliono otto-dieci minuti: il
// test aspetta fino a venti.
import { test, expect } from '@playwright/test'
import { entra, PASSWORD, COLLAUDO } from './aiuto.js'

const LOCALE = process.env.E2E_LOCALE_COLLAUDO || 'prova-bar'
const APP = process.env.E2E_APP_COLLAUDO || `https://drinkpos-${LOCALE}.web.app`
const MOTIVO = 'collaudo automatico'

// Niente ripetizioni: ripetere il gruppo lancerebbe un secondo
// aggiornamento vero del locale mentre il primo è ancora in corso.
test.describe.configure({ mode: 'serial', retries: 0 })
test.beforeEach(({ page }) => {
  test.skip(!COLLAUDO, 'il collaudo gira solo con E2E_COLLAUDO=true')
  test.skip(!PASSWORD, 'manca E2E_PASSWORD')
  return entra(page, 'admin')
})

// La scheda del locale di prova, aperta dall'indirizzo.
// Se il backoffice dice che non è riuscito a leggere (REQ-FLOTTA-064: un
// inciampo di rete del runner, come nel collaudo del v0.3.0-beta.10), si
// preme «Riprova» fino a tre volte: una lettura mancata non è un difetto
// del rilascio. Se dopo tre volte non legge, il test fallisce, e fa bene.
async function scheda(page) {
  await page.goto(`/backoffice/locali?locale=${LOCALE}`)
  const articolo = page.getByRole('article').filter({ hasText: LOCALE }).first()
  const riprova = page.getByRole('button', { name: 'Riprova' })
  for (let giri = 0; giri < 3; giri++) {
    await expect(articolo.or(riprova)).toBeVisible()
    if (await articolo.isVisible()) break
    await riprova.click()
  }
  await expect(articolo).toBeVisible()
  return articolo
}
const stato = (articolo) => articolo.locator('.locale-testa .stato')
// La versione installata, nel blocco App della scheda (REQ-FLOTTA-089): solo
// il numero, o «—». L'aggiornamento in corso sta nello stesso blocco; quello
// fallito negli avvisi in testa: per tutti e due si legge la scheda intera.
const versione = (articolo) => articolo.getByTestId(`versione-${LOCALE}`)

test('«Sospendi» scrive la licenza nel locale e l’app lo dice; «Riattiva» la rimette', async ({ page, context }) => {
  const articolo = await scheda(page)
  await expect(stato(articolo)).toHaveText('Attiva')
  page.once('dialog', (d) => d.accept(MOTIVO))
  await articolo.getByRole('button', { name: 'Sospendi' }).click()
  await expect(stato(articolo)).toContainText(`sospesa · ${MOTIVO}`)

  // L'app del locale legge licenza/attuale e si ferma, col motivo.
  const app = await context.newPage()
  await app.goto(APP)
  const avviso = app.getByRole('alert')
  await expect(avviso).toContainText('Installazione sospesa', { timeout: 60_000 })
  await expect(avviso).toContainText(`Motivo: ${MOTIVO}`)

  await articolo.getByRole('button', { name: 'Riattiva' }).click()
  await expect(stato(articolo)).toHaveText('Attiva')
  await app.reload()
  await expect(app.getByText('Installazione sospesa')).toHaveCount(0, { timeout: 60_000 })
  await app.close()
})

test('«Aggiorna subito» porta il locale all’ultima versione dell’app: il workflow parte, finisce e la scheda lo dice', async ({ page }) => {
  test.setTimeout(22 * 60_000)
  let articolo = await scheda(page)
  const prima = (await versione(articolo).textContent()).trim()
  await articolo.getByRole('button', { name: /^Aggiorna subito/ }).click()
  // «partito» dura poco: appena la Function ha scritto, la scheda si
  // ricarica e dice «in corso da meno di un minuto». Vanno bene tutti e due.
  await expect(articolo.getByRole('status')).toContainText(/partito|in corso/)

  // Finché la scheda dice «in corso» si aspetta; «fallito» ferma tutto.
  const scadenza = Date.now() + 20 * 60_000
  let testo = ''
  do {
    await page.waitForTimeout(30_000)
    articolo = await scheda(page)
    testo = (await articolo.textContent()).trim()
    expect(testo, `l’aggiornamento di ${LOCALE} è fallito`).not.toMatch(/fallito/)
  } while (/in corso/.test(testo) && Date.now() < scadenza)
  expect(testo, `l’aggiornamento di ${LOCALE} non è finito in venti minuti`).not.toMatch(/in corso/)
  const dopo = (await versione(articolo).textContent()).trim()
  expect(dopo).not.toBe('—')
  console.log(`[collaudo] ${LOCALE}: versione prima «${prima}», dopo «${dopo}»`)
})
