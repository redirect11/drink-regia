// L'ACCESSO E L'USCITA (REQ-DEV-004, REQ-FLOTTA-003): la password sbagliata
// si dice, quella giusta porta alla dashboard del proprio locale, si esce;
// chi non è admin non entra nel backoffice. La registrazione si prova solo
// fino ai controlli: creare account veri a ogni giro sporcherebbe il test.
import { test, expect } from '@playwright/test'
import { entra, emailDiCaso, nomeDiCaso, menu, PASSWORD } from './aiuto.js'

test.describe('l’accesso', () => {
  test('una password sbagliata non entra e lo dice', async ({ page }) => {
    await page.goto('/accedi')
    await page.getByLabel('Email').fill(emailDiCaso('free'))
    await page.getByLabel('Password').fill('non-e-questa-1')
    await page.getByRole('button', { name: 'Entra', exact: true }).click()
    await expect(page.locator('.errore')).toBeVisible()
    await expect(page).toHaveURL(/\/accedi$/)
  })

  test('il titolare entra, vede il suo locale, esce', async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'free')
    await expect(page.getByRole('heading', { level: 2, name: nomeDiCaso('free') })).toBeVisible()
    await expect(menu(page).getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(menu(page).getByRole('link', { name: 'Backoffice' })).toHaveCount(0)
    await menu(page).getByRole('button', { name: 'Esci' }).click()
    await expect(menu(page).getByRole('link', { name: 'Accedi' })).toBeVisible()
    // Chi è fuori non vede la dashboard: va all'accesso.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/accedi$/)
  })

  test('chi non è admin non entra nel backoffice', async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'completo-stripe')
    await page.goto('/backoffice/locali')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Scritto dietro il banco.')
  })
})

test.describe('la registrazione', () => {
  test('ogni passo si controlla prima di andare avanti; nessun account si crea', async ({ page }) => {
    await page.goto('/registrati')
    await page.getByRole('button', { name: 'Avanti' }).click()
    await expect(page.locator('.errore').first()).toBeVisible()
    await page.getByLabel('Email').fill('qualcuno@semina.example')
    await page.getByLabel(/^Password/).fill('corta1')
    await page.getByLabel('Ripeti la password').fill('corta1')
    await page.getByRole('button', { name: 'Avanti' }).click()
    await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('list', { name: 'Passi della registrazione' }).locator('[aria-current="step"]')).toHaveText('Account')
    await page.getByLabel(/^Password/).fill('lunghissima10')
    await page.getByLabel('Ripeti la password').fill('lunghissima10')
    await page.getByRole('button', { name: 'Avanti' }).click()
    await expect(page.getByRole('list', { name: 'Passi della registrazione' }).locator('[aria-current="step"]')).toHaveText('Il locale')
    // Il nome del locale mostra l'indirizzo che l'app avrà.
    await page.getByLabel('Nome del locale').fill('Bar di Prova E2E')
    await expect(page.getByText(/L’indirizzo dell’app sarà https:\/\/bar-di-prova-e2e\./)).toBeVisible()
  })
})
