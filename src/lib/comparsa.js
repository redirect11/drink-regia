// ── LE SEZIONI CHE ENTRANO (DESIGN.md §4, «Movimento») ────────────────
//
// Le sezioni della prima pagina sotto la prima schermata entrano con una
// dissolvenza breve, una volta sola. È un'aggiunta: il contenuto è
// visibile di suo, e la classe che lo nasconde in attesa la mette solo
// questo codice, solo dove c'è IntersectionObserver e solo se chi legge
// non ha chiesto meno movimento (prefers-reduced-motion). Se il codice non
// gira, la pagina si legge lo stesso.

export function osservaComparsa(radice, finestra = globalThis.window) {
  if (!radice || typeof finestra?.IntersectionObserver !== 'function') return () => {}
  if (finestra.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  const osservatore = new finestra.IntersectionObserver(
    (voci) => {
      for (const v of voci) {
        if (!v.isIntersecting) continue
        v.target.classList.add('comparso')
        osservatore.unobserve(v.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px' }
  )
  radice.classList.add('con-comparsa')
  radice.querySelectorAll('[data-comparsa]').forEach((el) => osservatore.observe(el))
  return () => {
    osservatore.disconnect()
    radice.classList.remove('con-comparsa')
  }
}
