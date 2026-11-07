// LA DASHBOARD DEL TITOLARE (REQ-DEV-004, REQ-FLOTTA-004): ogni persona
// seminata vede la sua situazione: il piano, i moduli, l'abbonamento, la
// prova in corso, la scelta del piano per chi non ce l'ha.
import { test, expect } from '@playwright/test'
import { PIANI, MODULI, euro, prezzoMensile, entra, nomeDiCaso, PASSWORD } from './aiuto.js'

test.beforeEach(() => {
  test.skip(!PASSWORD, 'manca E2E_PASSWORD')
})

test.describe('la dashboard', () => {
  test('il Free: piano a zero coi suoi limiti, app attiva', async ({ page }) => {
    await entra(page, 'free')
    await expect(page.getByTestId('stato-istanza')).toHaveText('Attiva')
    await expect(page.getByTestId('prezzo-piano')).toContainText('0 € al mese')
    await expect(page.getByTestId('limiti-piano')).toContainText(`fino a ${PIANI.free.limiti.prodotti_max} prodotti`)
  })

  test('il Completo con Stripe: il prezzo IVA inclusa, i moduli compresi, il portale e il credito AI', async ({ page }) => {
    await entra(page, 'completo-stripe')
    await expect(page.getByRole('heading', { level: 2, name: nomeDiCaso('completo-stripe') })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Piano', exact: true })).toContainText(PIANI.completo.nome)
    await expect(page.getByTestId('prezzo-piano')).toContainText(`${euro(PIANI.completo.prezzo)} + IVA al mese`)
    await expect(page.getByRole('button', { name: 'Gestisci l’abbonamento' })).toBeVisible()
    await expect(page.getByTestId('credito-ai').first()).toBeVisible()
    await expect(page.getByTestId('ricariche-ai')).toContainText('in omaggio')
  })

  test('il Base coi moduli in più, pagato all’anno', async ({ page }) => {
    await entra(page, 'base-moduli')
    const nomi = ['magazzino', 'statistiche'].map((id) => MODULI.find((m) => m.id === id).nome)
    await expect(page.getByRole('region', { name: 'Piano', exact: true })).toContainText(`moduli: ${nomi.join(', ')}`)
    await expect(page.getByTestId('prezzo-piano')).toContainText('all’anno')
  })

  test('un pagamento a mano dice fino a quando è pagato; un moroso vede l’abbonamento non pagato', async ({ page }) => {
    await entra(page, 'base-manuale')
    await expect(page.getByTestId('pagato-fino-al')).toContainText('Pagato fino al')
    await expect(page.getByRole('region', { name: 'Piano', exact: true })).toContainText('4 terminali')
    await page.getByRole('button', { name: 'Esci' }).click()
    await entra(page, 'moroso')
    await expect(page.getByRole('region', { name: 'Piano', exact: true })).toContainText('Abbonamento non pagato.')
  })

  test('un modulo in prova si vede con la sua scadenza', async ({ page }) => {
    await entra(page, 'prova-modulo')
    const prova = page.getByRole('region', { name: 'Prova un modulo' })
    await expect(prova).toContainText(`${MODULI.find((m) => m.id === 'magazzino').nome} è in prova fino al`)
  })

  test('senza piano si sceglie: i moduli cambiano il totale, l’app non è attivata', async ({ page }) => {
    await entra(page, 'senza-piano')
    await expect(page.getByTestId('stato-istanza')).toHaveText('Non ancora attivata')
    const scelta = page.getByRole('region', { name: 'Scelta del piano' })
    await expect(scelta.getByTestId('prezzo-scelta')).toContainText(euro(PIANI.base.prezzo))
    const magazzino = MODULI.find((m) => m.id === 'magazzino')
    await scelta.getByLabel(new RegExp(`^${magazzino.nome}`)).check()
    await expect(scelta.getByTestId('prezzo-scelta')).toContainText(euro(prezzoMensile({ piano: 'base', moduli: ['magazzino'] })))
    await scelta.getByLabel(/^Completo/).check()
    await expect(scelta.getByTestId('prezzo-scelta')).toContainText(euro(PIANI.completo.prezzo))
  })
})
