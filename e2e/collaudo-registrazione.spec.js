// IL COLLAUDO DELLA REGISTRAZIONE (REQ-DEV-009). Diversamente dagli altri
// test end-to-end, questo SCRIVE sulla regia di test: si registra davvero,
// come un titolare, e poi l'admin cancella quello che ha creato. Gira solo
// quando lo si chiede (E2E_COLLAUDO=true): nel workflow di deploy, dopo
// che un tag ha pubblicato sul test, prima che lo stesso codice possa
// andare in produzione.
//
// Cosa prova, che il giro in sola lettura non può: la Function
// registraCliente con l'account con cui girano le Functions (il documento
// del cliente lo scrive lei, non il browser: REQ-FLOTTA-045), l'account di
// Auth, l'email di verifica, la dashboard del nuovo titolare; e che un
// secondo titolare con lo stesso nome del locale venga fermato sullo slug
// e possa sceglierne un altro. Non attiva mai l'istanza: creerebbe un
// progetto Google, e la quota dei progetti è contata.
import { test, expect } from '@playwright/test'
import { entra, menu, PASSWORD, COLLAUDO } from './aiuto.js'

// Un'etichetta diversa a ogni giro, così due collaudi non si pestano; il
// dominio .invalid non consegna mai (RFC 2606): l'email di verifica parte e
// non arriva a nessuno.
const marca = Date.now().toString(36)
const NOME = `Collaudo ${marca}`
const SLUG = `collaudo-${marca}`
const email = (suffisso = '') => `collaudo-${marca}${suffisso}@collaudo.invalid`
const PASSWORD_NUOVA = `collaudo-${marca}-ok`
const SLUG_IN_USO = 'Questo identificativo è già in uso: scegline un altro.'

// Niente ripetizioni: in un gruppo seriale un fallimento fa ripartire il
// file intero, e qui il secondo giro trovava i clienti del primo (due con
// lo stesso nome) e confondeva la pulizia. Un collaudo fallito si legge
// nel rapporto e si rilancia col tag dopo.
test.describe.configure({ mode: 'serial', retries: 0 })
test.beforeEach(() => {
  test.skip(!COLLAUDO, 'il collaudo gira solo con E2E_COLLAUDO=true')
  test.skip(!PASSWORD, 'manca E2E_PASSWORD')
})

// La registrazione in quattro passi, come la farebbe un titolare.
async function registra(page, { email, nome }) {
  await page.goto('/registrati')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/^Password/).fill(PASSWORD_NUOVA)
  await page.getByLabel('Ripeti la password').fill(PASSWORD_NUOVA)
  await page.getByRole('button', { name: 'Avanti' }).click()
  await page.getByLabel('Nome del locale').fill(nome)
  await page.getByLabel('Tipo di locale').selectOption('bar')
  await page.getByLabel('Indirizzo').fill('Via del Collaudo 1')
  await page.getByLabel('CAP').fill('00100')
  await page.getByLabel('Città').fill('Roma')
  await page.getByLabel('Provincia').fill('RM')
  await page.getByLabel('Telefono del locale').fill('06 0000000')
  await page.getByRole('button', { name: 'Avanti' }).click()
  await page.getByLabel('Ragione sociale').fill(`${nome} srl`)
  // `exact`: c'è anche «Codice fiscale (se diverso dalla partita IVA)».
  await page.getByLabel('Partita IVA', { exact: true }).fill('01234567897')
  await page.getByLabel('PEC').fill(`${email.split('@')[0]}@pec.invalid`)
  await page.getByRole('button', { name: 'Avanti' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Collaudo')
  await page.getByLabel('Cognome').fill('Automatico')
  await page.getByLabel(/accetto i/).check()
  await page.getByLabel(/informativa sulla privacy/).check()
  await page.getByRole('button', { name: /Crea l’account/ }).click()
}

// L'admin, già entrato, cancella i clienti di collaudo: quelli di questo
// giro e quelli rimasti da un giro fallito prima (la ricerca li trova
// tutti dallo slug).
async function ripulisci(page) {
  await page.goto('/backoffice/locali')
  const tabella = page.getByRole('table', { name: 'Locali' })
  await expect(tabella).toBeVisible()
  await page.getByRole('searchbox', { name: 'Cerca' }).fill('collaudo-')
  const righe = tabella.locator('tr.riga-locale')
  // Una alla volta: ogni eliminazione ricarica l'elenco. Si conta per
  // righe e non per nome: due clienti di collaudo possono chiamarsi
  // uguale (il titolare e il «secondo titolare» del giro prima).
  for (let giri = 0; giri < 20; giri++) {
    const quante = await righe.count()
    if (quante === 0) break
    const nome = (await righe.first().locator('.nome-locale').textContent()).trim()
    await righe.first().getByRole('button', { name: nome }).click()
    const scheda = page.getByRole('article', { name: nome })
    page.once('dialog', (d) => d.accept())
    await scheda.getByRole('button', { name: 'Elimina cliente…' }).click()
    await expect(righe).toHaveCount(quante - 1)
  }
  await expect(righe).toHaveCount(0)
}

test('prima, l’admin toglie i clienti di collaudo rimasti da un giro precedente', async ({ page }) => {
  await entra(page, 'admin')
  await ripulisci(page)
})

test('un titolare nuovo si registra: account, documento del cliente, dashboard con la verifica dell’email e la scelta del piano', async ({ page }) => {
  await registra(page, { email: email(), nome: NOME })
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { level: 2, name: NOME })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Conferma la tua email')
  await expect(page.getByRole('region', { name: 'Scelta del piano' })).toBeVisible()
  // L'app non si attiva da qui (niente progetto nuovo): senza l'email
  // verificata e senza un piano il bottone c'è ma è spento.
  await expect(page.getByRole('button', { name: 'Attiva l’istanza' })).toBeDisabled()
})

test('un secondo titolare con lo stesso nome del locale si ferma sullo slug, ne sceglie un altro e passa', async ({ page }) => {
  await registra(page, { email: email('-bis'), nome: NOME })
  await expect(page.getByText(SLUG_IN_USO)).toBeVisible()
  const identificativo = page.getByLabel(/Identificativo dell’app/)
  await expect(identificativo).toBeVisible()
  await identificativo.fill(`${SLUG}-bis`)
  await page.getByRole('button', { name: 'Avanti' }).click()
  await page.getByRole('button', { name: 'Avanti' }).click()
  // Arrivati al referente si è ancora sulla registrazione: il primo
  // collaudo (09/11/2026) trovò che il secondo «Avanti» inviava il modulo
  // da sé, e l'account nasceva senza premere «Crea l’account».
  await expect(page).toHaveURL(/\/registrati/)
  await expect(page.getByRole('button', { name: /Crea l’account/ })).toBeEnabled()
  await page.getByRole('button', { name: /Crea l’account/ }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { level: 2, name: NOME })).toBeVisible()
})

test('l’admin vede i due clienti nel backoffice e li elimina: account e documenti spariscono', async ({ page }) => {
  await entra(page, 'admin')
  await page.goto('/backoffice/locali')
  await page.getByRole('searchbox', { name: 'Cerca' }).fill(SLUG)
  const tabella = page.getByRole('table', { name: 'Locali' })
  await expect(tabella.locator('tr.riga-locale')).toHaveCount(2)
  await ripulisci(page)
  // Il titolare eliminato non entra più: l'account non c'è. Prima esce
  // l'admin, altrimenti /accedi rimanda alla sua dashboard.
  await menu(page).getByRole('button', { name: 'Esci' }).click()
  await page.goto('/accedi')
  await page.getByLabel('Email').fill(email())
  await page.getByLabel('Password').fill(PASSWORD_NUOVA)
  await page.getByRole('button', { name: 'Entra', exact: true }).click()
  await expect(page.locator('.errore').first()).toBeVisible()
  await expect(page).not.toHaveURL(/\/dashboard/)
})
