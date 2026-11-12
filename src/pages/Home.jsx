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
// italiano». Un percorso invece di un elenco: la promessa (hero), i
// cinque gesti del locale coi loro filmati, le funzioni coi loro
// moduli, i tre passi, i prezzi, le domande, l'ultima azione. I testi stanno
// in src/i18n (uno per lingua); qui c'è solo la struttura. I numeri vengono
// dal listino e dalla vendita decisa dall'admin, mai scritti a mano.
//
// L'ASPETTO DEL 07/11/2026 (DESIGN.md §4, la direzione dell'utente: «sembri
// il sito curato di un prodotto reale, nato e usato in un locale, non un
// template generico»): dall'11/11/2026 tutta su fondo scuro (la
// prima schermata, i gesti, la chiusura), il lime per azioni e dettagli (dal 11/11/2026);
// niente luci sfocate, niente card tutte uguali con l'icona, composizioni
// che si alternano (testo accanto a un pannello, righe numerate, una
// tabella). Niente schermate finte: le vere arriveranno quando ci saranno
// (DESIGN.md §9.5), e intanto lo spazio lo tengono tipografia e griglia.

// Le funzioni e i moduli che le portano: la struttura, uguale nelle due
// lingue. Una funzione senza moduli sta nel piano Base; una con moduli si
// vede se almeno uno è in vendita (REQ-FLOTTA-015). Fino all'11/11/2026
// ognuna portava l'etichetta del suo piano o modulo; Daniele: «pure sotto
// le funzioni non mettere i moduli o piano base. Quello viene dopo». Qui
// si spiega cosa fa il prodotto; cosa si compra lo dicono i prezzi.
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

// I FILMATI DELLA PRIMA PAGINA (11/11/2026, l'utente: «una pagina moderna…
// nella parte sopra c'è il video in background e uno slogan davanti»).
// Cinque filmati brevi in public/video, muti e in ciclo, uno per gesto:
// fanno da sfondo alla prima schermata, a turno. Sono decorazione, non
// contenuto: nascosti a chi usa un lettore di schermo.
// QUANDO GIRANO. Chi chiede meno movimento (prefers-reduced-motion) o di
// risparmiare dati vede il fermo immagine, che è anche quello che si vede
// finché il codice non è partito: per questo il video non si scarica
// prima. E chi li vede girare li può fermare, col bottone fra i comandi
// del carosello, che ferma anche lo scorrimento:
// partono da soli e non finiscono mai, e un movimento così accanto a un
// testo deve potersi fermare (WCAG 2.2.2; rilievo del revisore, 11/11/2026).
// `possibile` dice se il sistema li lascia girare, `acceso` se chi guarda
// non li ha fermati.
function useFilmati() {
  const [possibile, setPossibile] = useState(false)
  const [acceso, setAcceso] = useState(true)
  useEffect(() => {
    const fermo = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const risparmio = navigator.connection?.saveData
    setPossibile(!fermo && !risparmio)
  }, [])
  return { possibile, girano: possibile && acceso, cambia: () => setAcceso((a) => !a) }
}

function Filmato({ nome, className, gira }) {
  const fermo = `/video/${nome}.jpg`
  if (!gira) return <img className={className} src={fermo} alt="" decoding="async" />
  return (
    <video className={className} poster={fermo} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}>
      <source src={`/video/${nome}.mp4`} type="video/mp4" />
    </video>
  )
}

// I CINQUE GESTI, IN UN CAROSELLO (11/11/2026, REQ-FLOTTA-061). Il lavoro
// di un locale sono cinque gesti, e l'app sta dentro ognuno: Ordina,
// Prepara, Incassa, Conta, Riordina, nell'ordine del servizio, che è lo
// slogan «Dalla comanda alla cassa». La prima versione (REQ-FLOTTA-060)
// li metteva in cinque fasce una sotto l'altra; Daniele, vista sul sito di
// test: «fai un carosello sopra a tutto dove sta il primo video… invece
// di scorrerle in verticale le facciamo scorrere in automatico in
// orizzontale». Ora ogni gesto è una diapositiva della prima schermata:
// il suo filmato fa da sfondo, la parola e una riga corta stanno in basso,
// e titolo, bottoni e scheda dei fatti restano fermi davanti.
//
// I MODULI DI OGNI GESTO seguono la vendita decisa dall'admin, come le
// funzioni più sotto (REQ-FLOTTA-015): un gesto che vive solo di moduli
// (i numeri, la scorta) non si vede se nessuno dei suoi è in vendita.
// Le etichette dei moduli sotto la frase («Nel piano Base», «Modulo…»)
// non ci sono più: Daniele, 11/11/2026, «non hanno senso lì: l'utente
// deve prima capire di che si parla». Piani e moduli li dicono l'elenco
// delle funzioni e la tabella dei prezzi, più sotto. Per questo la
// riga di «Ordina» e «Incassa» non promette il menù con QR o il lettore
// di carte, e «Conta», che ha due moduli, ha una frase per modulo: si
// legge quella del primo in vendita.
const GESTI = [
  { id: 'sala', moduli: ['menu_tavoli', 'ordini_cliente'], base: true },
  { id: 'banco', moduli: [], base: true },
  { id: 'conto', moduli: ['sumup'], base: true },
  { id: 'numeri', moduli: ['statistiche', 'staff'], base: false },
  { id: 'scorta', moduli: ['magazzino'], base: false },
]
// Ogni quanto il carosello passa al gesto dopo, da solo. Erano sei secondi;
// Daniele, visto sul sito di test (11/11/2026): «i filmati dovrebbero
// durare di meno». Quattro bastano a leggere una parola e una frase corta.
const PASSO_CAROSELLO_MS = 4000

// UN PEZZO CHE SI APRE (REQ-FLOTTA-063): il confronto fra i piani e ogni
// modulo dell'elenco. Daniele, 11/11/2026: i moduli a pagamento «nascosti,
// che si possono aprire… con qualche animazione ben integrata nella UI».
// Il comando è un bottone che dice lo stato (aria-expanded) e comanda la
// sua regione. L'animazione è l'altezza che passa da zero a quella del
// contenuto (una griglia da 0fr a 1fr, src/index.css): il contenuto resta
// nel documento, così l'altezza si può animare, ma da chiuso è `inert` e
// nascosto ai lettori di schermo, quindi non ci si arriva né con Tab né
// con un lettore. Chi ha chiesto meno movimento lo vede aprirsi di colpo.
// `inert` è scritto come stringa vuota perché React 18 non lo conosce e lo
// passa com'è; da React 19 è un booleano, e la stringa vuota varrebbe
// falso: all'aggiornamento va scritto `inert={!aperto}`. Il test che
// cerca l'attributo se ne accorge.
function Apribile({ id, comando, className = '', children }) {
  const [aperto, setAperto] = useState(false)
  return (
    <div className={`apribile ${className}`.trim()} data-aperto={aperto}>
      <button type="button" className="apribile-comando" aria-expanded={aperto} aria-controls={id} onClick={() => setAperto((a) => !a)}>
        {comando}
        <span className="apribile-segno" aria-hidden="true" />
      </button>
      <div id={id} className="apribile-corpo" aria-hidden={!aperto} inert={aperto ? undefined : ''}>
        <div className="apribile-dentro">{children}</div>
      </div>
    </div>
  )
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
  const gesti = GESTI.filter((g) => g.base || g.moduli.some((id) => moduloVisibile(vendita, id)))
  const filmati = useFilmati()
  // Una frase sola (REQ-FLOTTA-061): per un gesto con più moduli, quella
  // del primo modulo in vendita.
  const rigaGesto = (g) => {
    const voce = t.gesti.voci[g.id]
    if (!voce.frasi) return voce.testo
    const primo = g.moduli.find((id) => moduloVisibile(vendita, id) && voce.frasi[id])
    return primo ? voce.frasi[primo] : ''
  }
  // IL CAROSELLO. `scelto` è il gesto che si vede; se la vendita cambia a
  // pagina aperta e i gesti diventano meno, si resta sull'ultimo. Avanza
  // da solo finché i filmati girano (cioè: il sistema lo permette e
  // nessuno ha premuto «Ferma»), e aspetta quando il puntatore o il fuoco
  // sono sulla prima schermata: chi sta leggendo o usando i comandi non
  // deve vedersi cambiare la diapositiva sotto le mani.
  const [scelto, setScelto] = useState(0)
  // Due motivi per aspettare, ognuno col suo stato (rilievo del revisore,
  // 11/11/2026): con uno solo, l'ultimo evento vinceva, e il mouse che
  // usciva faceva ripartire lo scorrimento anche col fuoco ancora su un
  // comando. Il puntatore conta solo se è un mouse: al tocco «entra» ma non
  // «esce» mai, e lo scorrimento restava fermo per sempre.
  const [puntatoreSopra, setPuntatoreSopra] = useState(false)
  const [fuocoDentro, setFuocoDentro] = useState(false)
  const inPausa = puntatoreSopra || fuocoDentro
  const indice = Math.min(scelto, gesti.length - 1)
  const quanti = gesti.length
  const vai = (i) => setScelto(((i % quanti) + quanti) % quanti)
  const scorre = filmati.girano && !inPausa && quanti > 1
  useEffect(() => {
    if (!scorre) return undefined
    // Riparte a ogni cambio di diapositiva (per questo `indice` è fra le
    // dipendenze): chi ne ha scelta una a mano la vede per quattro secondi
    // interi, non per quel che restava del giro.
    const giro = setTimeout(() => setScelto((i) => (Math.min(i, quanti - 1) + 1) % quanti), PASSO_CAROSELLO_MS)
    return () => clearTimeout(giro)
  }, [scorre, quanti, indice])
  const gesto = gesti[indice]
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
  // IL CONFRONTO FRA I PIANI (REQ-FLOTTA-063). Le colonne sono i piani in
  // vendita. Le righe del «lavoro di ogni giorno» nascono dai limiti del
  // listino (functions/piani.json): un piano senza un limite scritto non
  // ce l'ha, e la cella lo dice («Senza limite», «Sì», «Tutto»). Nessun
  // numero scritto a mano.
  const c = t.prezzi.confronto
  const limite = (p, chiave) => p.limiti?.[chiave]
  const righeLavoro = [
    { id: 'comande', valore: (p) => (limite(p, 'comande') === false ? c.no : c.si) },
    { id: 'prodotti', valore: (p) => (limite(p, 'prodotti_max') ? interpola(c.finoA, { n: limite(p, 'prodotti_max') }) : c.senzaLimite) },
    { id: 'conti', valore: (p) => (limite(p, 'conti_aperti_max') ? interpola(c.finoA, { n: limite(p, 'conti_aperti_max') }) : c.senzaLimite) },
    { id: 'utenti', valore: (p) => (limite(p, 'utenti_max') === 1 ? c.soloTitolare : limite(p, 'utenti_max') ? interpola(c.finoA, { n: limite(p, 'utenti_max') }) : c.senzaLimite) },
    { id: 'sconti', valore: (p) => (limite(p, 'sconti') === false ? c.no : c.si) },
    { id: 'storico', valore: (p) => (limite(p, 'storico_giorni') ? interpola(c.giorni, { n: limite(p, 'storico_giorni') }) : c.tutto) },
    // La scritta col nome del prodotto in fondo allo scontrino e al menù
    // (REQ-FLOTTA-068): la porta chi ha `marchio` nel listino, oggi il Free.
    { id: 'marchio', valore: (p) => (limite(p, 'marchio') ? interpola(c.marchio, { nome: NOME_PRODOTTO }) : c.nessuna) },
    { id: 'terminali', valore: (p) => String(p.terminali || 1) },
  ]
  // Una riga che dice la stessa cosa per tutti i piani in colonna non è un
  // confronto: senza il Free in vendita, Base e Completo hanno comande,
  // prodotti, conti, utenti, sconti e storico uguali, e sei righe identiche
  // nasconderebbero l'unica cosa che conta, i moduli. I terminali restano
  // sempre: sono un numero che chi compra vuole leggere.
  const righeDaMostrare = righeLavoro.filter((r) => r.id === 'terminali' || new Set(piani.map((p) => r.valore(p))).size > 1)
  // Un modulo, in un piano: compreso, da comprare a parte, o (nel piano
  // gratuito, che non ha moduli) non disponibile.
  const cellaModulo = (p, m) => {
    if ((p.include || []).includes(m.id)) return 'incluso'
    if (p.gratuito) return 'no'
    return 'prezzo'
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

      {/* LA PRIMA SCHERMATA È UN CAROSELLO. Sotto, i cinque filmati in fila,
          che scorrono in orizzontale uno alla volta; sopra un velo scuro;
          davanti, ferme, le cose che non cambiano: cosa è, cosa fare e la
          scheda coi fatti. In basso la parola del gesto che si vede, la
          sua riga, e i comandi: indietro, avanti, i cinque
          punti, e «Ferma i filmati» che ferma anche lo scorrimento.
          Gira solo il filmato della diapositiva che si vede: gli altri
          sono fermi immagine, così non si scaricano cinque filmati
          insieme. La parola del gesto è annunciata ai lettori di schermo
          solo quando si cambia a mano, non a ogni giro. */}
      <section
        className="hero"
        aria-labelledby="hero-titolo"
        onPointerEnter={(e) => e.pointerType !== 'touch' && setPuntatoreSopra(true)}
        onPointerLeave={() => setPuntatoreSopra(false)}
        onFocus={() => setFuocoDentro(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFuocoDentro(false)}
      >
        <div className="carosello" aria-hidden="true">
          <ol className="diapositive" style={{ transform: `translateX(-${indice * 100}%)` }}>
            {gesti.map((g, i) => (
              <li key={g.id} className="diapositiva" data-gesto={g.id} data-visibile={i === indice}>
                <Filmato nome={g.id} className="hero-sfondo" gira={filmati.girano && i === indice} />
              </li>
            ))}
          </ol>
        </div>
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
        <div className="contenitore">
          <div id="gesti" className="gesti" role="group" aria-roledescription={t.gesti.carosello} aria-label={t.gesti.titolo}>
            <div className="gesto-testo" aria-live={scorre ? 'off' : 'polite'} aria-atomic="true">
              <p className="gesto-parola">{t.gesti.voci[gesto.id].parola}</p>
              <p className="gesto-riga">{rigaGesto(gesto)}</p>
            </div>
            <div className="gesto-comandi">
              <button type="button" className="gesto-freccia" aria-label={t.gesti.precedente} onClick={() => vai(indice - 1)}>
                <span aria-hidden="true">‹</span>
              </button>
              <ol className="gesto-punti">
                {gesti.map((g, i) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="gesto-punto"
                      aria-label={interpola(t.gesti.vaiA, { parola: t.gesti.voci[g.id].parola, n: i + 1, totale: quanti })}
                      aria-current={i === indice ? 'true' : undefined}
                      onClick={() => vai(i)}
                    />
                  </li>
                ))}
              </ol>
              <button type="button" className="gesto-freccia" aria-label={t.gesti.successiva} onClick={() => vai(indice + 1)}>
                <span aria-hidden="true">›</span>
              </button>
              {filmati.possibile && (
                <button type="button" className="link ferma-filmati" aria-pressed={!filmati.girano} onClick={filmati.cambia}>
                  {filmati.girano ? t.gesti.ferma : t.gesti.riprendi}
                </button>
              )}
            </div>
          </div>
          <p className="nota nota-filmati">{t.gesti.nota}</p>
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
                  </div>
                  {/* Sempre aperto (Daniele, 11/11/2026: «i box cosa comprende
                      dovrebbero essere sempre aperti»): per un pomeriggio
                      è stato un elemento che si apriva. */}
                  <div className="funzione-riquadro">
                    <p className="scheda-titolo">{t.funzioni.punti}</p>
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
                  <p className="minore-testo">{t.funzioni.minori[f.id]}</p>
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
          {/* IL CONFRONTO FRA I PIANI, CHE SI APRE (REQ-FLOTTA-063). Una
              colonna per piano in vendita. Prima cosa cambia nel lavoro di
              ogni giorno, poi i moduli: «Incluso» dove il piano li
              comprende, il prezzo dove si comprano a parte, «Non
              disponibile» nel piano gratuito. I prezzi sono al mese e IVA
              esclusa, e lo dice la riga sotto la tabella. */}
          <Apribile id="confronto-piani" className="confronto" comando={<span className="apribile-titolo">{c.apri}</span>}>
            <div className="tabella-confronto">
              <table className="confronto-tabella">
                <caption className="solo-lettori">{c.didascalia}</caption>
                <thead>
                  <tr>
                    <td />
                    {piani.map((p) => (
                      <th scope="col" key={p.id} className={p.id === 'completo' ? 'in-evidenza' : undefined}>
                        {nomePiano(t, p)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="gruppo">
                    <th scope="rowgroup" colSpan={piani.length + 1}>
                      {c.gruppoLavoro}
                    </th>
                  </tr>
                  {righeDaMostrare.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{c.righe[r.id]}</th>
                      {piani.map((p) => (
                        <td key={p.id}>{r.valore(p)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {/* Un <tbody> per gruppo: l'intestazione di gruppo vale per le
                    righe del suo, e un lettore di schermo non attribuisce «Il
                    lavoro di ogni giorno» ai moduli. */}
                <tbody>
                  <tr className="gruppo">
                    <th scope="rowgroup" colSpan={piani.length + 1}>
                      {c.gruppoModuli}
                    </th>
                  </tr>
                  {moduliVisibili.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">{nomeModulo(t, m)}</th>
                      {piani.map((p) => {
                        const cosa = cellaModulo(p, m)
                        return (
                          <td key={p.id}>
                            {cosa === 'incluso' && (
                              <span className="incluso">
                                <Icona d={SPUNTA} className="icona spunta" />
                                {t.prezzi.tabella.incluso}
                              </span>
                            )}
                            {cosa === 'no' && <span className="non-incluso">{c.nonDisponibile}</span>}
                            {cosa === 'prezzo' && (
                              <>
                                {piuIva(m.prezzo)}
                                <span className="iva-inclusa">{ivaInclusa(m.prezzo)}</span>
                              </>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{t.prezzi.tabella.terminale}</th>
                    {piani.map((p) => (
                      <td key={p.id}>
                        {p.gratuito ? (
                          <span className="non-incluso">{c.nonDisponibile}</span>
                        ) : (
                          <>
                            {piuIva(TERMINALE_IN_PIU)}
                            <span className="iva-inclusa">{ivaInclusa(TERMINALE_IN_PIU)}</span>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="nota confronto-nota">{c.nota}</p>
          </Apribile>

          {/* I MODULI, UNO PER UNO, A SCOMPARSA. Una riga per modulo col nome
              e quanto costa; si apre a dire cosa fa. Prima era una tabella
              sempre aperta, e in testa ai prezzi c'erano nove righe di
              moduli prima ancora di aver capito i piani. */}
          <h3 className="tabella-titolo">{t.prezzi.tabella.titolo}</h3>
          <ul className="moduli-elenco">
            {moduliVisibili.map((m) => (
              <li key={m.id}>
                <Apribile
                  id={`modulo-${m.id}`}
                  className="modulo"
                  comando={
                    <>
                      <span className="apribile-titolo">{nomeModulo(t, m)}</span>{' '}
                      <span className="modulo-prezzo">
                        {inclusiNelBase.has(m.id) ? interpola(c.nelPiano, { piano: nomeBase }) : `${piuIva(m.prezzo)} ${t.prezzi.alMese}`}
                      </span>
                    </>
                  }
                >
                  <p className="modulo-cosa">{descrizioneModulo(t, m)}</p>
                  <p className="modulo-dove">
                    {inclusiNelBase.has(m.id)
                      ? interpola(c.inclusoInTutti, { base: nomeBase, completo: nomeCompleto })
                      : interpola(inclusiNelCompleto.has(m.id) ? c.aParteEIncluso : c.aParte, {
                          base: nomeBase,
                          completo: nomeCompleto,
                          prezzo: piuIva(m.prezzo),
                          lordo: ivaInclusa(m.prezzo),
                        })}
                  </p>
                </Apribile>
              </li>
            ))}
            <li>
              <Apribile
                id="modulo-terminale"
                className="modulo"
                comando={
                  <>
                    <span className="apribile-titolo">{t.prezzi.tabella.terminale}</span>{' '}
                    <span className="modulo-prezzo">
                      {piuIva(TERMINALE_IN_PIU)} {t.prezzi.alMese}
                    </span>
                  </>
                }
              >
                <p className="modulo-cosa">{t.prezzi.tabella.terminaleTesto}</p>
                <p className="modulo-dove">
                  {interpola(c.terminaliNelPiano, {
                    base: nomeBase,
                    completo: nomeCompleto,
                    n_base: plurale(base.terminali || 1, t.prezzi.tabella.terminaliInclusi),
                    n_completo: plurale(completo.terminali || 1, t.prezzi.tabella.terminaliInclusi),
                    lordo: ivaInclusa(TERMINALE_IN_PIU),
                  })}
                </p>
              </Apribile>
            </li>
          </ul>
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
