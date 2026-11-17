// LA PRIMA PAGINA (REQ-DEV-004, REQ-FLOTTA-002): si apre, dice quello che
// deve, in italiano e in inglese, e porta ai prezzi e all'accesso. Senza
// entrare: è quello che vede chiunque.
import { test, expect } from '@playwright/test'
import { PIANI, menu, titoloDellaHome } from './aiuto.js'

test.describe('la prima pagina', () => {
  test('in italiano: il titolo scelto, i prezzi del listino, il nastro di test', async ({ page }) => {
    await page.goto('/')
    const titolo = page.getByRole('heading', { level: 1 })
    // Il titolo è quello dei testi della pagina, qualunque sia lo slogan.
    const scelto = titoloDellaHome('it')
    await expect(titolo).toContainText(scelto.prima)
    await expect(titolo.locator('.titolo-accento')).toHaveText(scelto.seconda)
    await expect(page.getByRole('note')).toContainText('TEST')
    await expect(menu(page).getByRole('link', { name: 'Prezzi' })).toHaveAttribute('href', '/#prezzi')
    // Il listino è quello di functions/piani.json: il Base col suo prezzo.
    const prezzi = page.locator('#prezzi')
    await expect(prezzi).toContainText(PIANI.base.nome)
    await expect(prezzi).toContainText('32,70')
  })

  test('in inglese: lo stesso filo, su /en', async ({ page }) => {
    await page.goto('/en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(titoloDellaHome('en').prima)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  // REQ-FLOTTA-133 (Daniele, 17/11/2026: «l'altezza del frame dove scorre il
  // video cambia. Dovrebbe essere fissa»): la prima schermata è alta uguale
  // per ogni diapositiva, sul computer, sul telefono e a 320 px.
  for (const [larghezza, altezza] of [[1280, 900], [390, 844], [320, 640]]) {
    test(`la cornice del carosello non cambia altezza fra i gesti, a ${larghezza} px`, async ({ page }) => {
      await page.setViewportSize({ width: larghezza, height: altezza })
      await page.goto('/')
      const cornice = page.locator('.hero')
      await expect(cornice).toBeVisible()
      const punti = page.locator('.gesto-punto')
      const quanti = await punti.count()
      expect(quanti).toBeGreaterThan(1)
      const altezze = []
      for (let i = 0; i < quanti; i++) {
        await punti.nth(i).click()
        await expect(punti.nth(i)).toHaveAttribute('aria-current', 'true')
        altezze.push(Math.round((await cornice.boundingBox()).height))
      }
      expect(new Set(altezze).size, `altezze della cornice: ${altezze.join(', ')}`).toBe(1)
    })
  }

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
    // Da un tag la versione è «vX.Y.Z»; da un ramo (il test segue develop, o
    // un lancio a mano) sono il ramo e il commit (src/lib/versione.js).
    await expect(page.getByTestId('versione')).toContainText(/Versione (v\d+\.\d+\.\d+|\S+ · [0-9a-f]{7})/)
  })
})
