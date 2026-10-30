import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOME_PRODOTTO, URL_DEMO, EMAIL_CONTATTI } from '../lib/prodotto.js'
import { MODULI, PIANI, TERMINALE_IN_PIU, ATTIVAZIONE } from '../lib/piani.js'
import { osservaVendita } from '../lib/db.js'
import { venditaPulita, pianiInVendita, moduloVisibile } from '../lib/vendita.js'
import {
  applicaLingua,
  importo,
  interpola,
  linguaDaProporre,
  percorsoDellaLingua,
  plurale,
  salvaPreferenza,
} from '../lib/lingua.js'
import { osservaComparsa } from '../lib/comparsa.js'
import { TESTI, testi } from '../i18n/index.js'

// LA PRIMA PAGINA (REQ-FLOTTA-002), rifatta secondo DESIGN.md. L'utente,
// 29/10/2026: «dovrebbe essere più moderna… con slogan migliori… le info
// nei box sembrano scritte da un bambino… sia in inglese che in italiano».
// Un percorso invece di un elenco: la promessa (hero), il problema che il
// titolare riconosce, i tre pilastri, le funzioni coi loro moduli, i tre
// passi, i prezzi, le domande, l'ultima azione. I testi stanno in
// src/i18n (uno per lingua); qui c'è solo la struttura. I numeri vengono
// dal listino e dalla vendita decisa dall'admin, mai scritti a mano.

// Le funzioni e i moduli che le portano: la struttura, uguale nelle due
// lingue. Una funzione senza moduli sta nel piano Base; una con moduli si
// vede se almeno uno è in vendita (REQ-FLOTTA-015), e porta l'etichetta di
// ognuno: niente sorprese al momento del prezzo (DESIGN.md §5.4). Le
// schermate vere dell'app (DESIGN.md §4, «Immagini») andranno nel
// riquadro accanto al testo quando l'utente avrà scelto da dove prenderle.
const FUNZIONI = [
  { id: 'conti', moduli: [], icona: 'M4 4h16v4H4zM4 10h16v10H4zM8 14h8M8 17h5' },
  { id: 'menu', moduli: ['menu_tavoli', 'ordini_cliente'], icona: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3' },
  { id: 'magazzino', moduli: ['magazzino'], icona: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10' },
  { id: 'statistiche', moduli: ['statistiche'], icona: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
]
// Le due funzioni più piccole, in una riga a due colonne: ognuna è un modulo.
const MINORI = [
  { id: 'staff', icona: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11l2 2 4-4' },
  { id: 'sumup', icona: 'M3 6h18v12H3zM3 10h18M7 15h4' },
]
// I tre pilastri (DESIGN.md §3): non si ferma, è tuo, fatto per il servizio.
const ICONE_PILASTRI = [
  'M2 9c5-5 15-5 20 0M5 12c4-3 10-3 14 0M8 15c2-2 6-2 8 0M12 19h0',
  'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  'M13 2L4 14h7l-1 8 9-12h-7z',
]
const SPUNTA = 'M5 12l5 5 9-11'

function Icona({ d, className = 'icona' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}

const nomeModulo = (t, m) => t.moduli[m.id]?.nome || m.nome
const descrizioneModulo = (t, m) => t.moduli[m.id]?.descrizione || m.descrizione
const nomePiano = (t, p) => t.prezzi.piani[p.id]?.nome || p.nome

function descrizionePiano(t, p) {
  const testo = t.prezzi.piani[p.id]?.descrizione
  if (!testo) return p.descrizione
  return interpola(testo, {
    terminali: plurale(p.terminali || 1, t.prezzi.terminali),
    prodotti: p.limiti?.prodotti_max,
    conti: p.limiti?.conti_aperti_max,
  })
}

// L'avviso che propone l'altra lingua a chi ha il browser in quella lingua
// (DESIGN.md §6): mai un reindirizzamento, e scritto nella lingua che
// propone. Chi sceglie, da qui o dal selettore, non lo rivede più.
function AvvisoLingua({ lingua, proposta, chiudi }) {
  const tp = TESTI[proposta].avvisoLingua
  return (
    <aside className="avviso-lingua" lang={proposta} aria-label={tp.etichetta}>
      <p>{tp.testo}</p>
      <div className="avviso-lingua-azioni">
        <Link to={percorsoDellaLingua(proposta)} hrefLang={proposta} onClick={() => salvaPreferenza(proposta)}>
          {tp.vai}
        </Link>
        <button
          type="button"
          className="link"
          onClick={() => {
            salvaPreferenza(lingua)
            chiudi()
          }}
        >
          {tp.resta}
        </button>
      </div>
    </aside>
  )
}

export default function Home({ utente, lingua = 'it' }) {
  const t = testi(lingua)
  const euro = (n) => importo(n, lingua)
  // Dalla pagina inglese, registrazione e account sono ancora in italiano:
  // il link lo dice al browser (hreflang) e la pagina lo scrive.
  const versoItaliano = lingua === 'it' ? {} : { hrefLang: 'it' }

  // Il Free e i moduli si mostrano solo se sono in vendita (REQ-FLOTTA-015).
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])

  const [proposta, setProposta] = useState(() => linguaDaProporre(lingua))

  useEffect(
    () =>
      applicaLingua(document, {
        lingua,
        titolo: `${NOME_PRODOTTO} — ${t.meta.titolo}`,
        descrizione: t.meta.descrizione,
        origine: window.location.origin,
      }),
    [lingua, t]
  )

  const radice = useRef(null)
  useEffect(() => osservaComparsa(radice.current), [])

  const piani = pianiInVendita(vendita)
  const daPrezzo = Math.min(...Object.values(PIANI).filter((p) => !p.gratuito).map((p) => p.prezzo))
  const moduliVisibili = MODULI.filter((m) => moduloVisibile(vendita, m.id))
  const funzioni = FUNZIONI.filter((f) => !f.moduli.length || f.moduli.some((id) => moduloVisibile(vendita, id)))
  const minori = MINORI.filter((f) => moduloVisibile(vendita, f.id))
  const { base, completo } = PIANI
  const inclusiNelCompleto = new Set(completo.include)
  // Quanto conviene il Completo: il Base con tutti i moduli in vendita che il
  // Completo include, contro il prezzo del Completo. Calcolato dal listino
  // (DESIGN.md §5.6), e detto solo se è vero.
  const totaleSulBase =
    base.prezzo + moduliVisibili.filter((m) => inclusiNelCompleto.has(m.id)).reduce((s, m) => s + m.prezzo, 0)
  const nomeBase = nomePiano(t, base)
  const nomeCompleto = nomePiano(t, completo)
  const colonnaBase = interpola(t.prezzi.tabella.sulBase, { base: nomeBase })
  const colonnaCompleto = interpola(t.prezzi.tabella.nelCompleto, { completo: nomeCompleto })

  const etichetteModuli = (ids) =>
    ids.length
      ? MODULI.filter((m) => ids.includes(m.id) && moduloVisibile(vendita, m.id)).map((m) =>
          interpola(t.funzioni.modulo, { nome: nomeModulo(t, m) })
        )
      : [interpola(t.funzioni.nelPiano, { piano: nomeBase })]

  // Un'azione principale per schermata (DESIGN.md §2): chi è già dentro va
  // alla sua dashboard, gli altri all'attivazione.
  const azionePrincipale = (testo) =>
    utente ? (
      <Link className="btn grande" to="/dashboard">
        {testo.dashboard}
      </Link>
    ) : (
      <Link className="btn grande" to="/registrati" {...versoItaliano}>
        {testo.attiva}
      </Link>
    )

  return (
    <main className="landing" ref={radice}>
      {proposta && <AvvisoLingua lingua={lingua} proposta={proposta} chiudi={() => setProposta(null)} />}

      <section className="hero" aria-labelledby="hero-titolo">
        {/* La foto del banco è uno sfondo: il testo alternativo vuoto la toglie ai lettori di schermo. */}
        <img className="hero-fondo" src="/hero.jpg" alt="" width="1600" height="600" fetchpriority="high" />
        <div className="contenitore hero-testo">
          <p className="occhiello">{t.hero.occhiello}</p>
          <h1 id="hero-titolo">{t.hero.titolo}</h1>
          <p className="hero-sotto">{t.hero.sottotitolo}</p>
          <div className="azioni">
            {azionePrincipale(t.hero)}
            <a className="btn ghost grande" href={URL_DEMO} target="_blank" rel="noreferrer">
              {t.hero.demo} <span className="solo-lettori">{t.hero.nuovaScheda}</span>
            </a>
          </div>
          <ul className="fatti" aria-label={t.hero.fatti}>
            {vendita.free && <li>{t.hero.free}</li>}
            <li>{interpola(t.hero.da, { prezzo: euro(daPrezzo) })}</li>
            <li>{t.hero.mensile}</li>
            <li>{t.hero.automatica}</li>
          </ul>
          {t.soloItaliano && <p className="nota-lingua">{t.soloItaliano}</p>}
        </div>
      </section>

      <section id="problema" className="fascia problema" aria-labelledby="problema-titolo" data-comparsa>
        <div className="contenitore stretto">
          <h2 id="problema-titolo">{t.problema.titolo}</h2>
          <p className="problema-testo">{t.problema.testo}</p>
          <p className="problema-chiusa">{t.problema.chiusa}</p>
        </div>
      </section>

      <section id="pilastri" className="sezione" aria-labelledby="pilastri-titolo" data-comparsa>
        <div className="contenitore">
          <h2 id="pilastri-titolo" className="solo-lettori">
            {t.pilastri.titolo}
          </h2>
          <ul className="pilastri">
            {t.pilastri.voci.map((p, i) => (
              <li key={p.titolo} className="pilastro">
                <span className="pilastro-icona">
                  <Icona d={ICONE_PILASTRI[i]} />
                </span>
                <h3>{p.titolo}</h3>
                <p>{p.testo}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="funzioni" className="sezione" aria-labelledby="funzioni-titolo">
        <div className="contenitore">
          <header className="sezione-testa" data-comparsa>
            <p className="occhiello">{t.funzioni.occhiello}</p>
            <h2 id="funzioni-titolo">{t.funzioni.titolo}</h2>
            <p className="sezione-sotto">{t.funzioni.sotto}</p>
          </header>
          <div className="funzioni">
            {funzioni.map((f) => {
              const v = t.funzioni.voci[f.id]
              return (
                <article className="funzione" key={f.id} aria-labelledby={`funzione-${f.id}`} data-comparsa>
                  <div className="funzione-testo">
                    <p className="occhiello">{v.occhiello}</p>
                    <h3 id={`funzione-${f.id}`}>{v.titolo}</h3>
                    <p>{v.testo}</p>
                    <ul className="etichette-moduli">
                      {etichetteModuli(f.moduli).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="funzione-riquadro">
                    <Icona d={f.icona} className="icona grande" />
                    <ul className="punti" aria-label={t.funzioni.punti}>
                      {v.punti.map((p) => (
                        <li key={p}>
                          <Icona d={SPUNTA} className="icona spunta" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              )
            })}
          </div>
          {minori.length > 0 && (
            <ul className="funzioni-minori" data-comparsa>
              {minori.map((f) => (
                <li key={f.id} className="minore">
                  <Icona d={f.icona} />
                  <div>
                    <p className="minore-testo">{t.funzioni.minori[f.id]}</p>
                    <ul className="etichette-moduli">
                      {etichetteModuli([f.id]).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section id="come-funziona" className="sezione" aria-labelledby="passi-titolo" data-comparsa>
        <div className="contenitore">
          <h2 id="passi-titolo">{t.passi.titolo}</h2>
          <ol className="passi-landing">
            {t.passi.voci.map((p, i) => (
              <li key={p.titolo}>
                <span className="numero" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{p.titolo}</h3>
                <p>{interpola(p.testo, { base: nomeBase })}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="prezzi" className="sezione" aria-labelledby="prezzi-titolo">
        <div className="contenitore">
          <header className="sezione-testa" data-comparsa>
            <h2 id="prezzi-titolo">{t.prezzi.titolo}</h2>
            <p className="sezione-sotto">{interpola(t.prezzi.sotto, { attivazione: euro(ATTIVAZIONE) })}</p>
          </header>
          <div className="piani">
            {piani.map((p) => {
              const nome = nomePiano(t, p)
              const evidenza = p.id === 'completo'
              return (
                <article
                  className={`piano${evidenza ? ' in-evidenza' : ''}`}
                  key={p.id}
                  aria-label={interpola(t.prezzi.piano, { nome })}
                >
                  {evidenza && <span className="etichetta">{t.prezzi.tuttoIncluso}</span>}
                  <h3>{nome}</h3>
                  <p className="prezzo">
                    {euro(p.prezzo)} <span className="prezzo-mese">{t.prezzi.alMese}</span>
                  </p>
                  <p className="piano-descrizione">{descrizionePiano(t, p)}</p>
                  {!utente && (
                    <Link className={`btn block${evidenza ? '' : ' ghost'}`} to="/registrati" {...versoItaliano}>
                      {interpola(t.prezzi.inizia, { nome })}
                    </Link>
                  )}
                </article>
              )
            })}
          </div>
          {totaleSulBase > completo.prezzo && (
            <p className="convenienza">
              {interpola(t.prezzi.convenienza, {
                base: nomeBase,
                totale: euro(totaleSulBase),
                completo: nomeCompleto,
                completo_prezzo: euro(completo.prezzo),
                terminali: plurale(completo.terminali || 1, t.prezzi.terminali),
              })}
            </p>
          )}
          <h3 className="tabella-titolo">{t.prezzi.tabella.titolo}</h3>
          <div className="tabella-moduli">
            <table className="moduli">
              <caption className="solo-lettori">
                {interpola(t.prezzi.tabella.didascalia, { base: nomeBase, completo: nomeCompleto })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t.prezzi.tabella.modulo}</th>
                  <th scope="col">{t.prezzi.tabella.cosaFa}</th>
                  <th scope="col" className="numero-colonna">
                    {colonnaBase}
                  </th>
                  <th scope="col" className="numero-colonna">
                    {colonnaCompleto}
                  </th>
                </tr>
              </thead>
              <tbody>
                {moduliVisibili.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{nomeModulo(t, m)}</th>
                    <td className="cosa-fa">{descrizioneModulo(t, m)}</td>
                    {/* data-colonna: sul telefono la tabella va in colonna, e l'intestazione si ripete accanto al valore. */}
                    <td className="numero-colonna" data-colonna={colonnaBase}>
                      {euro(m.prezzo)} {t.prezzi.alMese}
                    </td>
                    <td className="numero-colonna" data-colonna={colonnaCompleto}>
                      {inclusiNelCompleto.has(m.id) ? (
                        <span className="incluso">
                          <Icona d={SPUNTA} className="icona spunta" />
                          {t.prezzi.tabella.incluso}
                        </span>
                      ) : (
                        <span className="non-incluso">{t.prezzi.tabella.nonIncluso}</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">{t.prezzi.tabella.terminale}</th>
                  <td className="cosa-fa">{t.prezzi.tabella.terminaleTesto}</td>
                  <td className="numero-colonna" data-colonna={colonnaBase}>
                    {euro(TERMINALE_IN_PIU)} {t.prezzi.alMese}
                  </td>
                  <td className="numero-colonna" data-colonna={colonnaCompleto}>
                    {plurale(completo.terminali || 1, t.prezzi.tabella.terminaliInclusi)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="nota">{t.prezzi.notaScontrino}</p>
          {t.soloItaliano && <p className="nota">{t.soloItaliano}</p>}
        </div>
      </section>

      <section id="domande" className="sezione" aria-labelledby="domande-titolo" data-comparsa>
        <div className="contenitore stretto">
          <h2 id="domande-titolo">{t.domande.titolo}</h2>
          <div className="domande">
            {t.domande.voci.map(([d, r]) => (
              <details key={d}>
                <summary>{d}</summary>
                <p>{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="contatti" className="sezione" aria-labelledby="chiusura-titolo" data-comparsa>
        <div className="contenitore">
          <div className="chiusura">
            <h2 id="chiusura-titolo">{t.chiusura.titolo}</h2>
            <p>{t.chiusura.testo}</p>
            <div className="azioni">
              {azionePrincipale(t.chiusura)}
              <a className="btn ghost grande" href={`mailto:${EMAIL_CONTATTI}`}>
                {t.chiusura.scrivici}
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
