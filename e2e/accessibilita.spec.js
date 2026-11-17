// L'ACCESSIBILITÀ, PROVATA CON AXE-CORE (REQ-FLOTTA-125, punti D ed E).
// Daniele, 17/11/2026: «prima di tutto cerchiamo di diventare completamente
// conformi». L'audit di quel giorno (axe-core sulle sei pagine pubbliche
// del sito di test) aveva 0 violazioni, ma dashboard e backoffice, dietro
// l'accesso, non erano mai stati provati. Da qui ogni giro delle prove le
// prova tutte: una violazione delle regole WCAG 2.0, 2.1 e 2.2 di livello A
// o AA fa fallire la prova, col nome della regola e degli elementi.
// In più l'ordine dei titoli (heading-order): per axe è una buona pratica,
// ma il salto da h1 a h3 c'era e non deve tornare (revisione del 17/11/2026).
//
// Gira nelle «Prove in sola lettura» di e2e.yml (nessun titolo contiene la
// parola che quel passo esclude): guarda e basta, non scrive niente. Senza
// E2E_PASSWORD le pagine dietro l'accesso si saltano, come nelle altre
// prove. Una prova per pagina o sezione, ognuna col suo accesso: sul sito
// di test vero undici pagine in una prova sola rischiavano il limite dei
// 60 secondi (playwright.config.js), e una prova ferma il rilascio.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { SEZIONI_TITOLARE, indirizzoSezione } from '../src/lib/areaTitolare.js'
import { SEZIONI, BASE, AGGIUNTE } from '../src/lib/backoffice.js'
import { entra, PASSWORD } from './aiuto.js'

// I livelli A e AA delle tre versioni delle WCAG: quelli che la legge
// europea richiama (EN 301 549 rimanda alle WCAG 2.1 AA) e in più le 2.2.
export const REGOLE_WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
// Le regole fuori dai livelli che vogliamo lo stesso.
export const REGOLE_IN_PIU = ['heading-order']

const TELEFONO = { width: 390, height: 844 }
// Lo zoom al 400% di uno schermo da 1280 px (WCAG 1.4.10): la pagina deve
// stare in 320 px senza scorrere di lato.
const STRETTO = { width: 320, height: 640 }

// La pagina è pronta quando ha il suo titolo e niente «Carico…». Non
// «networkidle»: Firestore tiene una connessione aperta e la rete non si
// ferma mai. Il mezzo secondo in più lascia arrivare i riquadri che
// leggono da soli (le Functions di «Salute», «Commerciale»…).
async function pronta(page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('main').getByText(/^Carico/)).toHaveCount(0)
  await page.waitForTimeout(500)
}

// La prova: tutte le violazioni A e AA, più l'ordine dei titoli, con
// regola, impatto ed elementi, così il rapporto dice cosa correggere senza
// rifarla a mano.
async function senzaViolazioni(page, dove) {
  await pronta(page)
  const livelli = await new AxeBuilder({ page }).withTags(REGOLE_WCAG).analyze()
  const inPiu = await new AxeBuilder({ page }).withRules(REGOLE_IN_PIU).analyze()
  const trovate = [...livelli.violations, ...inPiu.violations].map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join(' | ')}`)
  expect(trovate, `violazioni WCAG A/AA su ${dove}`).toEqual([])
}

// Niente scorrimento di lato (WCAG 1.4.10): quello che sta in un riquadro
// che scorre da sé (le tabelle) non conta, perché non allarga la pagina.
async function senzaScorrimentoLaterale(page, dove) {
  await pronta(page)
  const sporge = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sporge, `${dove} scorre di lato di ${sporge} px a 320 px`).toBeLessThanOrEqual(0)
}

// Il secondo passo della registrazione, senza creare nessun account.
async function secondoPasso(page) {
  await page.goto('/registrati')
  await pronta(page)
  await page.getByLabel('Email').fill('qualcuno@semina.example')
  await page.getByLabel(/^Password/).fill('lunghissima10')
  await page.getByLabel('Ripeti la password').fill('lunghissima10')
  await page.getByRole('button', { name: 'Avanti' }).click()
  await expect(page.getByRole('list', { name: 'Passi della registrazione' }).locator('[aria-current="step"]')).toHaveText('Il locale')
}

const PUBBLICHE = ['/', '/en', '/registrati', '/accedi', '/termini', '/privacy']

for (const [vista, dimensioni] of [
  ['computer', { width: 1280, height: 900 }],
  ['telefono', TELEFONO],
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

  test('un rinvio al primo caricamento lascia «Salta al contenuto» come primo tasto', async ({ page }) => {
    // /dashboard senza accesso porta a /accedi da sola, senza che nessuno abbia fatto niente.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/accedi$/)
    await pronta(page)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Salta al contenuto' })).toBeFocused()
  })

  test('la registrazione: gli errori e il secondo passo, senza creare account', async ({ page }) => {
    await page.goto('/registrati')
    await pronta(page)
    await page.getByRole('button', { name: 'Avanti' }).click()
    await expect(page.locator('.errore').first()).toBeVisible()
    await senzaViolazioni(page, '/registrati con gli errori')
    await secondoPasso(page)
    await senzaViolazioni(page, '/registrati, secondo passo')
  })
})

test.describe('a 320 px, lo zoom al 400%', () => {
  test.use({ viewport: STRETTO })

  test('la prima pagina non scorre di lato', async ({ page }) => {
    await page.goto('/')
    await senzaScorrimentoLaterale(page, '/')
  })

  test('la registrazione al secondo passo non scorre di lato', async ({ page }) => {
    await secondoPasso(page)
    await senzaScorrimentoLaterale(page, '/registrati, secondo passo')
  })

  // Le tabelle larghe scorrono nel loro riquadro: qui axe vede anche che il
  // riquadro si raggiunge da tastiera (scrollable-region-focusable).
  test('il credito AI della dashboard: niente scorrimento di lato, nessuna violazione', async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'completo-stripe')
    await page.goto(indirizzoSezione('credito-ai'))
    await expect(page.getByRole('region', { name: 'Tabella degli ultimi consumi AI' })).toBeVisible()
    await senzaScorrimentoLaterale(page, 'dashboard, Credito AI')
    await senzaViolazioni(page, 'dashboard, Credito AI a 320 px')
  })

  test('il commerciale del backoffice: niente scorrimento di lato, nessuna violazione', async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'admin')
    await page.goto(`${BASE}/commerciale`)
    await expect(page.getByRole('region', { name: 'Tabella per modulo' })).toBeVisible()
    await senzaScorrimentoLaterale(page, 'backoffice, Commerciale')
    await senzaViolazioni(page, 'backoffice, Commerciale a 320 px')
  })
})

test.describe('la dashboard di un Completo', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'completo-stripe')
  })
  for (const s of SEZIONI_TITOLARE) {
    test(`${s.nome}: nessuna violazione A o AA, e il titolo della sezione`, async ({ page }) => {
      await page.goto(indirizzoSezione(s.id))
      await senzaViolazioni(page, `dashboard, ${s.nome}`)
      await expect(page).toHaveTitle(new RegExp(`^${s.nome} · Dashboard · `))
    })
  }
})

test.describe('la dashboard di chi deve ancora scegliere il piano', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'senza-piano')
  })
  test('la panoramica', async ({ page }) => {
    await senzaViolazioni(page, 'dashboard senza piano, panoramica')
  })
  test('la scelta del piano', async ({ page }) => {
    await page.goto(indirizzoSezione('piano'))
    await expect(page.getByRole('region', { name: 'Scelta del piano' })).toBeVisible()
    await senzaViolazioni(page, 'dashboard senza piano, scelta del piano')
  })
})

test.describe('il backoffice', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!PASSWORD, 'manca E2E_PASSWORD')
    await entra(page, 'admin')
  })
  for (const s of SEZIONI) {
    test(`${s.nome}: nessuna violazione A o AA, e il titolo della sezione`, async ({ page }) => {
      await page.goto(`${BASE}/${s.id}`)
      await senzaViolazioni(page, `backoffice, ${s.nome}`)
      await expect(page).toHaveTitle(new RegExp(`^${s.nome} · Backoffice · `))
    })
  }
  for (const a of AGGIUNTE) {
    test(`«Aggiungi locale», ${a.nome}`, async ({ page }) => {
      await page.goto(`${BASE}/aggiungi/${a.id}`)
      await senzaViolazioni(page, `backoffice, ${a.nome}`)
    })
  }
  test('la scheda di un locale', async ({ page }) => {
    await page.goto(`${BASE}/locali?locale=completo-stripe`)
    await expect(page.getByRole('article')).toBeVisible()
    await senzaViolazioni(page, 'backoffice, la scheda di un locale')
  })
})
