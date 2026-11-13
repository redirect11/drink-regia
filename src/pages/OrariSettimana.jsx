import { GIORNI, NOMI_GIORNI, giorniSenzaPausa, AVVISO_SENZA_PAUSA } from '../lib/orari.js'

// GLI ORARI DI SERVIZIO, UN GIORNO PER RIGA (REQ-FLOTTA-095): apertura e
// chiusura, o «chiuso». Serve alla registrazione e all'area del titolare.
// La chiusura prima dell'apertura è il giorno dopo; alla stessa ora sono 24
// ore. Se gli orari non lasciano un'ora fra una chiusura e l'apertura dopo
// (punto 9 di Daniele, 13/11/2026), un avviso lo dice subito: lì la
// sospensione per mancato pagamento può arrivare durante il servizio.
// `valore`: { lun: { chiuso, apre, chiude }, … } come nel modulo.
export default function OrariSettimana({ valore, onChange, errori = {}, prefisso = 'orari', disabilitato = false }) {
  const cambia = (id, campo, v) => onChange({ ...valore, [id]: { ...valore[id], [campo]: v } })
  const senzaPausa = giorniSenzaPausa(valore)
  return (
    <div className="orari-settimana">
      {GIORNI.map((id) => {
        const g = valore[id]
        const nome = NOMI_GIORNI[id]
        return (
          <div key={id} className="orari-giorno">
            <span className="orari-nome">{nome}</span>
            <label className="opzione">
              <input type="checkbox" aria-label={`${nome} chiuso`} checked={g.chiuso === true} disabled={disabilitato} onChange={(e) => cambia(id, 'chiuso', e.target.checked)} />
              chiuso
            </label>
            {g.chiuso !== true && (
              <>
                <input
                  id={`${prefisso}-${id}-apre`}
                  type="time"
                  aria-label={`${nome}, apertura`}
                  value={g.apre}
                  disabled={disabilitato}
                  aria-invalid={Boolean(errori[id])}
                  onChange={(e) => cambia(id, 'apre', e.target.value)}
                />
                <span aria-hidden="true">–</span>
                <input id={`${prefisso}-${id}-chiude`} type="time" aria-label={`${nome}, chiusura`} value={g.chiude} disabled={disabilitato} onChange={(e) => cambia(id, 'chiude', e.target.value)} />
              </>
            )}
            {errori[id] && <p className="errore small">{errori[id]}</p>}
          </div>
        )
      })}
      {errori.orari && <p className="errore small">{errori.orari}</p>}
      {senzaPausa.length > 0 && (
        <p className="avviso small" role="status">
          {AVVISO_SENZA_PAUSA} (dopo {senzaPausa.map((id) => NOMI_GIORNI[id].toLowerCase()).join(', ')}): non c’è almeno un’ora fra la chiusura e l’apertura dopo.
        </p>
      )}
    </div>
  )
}
