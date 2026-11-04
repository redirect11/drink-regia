import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOME_PRODOTTO, URL_DEMO, EMAIL_CONTATTI } from '../lib/prodotto.js'
import {
  MODULI,
  PIANI,
  TERMINALE_IN_PIU,
  ATTIVAZIONE,
  ANNUALE,
  FONDATORI,
  PROVA_GIORNI,
  ASSISTENZA,
  STAMPANTE,
  IVA,
  conIva,
  prezzoAnnuale,
} from '../lib/piani.js'
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

// Il titolo in due tempi: la scena, poi la svolta in oro («La serata non si
// ferma. / Nemmeno quando cade il Wi-Fi.»). Si taglia alla prima frase, così
// i testi in src/i18n restano una frase intera per lingua; un titolo di una
// frase sola resta tutto bianco.
function dueTempi(testo) {
  const taglio = testo.search(/[.?]\s/)
  if (taglio < 0) return { prima: testo, seconda: '' }
  return { prima: testo.slice(0, taglio + 1), seconda: testo.slice(taglio + 2) }
}

// L'aliquota del listino, scritta una volta («IVA esclusa, al 22%»).
const IVA_PERCENTO = `${IVA}%`

export default function Home({ utente, lingua = 'it' }) {
  const t = testi(lingua)
  const euro = (n) => importo(n, lingua)
  // Il listino del 02/11/2026 (DEC-0005): ogni prezzo è l'imponibile
  // «+ IVA», perché la vendita è fra imprese e la fattura parte da lì; il
  // totale IVA inclusa sta accanto, calcolato (conIva), perché è quello
  // che esce dal conto del locale. Nessun numero scritto a mano.
  const piuIva = (n) => interpola(t.prezzi.piuIva, { prezzo: euro(n) })
  const ivaInclusa = (n) => interpola(t.prezzi.ivaInclusa, { prezzo: euro(conIva(n)) })
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

  const titolo = dueTempi(t.hero.titolo)
  const radice = useRef(null)
  useEffect(() => osservaComparsa(radice.current), [])

  const piani = pianiInVendita(vendita)
  // L'attivazione è automatica solo se si paga online o si parte dal Free.
  // Con i pagamenti online spenti (così parte la produzione) chi sceglie un
  // piano ci lascia un recapito e l'attivazione si concorda (REQ-FLOTTA-017):
  // la pagina non promette quello che oggi non succede.
  const automatica = vendita.pagamenti_online || vendita.free
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
  // L'offerta Fondatori (DEC-0005), per i piani che il listino elenca e
  // che sono in vendita. Sobria: i numeri e la regola, mai i posti rimasti
  // (sarebbe urgenza, e la pagina non ha il conteggio, che sta sul server).
  const pianiFondatori = piani.filter((p) => FONDATORI?.prezzi?.[p.id] != null)
  const fondatori =
    FONDATORI?.posti > 0 && pianiFondatori.length > 0
      ? interpola(t.prezzi.fondatori.testo, {
          posti: FONDATORI.posti,
          piani: pianiFondatori
            .map((p) =>
              interpola(t.prezzi.fondatori.piano, {
                nome: nomePiano(t, p),
                prezzo: piuIva(FONDATORI.prezzi[p.id]),
                lordo: ivaInclusa(FONDATORI.prezzi[p.id]),
                mesi: FONDATORI.mesi,
                listino: piuIva(p.prezzo),
              })
            )
            .join('; '),
          attivazione: FONDATORI.attivazione
            ? interpola(t.prezzi.fondatori.attivazione, { prezzo: piuIva(FONDATORI.attivazione) })
            : t.prezzi.fondatori.attivazioneGratuita,
        })
      : null
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
        {/* L'atmosfera del bar di sera (DESIGN.md §4, 03/11/2026): luci
            sfocate disegnate dal CSS, al posto del segnaposto hero.jpg.
            Decorative: fuori dall'albero dell'accessibilità. */}
        <div className="hero-luci" aria-hidden="true" />
        <div className="contenitore hero-testo">
          <p className="occhiello hero-occhiello">{t.hero.occhiello}</p>
          <h1 id="hero-titolo">
            {titolo.prima}
            {titolo.seconda && (
              <>
                {' '}
                <span className="titolo-oro">{titolo.seconda}</span>
              </>
            )}
          </h1>
          <p className="hero-sotto">{t.hero.sottotitolo}</p>
          <div className="azioni">
            {azionePrincipale(t.hero)}
            <a className="btn ghost grande" href={URL_DEMO} target="_blank" rel="noreferrer">
              {t.hero.demo} <span className="solo-lettori">{t.hero.nuovaScheda}</span>
            </a>
          </div>
          <ul className="fatti" aria-label={t.hero.fatti}>
            {vendita.free && <li>{t.hero.free}</li>}
            <li>{interpola(t.hero.da, { prezzo: piuIva(daPrezzo) })}</li>
            <li>{t.hero.mensile}</li>
            {PROVA_GIORNI > 0 && <li>{interpola(t.hero.prova, { giorni: PROVA_GIORNI })}</li>}
            <li>{automatica ? t.hero.automatica : t.hero.concordata}</li>
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
                <span className="pilastro-numero" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
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
                          {interpola(p, { terminale: piuIva(TERMINALE_IN_PIU) })}
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
                <p>{interpola(automatica || !p.concordata ? p.testo : p.concordata, { base: nomeBase })}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="prezzi" className="sezione" aria-labelledby="prezzi-titolo">
        <div className="contenitore">
          <header className="sezione-testa" data-comparsa>
            <h2 id="prezzi-titolo">{t.prezzi.titolo}</h2>
            <p className="sezione-sotto">
              {interpola(t.prezzi.sotto, { iva: IVA_PERCENTO, attivazione: piuIva(ATTIVAZIONE), lordo: ivaInclusa(ATTIVAZIONE) })}
            </p>
            {PROVA_GIORNI > 0 && <p className="sezione-sotto">{interpola(t.prezzi.prova, { giorni: PROVA_GIORNI })}</p>}
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
                  {p.gratuito ? (
                    <p className="prezzo">
                      {euro(0)} <span className="prezzo-mese">{t.prezzi.alMese}</span>
                    </p>
                  ) : (
                    <>
                      <p className="prezzo">
                        {euro(p.prezzo)} <span className="prezzo-mese">{t.prezzi.piuIvaAlMese}</span>
                      </p>
                      <p className="prezzo-lordo">{ivaInclusa(p.prezzo)}</p>
                      {ANNUALE?.mensilita > 0 && (
                        <p className="prezzo-anno">
                          {interpola(t.prezzi.annuale, {
                            prezzo: piuIva(prezzoAnnuale(p.prezzo)),
                            lordo: ivaInclusa(prezzoAnnuale(p.prezzo)),
                            mesi: ANNUALE.mensilita,
                          })}
                        </p>
                      )}
                    </>
                  )}
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
          {fondatori && (
            <section className="fondatori" aria-labelledby="fondatori-titolo">
              <h3 id="fondatori-titolo">{t.prezzi.fondatori.titolo}</h3>
              <p>{fondatori}</p>
              <p className="nota-piccola">{t.prezzi.fondatori.regola}</p>
            </section>
          )}
          {/* Dal 02/11/2026 Base e Completo hanno gli stessi 3 terminali: la
              frase non li nomina più, perché non sono una differenza. Il
              confronto resta vero col Base a 32,70 € (anche a 25 €, coi
              Fondatori): si mostra solo se lo è. */}
          {totaleSulBase > completo.prezzo && (
            <p className="convenienza">
              {interpola(t.prezzi.convenienza, {
                base: nomeBase,
                totale: piuIva(totaleSulBase),
                completo: nomeCompleto,
                completo_prezzo: piuIva(completo.prezzo),
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
                      {piuIva(m.prezzo)} {t.prezzi.alMese}
                      <span className="iva-inclusa">{ivaInclusa(m.prezzo)}</span>
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
                    {piuIva(TERMINALE_IN_PIU)} {t.prezzi.alMese}
                    <span className="iva-inclusa">{ivaInclusa(TERMINALE_IN_PIU)}</span>
                  </td>
                  <td className="numero-colonna" data-colonna={colonnaCompleto}>
                    {plurale(completo.terminali || 1, t.prezzi.tabella.terminaliInclusi)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="nota">{t.prezzi.notaScontrino}</p>
          {/* Il tetto dell'assistenza e le stampanti a preventivo (DEC-0005):
              detti qui, prima della firma, e ripetuti nei Termini. */}
          {ASSISTENZA?.ore_mese > 0 && (
            <p className="nota">{interpola(t.prezzi.assistenza, { ore: plurale(ASSISTENZA.ore_mese, t.prezzi.ore) })}</p>
          )}
          {STAMPANTE?.modalita === 'preventivo' && <p className="nota">{t.prezzi.stampante}</p>}
          {t.soloItaliano && <p className="nota">{t.soloItaliano}</p>}
        </div>
      </section>

      <section id="domande" className="sezione" aria-labelledby="domande-titolo" data-comparsa>
        {/* Da tablet in su il titolo resta a sinistra e le domande scorrono a destra. */}
        <div className="contenitore domande-griglia">
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
