import { EMAIL_CONTATTI } from '../lib/prodotto.js'
import { stampantiPerIlTitolare } from '../lib/stampanti.js'
import { contattoDi } from '../lib/clienti.js'

// «IL LOCALE» NELL'AREA DEL TITOLARE (REQ-FLOTTA-084): i dati che la regia
// ha nella scheda del cliente (clienti/{uid}), come nascono alla
// registrazione (schema 2, functions/lib/registrazione.js), più le
// stampanti dette con l'acquisto (REQ-FLOTTA-081).
// IN SOLA LETTURA: oggi il sito non scrive mai clienti/{uid} dal browser e
// nessuna Function cambia questi dati (firestore.rules), quindi la modifica
// si chiede per email. Un modulo per cambiarli è un lavoro a parte, con le
// stesse verifiche della registrazione.
// Un cliente registrato prima dello schema 2 può non avere i blocchi:
// quello che manca si dice «non indicato», senza inventare.

const nonIndicato = <span className="muted">non indicato</span>

// La sede in due righe: «Via…» e «CAP Città (PR)».
function righeIndirizzo(i) {
  const citta = [i?.cap, i?.citta].filter(Boolean).join(' ')
  const seconda = [citta, i?.provincia ? `(${i.provincia})` : ''].filter(Boolean).join(' ')
  return [i?.via, seconda].filter(Boolean)
}

function Voce({ nome, children }) {
  return (
    <div>
      <dt>{nome}</dt>
      <dd>{children || nonIndicato}</dd>
    </div>
  )
}

// Vuoto è false, così la voce dice «non indicato».
const Righe = ({ righe }) => righe.map((r) => <div key={r}>{r}</div>)
const indirizzo = (i) => righeIndirizzo(i).length > 0 && <Righe righe={righeIndirizzo(i)} />

export default function IlLocale({ cliente }) {
  const locale = cliente.locale || {}
  const f = cliente.fatturazione || {}
  const r = cliente.referente || {}
  const stampanti = stampantiPerIlTitolare(cliente.stampanti)
  return (
    <section className="card" aria-label="Dati del locale">
      <h3>Dati del locale</h3>
      <p className="muted small">
        Sono i dati della registrazione, e servono anche per le fatture. Qui si possono solo leggere: per correggerli o cambiarli
        scrivici a <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a> dall’indirizzo email di questo account.
      </p>

      <h4>Il locale</h4>
      <dl className="locale-dati">
        <Voce nome="Nome">{cliente.nome_locale}</Voce>
        <Voce nome="Tipo">{locale.tipo}</Voce>
        <Voce nome="Indirizzo">{indirizzo(locale.indirizzo)}</Voce>
        <Voce nome="Telefono">{locale.telefono}</Voce>
        <Voce nome="Sito">{locale.sito}</Voce>
      </dl>

      <h4>Fatturazione</h4>
      <dl className="locale-dati">
        <Voce nome="Ragione sociale">{f.ragione_sociale}</Voce>
        <Voce nome="Partita IVA">{f.partita_iva}</Voce>
        <Voce nome="Codice fiscale">{f.codice_fiscale}</Voce>
        <Voce nome="PEC">{f.pec}</Voce>
        <Voce nome="Codice destinatario (SDI)">{f.sdi}</Voce>
        <Voce nome="Sede legale">{indirizzo(f.sede_legale)}</Voce>
      </dl>

      <h4>Referente</h4>
      <dl className="locale-dati">
        <Voce nome="Nome">{contattoDi(cliente)}</Voce>
        <Voce nome="Ruolo">{r.ruolo}</Voce>
        <Voce nome="Telefono">{r.telefono}</Voce>
        <Voce nome="Email dell’account">{cliente.email}</Voce>
      </dl>

      {/* Le stampanti si dicono con la richiesta d'acquisto (REQ-FLOTTA-081): chi non l'ha fatta non le ha. */}
      {stampanti && (
        <>
          <h4>Stampanti</h4>
          <p data-testid="stampanti-locale">{stampanti}</p>
        </>
      )}
    </section>
  )
}
