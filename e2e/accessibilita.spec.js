// L'ACCESSIBILITÀ, PROVATA CON AXE-CORE (REQ-FLOTTA-125, punti D ed E).
// Daniele, 17/11/2026: «prima di tutto cerchiamo di diventare completamente
// conformi». L'audit di quel giorno (axe-core sulle sei pagine pubbliche
// del sito di test) aveva 0 violazioni, ma dashboard e backoffice, dietro
// l'accesso, non erano mai stati provati. Da qui ogni giro delle prove le
// prova tutte: una violazione delle regole WCAG 2.0, 2.1 e 2.2 di livello A
// o AA fa fallire la prova, col nome della regola e degli elementi.
//
// Gira nelle «Prove in sola lettura» di e2e.yml (il nome non contiene
// «collaudo»): guarda e basta, non scrive niente. Senza E2E_PASSWORD le
// pagine dietro l'accesso si saltano, come nelle altre prove.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { SEZIONI_TITOLARE, indirizzoSezione } from '../src/lib/areaTitolare.js'
import { SEZIONI, BASE, AGGIUNTE } from '../src/lib/backoffice.js'
import { entra, PASSWORD } from './aiuto.js'

// I livelli A e AA delle tre versioni delle WCAG: quelli che la legge
// europea richiama (EN 301 549 rimanda alle WCAG 2.1 AA) e in più le 2.2.
export const REGOLE_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// La pagina è pronta quando ha il suo titolo e niente «Carico…». Non
// «networkidle»: Firestore tiene una connessione aperta e la rete non si
// ferma mai. Il mezzo secondo in più lascia arrivare i riquadri che
// leggono da soli (le Functions di «Salute», «Commerciale»…).
async function pronta(page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('main').getByText(/^Carico/)).toHaveCount(0)
  await page.waitForTimeout(500)
}

// La prova: tutte le violazioni A e AA, con regola, impatto ed elementi,
// così il rapporto dice cosa correggere senza rifarla a mano.
async function senzaViolazioni(page, dove) {
  await pronta(page)
  const { violations } = await new AxeBuilder({ page }).withTags(REGOLE_WCAG).analyze()
  const trovate = violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`)
  expect(trovate, `violazioni WCAG A/AA su ${dove}`).toEqual([])
}

const PUBBLICHE = ['/', '/en', '/registrati', '/accedi', '/termini', '/privacy']

for (const [vista, dimensioni] of [
  ['computer', { width: 1280, height: 900 }],
  ['telefono', { width: 390, height: 844 }],
]) {
  test.describe(`le pagine pubbliche, da ${vista}`, () => {
    test.use({ viewport: dimensioni })
    for (const percorso of PUBBLICHE) {
      test(`${percorso}: nessuna violazione A o AA`, async ({ page }) => {
        await page.goto(percorso)
        await senzaViolazioni(page, `${percorso} (${vista})`)
      })
    }
  })
}

test.describe('la struttura delle pagine pubbliche', () => {
  test('ogni pagina ha il suo titolo e un solo h1; «Salta al contenuto» è il primo tasto e porta al contenuto', async ({ page }) => {
    const titoli = new Set()
    for (const percorso of PUBBLICHE) {
      await page.goto(percorso)
      await pronta(page)
      titoli.add(await page.title())
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await page.keyboard.press('Tab')
      const salta = page.getByRole('link', { name: percorso === '/en' ? 'Skip to content' : 'Salta al contenuto' })
      await expect(salta).toBeFocused()
      await expect(salta).toBeInViewport()
      await page.keyboard.press('Enter')
      await expect(page.locator('main')).toBeFocused()
    }
    expect(titoli.size, 'titoli uguali fra le pagine pubbliche').toBe(PUBBLICHE.length)
  })

  test('la registrazione: gli errori e il secondo passo, senza creare account', async ({ page }) => {
    await page.goto('/registrati')
    await pronta(page)
    await page.getByRole('button', { name: 'Avanti' }).click()
    await expect(page.locator('.errore').first()).toBeVisible()
    await senzaViolazioni(page, '/registrati con gli errori')
    await page.getByLabel('Email').fill('qualcuno@semina.example')
    await page.getByLabel(/^Password/).fill('lunghissima10')
    await page.getByLabel('Ripeti la password').fill('lunghissima10')
    await page.getByRole('button', { name: 'Avanti' }).click()
    await expect(page.getByRole('list', { name: 'Passi della registrazione' }).locator('[aria-current="step"]')).toHaveText('Il locale')
    await senzaViolazioni(page, '/registrati, secondo passo')
  })
})

test.describe('dietro l’accesso', () => {
  test.beforeEach(() => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
  })

  test('la dashboard di un Completo: ogni sezione', async ({ page }) => {
    await entra(page, 'completo-stripe')
    const titoli = new Set()
    for (const s of SEZIONI_TITOLARE) {
      await page.goto(indirizzoSezione(s.id))
      await senzaViolazioni(page, `dashboard, ${s.nome}`)
      titoli.add(await page.title())
    }
    expect(titoli.size).toBe(SEZIONI_TITOLARE.length)
  })

  test('la dashboard di chi deve ancora scegliere il piano', async ({ page }) => {
    await entra(page, 'senza-piano')
    await senzaViolazioni(page, 'dashboard senza piano, panoramica')
    await page.goto(indirizzoSezione('piano'))
    await expect(page.getByRole('region', { name: 'Scelta del piano' })).toBeVisible()
    await senzaViolazioni(page, 'dashboard senza piano, scelta del piano')
  })

  test('il backoffice: ogni sezione, la scheda di un locale e i due modi di aggiungerne uno', async ({ page }) => {
    await entra(page, 'admin')
    const titoli = new Set()
    for (const s of SEZIONI) {
      await page.goto(`${BASE}/${s.id}`)
      await senzaViolazioni(page, `backoffice, ${s.nome}`)
      titoli.add(await page.title())
    }
    expect(titoli.size).toBe(SEZIONI.length)
    for (const a of AGGIUNTE) {
      await page.goto(`${BASE}/aggiungi/${a.id}`)
      await senzaViolazioni(page, `backoffice, ${a.nome}`)
    }
    await page.goto(`${BASE}/locali?locale=completo-stripe`)
    await expect(page.getByRole('article')).toBeVisible()
    await senzaViolazioni(page, 'backoffice, la scheda di un locale')
  })
})
