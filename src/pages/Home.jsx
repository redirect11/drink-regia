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

// LA PRIMA PAGINA (REQ-FLOTTA-002), secondo DESIGN.md. L'utente, 29/10/2026:
// «dovrebbe essere più moderna… con slogan migliori… sia in inglese che in
// italiano». Un percorso invece di un elenco: la promessa (hero), il
// problema che il titolare riconosce, i tre pilastri, le funzioni coi loro
// moduli, i tre passi, i prezzi, le domande, l'ultima azione. I testi stanno
// in src/i18n (uno per lingua); qui c'è solo la struttura. I numeri vengono
// dal listino e dalla vendita decisa dall'admin, mai scritti a mano.
//
// L'ASPETTO DEL 07/11/2026 (DESIGN.md §4, la direzione dell'utente: «sembri
// il sito curato di un prodotto reale, nato e usato in un locale, non un
// template generico»): fondo chiaro, poche sezioni scure volute (il
// problema, la chiusura), il lime per azioni e dettagli (dal 11/11/2026);
// niente luci sfocate, niente card tutte uguali con l'icona, composizioni
// che si alternano (testo accanto a un pannello, righe numerate, una
// tabella). Niente schermate finte: le vere arriveranno quando ci saranno
// (DESIGN.md §9.5), e intanto lo spazio lo tengono tipografia e griglia.

// Le funzioni e i moduli che le portano: la struttura, uguale nelle due
// lingue. Una funzione senza moduli sta nel piano Base; una con moduli si
// vede se almeno uno è in vendita (REQ-FLOTTA-015), e porta l'etichetta di
// ognuno: niente sorprese al momento del prezzo (DESIGN.md §5.4).
const FUNZIONI = [
  { id: 'conti', moduli: [] },
  { id: 'menu', moduli: ['menu_tavoli', 'ordini_cliente'] },
  { id: 'magazzino', moduli: ['magazzino'] },
  { id: 'statistiche', moduli: ['statistiche'] },
]
// Le due funzioni più piccole, in una riga a due colonne: ognuna è un modulo.
const MINORI = [{ id: 'staff' }, { id: 'sumup' }]
const SPUNTA = 'M5 12l5 5 9-11'

function Icona({ d, className = 'icona' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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

// Il titolo in due tempi: la prima frase nel colore del testo, la seconda
// con l'evidenziatore lime. Si taglia alla prima frase, così
// i testi in src/i18n restano una frase intera per lingua; un titolo di una
// frase sola resta tutto di un colore.
function dueTempi(testo) {
  const taglio = testo.search(/[.?]\s/)
  if (taglio < 0) return { prima: testo, seconda: '' }
  return { prima: testo.slice(0, taglio + 1), seconda: testo.slice(taglio + 2) }
}

// I VIDEO DELLA PRIMA PAGINA (11/11/2026, l'utente: «una pagina moderna…
// nella parte sopra c'è il video in background e uno slogan davanti… con
// i video nei box»). Tre filmati brevi in public/video, muti e in ciclo:
// il barman dietro al titolo, la sala e la cassa nei riquadri. Sono
// decorazione, non contenuto: nascosti a chi usa un lettore di schermo.
// Chi chiede meno movimento (prefers-reduced-motion) o di risparmiare
// dati vede il fermo immagine, che è anche quello che si vede finché il
// codice non è partito: per questo il video non si scarica prima.
function useMovimento() {
  const [movimento, setMovimento] = useState(false)
  useEffect(() => {
    const fermo = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const risparmio = navigator.connection?.saveData
    setMovimento(!fermo && !risparmio)
  }, [])
  return movimento
}

function Filmato({ nome, className }) {
  const movimento = useMovimento()
  const fermo = `/video/${nome}.jpg`
  if (!movimento) return <img className={className} src={fermo} alt="" decoding="async" />
  return (
    <video className={className} poster={fermo} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
      <source src={`/video/${nome}.mp4`} type="video/mp4" />
    </video>
  )
}

// I CINQUE GESTI (11/11/2026). L'utente ha scartato gli orari («la cosa
// degli orari non mi piace») e ha chiesto «semplice, non troppo complesso
// ma originale». Il lavoro di un locale sono cinque gesti, e l'app sta
// dentro ognuno: ogni gesto è una fascia a tutta larghezza col suo
// filmato e una parola sola, grande. Niente schede, niente elenchi: la
// parola dice il gesto, una riga dice cosa fa l'app, e sotto i moduli
// coinvolti. L'ordine è quello del servizio, dalla comanda ai numeri, e
// riprende lo slogan «Dalla comanda alla cassa». Struttura qui, testi in
// src/i18n (gesti.voci).
const GESTI = ['sala', 'banco', 'conto', 'numeri', 'scorta']

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
  const inclusiNelBase = new Set(base.include)
  const inclusiNelCompleto = new Set(completo.include)
  // Quanto conviene il Completo: il Base con tutti i moduli in vendita che il
  // Completo include, contro il prezzo del Completo. Calcolato dal listino
  // (DESIGN.md §5.6), e detto solo se è vero. Quelli già nel Base (il menù
  // digitale) non si pagano due volte.
  const totaleSulBase =
    base.prezzo +
    moduliVisibili.filter((m) => inclusiNelCompleto.has(m.id) && !inclusiNelBase.has(m.id)).reduce((s, m) => s + m.prezzo, 0)
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

  // Un modulo compreso nel Base (il menù digitale) si dice «Nel piano
  // Base», come le funzioni senza moduli: non è una cosa da comprare.
  const nelBase = interpola(t.funzioni.nelPiano, { piano: nomeBase })
  const etichetteModuli = (ids) => {
    const etichette = MODULI.filter((m) => ids.includes(m.id) && moduloVisibile(vendita, m.id)).map((m) =>
      inclusiNelBase.has(m.id) ? nelBase : interpola(t.funzioni.modulo, { nome: nomeModulo(t, m) })
    )
    return etichette.length ? [...new Set(etichette)] : [nelBase]
  }

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

      {/* LA PRIMA SCHERMATA: il filmato del barman a tutta larghezza, un
          velo scuro sopra, e davanti cosa è e cosa fare; a destra la scheda
          coi fatti (prezzo, abbonamento, attivazione), informazioni vere. */}
      <section className="hero" aria-labelledby="hero-titolo">
        <Filmato nome="banco" className="hero-sfondo" />
        <div className="hero-velo" />
        <div className="contenitore hero-griglia">
          <div className="hero-testo">
            <p className="occhiello hero-occhiello">{t.hero.occhiello}</p>
            <h1 id="hero-titolo">
              {titolo.prima}
              {titolo.seconda && (
                <>
                  {' '}
                  <span className="titolo-accento"><span>{titolo.seconda}</span></span>
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
            {t.soloItaliano && <p className="nota-lingua">{t.soloItaliano}</p>}
          </div>
          <aside className="hero-scheda">
            <p className="scheda-titolo">{t.hero.fatti}</p>
            <ul className="fatti" aria-label={t.hero.fatti}>
              {vendita.free && <li>{t.hero.free}</li>}
              <li>{interpola(t.hero.da, { prezzo: piuIva(daPrezzo) })}</li>
              <li>{t.hero.mensile}</li>
              {PROVA_GIORNI > 0 && <li>{interpola(t.hero.prova, { giorni: PROVA_GIORNI })}</li>}
              <li>{automatica ? t.hero.automatica : t.hero.concordata}</li>
            </ul>
          </aside>
        </div>
      </section>

      {/* I CINQUE GESTI: una fascia per gesto, col filmato sotto, un velo
          scuro e la parola grande davanti; il testo sta a sinistra o a
          destra a fasce alterne, dal lato dove il filmato è più libero.
          La nota in fondo dice che i filmati sono generati: nessuno deve
          prenderli per riprese di un locale vero. */}
      <section id="gesti" className="gesti" aria-labelledby="gesti-titolo">
        <h2 id="gesti-titolo" className="solo-lettori">
          {t.gesti.titolo}
        </h2>
        <ol className="gesti-fasce">
          {GESTI.map((id) => (
            <li key={id} className="gesto">
              <Filmato nome={id} className="gesto-sfondo" />
              <div className="gesto-velo" />
              <div className="contenitore">
                <div className="gesto-testo">
                  <h3>{t.gesti.voci[id].parola}</h3>
                  <p>{t.gesti.voci[id].testo}</p>
                  <p className="gesto-funzioni">{t.gesti.voci[id].funzioni}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="contenitore">
          <p className="nota">{t.gesti.nota}</p>
        </div>
      </section>

      {/* IL PROBLEMA: la prima delle due sezioni scure, volute. Il titolo a
          sinistra, il testo a destra: una pagina di rivista, non una card. */}
      <section id="problema" className="fascia problema" aria-labelledby="problema-titolo" data-comparsa>
        <div className="contenitore problema-griglia">
          <h2 id="problema-titolo">{t.problema.titolo}</h2>
          <div>
            <p className="problema-testo">{t.problema.testo}</p>
            <p className="problema-chiusa">{t.problema.chiusa}</p>
          </div>
        </div>
      </section>

      {/* I PILASTRI: tre colonne numerate, divise da un filo. Niente card,
          niente icone: il numero nel verde e il titolo bastano. */}
      <section id="pilastri" className="sezione" aria-labelledby="pilastri-titolo" data-comparsa>
        <div className="contenitore">
          <h2 id="pilastri-titolo" className="titolo-sezione">
            {t.pilastri.titolo}
          </h2>
          <ol className="pilastri">
            {t.pilastri.voci.map((p, i) => (
              <li key={p.titolo} className="pilastro">
                <span className="pilastro-numero" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3>{p.titolo}</h3>
                <p>{p.testo}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* LE FUNZIONI: il testo da una parte e, dall'altra, il pannello di
          cosa comprende; le righe si alternano. Quando ci saranno le
          schermate vere dell'app, prenderanno il posto del pannello. */}
      <section id="funzioni" className="sezione" aria-labelledby="funzioni-titolo">
        <div className="contenitore">
          <header className="sezione-testa" data-comparsa>
            <p className="occhiello">{t.funzioni.occhiello}</p>
            <h2 id="funzioni-titolo">{t.funzioni.titolo}</h2>
            <p className="sezione-sotto">{t.funzioni.sotto}</p>
          </header>
          <div className="funzioni">
            {funzioni.map((f, i) => {
              const v = t.funzioni.voci[f.id]
              return (
                <article className="funzione" key={f.id} aria-labelledby={`funzione-${f.id}`} data-comparsa>
                  <div className="funzione-testo">
                    <p className="occhiello">
                      <span className="numero-funzione" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {v.occhiello}
                    </p>
                    <h3 id={`funzione-${f.id}`}>{v.titolo}</h3>
                    <p>{v.testo}</p>
                    <ul className="etichette-moduli">
                      {etichetteModuli(f.moduli).map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="funzione-riquadro">
                    <p className="scheda-titolo">{t.funzioni.punti}</p>
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
                  <p className="minore-testo">{t.funzioni.minori[f.id]}</p>
                  <ul className="etichette-moduli">
                    {etichetteModuli([f.id]).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* I TRE PASSI: numerati, in fila, divisi da un filo. */}
      <section id="come-funziona" className="sezione" aria-labelledby="passi-titolo" data-comparsa>
        <div className="contenitore">
          <h2 id="passi-titolo" className="titolo-sezione">
            {t.passi.titolo}
          </h2>
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
                  <div className="piano-testa">
                    <h3>{nome}</h3>
                    {evidenza && <span className="etichetta">{t.prezzi.tuttoIncluso}</span>}
                  </div>
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
                      {inclusiNelBase.has(m.id) ? (
                        <span className="incluso">
                          <Icona d={SPUNTA} className="icona spunta" />
                          {t.prezzi.tabella.incluso}
                        </span>
                      ) : (
                        <>
                          {piuIva(m.prezzo)} {t.prezzi.alMese}
                          <span className="iva-inclusa">{ivaInclusa(m.prezzo)}</span>
                        </>
                      )}
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

      {/* LA CHIUSURA: la seconda sezione scura, a tutta larghezza. */}
      <section id="contatti" className="chiusura" aria-labelledby="chiusura-titolo" data-comparsa>
        <div className="contenitore chiusura-griglia">
          <div>
            <h2 id="chiusura-titolo">{t.chiusura.titolo}</h2>
            <p>{t.chiusura.testo}</p>
          </div>
          <div className="azioni">
            {azionePrincipale(t.chiusura)}
            <a className="btn ghost grande" href={`mailto:${EMAIL_CONTATTI}`}>
              {t.chiusura.scrivici}
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
