import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { elencoMovimenti, elencoTraffico, statoFondatori } from '../lib/db.js'
import { PERIODI, periodoDi, riepilogo, tabellaAbbonamenti, csv, COLONNE_ABBONAMENTI, COLONNE_MOVIMENTI, CLASSI_DETTE, variazione } from '../lib/commerciale.js'
import { euro } from '../lib/piani.js'

// «COMMERCIALE» (REQ-FLOTTA-041, REQ-FLOTTA-042): la dashboard di chi vende.
// L'utente, 07/11/2026: «il guadagno, le attivazioni, il traffico e altre
// cose utili […] prendi ispirazione dai vari e-commerce online». Com'è
// fatta, nell'ordine di un pannello di vendita: il periodo in alto, che
// vale per tutto; quattro numeri di testa (incasso, canone mensile,
// paganti, viste) col confronto sul periodo prima; gli andamenti per
// giorno; cosa si vende; il percorso da visitatore a pagante; cosa scade e
// cosa chiede attenzione; gli abbonamenti e i movimenti in tabella, con
// l'esportazione in CSV. I numeri li calcola src/lib/commerciale.js; qui
// si disegna. Le righe dei locali e i contatti arrivano dal Backoffice, che
// li ha già; movimenti, traffico e Fondatori si leggono qui.
export default function Commerciale({ righe, contatti, onErrore, adesso = new Date() }) {
  const [parametri, setParametri] = useSearchParams()
  const periodo = periodoDi(parametri.get('periodo'))
  const [movimenti, setMovimenti] = useState(undefined)
  const [traffico, setTraffico] = useState([])
  const [fondatori, setFondatori] = useState(null)

  useEffect(() => {
    let vivo = true
    Promise.all([elencoMovimenti(), elencoTraffico(400).catch(() => []), statoFondatori().catch(() => null)])
      .then(([m, t, f]) => {
        if (!vivo) return
        setMovimenti(m)
        setTraffico(t)
        setFondatori(f)
      })
      .catch((e) => {
        if (!vivo) return
        onErrore?.(e.message)
        setMovimenti([])
      })
    return () => {
      vivo = false
    }
  }, [onErrore])

  const r = useMemo(
    () => riepilogo({ righe: righe || [], movimenti: movimenti || [], traffico, contatti: contatti || [], fondatori }, { giorni: periodo.giorni, adesso }),
    [righe, movimenti, traffico, contatti, fondatori, periodo.giorni, adesso]
  )
  const abbonamenti = useMemo(() => tabellaAbbonamenti(righe || [], movimenti || [], adesso), [righe, movimenti, adesso])

  if (movimenti === undefined) return <p className="muted">Carico i numeri…</p>

  const cambiaPeriodo = (id) =>
    setParametri(
      (p) => {
        const n = new URLSearchParams(p)
        if (id === PERIODI[1].id) n.delete('periodo')
        else n.set('periodo', id)
        return n
      },
      { replace: true }
    )

  return (
    <div className="commerciale">
      {/* Il filtro, uno solo, sopra tutto quello che governa. */}
      <div className="filtri-locali" role="group" aria-label="Periodo">
        <div className="campo">
          <label htmlFor="co-periodo">Periodo</label>
          <select id="co-periodo" value={periodo.id} onChange={(e) => cambiaPeriodo(e.target.value)}>
            {PERIODI.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <p className="muted small periodo-dal">
          Dal {giorno(r.periodo.dal)} a oggi, confrontato coi {periodo.giorni} giorni prima.
        </p>
      </div>

      <section className="tessere" aria-label="Numeri di testa">
        <Tessera
          etichetta="Incasso del periodo"
          valore={euro(r.ricavi.incasso)}
          delta={r.ricavi.variazione}
          nota={`${r.ricavi.movimentiNelPeriodo} ${r.ricavi.movimentiNelPeriodo === 1 ? 'movimento' : 'movimenti'} · prima ${euro(r.ricavi.incassoPrecedente)}`}
          testid="kpi-incasso"
        />
        <Tessera
          etichetta="Canone mensile ricorrente"
          valore={euro(r.ricavi.mrr)}
          nota={`${euro(r.ricavi.arr)} all’anno · ${euro(r.ricavi.arpu)} per cliente`}
          testid="kpi-mrr"
        />
        <Tessera
          etichetta="Clienti paganti"
          valore={numero(r.clienti.paganti)}
          delta={variazione(r.clienti.nuovi, r.clienti.nuoviPrima)}
          nota={`${r.clienti.nuovi} ${r.clienti.nuovi === 1 ? 'registrato' : 'registrati'} nel periodo · ${r.clienti.istanzeAttive} app attive`}
          testid="kpi-paganti"
        />
        <Tessera
          etichetta="Viste del sito"
          valore={numero(r.traffico.viste)}
          delta={variazione(r.traffico.viste, r.traffico.vistePrima)}
          nota={r.traffico.giorniConDati ? `${r.traffico.giorniConDati} giorni con dati · ${numero(r.traffico.eventi.registrazione || 0)} registrazioni dal sito` : 'nessun dato ancora'}
          testid="kpi-viste"
        />
      </section>

      <section className="riquadri commerciale-grafici" aria-label="Andamenti">
        <Colonne titolo="Incasso per giorno" giorni={r.serie.giorni} valori={r.serie.incassi} formato={euro} />
        <Colonne titolo="Registrazioni per giorno" giorni={r.serie.giorni} valori={r.serie.registrazioni} formato={numero} />
        <Colonne titolo="Viste per giorno" giorni={r.serie.giorni} valori={r.serie.viste} formato={numero} />
      </section>

      <div className="riquadri">
        <section className="card" aria-label="Clienti">
          <h3>Clienti</h3>
          <dl className="locale-dati">
            {['pagante', 'free', 'gratis', 'in_attesa', 'fermo', 'disdetto', 'eliminato'].map((k) => (
              <div key={k}>
                <dt>{CLASSI_DETTE[k]}</dt>
                <dd data-testid={`clienti-${k}`}>{numero(r.clienti[CHIAVE_CLASSE[k]])}</dd>
              </div>
            ))}
          </dl>
          <p className="muted small">
            Conversione dall’inizio: {r.conversione.paganti} paganti su {r.conversione.registrati} registrati ({r.conversione.tasso}%); {r.conversione.conPiano} hanno un piano.
            {r.clienti.disdettiNelPeriodo > 0 && ` ${r.clienti.disdettiNelPeriodo} ${r.clienti.disdettiNelPeriodo === 1 ? 'disdetta' : 'disdette'} nel periodo.`}
          </p>
        </section>

        <section className="card" aria-label="Cosa si vende">
          <h3>Cosa si vende</h3>
          <table className="tabella-commerciale" aria-label="Per piano">
            <thead>
              <tr>
                <th scope="col">Piano</th>
                <th scope="col" className="num">
                  Locali
                </th>
                <th scope="col" className="num">
                  Canone
                </th>
              </tr>
            </thead>
            <tbody>
              {r.perPiano.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.nome}</th>
                  <td className="num">{numero(p.quanti)}</td>
                  <td className="num">{euro(p.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="tabella-commerciale" aria-label="Per modulo">
            <thead>
              <tr>
                <th scope="col">Modulo</th>
                <th scope="col" className="num">
                  Comprato
                </th>
                <th scope="col" className="num">
                  Incluso
                </th>
                <th scope="col" className="num">
                  In prova
                </th>
              </tr>
            </thead>
            <tbody>
              {r.perModulo.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.nome}</th>
                  <td className="num">{numero(m.comprati)}</td>
                  <td className="num">{numero(m.inclusi)}</td>
                  <td className="num">{numero(m.inProva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            {r.terminaliInPiu} {r.terminaliInPiu === 1 ? 'terminale in più venduto' : 'terminali in più venduti'} · Fondatori: {r.fondatori.assegnati} su {r.fondatori.posti}, {r.fondatori.liberi} liberi.
          </p>
        </section>

        <section className="card" aria-label="Dal visitatore al cliente">
          <h3>Dal visitatore al cliente</h3>
          <Imbuto passi={r.traffico.imbuto} />
          <p className="muted small">
            I passi li conta il sito stesso (registrazioni, scelte del piano, attivazioni chieste): sono gesti, non persone. Senza cookie non si contano i
            visitatori, solo le viste.
          </p>
        </section>

        <section className="card" aria-label="Da dove arrivano">
          <h3>Da dove arrivano</h3>
          <Classifica voci={r.traffico.provenienze} vuoto="Nessuna vista nel periodo." />
          <h4>Pagine più viste</h4>
          <Classifica voci={r.traffico.perPagina} vuoto="Nessuna vista nel periodo." />
          <p className="muted small">
            Lingua: {numero(r.traffico.lingue.it || 0)} in italiano, {numero(r.traffico.lingue.en || 0)} in inglese.
          </p>
        </section>

        <section className="card" aria-label="Credito AI">
          <h3>Credito AI</h3>
          <dl className="locale-dati">
            <div>
              <dt>Venduto nel periodo</dt>
              <dd>{euro(r.ai.venduto)}</dd>
            </div>
            <div>
              <dt>Credito ancora nei cassetti</dt>
              <dd>{euro(r.ai.creditoResiduo)}</dd>
            </div>
            <div>
              <dt>Speso dai locali questo mese</dt>
              <dd>{euro(r.ai.spesoMese)}</dd>
            </div>
            <div>
              <dt>Cassetti</dt>
              <dd>{numero(r.ai.cassetti)}</dd>
            </div>
          </dl>
          <p className="muted small">Il credito nei cassetti è un servizio ancora da rendere: entra come incasso quando si ricarica, si consuma quando i locali usano l’AI.</p>
        </section>

        <section className="card" aria-label="Scadenze e attenzione">
          <h3>Scadenze e attenzione</h3>
          <ul className="attenzione">
            {r.attenzione.contattiAperti > 0 && <li>{r.attenzione.contattiAperti} {r.attenzione.contattiAperti === 1 ? 'richiesta di contatto aperta' : 'richieste di contatto aperte'} (sezione «Richieste»).</li>}
            {r.attenzione.daApprovare > 0 && <li>{r.attenzione.daApprovare} {r.attenzione.daApprovare === 1 ? 'attivazione da autorizzare' : 'attivazioni da autorizzare'}.</li>}
            {r.attenzione.attivazioniFallite > 0 && <li className="errore">{r.attenzione.attivazioniFallite} {r.attenzione.attivazioniFallite === 1 ? 'attivazione fallita' : 'attivazioni fallite'}.</li>}
            {r.attenzione.fermi > 0 && <li className="errore">{r.attenzione.fermi} {r.attenzione.fermi === 1 ? 'locale fermo' : 'locali fermi'} per il pagamento.</li>}
            {r.attenzione.pagamentiFalliti.map((p) => (
              <li key={p.slug} className="errore">
                Pagamento fallito: {p.nome} ({giorno(p.il)}).
              </li>
            ))}
            {r.scadenze.map((s) => (
              <li key={`${s.slug}-${s.tipo}-${s.il}`} className={s.scaduta ? 'errore' : ''}>
                {SCADENZE_DETTE[s.tipo]} {s.nome}
                {s.dettaglio ? ` (${s.dettaglio})` : ''}: {giorno(s.il)}
                {s.scaduta && ' · scaduta'}
              </li>
            ))}
            {r.attenzione.contattiAperti === 0 && r.attenzione.daApprovare === 0 && r.attenzione.attivazioniFallite === 0 && r.attenzione.fermi === 0 && r.attenzione.pagamentiFalliti.length === 0 && r.scadenze.length === 0 && (
              <li className="muted">Niente in scadenza nei prossimi 14 giorni, niente da gestire.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="card" aria-label="Abbonamenti">
        <div className="row-tra">
          <h3>Abbonamenti</h3>
          <Esporta nome={`abbonamenti-${r.periodo.al.slice(0, 10)}.csv`} testo={() => csv(abbonamenti, COLONNE_ABBONAMENTI)} />
        </div>
        <div className="tabella-scorre">
          <table className="tabella-locali tabella-commerciale" aria-label="Elenco degli abbonamenti">
            <thead>
              <tr>
                <th scope="col">Locale</th>
                <th scope="col">Classe</th>
                <th scope="col">Piano</th>
                <th scope="col" className="num">
                  Canone
                </th>
                <th scope="col" className="col-secondaria">
                  Dal
                </th>
                <th scope="col" className="col-secondaria">
                  Fino
                </th>
                <th scope="col" className="num">
                  Pagato
                </th>
              </tr>
            </thead>
            <tbody>
              {abbonamenti.map((a) => (
                <tr key={a.uid || a.slug}>
                  <th scope="row">
                    {a.nome}
                    <div className="muted small">{a.slug}</div>
                  </th>
                  <td>{CLASSI_DETTE[a.classe]}</td>
                  <td>
                    {a.piano || <span className="muted">—</span>}
                    {a.moduli.length > 0 && <div className="muted small">{a.moduli.join(', ')}</div>}
                    {a.sconto && <div className="muted small">sconto {a.sconto}</div>}
                    {a.fondatore && <div className="muted small">Fondatore</div>}
                  </td>
                  <td className="num">{a.canone ? euro(a.canone) : <span className="muted">—</span>}</td>
                  <td className="col-secondaria muted small">{a.dal ? giorno(a.dal) : '—'}</td>
                  <td className="col-secondaria muted small">{a.fino ? giorno(a.fino) : '—'}</td>
                  <td className="num">{a.pagato ? euro(a.pagato) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-label="Movimenti">
        <div className="row-tra">
          <h3>Ultimi movimenti</h3>
          <Esporta nome={`movimenti-${r.periodo.al.slice(0, 10)}.csv`} testo={() => csv(movimenti, COLONNE_MOVIMENTI)} />
        </div>
        {r.ultimiMovimenti.length === 0 ? (
          <p className="muted">Nessun incasso registrato ancora. Le fatture di Stripe e i pagamenti registrati dalla scheda del locale compaiono qui.</p>
        ) : (
          <div className="tabella-scorre">
            <table className="tabella-locali tabella-commerciale" aria-label="Elenco dei movimenti">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Locale</th>
                  <th scope="col">Cosa</th>
                  <th scope="col" className="num">
                    Imponibile
                  </th>
                  <th scope="col" className="num col-secondaria">
                    Totale
                  </th>
                  <th scope="col" className="col-secondaria">
                    Origine
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.ultimiMovimenti.map((m) => (
                  <tr key={m.id}>
                    <td>{giorno(m.il)}</td>
                    <th scope="row">{m.slug || m.uid}</th>
                    <td>
                      {TIPI_DETTI[m.tipo] || m.tipo}
                      {m.descrizione && <div className="muted small">{m.descrizione}</div>}
                    </td>
                    <td className="num">{euro(m.importo)}</td>
                    <td className="num col-secondaria muted small">{euro(m.totale)}</td>
                    <td className="col-secondaria muted small">{m.origine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const CHIAVE_CLASSE = { pagante: 'paganti', free: 'free', gratis: 'gratis', in_attesa: 'inAttesa', fermo: 'fermi', disdetto: 'disdetti', eliminato: 'eliminati' }
const SCADENZE_DETTE = { pagamento: 'Pagamento a mano di', rinnovo: 'Rinnovo Stripe di', prova: 'Fine prova di', sconto: 'Fine sconto di' }
const TIPI_DETTI = { abbonamento: 'Abbonamento', ricarica_ai: 'Credito AI', manuale: 'Pagamento a mano' }

// Il punto delle migliaia a mano, come euro(): il Node della CI non ha i dati
// di lingua italiani.
export const numero = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const giorno = (iso) => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// UNA TESSERA: etichetta, valore grande, lo scarto sul periodo prima
// (verde se sale, rosso se scende: qui salire è sempre bene), una nota.
function Tessera({ etichetta, valore, delta, nota, testid }) {
  return (
    <div className="tessera" data-testid={testid}>
      <div className="tessera-etichetta">{etichetta}</div>
      <div className="tessera-valore">{valore}</div>
      {delta != null && (
        <div className={`tessera-delta ${delta > 0 ? 'su' : delta < 0 ? 'giu' : ''}`}>
          {delta > 0 ? '+' : ''}
          {delta}% <span className="muted">sul periodo prima</span>
        </div>
      )}
      {delta === null && <div className="tessera-delta muted">prima era zero</div>}
      {nota && <div className="muted small">{nota}</div>}
    </div>
  )
}

// COLONNE PER GIORNO, una serie sola: l'oro della regia per le barre, il
// testo coi suoi colori. Le barre non superano i 24px, hanno la punta
// arrotondata e la base squadrata, e fra loro un vuoto del colore del
// fondo; una sola etichetta diretta, sul giorno più alto; la griglia è un
// filo. Ogni barra ha il suo titolo al passaggio del mouse, e i numeri
// stanno anche in tabella, sotto.
export function Colonne({ titolo, giorni, valori, formato = numero }) {
  const L = 600
  const H = 150
  const sopra = 18
  const sotto = 22
  const sinistra = 4
  const n = giorni.length
  const max = Math.max(0, ...valori)
  const scala = max > 0 ? (H - sopra - sotto) / max : 0
  const slot = (L - sinistra * 2) / n
  const spessore = Math.max(1, Math.min(24, slot - 2))
  const iMax = valori.indexOf(max)
  const etichette = n <= 7 ? giorni.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
  const breve = (g) => {
    const [, m, d] = g.split('-')
    return `${Number(d)}/${Number(m)}`
  }
  const totale = valori.reduce((s, v) => s + (Number(v) || 0), 0)
  return (
    <section className="card grafico" aria-label={titolo}>
      <h3>
        {titolo} <span className="muted small">· totale {formato(totale)}</span>
      </h3>
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`${titolo}: ${n} giorni, massimo ${formato(max)}`} className="colonne">
        <line x1={sinistra} x2={L - sinistra} y1={H - sotto} y2={H - sotto} className="asse" />
        {max > 0 && <line x1={sinistra} x2={L - sinistra} y1={sopra} y2={sopra} className="griglia" />}
        {valori.map((v, i) => {
          const h = Math.max(0, v * scala)
          const x = sinistra + i * slot + (slot - spessore) / 2
          const y = H - sotto - h
          const raggio = Math.min(4, spessore / 2, h)
          return (
            <g key={giorni[i]} className="colonna">
              <rect x={sinistra + i * slot} y={sopra} width={slot} height={H - sopra - sotto} fill="transparent">
                <title>{`${breve(giorni[i])}: ${formato(v)}`}</title>
              </rect>
              {h > 0 && (
                <path
                  d={`M${x},${H - sotto} v${-(h - raggio)} a${raggio},${raggio} 0 0 1 ${raggio},${-raggio} h${spessore - 2 * raggio} a${raggio},${raggio} 0 0 1 ${raggio},${raggio} v${h - raggio} z`}
                  className="barra"
                />
              )}
              {i === iMax && max > 0 && (
                <text x={Math.min(L - sinistra - 2, Math.max(sinistra + 2, x + spessore / 2))} y={y - 5} textAnchor={i > n * 0.8 ? 'end' : i < n * 0.2 ? 'start' : 'middle'} className="etichetta-valore">
                  {formato(v)}
                </text>
              )}
            </g>
          )
        })}
        {etichette.map((i) => (
          <text key={giorni[i]} x={sinistra + i * slot + slot / 2} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="etichetta-asse">
            {breve(giorni[i])}
          </text>
        ))}
      </svg>
      <details className="tabella-grafico">
        <summary className="muted small">Vedi i numeri</summary>
        <div className="tabella-scorre">
          <table className="tabella-commerciale">
            <thead>
              <tr>
                <th scope="col">Giorno</th>
                <th scope="col" className="num">
                  Valore
                </th>
              </tr>
            </thead>
            <tbody>
              {giorni.map((g, i) => (
                <tr key={g}>
                  <td>{g}</td>
                  <td className="num">{formato(valori[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

// L'IMBUTO: barre orizzontali ordinate, una tinta, il valore in punta e la
// percentuale sul passo prima.
function Imbuto({ passi }) {
  const max = Math.max(0, ...passi.map((p) => p.quanti))
  return (
    <ol className="imbuto">
      {passi.map((p, i) => {
        const prima = passi[i - 1]?.quanti
        const quota = prima > 0 ? Math.round((p.quanti / prima) * 100) : null
        return (
          <li key={p.passo}>
            <div className="row-tra">
              <span>{p.passo}</span>
              <span className="num">
                {numero(p.quanti)}
                {quota != null && <span className="muted small"> · {quota}%</span>}
              </span>
            </div>
            <div className="imbuto-traccia" aria-hidden="true">
              <div className="imbuto-barra" style={{ width: `${max > 0 ? Math.max(p.quanti > 0 ? 2 : 0, (p.quanti / max) * 100) : 0}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// UNA CLASSIFICA: le prime sei voci con la loro barra, in una tinta.
function Classifica({ voci, vuoto }) {
  if (!voci.length) return <p className="muted small">{vuoto}</p>
  const max = voci[0].viste
  return (
    <ul className="classifica">
      {voci.slice(0, 6).map((v) => (
        <li key={v.nome}>
          <div className="row-tra">
            <span>{NOMI_VOCI[v.nome] || v.nome.replace(/_/g, '.')}</span>
            <span className="num">{numero(v.viste)}</span>
          </div>
          <div className="imbuto-traccia" aria-hidden="true">
            <div className="imbuto-barra" style={{ width: `${(v.viste / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
const NOMI_VOCI = { diretto: 'Diretto (nessun sito di provenienza)', home: 'Prima pagina', en: 'Prima pagina in inglese', altro: 'Altro' }

// L'ESPORTAZIONE: il CSV si costruisce nel browser e si scarica, senza
// passare da un server. Nei test si passa `scarica`.
function Esporta({ nome, testo, scarica = scaricaFile }) {
  return (
    <button type="button" className="btn ghost small" onClick={() => scarica(nome, testo())}>
      Esporta CSV
    </button>
  )
}
export function scaricaFile(nome, testo) {
  const url = URL.createObjectURL(new Blob(['﻿', testo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
