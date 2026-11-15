'use strict'

// L'ISTANZA DI PROVA (REQ-FLOTTA-114). Daniele, 15/11/2026, su prova-e2e:
// «teniamola ma deve rispondere sempre con la versione realmente
// installata. Regia non si caga le anteprime. Quello che possiamo fare è
// disattivare l'istanza e2e alla fine delle prove e nel backoffice la si
// vede come disattivata». L'admin segna un'istanza senza cliente come
// istanza di prova; le prove e2e di tana-drink la accendono all'inizio e
// la spengono alla fine (`istanzaDiProva`). Spenta non cambia la licenza né
// la presentazione: è uno stato della regia, per il backoffice e la
// sentinella.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const prova = require('../functions/lib/istanzaDiProva.js')
const ADESSO = new Date('2026-11-15T10:30:00.000Z')
const codice = readFileSync('functions/index.js', 'utf8')

describe('l’istanza di prova', () => {
  it('il corpo: { attiva } con un vero sì o no, niente altro', () => {
    expect(prova.corpoProva({ attiva: true })).toEqual({ attiva: true })
    expect(prova.corpoProva({ attiva: false })).toEqual({ attiva: false })
    for (const body of [{ attiva: 'true' }, { attiva: 1 }, {}, null, { attiva: null }]) expect(prova.corpoProva(body)).toBeNull()
  })

  it('quello che si segna: accesa o spenta, e da quando', () => {
    expect(prova.registroProva(false, ADESSO)).toEqual({ prova: { attiva: false, il: ADESSO.toISOString() } })
    expect(prova.registroProva(true, ADESSO)).toEqual({ prova: { attiva: true, il: ADESSO.toISOString() } })
  })

  it('si accende e si spegne solo un’istanza segnata di prova, senza cliente e non eliminata', () => {
    const ist = { stato: 'attiva', prova: { attiva: true, il: 'x' } }
    expect(prova.puoCambiare(ist, null)).toEqual({ ok: true })
    expect(prova.puoCambiare({ stato: 'attiva' }, null)).toEqual({ ok: false, status: 403, perche: 'Non è un’istanza di prova.' })
    expect(prova.puoCambiare(ist, { uid: 'u1' })).toEqual({ ok: false, status: 403, perche: 'Ha un cliente: non è un’istanza di prova.' })
    expect(prova.puoCambiare({ ...ist, stato: 'eliminata' }, null)).toEqual({ ok: false, status: 404, perche: 'Installazione non registrata nella regia.' })
    expect(prova.puoCambiare(null, null)).toEqual({ ok: false, status: 404, perche: 'Installazione non registrata nella regia.' })
  })

  it('la Function: POST col token di un utente del progetto, come la presentazione', () => {
    expect(codice).toMatch(/exports\.istanzaDiProva = onRequest\(/)
    const corpo = codice.slice(codice.indexOf('exports.istanzaDiProva'), codice.indexOf('exports.istanzaDiProva') + 2500)
    expect(corpo).toContain("if (req.method !== 'POST')")
    expect(corpo).toContain('verifyIdToken(token)')
    expect(corpo).toContain('prova.puoCambiare(ist, await clienteDi(trovata.id))')
    expect(corpo).toContain('prova.registroProva(corpo.attiva)')
    expect(corpo).toContain('res.locals.slug = trovata.id')
  })

  it('segnarla di prova lo fa solo l’admin, e solo per un’istanza senza cliente', () => {
    const corpo = codice.slice(codice.indexOf('exports.segnaIstanzaDiProva'), codice.indexOf('exports.segnaIstanzaDiProva') + 1500)
    expect(corpo).toContain("req.auth?.token?.admin !== true")
    expect(corpo).toContain('await clienteDi(slug)')
    expect(corpo).toContain('FieldValue.delete()')
  })
})
