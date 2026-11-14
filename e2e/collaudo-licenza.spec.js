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
// REQ-FLOTTA-101: anche la scheda ha un «Riprova», quello di un
// aggiornamento fallito, e in modalità rigorosa due elementi fermano
// l'attesa. Si aspetta il primo dei due; se la scheda c'è si esce, e il
// «Riprova» si preme solo quando la scheda non c'è, cioè quello della
// lettura fallita.
async function scheda(page) {
  await page.goto(`/backoffice/locali?locale=${LOCALE}`)
  const articolo = page.getByRole('article').filter({ hasText: LOCALE }).first()
  const riprova = page.getByRole('button', { name: 'Riprova' })
  for (let giri = 0; giri < 3; giri++) {
    await expect(articolo.or(riprova).first()).toBeVisible()
    if (await articolo.isVisible()) break
    await riprova.first().click()
  }
  await expect(articolo).toBeVisible()
  return articolo
}
const stato = (articolo) => articolo.locator('.locale-testa .stato')

// IL LOCALE IN ORDINE (REQ-FLOTTA-103, Daniele, 14/11/2026: «mettilo ora in
// ogni caso»). Le prove cambiano davvero il locale di prova: se una si
// ferma a metà, il giro dopo lo trova sospeso e si ferma anche lui, finché
// qualcuno non preme «Riattiva» a mano. Prima di cominciare, e alla fine
// di «Sospendi» anche dopo un errore, lo si riattiva.
async function riattivaSeSospeso(articolo) {
  const testo = ((await stato(articolo).textContent()) || '').trim()
  if (!testo.startsWith('sospesa')) return
  await articolo.getByRole('button', { name: 'Riattiva' }).click()
  await expect(stato(articolo)).toHaveText('Attiva')
}
// La versione installata, nel blocco App della scheda (REQ-FLOTTA-089): solo
// il numero, o «—». L'aggiornamento in corso sta nello stesso blocco; quello
// fallito negli avvisi in testa: per tutti e due si legge la scheda intera.
const versione = (articolo) => articolo.getByTestId(`versione-${LOCALE}`)

test('«Sospendi» scrive la licenza nel locale e l’app lo dice; «Riattiva» la rimette', async ({ page, context }) => {
  const articolo = await scheda(page)
  await riattivaSeSospeso(articolo)
  await expect(stato(articolo)).toHaveText('Attiva')
  const app = await context.newPage()
  try {
    page.once('dialog', (d) => d.accept(MOTIVO))
    await articolo.getByRole('button', { name: 'Sospendi' }).click()
    await expect(stato(articolo)).toContainText(`sospesa · ${MOTIVO}`)

    // L'app del locale legge licenza/attuale e si ferma. Chi la apre senza
    // entrare è il pubblico: da REQ-LIC-018 di tana-drink (Daniele,
    // 13/11/2026: «chi entra nel locale non deve leggere che il titolare non
    // ha pagato») legge solo che il menù non è disponibile, mai il motivo
    // (REQ-FLOTTA-102). Un'app di prima mostrava a tutti «Installazione
    // sospesa» col motivo: passa finché il locale di prova non è aggiornato.
    await app.goto(APP)
    const avviso = app.getByRole('alert')
    await expect(avviso).toContainText(/Menù non disponibile|Installazione sospesa/, { timeout: 60_000 })
    if (/Menù non disponibile/.test(await avviso.textContent())) {
      await expect(avviso).not.toContainText(MOTIVO)
    }

    await articolo.getByRole('button', { name: 'Riattiva' }).click()
    await expect(stato(articolo)).toHaveText('Attiva')
    await app.reload()
    await expect(app.getByText(/Menù non disponibile|Installazione sospesa/)).toHaveCount(0, { timeout: 60_000 })
  } finally {
    // Anche se la prova si è fermata a metà: il locale torna attivo per il
    // giro dopo. Un errore qui non copre quello della prova.
    await riattivaSeSospeso(articolo).catch(() => {})
    await app.close().catch(() => {})
  }
})

test('«Aggiorna subito» porta il locale all’ultima versione dell’app: il workflow parte, finisce e la scheda lo dice', async ({ page }) => {
  test.setTimeout(22 * 60_000)
  let articolo = await scheda(page)
  await riattivaSeSospeso(articolo)
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
