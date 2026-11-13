// @vitest-environment happy-dom
'use strict'

// ISTANZA E TITOLARE SCOLLEGATI, NEL BACKOFFICE (REQ-FLOTTA-086). Daniele,
// 13/11/2026: «fai il tasto di collegamento nel backoffice, ma deve
// apparire solo se per qualche motivo istanza e regia risultano
// scollegati». L'avviso e il tasto stanno in cima alla scheda del locale.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({ collegaIstanza: vi.fn(async () => ({ ok: true, vecchio: 'VECCHIO', nuovo: 'NUOVO' })) }))
vi.mock('../src/lib/db.js', () => db)

import CollegaIstanza from '../src/pages/CollegaIstanza.jsx'

const cliente = { uid: 'NUOVO', slug: 'prova-free', nome_locale: 'Prova Free', email: 'titolare@example.it' }
const TASTO = { name: 'Collega l’app al titolare' }
let conferma

beforeEach(() => {
  vi.clearAllMocks()
  conferma = vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => conferma.mockRestore())

describe('quando compare', () => {
  it('istanza legata a un altro uid: l’avviso, con l’uid dell’app e quello del titolare, e il tasto', () => {
    render(<CollegaIstanza cliente={cliente} istanza={{ stato: 'attiva', uid: 'VECCHIO' }} />)
    const avviso = screen.getByRole('alert')
    expect(avviso).toHaveTextContent('L’app è legata a un altro account: il titolare non la vede nella sua area')
    expect(avviso).toHaveTextContent('VECCHIO')
    expect(avviso).toHaveTextContent('titolare@example.it')
    expect(avviso).toHaveTextContent('NUOVO')
    expect(screen.getByRole('button', TASTO)).toBeInTheDocument()
  })

  it('istanza senza uid: lo stesso, e dice che non è legata a nessun account', () => {
    render(<CollegaIstanza cliente={cliente} istanza={{ stato: 'attiva', progetto: 'drinkpos-prova-free' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/nessun account/)
    expect(screen.getByRole('button', TASTO)).toBeInTheDocument()
  })

  it('collegata, senza istanza o eliminata: niente avviso e niente tasto', () => {
    for (const istanza of [{ stato: 'attiva', uid: 'NUOVO' }, null, { stato: 'eliminata', uid: 'VECCHIO' }]) {
      const { container, unmount } = render(<CollegaIstanza cliente={cliente} istanza={istanza} />)
      expect(container).toBeEmptyDOMElement()
      expect(screen.queryByRole('button', TASTO)).toBeNull()
      unmount()
    }
  })
})

describe('il tasto', () => {
  it('chiede conferma con nome del locale, email del titolare e uid vecchio → nuovo', async () => {
    const user = userEvent.setup()
    render(<CollegaIstanza cliente={cliente} istanza={{ stato: 'attiva', uid: 'VECCHIO' }} />)
    await user.click(screen.getByRole('button', TASTO))
    const testo = conferma.mock.calls[0][0]
    expect(testo).toContain('Prova Free')
    expect(testo).toContain('titolare@example.it')
    expect(testo).toContain('VECCHIO → NUOVO')
  })

  it('annullato non chiama niente', async () => {
    conferma.mockReturnValue(false)
    const user = userEvent.setup()
    render(<CollegaIstanza cliente={cliente} istanza={{ stato: 'attiva', uid: 'VECCHIO' }} />)
    await user.click(screen.getByRole('button', TASTO))
    expect(db.collegaIstanza).not.toHaveBeenCalled()
  })

  it('confermato chiama la Function con lo slug, dice l’esito e rilegge la pagina', async () => {
    const onFatto = vi.fn()
    const user = userEvent.setup()
    render(<CollegaIstanza cliente={cliente} istanza={{ stato: 'attiva', uid: 'VECCHIO' }} onFatto={onFatto} />)
    await user.click(screen.getByRole('button', TASTO))
    expect(db.collegaIstanza).toHaveBeenCalledWith('prova-free')
    expect(await screen.findByRole('status')).toHaveTextContent('Collegata: l’app ora è del titolare (VECCHIO → NUOVO).')
    expect(onFatto).toHaveBeenCalled()
  })

  it('se la Function rifiuta, il perché resta sulla scheda', async () => {
    db.collegaIstanza.mockRejectedValueOnce(new Error('La richiesta di attivazione è legata a un terzo account (TERZO).'))
    const user = userEvent.setup()
    render(<CollegaIstanza cliente={cliente} istanza={{ stato: 'attiva', uid: 'VECCHIO' }} />)
    await user.click(screen.getByRole('button', TASTO))
    expect(await screen.findByText(/terzo account \(TERZO\)/)).toBeInTheDocument()
  })
})

describe('nella scheda del locale', () => {
  it('sta fra gli avvisi in testa alla scheda, prima dei blocchi (REQ-FLOTTA-089)', () => {
    const bo = readFileSync('src/pages/Backoffice.jsx', 'utf8')
    expect(bo).toContain("import CollegaIstanza from './CollegaIstanza.jsx'")
    const scheda = bo.slice(bo.indexOf('function SchedaLocale('))
    expect(scheda.indexOf('<CollegaIstanza cliente={c} istanza={istanza} onFatto={az.carica} />')).toBeGreaterThan(-1)
    // Fra gli avvisi, che la scheda mostra prima dei sei blocchi.
    expect(scheda.indexOf('<CollegaIstanza')).toBeLessThan(scheda.indexOf('const avvisi = [') === -1 ? -1 : scheda.indexOf('].filter(Boolean)'))
    expect(scheda.indexOf('<CollegaIstanza')).toBeGreaterThan(scheda.indexOf('const avvisi = ['))
  })

  it('db.js chiama la callable collegaIstanza con lo slug', () => {
    const src = readFileSync('src/lib/db.js', 'utf8')
    expect(src).toMatch(/export async function collegaIstanza\(slug\)[\s\S]{0,200}'collegaIstanza'\)[\s\S]{0,80}fn\(\{ slug \}\)/)
  })
})
