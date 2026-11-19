// IL PACCHETTO SU DISCO (REQ-FLOTTA-140, interfaccia 16): scaricarlo dalla
// Release del tag di tana-drink, aprirlo, controllarlo e personalizzarlo per
// un locale. Lo usano lo script dei workflow (scripts/pacchetto-locale.mjs,
// nel job senza credenziali) e il lavoro della flotta su Google
// (scripts/flotta-lavoro.mjs, in pausa): il controllo è scritto una volta.
// Le regole stanno in lib-pacchetto.js e lib-lavoro.js, qui solo rete,
// disco e processi. Ogni rifiuto è un ErrorePacchetto che dice il file e il
// motivo, da riferire a tana-drink così com'è.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, dirname, sep } from 'node:path'
import { problemiDelManifesto, problemiDeiFile, versioneAmmessa, nomeArchivio, nomeImpronta, indirizzoNellaRelease, improntaDalFile, problemiDellArchivio, comandiInFirebaseJson } from './lib-pacchetto.js'
import { problemiDellElenco, importNonAmmessi } from './lib-lavoro.js'

export class ErrorePacchetto extends Error {}
const rifiuta = (msg) => { throw new ErrorePacchetto(msg) }

export const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

export function fileDi(cartella) {
  const fuori = []
  const giro = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) giro(p)
      else fuori.push(relative(cartella, p).split(sep).join('/'))
    }
  }
  giro(cartella)
  return fuori
}

// Un comando con gli argomenti separati, mai una riga di shell.
function comando(cmd, args, { cwd, env = process.env } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  return { ok: r.status === 0, status: r.status, out: r.stdout || '', err: r.stderr || '' }
}

// Un file della Release. GitHub risponde con un rinvio al suo magazzino, e
// fetch lo segue. 404 vuol dire che il file non è allegato (ancora).
async function scarica(indirizzo, destinazione, fetchFn) {
  const r = await fetchFn(indirizzo, { redirect: 'follow' })
  if (r.status === 404) return false
  if (!r.ok) rifiuta(`${indirizzo} ha risposto ${r.status}`)
  writeFileSync(destinazione, Buffer.from(await r.arrayBuffer()))
  return true
}

// Il pacchetto c'è nella Release? Basta l'impronta: è allegata dopo
// l'archivio, quindi se c'è il pacchetto è completo.
export async function cèNellaRelease({ tipo, versione, fetchFn = fetch }) {
  const r = await fetchFn(indirizzoNellaRelease(nomeImpronta(tipo, versione), versione), { method: 'HEAD', redirect: 'follow' })
  return r.ok
}

// Scarica impronta e archivio in `cartella` e li confronta: con l'impronta
// dichiarata e, se la regia ne ricorda una per questa versione, con quella.
export async function scaricaDallaRelease({ tipo, versione, cartella, ricordata = '', fetchFn = fetch }) {
  mkdirSync(cartella, { recursive: true })
  const impronta = join(cartella, nomeImpronta(tipo, versione))
  const archivio = join(cartella, nomeArchivio(tipo, versione))
  if (!(await scarica(indirizzoNellaRelease(nomeImpronta(tipo, versione), versione), impronta, fetchFn))) rifiuta(`il pacchetto ${tipo} della versione ${versione} non c'è (o non è completo) nella Release v${versione} di tana-drink`)
  if (!(await scarica(indirizzoNellaRelease(nomeArchivio(tipo, versione), versione), archivio, fetchFn))) rifiuta(`nella Release v${versione} c'è l'impronta ma non l'archivio ${nomeArchivio(tipo, versione)}`)
  const vera = sha256(archivio)
  const p = problemiDellArchivio({ dichiarata: improntaDalFile(readFileSync(impronta, 'utf8')), vera, ricordata })
  if (p.length) rifiuta(p.join('; '))
  return { archivio, impronta: vera }
}

const controllaFile = (cartella, m, opz) => {
  const p = problemiDeiFile(m, (f) => (existsSync(join(cartella, f)) ? sha256(join(cartella, f)) : null), fileDi(cartella), opz)
  if (p.length) rifiuta(`il pacchetto non torna${opz?.dopo ? ' dopo la personalizzazione' : ''}:\n  ${p.join('\n  ')}`)
}

// personalizza.mjs e i file che importa: solo moduli di Node e file del
// pacchetto (importNonAmmessi), seguiti fino in fondo.
export function controllaPersonalizza(cartella) {
  const visti = new Set()
  const giro = (rel) => {
    if (visti.has(rel)) return
    visti.add(rel)
    const pieno = resolve(cartella, rel)
    if (!pieno.startsWith(resolve(cartella) + sep)) rifiuta(`personalizza.mjs importa un file fuori dal pacchetto: ${rel}`)
    if (!existsSync(pieno)) rifiuta(`personalizza.mjs importa un file che non c'è: ${rel}`)
    const sorgente = readFileSync(pieno, 'utf8')
    const no = importNonAmmessi(sorgente)
    if (no.length) rifiuta(`${rel} importa moduli che non sono di Node né del pacchetto: ${no.join(', ')}`)
    for (const m of sorgente.matchAll(/['"](\.{1,2}\/[^'"]+)['"]/g)) giro(relative(cartella, resolve(dirname(pieno), m[1])).split(sep).join('/'))
  }
  giro('personalizza.mjs')
}

// Apre l'archivio in `cartella` (vuota o da creare) e lo controlla tutto,
// prima di toccare un locale. `commit`, se dato, è lo SHA del tag che il
// workflow ha controllato (per la produzione: è su main): il pacchetto deve
// essere stato compilato da lì.
export function apriPacchetto({ archivio, cartella, tipo, versione, ambiente, commit = '', firebaseTools = '' }) {
  const elenco = comando('tar', ['-tvzf', archivio])
  if (!elenco.ok) rifiuta(`l'archivio non si legge: ${elenco.err.trim()}`)
  const pe = problemiDellElenco(elenco.out.split('\n'))
  if (pe.length) rifiuta(`l'archivio contiene voci non ammesse:\n  ${pe.join('\n  ')}`)
  mkdirSync(cartella, { recursive: true })
  if (readdirSync(cartella).length) rifiuta(`${cartella} non è vuota`)
  const x = comando('tar', ['-xzf', archivio, '-C', cartella, '--no-same-owner', '--no-same-permissions'])
  if (!x.ok) rifiuta(`l'archivio non si apre: ${x.err.trim()}`)
  if (!existsSync(join(cartella, 'pacchetto.json'))) rifiuta('manca pacchetto.json')
  let m
  try { m = JSON.parse(readFileSync(join(cartella, 'pacchetto.json'), 'utf8')) } catch { rifiuta('pacchetto.json non è JSON') }
  const pm = problemiDelManifesto(m, { versioneAttesa: versione, tipoAtteso: tipo })
  if (pm.length) rifiuta(`pacchetto.json non va:\n  ${pm.join('\n  ')}`)
  if (!versioneAmmessa(versione, ambiente === 'test' ? 'test' : 'produzione', m)) rifiuta(`la versione ${versione} non si dà a un locale di ${ambiente}`)
  if (commit && m.commit !== commit) rifiuta(`il pacchetto è del commit ${m.commit}, il tag v${versione} è su ${commit}`)
  if (firebaseTools && m.strumenti['firebase-tools'] !== firebaseTools) rifiuta(`il pacchetto vuole firebase-tools ${m.strumenti['firebase-tools']}, qui c'è la ${firebaseTools}`)
  controllaFile(cartella, m)
  let fj
  try { fj = JSON.parse(readFileSync(join(cartella, 'firebase.json'), 'utf8')) } catch { rifiuta('firebase.json non è JSON') }
  const hook = comandiInFirebaseJson(fj)
  if (hook.length) rifiuta(`firebase.json fa girare comandi al deploy, dove ci sono le credenziali: ${hook.join(', ')}`)
  if (tipo === 'locali') controllaPersonalizza(cartella)
  return { cartella, manifesto: m }
}

// personalizza.mjs è codice di tana-drink: gira con un ambiente vuoto (solo
// PATH e una HOME di comodo), così non vede niente di chi lo lancia. Poi si
// ricontrolla che abbia toccato solo i file che può toccare. Il .env delle
// Functions si scrive DOPO questo controllo (tana-drink, 19/11/2026): non è
// un file del pacchetto.
export function personalizzaPacchetto({ cartella, manifesto, configurazione, tmp }) {
  mkdirSync(tmp, { recursive: true })
  const conf = join(tmp, 'configurazione-locale.json')
  writeFileSync(conf, JSON.stringify(configurazione, null, 2))
  const r = comando(process.execPath, ['personalizza.mjs', '--dist', 'dist', '--configurazione', conf], { cwd: cartella, env: { PATH: process.env.PATH || '', HOME: tmp } })
  process.stdout.write(r.out)
  if (!r.ok) rifiuta(`personalizza.mjs è uscito con ${r.status}:\n${r.err.trim()}`)
  if (!existsSync(join(cartella, 'dist/configurazione.json'))) rifiuta('personalizza.mjs non ha scritto dist/configurazione.json')
  controllaFile(cartella, manifesto, { dopo: true })
}
