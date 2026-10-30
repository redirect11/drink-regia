// @vitest-environment happy-dom
'use strict'

// LE SEZIONI CHE ENTRANO (REQ-FLOTTA-002, DESIGN.md §4 «Movimento»): una
// dissolvenza sola, solo dove il browser sa osservare e solo se chi legge
// non ha chiesto meno movimento. Altrimenti la pagina resta com'è, visibile.

import { describe, it, expect } from 'vitest'
import { osservaComparsa } from '../src/lib/comparsa.js'

// Un IntersectionObserver finto: tiene gli elementi osservati e lascia
// decidere al test quando «entrano».
function finestraFinta({ menoMovimento = false } = {}) {
  const osservatori = []
  class IntersectionObserver {
    constructor(cb) {
      this.cb = cb
      this.osservati = new Set()
      this.spento = false
      osservatori.push(this)
    }
    observe(el) {
      this.osservati.add(el)
    }
    unobserve(el) {
      this.osservati.delete(el)
    }
    disconnect() {
      this.spento = true
      this.osservati.clear()
    }
    entra(el, isIntersecting = true) {
      this.cb([{ target: el, isIntersecting }])
    }
  }
  return {
    IntersectionObserver,
    matchMedia: (q) => ({ matches: menoMovimento && q.includes('reduce') }),
    osservatori,
  }
}

function pagina() {
  const radice = document.createElement('main')
  radice.innerHTML = '<section data-comparsa id="a"></section><section data-comparsa id="b"></section><section id="c"></section>'
  return radice
}

describe('le sezioni che entrano', () => {
  it('osserva le sezioni marcate e le fa comparire una volta sola', () => {
    const f = finestraFinta()
    const radice = pagina()
    const smetti = osservaComparsa(radice, f)
    const [o] = f.osservatori
    expect([...o.osservati].map((e) => e.id)).toEqual(['a', 'b'])
    const [a, b, c] = ['#a', '#b', '#c'].map((q) => radice.querySelector(q))
    // In attesa (nascosti dal CSS) solo quelli osservati; chi non è marcato no.
    expect(a.classList.contains('in-attesa')).toBe(true)
    expect(c.classList.contains('in-attesa')).toBe(false)
    o.entra(a, false)
    expect(a.classList.contains('comparso')).toBe(false)
    o.entra(a)
    expect(a.classList.contains('comparso')).toBe(true)
    expect(a.classList.contains('in-attesa')).toBe(false)
    expect(o.osservati.has(a)).toBe(false)
    smetti()
    expect(o.spento).toBe(true)
    // Smettendo di osservare, chi aspettava ancora torna visibile.
    expect(b.classList.contains('in-attesa')).toBe(false)
  })

  // Il difetto trovato in revisione (PR #20): un elemento montato dopo il
  // primo giro (un modulo rimesso in vendita a pagina aperta) restava a
  // opacità zero, perché nascondeva la classe sulla radice e nessuno lo
  // osservava. Ora si nasconde solo chi è osservato.
  it('un elemento montato dopo è visibile da subito', () => {
    const f = finestraFinta()
    const radice = pagina()
    osservaComparsa(radice, f)
    const nuovo = document.createElement('article')
    nuovo.setAttribute('data-comparsa', '')
    radice.appendChild(nuovo)
    expect(nuovo.classList.contains('in-attesa')).toBe(false)
    expect(radice.classList.length).toBe(0)
  })

  it('con meno movimento richiesto non fa niente', () => {
    const f = finestraFinta({ menoMovimento: true })
    const radice = pagina()
    osservaComparsa(radice, f)()
    expect(f.osservatori).toHaveLength(0)
    expect(radice.querySelector('.in-attesa')).toBeNull()
  })

  it('senza IntersectionObserver, o senza pagina, non fa niente', () => {
    const radice = pagina()
    osservaComparsa(radice, {})()
    expect(radice.querySelector('.in-attesa')).toBeNull()
    expect(osservaComparsa(null, finestraFinta())).toBeTypeOf('function')
  })

  it('un browser senza matchMedia osserva lo stesso', () => {
    const f = finestraFinta()
    delete f.matchMedia
    osservaComparsa(pagina(), f)
    expect(f.osservatori).toHaveLength(1)
  })

  it('di suo usa la finestra del browser', () => {
    const radice = pagina()
    const smetti = osservaComparsa(radice)
    expect(typeof smetti).toBe('function')
    smetti()
  })
})
