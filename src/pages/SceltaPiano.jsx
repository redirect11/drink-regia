import { useEffect, useState } from 'react'
import {
  PIANI,
  MODULI,
  TERMINALE_IN_PIU,
  ATTIVAZIONE,
  ANNUALE,
  FONDATORI,
  PROVA_GIORNI,
  prezzoMensile,
  prezzoAnnuale,
  prezzoFondatori,
  conIva,
  euro,
  baseMancante,
  senzaOrfani,
} from '../lib/piani.js'
import { GRUPPI_NON_FISCALI, FISCALI, NESSUNA, NON_SO, ALTRA } from '../lib/stampanti.js'
import { attivaConCodice, avviaPagamento, cambiaScelta, chiediContatto, osservaContatto, osservaVendita, scegliFree, verificaCodiceSconto } from '../lib/db.js'
import { EMAIL_CONTATTI } from '../lib/prodotto.js'
import { venditaPulita, pianiInVendita, moduloVisibile, eGratuito } from '../lib/vendita.js'

// LA SCELTA DEL PIANO (REQ-FLOTTA-007): piano, moduli in più, terminali;
// il prezzo del mese si aggiorna mentre si sceglie; «Vai al pagamento»
// apre il Checkout di Stripe. Finché le chiavi di Stripe non ci sono, il
// tasto spiega che l'abbonamento si attiva con noi.
// `modifica`: il cliente ha già un abbonamento e cambia piano o moduli
// (REQ-FLOTTA-010): niente Checkout, si aggiorna e la licenza segue.
// IL FREE (REQ-FLOTTA-015): c'è solo se l'admin lo mette in vendita, e non
// a chi cambia un abbonamento a pagamento; non ha moduli né terminali in
// più, e si attiva senza pagamento. Un modulo tolto dalla vendita non si
// mostra, a meno che il cliente non lo abbia già.
// PAGAMENTI ONLINE SPENTI (REQ-FLOTTA-017): finché l'admin non li accende,
// al posto del Checkout il titolare lascia un recapito e lo contattiamo
// noi; il pagamento si concorda fuori dal sito e il piano lo attiva l'admin.
// IL LISTINO DEL 02/11/2026 (DEC-0005): prezzi «+ IVA» col totale IVA
// inclusa accanto; mensile o annuale (`intervallo: 'mese' | 'anno'` nella
// scelta, che le Functions validano: qui si mostra soltanto); l'offerta
// Fondatori detta come informazione, perché chi rientra lo decide il
// server contando gli abbonamenti attivati: la pagina non ha il conteggio
// e non mostra i posti rimasti.

// IL CODICE SCONTO (REQ-FLOTTA-028): chi comincia un piano a pagamento lo
// scrive qui, e «Applica» chiede alla regia se vale e quanto (la pagina non
// legge i codici). Al pagamento il server lo ricontrolla e lo mette nel
// Checkout; se c'è anche il prezzo Fondatori vale il più conveniente, e la
// pagina lo dice prima. Un codice al 100% attiva il piano senza pagamento.
// Coi pagamenti online spenti il codice viaggia con la richiesta di
// contatto, e lo applica l'admin.
const durataDetta = (mesi) => (mesi ? `per ${mesi} ${mesi === 1 ? 'mese' : 'mesi'}` : 'senza scadenza')

function testoCodice(e, daContattare) {
  if (e.gratis) return `Codice ${e.codice}: il piano non si paga, ${durataDetta(e.durata_mesi)}. Si attiva col tasto qui sotto, senza pagamento.`
  if (daContattare) return `Codice ${e.codice}: ${e.percentuale}% di sconto, ${durataDetta(e.durata_mesi)}. Lo applichiamo noi quando attiviamo il piano.`
  if (e.vale === 'fondatori') return `Codice ${e.codice} valido, ma con l’offerta Fondatori risparmi di più nel primo anno: si applica quella. Lo sconto è uno solo per acquisto.`
  return `Codice ${e.codice}: ${e.percentuale}% di sconto, ${durataDetta(e.durata_mesi)}, applicato nel pagamento.`
}

// «32,70 € + IVA» e «39,89 € IVA inclusa»: le due metà di ogni prezzo.
const piuIva = (n) => `${euro(n)} + IVA`
const ivaInclusa = (n) => `${euro(conIva(n))} IVA inclusa`

const testoFondatori = (p, prezzo) =>
  `Offerta Fondatori: i primi ${FONDATORI.posti} abbonamenti a pagamento attivati hanno il ${p.nome} a ${piuIva(prezzo)} al mese ` +
  `(${ivaInclusa(prezzo)}) per ${FONDATORI.mesi} mesi dall’attivazione, poi ${piuIva(p.prezzo)}; ` +
  (FONDATORI.attivazione ? `attivazione a ${piuIva(FONDATORI.attivazione)}.` : 'attivazione gratuita.')

export default function SceltaPiano({ cliente, modifica = false, vai = (url) => window.location.assign(url) }) {
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  // IL PIANO ATTUALE (REQ-FLOTTA-084). Daniele, 12/11/2026: «prova free,
  // nella sua dashboard ha come piano selezionato il base ma invece è il
  // free che non c'è nelle opzioni». Prima il Free del cliente spariva
  // dalle opzioni e la scelta partiva dal Base: sembrava il suo piano. Ora
  // il piano che ha (abbonamento attivo, o quello che cambia in
  // `modifica`) sta fra le opzioni come «Il tuo piano», ed è scelto
  // all'inizio. Un piano con l'abbonamento fermo non è attuale: chi lo
  // rinnova lo ritrova scelto e il tasto acceso, come prima.
  const attuale = cliente.piano && PIANI[cliente.piano] && (modifica || cliente.abbonamento?.stato === 'attivo') ? cliente.piano : null
  const [piano, setPiano] = useState(attuale || (cliente.piano && !eGratuito(cliente.piano) ? cliente.piano : 'base'))
  const [moduli, setModuli] = useState(cliente.moduli || [])
  const [terminali, setTerminali] = useState(cliente.terminali || 1)
  const [periodo, setPeriodo] = useState(cliente.abbonamento?.intervallo === 'anno' ? 'anno' : 'mese')
  const [errore, setErrore] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  const [fatto, setFatto] = useState(null)
  const [telefono, setTelefono] = useState('')
  const [nota, setNota] = useState('')
  // Le stampanti del locale (REQ-FLOTTA-081): obbligatorie nella richiesta
  // di informazioni e in quella d'acquisto.
  const [nonFiscale, setNonFiscale] = useState('')
  const [nonFiscaleAltra, setNonFiscaleAltra] = useState('')
  const [fiscale, setFiscale] = useState('')
  const [fiscaleAltra, setFiscaleAltra] = useState('')
  const [contatto, setContatto] = useState(null)
  useEffect(() => osservaContatto(cliente.uid, setContatto), [cliente.uid])
  const [codice, setCodice] = useState('')
  const [esitoCodice, setEsitoCodice] = useState(null)
  const [erroreCodice, setErroreCodice] = useState(null)
  // Cambiando piano o periodo il confronto coi Fondatori può cambiare: il
  // codice si riapplica.
  useEffect(() => setEsitoCodice(null), [piano, periodo])
  const gratuito = eGratuito(piano)
  // Il Checkout serve solo a chi comincia un piano a pagamento.
  const daContattare = !gratuito && !modifica && !vendita.pagamenti_online
  const scelta = gratuito ? { piano, moduli: [], terminali: 1 } : { piano, moduli, terminali, intervallo: periodo }
  const mensile = prezzoMensile(scelta)
  const annuale = periodo === 'anno' && !gratuito
  const daPagare = annuale ? prezzoAnnuale(mensile) : mensile
  // L'offerta si racconta a chi comincia un abbonamento, non a chi lo cambia.
  const fondatori = !gratuito && !modifica && FONDATORI?.posti > 0 ? prezzoFondatori(piano) : null
  const p = PIANI[piano]
  const inclusi = new Set(p.include)
  const giaSuoi = cliente.moduli || []
  // Il Free non si propone a chi cambia un abbonamento a pagamento; il
  // piano attuale c'è sempre, anche il Free tolto dalla vendita.
  const inVendita = new Set(pianiInVendita(vendita).filter((x) => !(x.gratuito && modifica)).map((x) => x.id))
  const piani = Object.values(PIANI).filter((x) => x.id === attuale || inVendita.has(x.id))
  // Il tasto si accende solo per un cambio: un altro piano o, restando sul
  // piano a pagamento che si ha, moduli, terminali o pagamento diversi.
  const stessi = (a, b) => [...new Set(a)].sort().join() === [...new Set(b)].sort().join()
  const invariata =
    attuale !== null &&
    piano === attuale &&
    (gratuito ||
      (stessi(moduli, cliente.moduli || []) &&
        terminali === (cliente.terminali || 1) &&
        periodo === (cliente.abbonamento?.intervallo === 'anno' ? 'anno' : 'mese')))
  const conCodice = !gratuito && !modifica
  const codiceScritto = conCodice ? codice.trim().toUpperCase() : ''
  const gratisColCodice = Boolean(esitoCodice?.gratis) && esitoCodice.codice === codiceScritto

  const applicaCodice = async () => {
    setErroreCodice(null)
    setEsitoCodice(null)
    if (!codiceScritto) return
    try {
      setEsitoCodice(await verificaCodiceSconto(scelta, codiceScritto))
    } catch (e) {
      setErroreCodice(e.message)
    }
  }

  // Le due scelte, o null se ne manca una (o «Altra» senza marca e modello).
  const una = (scelta, altra) => (!scelta ? null : scelta === ALTRA ? (altra.trim().length >= 2 ? { scelta, altra: altra.trim() } : null) : { scelta, altra: null })
  const stampanti = (() => {
    const nf = una(nonFiscale, nonFiscaleAltra)
    const rt = una(fiscale, fiscaleAltra)
    return nf && rt ? { non_fiscale: nf, fiscale: rt } : null
  })()
  const mancanoStampanti = () => {
    setErrore('Indica la stampante non fiscale e il registratore telematico (anche «non ancora» o «non lo so»).')
    setInCorso(false)
  }
  const conferma = async () => {
    // Il tasto è spento, ma la regola resta qui: niente richieste per non cambiare niente.
    if (invariata) return
    setErrore(null)
    setFatto(null)
    setInCorso(true)
    try {
      if (gratuito) {
        await scegliFree()
        setFatto('Piano Free attivo: ora puoi attivare il locale.')
        setInCorso(false)
        return
      }
      if (gratisColCodice) {
        await attivaConCodice(scelta, codiceScritto)
        setFatto(`Piano ${p.nome} attivo col codice ${codiceScritto}: ora puoi attivare il locale.`)
        setInCorso(false)
        return
      }
      if (daContattare) {
        if (!stampanti) return mancanoStampanti()
        await chiediContatto({ ...scelta, telefono, nota, ...(codiceScritto ? { codice: codiceScritto } : {}), stampanti })
        setFatto(`Richiesta inviata: ti contattiamo a ${cliente.email || 'la tua email'}${telefono ? ` o al ${telefono}` : ''}.`)
        setInCorso(false)
        return
      }
      if (modifica) {
        // Su un abbonamento a mano un aumento non si accende da solo
        // (REQ-FLOTTA-046): la Function registra la richiesta e lo dice.
        const esito = await cambiaScelta(scelta)
        setFatto(esito?.via === 'richiesta' ? 'Richiesta inviata: ti ricontattiamo per attivarla.' : 'Piano aggiornato: le funzioni nuove si accendono nell’app entro un minuto.')
        setInCorso(false)
        return
      }
      if (!stampanti) return mancanoStampanti()
      const { url } = await avviaPagamento({ ...(codiceScritto ? { ...scelta, codice: codiceScritto } : scelta), stampanti })
      vai(url)
    } catch (e) {
      setErrore(e.message)
      setInCorso(false)
    }
  }

  return (
    <section className="card" aria-label="Scelta del piano">
      <h3>{modifica ? 'Cambia piano o moduli' : 'Scegli il piano'}</h3>
      <div className="scelta-piani">
        {piani.map((x) => (
          <label key={x.id} className={`opzione${piano === x.id ? ' scelta' : ''}`}>
            <input type="radio" name="piano" value={x.id} checked={piano === x.id} onChange={() => setPiano(x.id)} />
            <strong>{x.nome}</strong> ·{' '}
            {x.gratuito ? `${euro(0)} / mese` : `${piuIva(x.prezzo)} / mese (${ivaInclusa(x.prezzo)})`}
            {x.id === attuale && (
              <>
                {' '}
                <span className="stato stato-ok">Il tuo piano</span>
              </>
            )}
            <div className="muted small">{x.descrizione}</div>
          </label>
        ))}
      </div>
      {!gratuito && (
        <>
          <h4>Moduli in più</h4>
          {MODULI.filter((m) => moduloVisibile(vendita, m.id, giaSuoi)).map((m) => {
            // Un modulo senza la sua base non si sceglie (tana-drink
            // REQ-LIC-015): la casella aspetta che la base sia spuntata, e
            // togliendo la base se ne va anche lui (senzaOrfani).
            const manca = !inclusi.has(m.id) && !moduli.includes(m.id) ? baseMancante({ piano, moduli }, m.id) : null
            return (
              <label key={m.id} className="opzione">
                <input
                  type="checkbox"
                  checked={inclusi.has(m.id) || moduli.includes(m.id)}
                  disabled={inclusi.has(m.id) || Boolean(manca)}
                  onChange={(e) => setModuli((v) => senzaOrfani(piano, e.target.checked ? [...new Set([...v, m.id])] : v.filter((id) => id !== m.id)))}
                />
                {m.nome} · {inclusi.has(m.id) ? <span className="muted small">incluso</span> : `${piuIva(m.prezzo)} / mese`}
                {manca && <span className="muted small"> · richiede {manca}</span>}
              </label>
            )
          })}
          <label htmlFor="terminali">Terminali (oltre {p.terminali || 1} {p.terminali > 1 ? 'inclusi' : 'incluso'}: {piuIva(TERMINALE_IN_PIU)} / mese ciascuno)</label>
          <input id="terminali" type="number" min={1} max={10} value={terminali} onChange={(e) => setTerminali(Math.max(1, Number(e.target.value) || 1))} />
          {ANNUALE?.mensilita > 0 && (
            <fieldset className="periodo">
              <legend>Come paghi</legend>
              <label className="opzione">
                <input type="radio" name="periodo" value="mese" checked={periodo === 'mese'} onChange={() => setPeriodo('mese')} />
                Ogni mese
              </label>
              <label className="opzione">
                <input type="radio" name="periodo" value="anno" checked={periodo === 'anno'} onChange={() => setPeriodo('anno')} />
                Un anno in anticipo ({ANNUALE.mensilita} mensilità)
              </label>
            </fieldset>
          )}
        </>
      )}
      <p className="prezzo" data-testid="prezzo-scelta">
        {gratuito ? (
          <>
            {euro(0)} <span className="muted small">/ mese, senza pagamento</span>
          </>
        ) : (
          <>
            {piuIva(daPagare)} <span className="muted small">{annuale ? 'all’anno' : 'al mese'}</span>
          </>
        )}
      </p>
      {!gratuito && (
        <p className="muted small" data-testid="prezzo-dettaglio">
          {ivaInclusa(daPagare)}
          {annuale && ` · pari a ${ANNUALE.mensilita} mensilità da ${piuIva(mensile)}`}
          {!modifica && ` · attivazione ${piuIva(ATTIVAZIONE)} (${ivaInclusa(ATTIVAZIONE)}) una volta`}
        </p>
      )}
      {fondatori != null && (
        <p className="muted small" data-testid="fondatori">
          {testoFondatori(p, fondatori)}{' '}
          {daContattare
            ? 'Se rientri lo verifichiamo noi all’attivazione, e te lo confermiamo quando ti contattiamo.'
            : 'Se rientri lo verifichiamo noi all’attivazione, e il prezzo applicato lo vedi nel riepilogo del pagamento.'}
        </p>
      )}
      {conCodice && (
        <div className="codice-sconto" data-testid="codice-sconto">
          <label htmlFor="codice">Codice sconto (facoltativo)</label>
          <div className="row">
            <input
              id="codice"
              value={codice}
              maxLength={24}
              autoCapitalize="characters"
              onChange={(e) => {
                setCodice(e.target.value)
                setEsitoCodice(null)
                setErroreCodice(null)
              }}
            />
            <button type="button" className="btn ghost small" disabled={!codiceScritto} onClick={applicaCodice}>
              Applica
            </button>
          </div>
          {esitoCodice && <p className="muted small" data-testid="esito-codice">{testoCodice(esitoCodice, daContattare)}</p>}
          {erroreCodice && <p className="errore">{erroreCodice}</p>}
        </div>
      )}
      {!gratuito && !modifica && PROVA_GIORNI > 0 && (
        <p className="muted small" data-testid="prova">
          I primi {PROVA_GIORNI} giorni sono di prova: il canone parte alla fine della prova.
        </p>
      )}
      {daContattare && (
        <div className="contatto" data-testid="contatto">
          <p className="muted small">
            I pagamenti online non sono ancora attivi. Lasciaci un recapito: ti contattiamo per attivare il piano e concordare il
            pagamento. Puoi anche scriverci a <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a>.
          </p>
          {contatto?.stato === 'aperta' && (
            <p className="muted small" data-testid="contatto-aperto">
              Hai già chiesto di essere contattato il {new Date(contatto.chiesta_il).toLocaleDateString('it-IT')}: una richiesta
              nuova prende il posto di quella.
            </p>
          )}
          <label htmlFor="telefono">Telefono (facoltativo)</label>
          <input id="telefono" type="tel" value={telefono} maxLength={20} onChange={(e) => setTelefono(e.target.value)} />
          <label htmlFor="nota">Una nota (facoltativa: orari, domande)</label>
          <textarea id="nota" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      )}
      {/* LE STAMPANTI DEL LOCALE (REQ-FLOTTA-081): nella richiesta di
          informazioni e in quella d'acquisto. Ci servono per decidere quali
          stampanti supportare. */}
      {!gratuito && !modifica && !gratisColCodice && (
        <fieldset className="stampanti" data-testid="stampanti">
          <legend>Le stampanti del locale</legend>
          <label htmlFor="stampante-non-fiscale">Stampante non fiscale (comande e scontrini di cortesia)</label>
          <select id="stampante-non-fiscale" value={nonFiscale} onChange={(e) => setNonFiscale(e.target.value)}>
            <option value="">Scegli…</option>
            {GRUPPI_NON_FISCALI.map((g) => (
              <optgroup key={g.gruppo} label={g.etichetta}>
                {g.modelli.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={ALTRA}>Altra (scrivi marca e modello)</option>
            <option value={NESSUNA}>Non ho ancora una stampante</option>
          </select>
          {nonFiscale === ALTRA && (
            <>
              <label htmlFor="stampante-altra">Marca e modello della stampante</label>
              <input id="stampante-altra" value={nonFiscaleAltra} maxLength={80} onChange={(e) => setNonFiscaleAltra(e.target.value)} />
            </>
          )}
          <p className="muted small">
            La stampa di comande e scontrini non fiscali oggi funziona con le stampanti Epson che hanno ePOS. Indicare il modello in uso: se non è
            ancora supportato, lo usiamo per decidere quali stampanti aggiungere.
          </p>
          <label htmlFor="stampante-fiscale">Registratore telematico (RT)</label>
          <select id="stampante-fiscale" value={fiscale} onChange={(e) => setFiscale(e.target.value)}>
            <option value="">Scegli…</option>
            {FISCALI.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={ALTRA}>Altra (scrivi marca e modello)</option>
            <option value={NON_SO}>Non lo so</option>
          </select>
          {fiscale === ALTRA && (
            <>
              <label htmlFor="fiscale-altra">Marca e modello del registratore telematico</label>
              <input id="fiscale-altra" value={fiscaleAltra} maxLength={80} onChange={(e) => setFiscaleAltra(e.target.value)} />
            </>
          )}
          <p className="muted small">Il registratore telematico (RT) è quello fiscale: oggi l’app non lo comanda. Ci serve sapere quale usate per collegarlo in futuro.</p>
        </fieldset>
      )}
      {errore && <p className="errore">{errore}</p>}
      {fatto && <p className="muted small">{fatto}</p>}
      {invariata && !fatto && (
        <p className="muted small" data-testid="scelta-invariata">
          {modifica ? 'Cambia piano, moduli, terminali o pagamento per aggiornarlo.' : 'È il piano che hai: scegline un altro per cambiarlo.'}
        </p>
      )}
      <button type="button" className="btn" disabled={inCorso || invariata} onClick={conferma}>
        {inCorso
          ? 'Un momento…'
          : invariata && !modifica
            ? 'È il tuo piano'
            : gratuito
              ? 'Attiva il Free'
              : modifica
                ? 'Aggiorna il piano'
                : gratisColCodice
                  ? 'Attiva con il codice'
                  : daContattare
                    ? 'Chiedi di essere contattato'
                    : 'Vai al pagamento'}
      </button>
    </section>
  )
}
