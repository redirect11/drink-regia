// @vitest-environment happy-dom
'use strict'

// LA SEZIONE «SALUTE» DEL BACKOFFICE (REQ-FLOTTA-109). I conti li fa
// functions/lib/salute.js (tests/salute.test.js); qui che la pagina li
// chieda solo quando l'admin preme il tasto (niente giri a tempo) e li
// mostri: per ogni locale giudizio, presentazione, permessi che mancano
// con la riga che li sistema, errori; poi gli errori per Function.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({ saluteDellaFlotta: vi.fn() }))
vi.mock('../src/lib/db.js', () => db)

import Salute from '../src/pages/Salute.jsx'

const rapporto = {
  controllato_il: '2026-11-14T20:00:00.000Z',
  registri: {
    leggibili: true,
    perche: null,
    per_function: [{ servizio: 'presentazione', errori: 4, ultimo: '2026-11-14T17:38:57.000Z' }],
    righe: [{ il: '2026-11-14T17:38:57.000Z', servizio: 'presentazione', slug: 'prova-e2e', testo: '[presentazione] prova-e2e: la licenza non si legge: 7 PERMISSION_DENIED' }],
  },
  locali: [
    {
      slug: 'prova-e2e',
      progetto: 'drinkpos-prova-e2e',
      controllato: true,
      giudizio: 'problema',
      errori: 1,
      mancanti: [
        { ruolo: 'roles/datastore.user', dove: 'progetto' },
        { ruolo: 'roles/iam.serviceAccountTokenCreator', dove: 'account firebase-adminsdk-fbsvc' },
      ],
      presentazione: { versione: 'v1.10.50-beta', il: '2026-11-14T17:38:36.000Z', ore_fa: 2, pubblicata: 'v1.10.29-beta', diversa: true },
    },
    {
      slug: 'prova-bar',
      progetto: 'drinkpos-prova-bar',
      controllato: true,
      giudizio: 'ok',
      errori: 0,
      mancanti: [],
      presentazione: { versione: 'v1.10.50-beta', il: '2026-11-14T16:00:00.000Z', ore_fa: 4, pubblicata: 'v1.10.50-beta', diversa: false },
    },
    {
      slug: 'drinkpos-demo',
      progetto: 'drinkpos-demo',
      controllato: false,
      giudizio: null,
      errori: 0,
      mancanti: [],
      presentazione: { versione: null, il: null, ore_fa: null, pubblicata: null, diversa: false },
    },
  ],
}

beforeEach(() => {
  db.saluteDellaFlotta.mockReset()
  db.saluteDellaFlotta.mockResolvedValue(rapporto)
})

describe('la sezione «Salute»', () => {
  it('non chiede niente finché l’admin non preme «Controlla adesso»', async () => {
    render(<Salute />)
    expect(screen.getByRole('region', { name: 'Salute' })).toBeInTheDocument()
    expect(db.saluteDellaFlotta).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Controlla adesso' }))
    expect(db.saluteDellaFlotta).toHaveBeenCalledTimes(1)
  })

  it('ogni locale col suo giudizio, la versione presentata e quella pubblicata', async () => {
    render(<Salute />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Controlla adesso' }))
    const tabella = await screen.findByRole('table', { name: 'Locali' })
    const e2e = within(tabella).getByRole('row', { name: /prova-e2e/ })
    expect(within(e2e).getByText('Problema')).toBeInTheDocument()
    expect(within(e2e).getByText(/v1\.10\.50-beta/)).toBeInTheDocument()
    expect(within(e2e).getByText(/pubblicata v1\.10\.29-beta/)).toBeInTheDocument()
    expect(within(tabella).getByRole('row', { name: /prova-bar/ })).toHaveTextContent('In ordine')
    expect(within(tabella).getByRole('row', { name: /drinkpos-demo/ })).toHaveTextContent('Non controllato')
  })

  it('i permessi che mancano, con la riga che li sistema', async () => {
    render(<Salute />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Controlla adesso' }))
    const e2e = within(await screen.findByRole('table', { name: 'Locali' })).getByRole('row', { name: /prova-e2e/ })
    expect(within(e2e).getByText(/roles\/datastore\.user/)).toBeInTheDocument()
    expect(within(e2e).getByText(/roles\/iam\.serviceAccountTokenCreator/)).toBeInTheDocument()
    expect(within(e2e).getByText('node scripts/account-runtime.mjs --progetto <regia> --locale drinkpos-prova-e2e')).toBeInTheDocument()
  })

  it('gli errori delle 24 ore per Function e le ultime righe', async () => {
    render(<Salute />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Controlla adesso' }))
    const perFunction = await screen.findByRole('table', { name: 'Errori per Function' })
    expect(within(perFunction).getByRole('row', { name: /presentazione/ })).toHaveTextContent('4')
    expect(screen.getByText(/la licenza non si legge: 7 PERMISSION_DENIED/)).toBeInTheDocument()
  })

  it('registri non leggibili: lo dice, con il perché', async () => {
    db.saluteDellaFlotta.mockResolvedValue({ ...rapporto, registri: { leggibili: false, perche: 'manca roles/logging.viewer', per_function: [], righe: [] } })
    render(<Salute />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Controlla adesso' }))
    expect(await screen.findByText(/I registri della regia non si leggono: manca roles\/logging\.viewer/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Errori per Function' })).toBeNull()
  })

  it('un errore della Function va a chi mostra gli errori del backoffice', async () => {
    db.saluteDellaFlotta.mockRejectedValue(new Error('Solo l’amministratore.'))
    const onErrore = vi.fn()
    render(<Salute onErrore={onErrore} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Controlla adesso' }))
    await vi.waitFor(() => expect(onErrore).toHaveBeenCalledWith('Solo l’amministratore.'))
  })
})
