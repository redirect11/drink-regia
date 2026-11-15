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

  // Con le regole di REQ-FLOTTA-115: il gettone di Google dell'account di
  // deploy del progetto, non un utente. `verifica` fa le veci di Google.
  describe('chi la chiama: il gettone di Google di deploy@<progetto>', () => {
    const payload = (email, extra = {}) => ({ iss: 'https://accounts.google.com', email, email_verified: true, ...extra })
    const istanza = { id: 'prova-e2e', data: { stato: 'attiva', progetto: 'drinkpos-prova-e2e', prova: { attiva: false } } }
    const cerca = async (progetto) => (progetto === 'drinkpos-prova-e2e' ? [istanza] : [])
    const con = (p, opts = {}) => {
      const chiamate = []
      const verifica = async (gettone, audience) => {
        chiamate.push(audience)
        return p
      }
      return { opts: { progettoRegia: 'drink-regia-test', verifica, cercaPerProgetto: cerca, ...opts }, chiamate }
    }

    it('l’account di deploy del progetto di prova trova la sua istanza, col destinatario delle prove', async () => {
      const { opts, chiamate } = con(payload('deploy@drinkpos-prova-e2e.iam.gserviceaccount.com'))
      expect(await prova.istanzaDalGettone('g', opts)).toBe(istanza)
      expect(chiamate).toEqual(['regia-prova:drink-regia-test'])
      expect(prova.audienceProva('drink-regia')).toBe('regia-prova:drink-regia')
      expect(prova.ACCOUNT_PROVA).toBe('deploy')
    })

    it('un utente del progetto, l’account dell’AI o un altro account no', async () => {
      for (const email of [
        'mario@example.com',
        'ai-locale@drinkpos-prova-e2e.iam.gserviceaccount.com',
        'firebase-adminsdk-fbsvc@drinkpos-prova-e2e.iam.gserviceaccount.com',
        '123456789-compute@developer.gserviceaccount.com',
      ]) {
        expect(await prova.istanzaDalGettone('g', con(payload(email)).opts), email).toBeNull()
      }
    })

    it('un gettone senza email verificata, di un altro emittente o senza gettone no', async () => {
      const email = 'deploy@drinkpos-prova-e2e.iam.gserviceaccount.com'
      expect(await prova.istanzaDalGettone('g', con(payload(email, { email_verified: false })).opts)).toBeNull()
      expect(await prova.istanzaDalGettone('g', con(payload(email, { iss: 'https://securetoken.google.com/drinkpos-prova-e2e' })).opts)).toBeNull()
      expect(await prova.istanzaDalGettone(null, con(payload(email)).opts)).toBeNull()
      expect(await prova.istanzaDalGettone('g', con(payload(email), { progettoRegia: null }).opts)).toBeNull()
    })

    it('un progetto senza istanza, o con più di una, no', async () => {
      const email = 'deploy@drinkpos-altro.iam.gserviceaccount.com'
      expect(await prova.istanzaDalGettone('g', con(payload(email)).opts)).toBeNull()
      const due = con(payload('deploy@drinkpos-prova-e2e.iam.gserviceaccount.com'), { cercaPerProgetto: async () => [istanza, istanza] })
      expect(await prova.istanzaDalGettone('g', due.opts)).toBeNull()
    })

    it('se Google rifiuta il gettone, l’errore arriva alla Function', async () => {
      const opts = { progettoRegia: 'drink-regia-test', verifica: async () => { throw new Error('Token used too late') }, cercaPerProgetto: cerca }
      await expect(prova.istanzaDalGettone('g', opts)).rejects.toThrow('Token used too late')
    })

    it('la Function: POST, il gettone di Google verificato come per l’AI, niente token di Firebase', () => {
      expect(codice).toMatch(/exports\.istanzaDiProva = onRequest\(/)
      const corpo = codice.slice(codice.indexOf('exports.istanzaDiProva'), codice.indexOf('exports.segnaIstanzaDiProva'))
      expect(corpo).toContain("if (req.method !== 'POST')")
      expect(corpo).toContain('identita.tokenDaBearer(')
      expect(corpo).toContain('.istanzaDalGettone(gettone, { progettoRegia: PROGETTO_REGIA, verifica: verificaGettone, cercaPerProgetto: istanzePerProgetto })')
      expect(corpo).toContain('identita.motivoBreve(e)')
      expect(corpo).not.toContain('verifyIdToken')
      expect(corpo).not.toContain('progettoDelToken')
      expect(corpo).toContain('prova.puoCambiare(trovata.data, await clienteDi(trovata.id))')
      expect(corpo).toContain('prova.registroProva(corpo.attiva)')
      expect(corpo).toContain('res.locals.slug = trovata.id')
    })
  })

  it('segnarla di prova lo fa solo l’admin, e solo per un’istanza senza cliente', () => {
    const corpo = codice.slice(codice.indexOf('exports.segnaIstanzaDiProva'), codice.indexOf('exports.segnaIstanzaDiProva') + 1500)
    expect(corpo).toContain("req.auth?.token?.admin !== true")
    expect(corpo).toContain('await clienteDi(slug)')
    expect(corpo).toContain('FieldValue.delete()')
  })
})
