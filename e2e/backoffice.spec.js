// IL BACKOFFICE DELL'ADMIN (REQ-DEV-004, REQ-FLOTTA-005, REQ-FLOTTA-041):
// l'elenco dei locali con le viste e la ricerca, la scheda che si apre, le
// richieste, e la sezione «Commerciale» coi numeri delle persone seminate.
// Nessuna azione che scriva: il test lascia il test com'era.
import { test, expect } from '@playwright/test'
import { PERSONE } from '../scripts/lib-semina.mjs'
import { entra, nomeDiCaso, PASSWORD } from './aiuto.js'

test.beforeEach(async ({ page }) => {
  test.skip(!PASSWORD, 'manca E2E_PASSWORD')
  await entra(page, 'admin')
})

test.describe('i locali', () => {
  test('l’elenco ha le persone seminate; la vista «Sospesi o chiusi» e la ricerca filtrano; il nome apre la scheda', async ({ page }) => {
    await page.goto('/backoffice/locali')
    const tabella = page.getByRole('table', { name: 'Locali' })
    await expect(tabella).toBeVisible()
    const quanti = Number((await page.getByTestId('quanti-locali').textContent()).match(/(\d+) locali/)[1])
    expect(quanti).toBeGreaterThanOrEqual(PERSONE.length)
    await page.getByLabel('Stato').selectOption('fermi')
    await expect(page).toHaveURL(/vista=fermi/)
    await expect(tabella.getByRole('button', { name: nomeDiCaso('moroso') })).toBeVisible()
    await expect(tabella.getByRole('button', { name: nomeDiCaso('free') })).toHaveCount(0)
    await page.getByLabel('Stato').selectOption('tutti')
    await page.getByRole('searchbox', { name: 'Cerca' }).fill('completo-stripe')
    await expect(tabella.locator('tr.riga-locale')).toHaveCount(1)
    await tabella.getByRole('button', { name: nomeDiCaso('completo-stripe') }).click()
    const scheda = page.getByRole('article', { name: nomeDiCaso('completo-stripe') })
    await expect(scheda).toBeVisible()
    await expect(scheda.getByRole('button', { name: 'Cambia piano…' })).toBeVisible()
    await expect(page).toHaveURL(/locale=completo-stripe/)
  })

  test('«Richieste» ha l’attivazione da autorizzare e i contatti aperti', async ({ page }) => {
    await page.goto('/backoffice/richieste')
    await expect(page.getByText(nomeDiCaso('da-approvare')).first()).toBeVisible()
    const contatti = page.getByRole('region', { name: 'Richieste di contatto' })
    await expect(contatti).toContainText(nomeDiCaso('senza-piano'))
  })
})

test.describe('il commerciale', () => {
  test('le tessere hanno i numeri, il periodo sta nell’indirizzo, le tabelle ci sono', async ({ page }) => {
    await page.goto('/backoffice/commerciale')
    const incasso = page.getByTestId('kpi-incasso')
    await expect(incasso).toBeVisible()
    await expect(incasso).toContainText(/\d+(,\d{2})? €/)
    await expect(page.getByTestId('kpi-mrr')).toContainText(/\d+(,\d{2})? €/)
    await expect(page.getByTestId('kpi-paganti')).not.toContainText(/^Clienti paganti0/)
    await expect(page.getByTestId('kpi-viste')).toContainText(/\d/)
    await page.getByRole('combobox', { name: 'Periodo' }).selectOption('90')
    await expect(page).toHaveURL(/periodo=90/)
    await expect(page.getByRole('table', { name: 'Elenco degli abbonamenti' })).toContainText(nomeDiCaso('completo-stripe'))
    await expect(page.getByRole('table', { name: 'Elenco dei movimenti' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Incasso per giorno' }).getByRole('img')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Dal visitatore al cliente' })).toContainText('Registrazioni')
  })

  test('«Esporta CSV» scarica gli abbonamenti', async ({ page }) => {
    await page.goto('/backoffice/commerciale')
    await expect(page.getByTestId('kpi-incasso')).toBeVisible()
    const attesa = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Esporta CSV' }).first().click()
    const file = await attesa
    expect(file.suggestedFilename()).toMatch(/^abbonamenti-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
