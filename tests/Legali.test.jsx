// @vitest-environment happy-dom
'use strict'

// I TERMINI E IL LISTINO DEL 02/11/2026 (DEC-0005, REQ-FLOTTA-003): i
// prezzi IVA esclusa, l'annuale, la prova, l'offerta Fondatori col suo
// criterio, il tetto dell'assistenza e le stampanti a preventivo. I
// numeri vengono dal listino, come nella pagina dei prezzi, così i termini
// non restano indietro quando cambia. Le regole che il listino non dice
// (preavviso, rimborsi, rinnovo) restano TODO per il consulente: qui si
// prova solo quello che è deciso.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { Termini } from '../src/pages/Legali.jsx'
import { PIANI, IVA, FONDATORI, ANNUALE, PROVA_GIORNI, ASSISTENZA, euro } from '../src/lib/piani.js'

describe('i termini e il listino', () => {
  it('un solo titolo di primo livello, e le condizioni nuove come sotto-titoli', () => {
    render(<Termini />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    for (const t of ['Pagamento annuale', 'Offerta Fondatori']) {
      expect(screen.getByRole('heading', { level: 3, name: t })).toBeInTheDocument()
    }
    // La prova entra nei termini solo quando il Checkout la applica.
    if (PROVA_GIORNI > 0) expect(screen.getByRole('heading', { level: 3, name: 'Periodo di prova' })).toBeInTheDocument()
    else expect(screen.queryByRole('heading', { level: 3, name: 'Periodo di prova' })).toBeNull()
  })

  it('i prezzi sono IVA esclusa, con l’aliquota del listino', () => {
    render(<Termini />)
    expect(document.body).toHaveTextContent(`al mese e IVA esclusa: l’IVA si aggiunge con l’aliquota di legge, oggi il ${IVA}%`)
  })

  it('l’annuale, la prova e il tetto dell’assistenza dal listino', () => {
    render(<Termini />)
    const testo = document.body.textContent
    expect(testo).toContain(`costa ${ANNUALE.mensilita} volte il prezzo mensile della scelta`)
    if (PROVA_GIORNI > 0) expect(testo).toContain(`comincia con ${PROVA_GIORNI} giorni di prova`)
    else expect(testo).not.toContain('giorni di prova')
    expect(testo).toContain(`L’assistenza ${ASSISTENZA.modalita} è inclusa nell’abbonamento fino a 1 ora al mese; oltre, si presta su preventivo`)
    expect(testo).toContain('si fa solo su preventivo scritto, accettato dal titolare prima dell’inizio del lavoro')
  })

  it('l’offerta Fondatori: i primi abbonamenti a pagamento attivati, per 12 mesi, poi il listino con preavviso e recesso', () => {
    render(<Termini />)
    const testo = document.body.textContent
    expect(testo).toContain(
      `Ai primi ${FONDATORI.posti} abbonamenti a pagamento attivati, in ordine di attivazione, si applica l’offerta Fondatori: il piano ${PIANI.base.nome} a ${euro(FONDATORI.prezzi.base)} al mese, IVA esclusa, per ${FONDATORI.mesi} mesi dalla data di attivazione dell’abbonamento, con l’attivazione gratuita.`
    )
    expect(testo).toContain('si applica il prezzo di listino in vigore')
    expect(testo).toMatch(/preavviso, e il titolare che non lo accetta può recedere/)
  })
})
