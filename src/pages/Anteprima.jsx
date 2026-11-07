import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { NOME_PRODOTTO, EMAIL_CONTATTI } from '../lib/prodotto.js'
import { applicaLingua } from '../lib/lingua.js'
import { testi } from '../i18n/index.js'

// L'ANTEPRIMA (REQ-FLOTTA-043). L'utente, 07/11/2026: «una cosa per la
// produzione che rende il sito indisponibile finché non decido di renderlo
// disponibile […] solo una pagina semplice che parla di una anteprima di
// prodotto, stile coming soon». Finché l'admin non apre il sito dal
// backoffice («Sito aperto al pubblico»), in produzione questa pagina sta
// al posto della prima pagina e della registrazione: cosa è il prodotto,
// che apre a breve, a chi scrivere. Chi ha già un account entra da /accedi
// (il link, discreto, serve all'amministratore). Niente prezzi, niente
// promesse: quelli arrivano con la pagina vera.
export default function Anteprima({ lingua = 'it' }) {
  const t = testi(lingua)
  useEffect(
    () =>
      applicaLingua(document, {
        lingua,
        titolo: `${NOME_PRODOTTO} — ${t.anteprima.titolo}`,
        descrizione: t.anteprima.testo,
        origine: window.location.origin,
      }),
    [lingua, t]
  )
  return (
    <main className="anteprima" aria-labelledby="anteprima-titolo">
      <div className="contenitore anteprima-testo">
        <p className="occhiello">{t.anteprima.occhiello}</p>
        <h1 id="anteprima-titolo">{t.anteprima.titolo}</h1>
        <p className="anteprima-sotto">{t.anteprima.testo}</p>
        <p>
          {t.anteprima.contatto}{' '}
          <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a>
        </p>
        <p className="muted small">
          <Link to="/accedi">{t.anteprima.accedi}</Link>
        </p>
      </div>
    </main>
  )
}
