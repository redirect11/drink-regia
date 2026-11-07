// LA PRIMA PAGINA (REQ-DEV-004, REQ-FLOTTA-002): si apre, dice quello che
// deve, in italiano e in inglese, e porta ai prezzi e all'accesso. Senza
// entrare: è quello che vede chiunque.
import { test, expect } from '@playwright/test'
import { PIANI, menu } from './aiuto.js'

test.describe('la prima pagina', () => {
  test('in italiano: il titolo scelto, i prezzi del listino, il nastro di test', async ({ page }) => {
    await page.goto('/')
    const titolo = page.getByRole('heading', { level: 1 })
    await expect(titolo).toContainText('Scritto dietro il banco.')
    await expect(titolo.locator('.titolo-oro')).toHaveText('In servizio ogni sera.')
    await expect(page.getByRole('note')).toContainText('TEST')
    await expect(menu(page).getByRole('link', { name: 'Prezzi' })).toHaveAttribute('href', '/#prezzi')
    // Il listino è quello di functions/piani.json: il Base col suo prezzo.
    const prezzi = page.locator('#prezzi')
    await expect(prezzi).toContainText(PIANI.base.nome)
    await expect(prezzi).toContainText('32,70')
  })

  test('in inglese: lo stesso filo, su /en', async ({ page }) => {
    await page.goto('/en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Written behind the bar.')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('«Accedi» porta all’accesso, «Attiva il tuo locale» alla registrazione', async ({ page }) => {
    await page.goto('/')
    await menu(page).getByRole('link', { name: 'Accedi' }).click()
    await expect(page).toHaveURL(/\/accedi$/)
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible()
    await page.goto('/')
    await menu(page).getByRole('link', { name: 'Attiva il tuo locale' }).click()
    await expect(page).toHaveURL(/\/registrati$/)
    await expect(page.getByRole('heading', { name: 'Registra il tuo locale' })).toBeVisible()
  })

  test('il piè di pagina ha termini, privacy e la versione', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Termini/ }).first()).toHaveAttribute('href', '/termini')
    await expect(page.getByRole('link', { name: /Privacy/ }).first()).toHaveAttribute('href', '/privacy')
    await expect(page.getByTestId('versione')).toContainText(/v\d+\.\d+\.\d+/)
  })
})
