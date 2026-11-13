import { useState } from 'react'
import { NOMI_ONDATE, TAG, rilascioAperto, contiDetti } from '../lib/rilasci.js'

// I RILASCI A ONDATE (REQ-FLOTTA-012): un tag di tana-drink arriva ai
// locali un'ondata alla volta — prova, interne, pilota, tutti gli altri —
// e ogni ondata la avvia l'admin quando quella prima è finita senza
// errori. Le regole le applica la Function; qui si vede e si decide.
//
// Un rilascio OBBLIGATORIO (REQ-FLOTTA-020: sicurezza, compatibilità con la
// regia) arriva a tutti, anche a chi aggiorna a scelta o non ha gli
// aggiornamenti nel piano: lo si dice quando lo si crea.
export default function Rilasci({ rilasci, onAzione }) {
  const aperto = rilascioAperto(rilasci)
  const ultimo = aperto || rilasci?.[0] || null
  const [obbligatorio, setObbligatorio] = useState(false)

  const nuovo = () => {
    const ref = window.prompt('Il tag di tana-drink da portare ai locali (vX.Y.Z):', '')
    if (ref == null) return
    if (!TAG.test(ref.trim())) {
      window.alert('Serve un tag vX.Y.Z: un ramo come main cambia fra un’ondata e l’altra.')
      return
    }
    onAzione('crea', { ref: ref.trim(), obbligatorio })
    setObbligatorio(false)
  }

  return (
    <section className="card" aria-label="Rilasci">
      <div className="row-tra">
        <h3>Rilasci</h3>
        {!aperto && (
          <button type="button" className="btn ghost small" onClick={nuovo}>
            Nuovo rilascio
          </button>
        )}
      </div>
      {!aperto && (
        <label className="riga small">
          <input type="checkbox" checked={obbligatorio} onChange={(e) => setObbligatorio(e.target.checked)} />
          Il prossimo rilascio è obbligatorio: sicurezza o compatibilità, arriva a tutti
        </label>
      )}
      {!ultimo ? (
        <p className="muted small">Nessun rilascio ancora. Un rilascio porta un tag di tana-drink ai locali, un’ondata alla volta.</p>
      ) : (
        <>
          <p>
            <strong>{ultimo.ref}</strong> · <span data-testid="stato-rilascio">{ultimo.stato}</span>
            {ultimo.obbligatorio && <span className="small"> · obbligatorio</span>}
            {ultimo.fermato_perche && <span className="errore small"> · {ultimo.fermato_perche}</span>}
          </p>
          <ol className="ondate">
            {ultimo.ondate.map((o, i) => {
              const conti = ultimo.riepilogo?.[i]
              return (
                <li key={o.nome} className={i === ultimo.ondata ? 'ondata-attuale' : ''}>
                  <strong>{NOMI_ONDATE[o.nome] || o.nome}</strong>{' '}
                  <span className="muted small">
                    {o.slugs.join(', ')}
                    {o.avviata_il ? ` · avviata il ${new Date(o.avviata_il).toLocaleString('it-IT')}` : ' · non avviata'}
                  </span>
                  {conti && o.avviata_il && <div className="small">{contiDetti(conti)}</div>}
                  {o.nome === 'interna' && o.avviata_il && (
                    <div className="muted small">Le installazioni interne si pubblicano dal loro repository: qui si aspetta la versione che riferiscono.</div>
                  )}
                </li>
              )
            })}
          </ol>
          {aperto && (
            <div className="azioni">
              {aperto.puo_avanzare ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    if (window.confirm(`Avviare l’ondata «${NOMI_ONDATE[aperto.prossima] || aperto.prossima}» di ${aperto.ref}?`)) onAzione('avanza', { ref: aperto.ref })
                  }}
                >
                  Avvia l’ondata «{NOMI_ONDATE[aperto.prossima] || aperto.prossima}»
                </button>
              ) : (
                <span className="muted small">{aperto.perche_fermo}</span>
              )}
              {aperto.stato === 'in corso' && (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    const perche = window.prompt('Perché si ferma?', '')
                    if (perche != null) onAzione('ferma', { ref: aperto.ref, perche })
                  }}
                >
                  Ferma
                </button>
              )}
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  if (window.confirm(`Annullare ${aperto.ref}? I locali già aggiornati restano come sono.`)) onAzione('annulla', { ref: aperto.ref })
                }}
              >
                Annulla rilascio
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
