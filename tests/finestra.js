// LA FINESTRA DEI TEST (setupFiles di vitest.config.mjs).
//
// happy-dom 21 (09/11/2026, aggiornamento di sicurezza) non definisce più
// window.alert, window.confirm e window.prompt: sono dialoghi del browser,
// e un DOM finto non ha niente da mostrare. Le pagine del backoffice li
// usano (Backoffice.jsx, CatalogoTemi.jsx, Rilasci.jsx) e i test li
// spiano con vi.spyOn(window, 'confirm'), che vuole una funzione da
// sostituire. Qui ci sono, con la risposta di chi chiude il dialogo senza
// confermare: così un test che si dimentica di spiarli non conferma
// niente per sbaglio. Nei file con ambiente node `window` non c'è, e non
// si fa nulla.
if (typeof window !== 'undefined') {
  const vuoti = { alert: () => undefined, confirm: () => false, prompt: () => null }
  for (const [nome, fn] of Object.entries(vuoti)) {
    if (typeof window[nome] !== 'function') window[nome] = fn
  }
}
