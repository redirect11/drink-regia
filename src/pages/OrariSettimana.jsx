import { GIORNI, NOMI_GIORNI, giorniSenzaPausa, AVVISO_SENZA_PAUSA, H24, h24 } from '../lib/orari.js'

// GLI ORARI DI SERVIZIO, UN GIORNO PER RIGA (REQ-FLOTTA-095): apertura e
// chiusura, o «chiuso», o «24 ore». Serve alla registrazione, all'area del
// titolare e al backoffice. La chiusura prima dell'apertura è il giorno
// dopo. Aperto 24 ore è 00:00–24:00 (Daniele, 13/11/2026: «se è h24 fai 0 -
// 24»): un campo orario non sa scrivere 24:00, quindi c'è la casella «24
// ore», che nasconde i due campi. Se gli orari non lasciano un'ora fra una chiusura e l'apertura dopo
// (punto 9 di Daniele, 13/11/2026), un avviso lo dice subito: lì la
// sospensione per mancato pagamento può arrivare durante il servizio.
// `valore`: { lun: { chiuso, apre, chiude }, … } come nel modulo.
export default function OrariSettimana({ valore, onChange, errori = {}, prefisso = 'orari', disabilitato = false }) {
  const cambia = (id, campo, v) => onChange({ ...valore, [id]: { ...valore[id], [campo]: v } })
  // Tolta la casella «24 ore», i campi tornano vuoti: 24:00 non si scrive a mano.
  const cambia24 = (id, si) => onChange({ ...valore, [id]: { ...valore[id], ...(si ? H24 : { apre: '', chiude: '' }) } })
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
              <label className="opzione">
                <input type="checkbox" aria-label={`${nome} aperto 24 ore`} checked={h24(g)} disabled={disabilitato} onChange={(e) => cambia24(id, e.target.checked)} />
                24 ore
              </label>
            )}
            {g.chiuso !== true && !h24(g) && (
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
