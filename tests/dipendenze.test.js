// LE DIPENDENZE DI SVILUPPO SENZA FALLE NOTE (REQ-DEV-008, audit del
// 09/11/2026, finding 24). Dependabot ha aperto le correzioni di sicurezza
// (#106, #107, #108, #114) e non riusciva a unirle: vitest 4 e 5 vogliono
// vite 6 o successivi, il sito stava su vite 5. La migrazione si fa qui,
// in un colpo solo, e questo test tiene ferme le soglie: sotto, le falle
// tornano (vitest < 4.1.12, vite < 6.4.4, happy-dom < 21.0.4, react-router
// < 7.18.0 per l'open redirect in Link e useNavigate).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const installata = (nome) => lock.packages[`node_modules/${nome}`]?.version
const numeri = (v) => String(v).replace(/^[\^~]/, '').split('.').map(Number)
const almeno = (v, min) => {
  const [a, b, c] = numeri(v)
  const [x, y, z] = numeri(min)
  return a !== x ? a > x : b !== y ? b > y : c >= z
}

describe('le dipendenze di sviluppo', () => {
  it.each([
    ['vite', '6.4.4', 'devDependencies'],
    ['vitest', '4.1.12', 'devDependencies'],
    ['@vitest/coverage-v8', '4.1.12', 'devDependencies'],
    ['happy-dom', '21.0.4', 'devDependencies'],
    ['react-router-dom', '7.18.0', 'dependencies'],
  ])('%s è almeno %s, dichiarata e installata', (nome, minima, gruppo) => {
    expect(almeno(pkg[gruppo][nome], minima), `${nome} in package.json: ${pkg[gruppo][nome]}`).toBe(true)
    expect(almeno(installata(nome), minima), `${nome} nel lockfile: ${installata(nome)}`).toBe(true)
  })

  it('coverage-v8 e vitest hanno la stessa versione: coverage-v8 la pretende', () => {
    expect(numeri(installata('@vitest/coverage-v8')).slice(0, 2)).toEqual(numeri(installata('vitest')).slice(0, 2))
  })

  // happy-dom 21 non definisce più i dialoghi del browser: li mette
  // tests/finestra.js, caricato prima di ogni file di test.
  it('la finestra finta ha alert, confirm e prompt (tests/finestra.js nei setupFiles)', () => {
    const config = readFileSync('vitest.config.mjs', 'utf8')
    expect(config).toMatch(/setupFiles:\s*\['tests\/finestra\.js'\]/)
    const finestra = readFileSync('tests/finestra.js', 'utf8')
    for (const nome of ['alert', 'confirm', 'prompt']) expect(finestra).toContain(`${nome}:`)
  })
})
