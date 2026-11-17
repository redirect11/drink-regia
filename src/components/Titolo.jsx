import { useEffect } from 'react'

// IL <title> DELLA PAGINA CHE SI VEDE (REQ-FLOTTA-125, punto A; WCAG 2.4.2).
// Lo mette la pagina, non App: sotto lo stesso indirizzo si vedono pagine
// diverse (/dashboard è la panoramica, la registrazione da completare o
// l'anteprima del sito chiuso), e solo chi si disegna sa cosa mostra. Un
// effetto di App, che gira dopo quelli delle pagine, copriva il titolo
// dell'anteprima (revisione del 17/11/2026). Prima pagina e anteprima
// usano applicaLingua (src/lib/lingua.js), che mette anche la lingua.
export default function Titolo({ testo }) {
  useEffect(() => {
    if (testo) document.title = testo
  }, [testo])
  return null
}
