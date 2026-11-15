// LE ISTANZE SENZA CLIENTE (REQ-FLOTTA-113). Daniele, 15/11/2026, cercando
// prova-e2e nei «Locali» del test: «nei locali prova-e2e non esiste».
// L'elenco parte dai clienti, e un'istanza senza cliente (prova-e2e, quella
// degli e2e di tana-drink) non compariva. Sulla proposta di mostrarle in
// fondo all'elenco, in un gruppo a parte, con la stessa scheda: «si».

import { describe, it, expect } from 'vitest'
import { istanzeSenzaCliente, filtraLocali } from '../src/lib/backoffice.js'

const clienti = [
  { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it' },
  { uid: 'b', slug: 'bar-nuovo', nome_locale: 'Bar Nuovo', email: 'b@x.it' },
]

describe('le istanze senza cliente', () => {
  it('le istanze che nessun cliente ha, in ordine di identificativo, con lo stato dell’istanza', () => {
    const istanze = {
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo' },
      'prova-e2e': { stato: 'attiva', progetto: 'drinkpos-prova-e2e', versione: 'v1.10.29-beta' },
      'altra-prova': { stato: 'errore', errore: 'quota progetti' },
    }
    const righe = istanzeSenzaCliente(istanze, clienti)
    expect(righe.map((r) => r.cliente.slug)).toEqual(['altra-prova', 'prova-e2e'])
    expect(righe[1]).toEqual({
      cliente: { slug: 'prova-e2e', nome_locale: 'prova-e2e' },
      istanza: istanze['prova-e2e'],
      richiesta: null,
      cassetto: null,
      stato: 'attiva',
      senzaCliente: true,
    })
    expect(righe[0].stato).toBe('errore')
  })

  it('nessuna, se ogni istanza ha il suo cliente; niente, se non si sono lette', () => {
    expect(istanzeSenzaCliente({ 'bar-attivo': { stato: 'attiva' } }, clienti)).toEqual([])
    expect(istanzeSenzaCliente(null, clienti)).toEqual([])
    expect(istanzeSenzaCliente({ 'prova-e2e': { stato: 'attiva' } }, null)).toHaveLength(1)
  })

  it('la ricerca dell’elenco le trova anche per progetto, e vale per tutti i locali', () => {
    const righe = istanzeSenzaCliente({ 'prova-e2e': { stato: 'attiva', progetto: 'drinkpos-prova-e2e' } }, clienti)
    expect(filtraLocali(righe, { cerca: 'drinkpos-prova' })).toHaveLength(1)
    expect(filtraLocali(righe, { cerca: 'e2e' })).toHaveLength(1)
    expect(filtraLocali(righe, { cerca: 'bar' })).toHaveLength(0)
    expect(filtraLocali([{ cliente: clienti[0], istanza: { progetto: 'drinkpos-bar-attivo' }, stato: 'attiva' }], { cerca: 'drinkpos-bar' })).toHaveLength(1)
  })
})
