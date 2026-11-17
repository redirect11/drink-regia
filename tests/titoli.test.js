'use strict'

// UN TITOLO PER OGNI PAGINA E OGNI SEZIONE (REQ-FLOTTA-125, punto A; WCAG
// 2.4.2). L'audit del 17/11/2026 ha trovato lo stesso titolo su /registrati,
// /accedi, /termini, /privacy e sulle sezioni di dashboard e backoffice:
// chi usa un lettore di schermo, o ha più schede aperte, non sapeva dov'era.
// La prima pagina e l'anteprima il titolo se lo mettono da sole, nella loro
// lingua (applicaLingua): qui `null`. Le altre pagine lo mettono con
// <Titolo> (src/components/Titolo.jsx), e lo prova tests/App.test.jsx.

import { describe, it, expect } from 'vitest'
import { titoloPagina, conProdotto } from '../src/lib/titoli.js'
import { NOME_ESTESO } from '../src/lib/prodotto.js'
import { SEZIONI_TITOLARE, indirizzoSezione } from '../src/lib/areaTitolare.js'
import { SEZIONI, BASE, AGGIUNTE } from '../src/lib/backoffice.js'

describe('il titolo della pagina', () => {
  it('le pagine pubbliche hanno ognuna il suo, col nome del prodotto in fondo', () => {
    expect(titoloPagina('/accedi')).toBe(`Accedi · ${NOME_ESTESO}`)
    expect(titoloPagina('/registrati')).toBe(`Registra il tuo locale · ${NOME_ESTESO}`)
    expect(titoloPagina('/termini')).toBe(`Termini di servizio · ${NOME_ESTESO}`)
    expect(titoloPagina('/privacy')).toBe(`Informativa sulla privacy · ${NOME_ESTESO}`)
    expect(titoloPagina('/accesso')).toBe(`Accesso dall’app del locale · ${NOME_ESTESO}`)
  })

  it('la prima pagina, in tutte e due le lingue, se lo mette da sola', () => {
    expect(titoloPagina('/')).toBeNull()
    expect(titoloPagina('/en')).toBeNull()
    expect(titoloPagina('/en/')).toBeNull()
  })

  // Le pagine che non hanno un indirizzo loro (la registrazione da
  // completare sotto /dashboard) compongono il titolo allo stesso modo.
  it('conProdotto mette le parti in ordine, il prodotto in fondo', () => {
    expect(conProdotto('Completa la registrazione')).toBe(`Completa la registrazione · ${NOME_ESTESO}`)
    expect(conProdotto('Dashboard')).toBe(`Dashboard · ${NOME_ESTESO}`)
  })

  it('ogni sezione della dashboard ha il suo, con «Dashboard» come nel menù', () => {
    for (const s of SEZIONI_TITOLARE) {
      expect(titoloPagina(indirizzoSezione(s.id))).toBe(`${s.nome} · Dashboard · ${NOME_ESTESO}`)
    }
    // La barra finale scritta a mano è la stessa pagina.
    expect(titoloPagina('/dashboard/')).toBe(`Panoramica · Dashboard · ${NOME_ESTESO}`)
  })

  it('ogni sezione del backoffice ha il suo; «Aggiungi locale» dice anche quale', () => {
    for (const s of SEZIONI) {
      expect(titoloPagina(`${BASE}/${s.id}`)).toBe(`${s.nome} · Backoffice · ${NOME_ESTESO}`)
    }
    for (const a of AGGIUNTE) {
      expect(titoloPagina(`${BASE}/aggiungi/${a.id}`)).toBe(`${a.nome} · Aggiungi locale · Backoffice · ${NOME_ESTESO}`)
    }
    expect(titoloPagina(BASE)).toBe(`Backoffice · ${NOME_ESTESO}`)
  })

  it('i titoli sono tutti diversi', () => {
    const percorsi = [
      '/accedi',
      '/registrati',
      '/termini',
      '/privacy',
      '/accesso',
      ...SEZIONI_TITOLARE.map((s) => indirizzoSezione(s.id)),
      ...SEZIONI.map((s) => `${BASE}/${s.id}`),
      ...AGGIUNTE.map((a) => `${BASE}/aggiungi/${a.id}`),
    ]
    const titoli = percorsi.map((p) => titoloPagina(p))
    expect(new Set(titoli).size).toBe(percorsi.length)
  })

  it('un indirizzo che non c’è non ha titolo: la pagina rimanda alla prima', () => {
    expect(titoloPagina('/non-esiste')).toBeNull()
  })
})
