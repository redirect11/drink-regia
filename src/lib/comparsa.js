// ── LE SEZIONI CHE ENTRANO (DESIGN.md §4, «Movimento») ────────────────
//
// Le sezioni della prima pagina sotto la prima schermata entrano con una
// dissolvenza breve, una volta sola. È un'aggiunta: il contenuto è
// visibile di suo, e la classe che lo nasconde in attesa (`in-attesa`) la
// mette solo questo codice, solo sugli elementi che sta davvero osservando,
// solo dove c'è IntersectionObserver e solo se chi legge non ha chiesto
// meno movimento (prefers-reduced-motion). Se il codice non gira, la
// pagina si legge lo stesso.
//
// Prima la classe stava sulla radice e nascondeva ogni [data-comparsa] non
// ancora comparso: un elemento montato dopo il primo giro (un modulo
// rimesso in vendita mentre la pagina è aperta) restava invisibile per
// sempre, perché nessuno lo osservava. Ora chi arriva dopo entra e basta.

export function osservaComparsa(radice, finestra = globalThis.window) {
  if (!radice || typeof finestra?.IntersectionObserver !== 'function') return () => {}
  if (finestra.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  const osservati = new Set()
  const osservatore = new finestra.IntersectionObserver(
    (voci) => {
      for (const v of voci) {
        if (!v.isIntersecting) continue
        v.target.classList.remove('in-attesa')
        v.target.classList.add('comparso')
        osservatore.unobserve(v.target)
        osservati.delete(v.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' }
  )
  radice.querySelectorAll('[data-comparsa]').forEach((el) => {
    el.classList.add('in-attesa')
    osservati.add(el)
    osservatore.observe(el)
  })
  return () => {
    osservatore.disconnect()
    // Chi non è ancora comparso torna visibile: smettere di osservare non
    // deve lasciare niente nascosto.
    osservati.forEach((el) => el.classList.remove('in-attesa'))
    osservati.clear()
  }
}
