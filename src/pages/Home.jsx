import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOME_PRODOTTO, SLOGAN, DESCRIZIONE, URL_DEMO, EMAIL_CONTATTI } from '../lib/prodotto.js'
import { MODULI, TERMINALE_IN_PIU, ATTIVAZIONE, euro } from '../lib/piani.js'
import { osservaVendita } from '../lib/db.js'
import { venditaPulita, pianiInVendita, moduloVisibile } from '../lib/vendita.js'

// LA PRIMA PAGINA (REQ-FLOTTA-002): una landing page intera — cosa fa il
// prodotto, per chi, come si attiva, i piani coi prezzi, le domande che
// un titolare fa prima di pagare. L'utente, 22/10/2026: «deve essere una
// landing page con menu e tutto il resto, una roba seria». Seria vuol
// dire curata, non gridata: registro del mestiere, niente toni da
// venditore (DESIGN.md, guardrail 3).

// Le funzioni, raccontate come le vede chi sta al banco. Le icone sono
// tratti semplici inline: niente font di icone, niente richieste esterne.
const FUNZIONI = [
  {
    titolo: 'Comande e conti',
    testo: 'Si apre un conto, si aggiungono i drink, si incassa. La comanda arriva al banco e si stampa da sola.',
    icona: 'M4 4h16v4H4zM4 10h16v10H4zM8 14h8',
  },
  {
    titolo: 'Funziona senza rete',
    testo: 'Con il Wi-Fi che cade a mezzanotte la cassa continua a battere: i dati si sincronizzano dopo, da soli.',
    icona: 'M2 9c5-5 15-5 20 0M5 12c4-3 10-3 14 0M8 15c2-2 6-2 8 0M12 19h0',
  },
  {
    titolo: 'Scontrino sulla stampante del bar',
    testo: 'Stampante termica Epson al banco: il conto esce in un secondo, con logo e indirizzo del locale.',
    icona: 'M6 3h12v7H6zM4 10h16v8H4zM7 18v3h10v-3',
  },
  {
    titolo: 'Menù digitale e ordini dal tavolo',
    testo: 'Il QR sul tavolo apre il menù sul telefono del cliente, che ordina e segue lo stato dell’ordine.',
    icona: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3',
  },
  {
    titolo: 'Magazzino che si scala da solo',
    testo: 'Ogni drink venduto scarica gli ingredienti della ricetta. Giacenze, scorte minime, inventario, fatture dei fornitori.',
    icona: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  },
  {
    titolo: 'Statistiche e bilancio',
    testo: 'Incassi per serata, venduto per fascia oraria, confronto tra periodi, bilancio per macro-categorie.',
    icona: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  },
]

const PASSI = [
  ['Registra il locale', 'Nome, dati di fatturazione, un referente. Cinque minuti, con l’email verificata.'],
  ['Scegli piano e moduli', 'Il piano Base per cassa e comande; i moduli si aggiungono quando servono, anche dopo.'],
  ['L’installazione è tua', 'Nasce in automatico, con il suo indirizzo e i suoi dati. Si entra dal tablet e si comincia.'],
]

const DOMANDE = [
  [
    'I miei dati stanno insieme a quelli di altri locali?',
    'No. Ogni locale ha un’installazione separata, con il suo database e il suo indirizzo. Nessun altro locale la vede, e noi la tocchiamo solo per manutenzione e aggiornamenti, come scritto nei termini.',
  ],
  [
    'Lo scontrino è fiscale?',
    'No. Lo scontrino esce su una stampante termica ed è un conto di cortesia. Per lo scontrino fiscale serve un registratore telematico, che resta del locale: l’app non lo sostituisce.',
  ],
  [
    'Che cosa serve per cominciare?',
    'Un tablet o un telefono con un browser moderno. Per lo scontrino, una stampante termica Epson in rete. Per i pagamenti con carta, un lettore SumUp.',
  ],
  [
    'Cosa succede se la rete cade?',
    'La cassa continua a lavorare: conti, comande e incassi restano sul dispositivo e si sincronizzano quando la rete torna. È la prima regola con cui l’app è stata scritta.',
  ],
  [
    'Posso cambiare piano o disdire?',
    'Il piano e i moduli si cambiano dalla propria pagina, e l’abbonamento è mensile. Alla disdetta l’installazione resta consultabile per il tempo scritto nei termini, poi viene chiusa.',
  ],
  [
    'Chi fa gli aggiornamenti?',
    'Noi. L’app è la stessa per tutti i locali e migliora ogni mese; gli aggiornamenti arrivano alla tua installazione senza che tu debba fare niente.',
  ],
]

function Icona({ d }) {
  return (
    <svg className="icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export default function Home({ utente }) {
  // Il Free e i moduli si mostrano solo se sono in vendita (REQ-FLOTTA-015).
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-testo">
          <p className="occhiello">Gestionale per bar e cocktail bar</p>
          <h1>{NOME_PRODOTTO}</h1>
          <p className="slogan">{SLOGAN}</p>
          <p className="muted hero-descrizione">{DESCRIZIONE}</p>
          <div className="azioni">
            {utente ? (
              <Link className="btn" to="/dashboard">
                La mia dashboard
              </Link>
            ) : (
              <>
                <Link className="btn" to="/registrati">
                  Registra il tuo locale
                </Link>
                <a className="btn ghost" href={URL_DEMO} target="_blank" rel="noreferrer">
                  Guarda l’installazione dimostrativa
                </a>
              </>
            )}
          </div>
          <ul className="fatti" aria-label="In breve">
            <li>Un’installazione per ogni locale</li>
            <li>Lavora senza rete</li>
            <li>Attivazione automatica</li>
          </ul>
        </div>
        <figure className="hero-figura">
          <img src="/hero.jpg" alt="Il banco di un cocktail bar" width="1600" height="600" />
        </figure>
      </section>

      <section id="funzioni" className="sezione">
        <h2>Funzioni</h2>
        <p className="muted sezione-sotto">Nata al banco di un cocktail bar, con il locale pieno. Ogni funzione risponde a una serata vera.</p>
        <div className="griglia-funzioni">
          {FUNZIONI.map((f) => (
            <article className="card funzione" key={f.titolo}>
              <Icona d={f.icona} />
              <h3>{f.titolo}</h3>
              <p className="muted">{f.testo}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="come-funziona" className="sezione">
        <h2>Come funziona</h2>
        <ol className="passi-landing">
          {PASSI.map(([titolo, testo], i) => (
            <li key={titolo}>
              <span className="numero" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{titolo}</h3>
              <p className="muted">{testo}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="prezzi" className="sezione">
        <h2>Piani e prezzi</h2>
        <p className="muted sezione-sotto">
          Importi al mese, IVA esclusa. L’attivazione si paga una volta: {euro(ATTIVAZIONE)}.
        </p>
        <div className="piani">
          {pianiInVendita(vendita).map((p) => (
            <article className={`card piano${p.id === 'completo' ? ' in-evidenza' : ''}`} key={p.id} aria-label={`Piano ${p.nome}`}>
              {p.id === 'completo' && <span className="etichetta">Tutto incluso</span>}
              <h3>{p.nome}</h3>
              <p className="prezzo">
                {euro(p.prezzo)} <span className="muted small">/ mese</span>
              </p>
              <p className="muted">{p.descrizione}</p>
              {!utente && (
                <Link className={`btn block${p.id === 'completo' ? '' : ' ghost'}`} to="/registrati">
                  Parti con {p.nome}
                </Link>
              )}
            </article>
          ))}
        </div>
        <h3>Moduli in più sul piano Base</h3>
        <table className="moduli">
          <tbody>
            {MODULI.filter((m) => moduloVisibile(vendita, m.id)).map((m) => (
              <tr key={m.id}>
                <th scope="row">{m.nome}</th>
                <td className="muted">{m.descrizione}</td>
                <td className="prezzo-riga">{euro(m.prezzo)} / mese</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Terminale in più</th>
              <td className="muted">Un altro tablet o telefono che batte sulla stessa cassa.</td>
              <td className="prezzo-riga">{euro(TERMINALE_IN_PIU)} / mese</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Lo scontrino esce su una stampante termica: non è uno scontrino fiscale. Per quello serve un registratore
          telematico, che resta del locale.
        </p>
      </section>

      <section id="domande" className="sezione">
        <h2>Domande frequenti</h2>
        <div className="domande">
          {DOMANDE.map(([d, r]) => (
            <details key={d}>
              <summary>{d}</summary>
              <p className="muted">{r}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contatti" className="sezione contatti card">
        <h2>Vuoi vederlo con il tuo menù?</h2>
        <p className="muted">
          Scrivici: ti rispondiamo con una dimostrazione sul tuo listino e un preventivo chiaro, senza impegno.
        </p>
        <div className="azioni">
          <a className="btn" href={`mailto:${EMAIL_CONTATTI}`}>
            Scrivi a {EMAIL_CONTATTI}
          </a>
          {!utente && (
            <Link className="btn ghost" to="/registrati">
              Registra il tuo locale
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}
