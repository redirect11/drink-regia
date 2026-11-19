// IL PACCHETTO NEI WORKFLOW (REQ-FLOTTA-140): provisiona-istanza e
// aggiorna-istanza lo chiamano per pubblicare un locale dal pacchetto della
// Release di tana-drink invece di compilarlo. Quattro comandi, uno per job:
//
//   strada      (job `controlla`, senza credenziali) decide la strada
//               (stradaDi): GITHUB_OUTPUT strada, perche.
//   verifica    (job `controlla`, PRIMA del Terraform) scarica il pacchetto e
//               lo controlla tutto, senza eseguirne niente: GITHUB_OUTPUT
//               impronta. Un pacchetto che non va si ferma qui, prima che il
//               progetto del locale nasca o cambi.
//   prepara     (job `pacchetto`, senza credenziali) lo riscarica con
//               l'impronta verificata, lo personalizza con personalizza.mjs
//               in un ambiente vuoto e ricontrolla.
//   riverifica  (job `pubblica`, PRIMA delle credenziali) non si fida di
//               quello che arriva dal job dove ha girato personalizza.mjs: lo
//               confronta col pacchetto della Release, riscrive lui i due
//               .env, e mette in GITHUB_ENV firebase-tools e la versione,
//               letti dal pacchetto e controllati.
//
// Gli input arrivano come variabili d'ambiente, già passati da «Input
// validi» del workflow, e non entrano mai in una riga di shell. Un rifiuto
// esce con 1 e dice il file e il motivo.
import { appendFileSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { versioneDelTag, stradaDi, versioneStrumentoValida } from './lib-pacchetto.js'
import { firebaseDa, configurazioneLocale, chiaviVenueFuori, datiLocaleDa, datiAmmessi, envDaFirebase, envFunctions, problemiDellaConfigurazione } from './lib-lavoro.js'
import { ErrorePacchetto, cèNellaRelease, scaricaDallaRelease, apriPacchetto, personalizzaPacchetto, riverificaApp } from './pacchetto-su-disco.mjs'

const TIPO = 'locali'
const env = process.env
const v = (k) => (env[k] == null ? '' : String(env[k]))
const rifiuta = (msg) => { throw new ErrorePacchetto(msg) }

function scrivi(file, valori) {
  const righe = Object.entries(valori).map(([k, x]) => `${k}=${String(x).replace(/[\r\n]/g, ' ')}`).join('\n') + '\n'
  if (file) appendFileSync(file, righe)
  else process.stdout.write(righe)
}
const uscita = (valori) => scrivi(env.GITHUB_OUTPUT, valori)

function versione() {
  const x = versioneDelTag(v('REF_APP'))
  if (!x) rifiuta(`«${v('REF_APP')}» non è un tag di versione: il pacchetto c'è solo per i tag`)
  return x
}

// Il locale come lo vede la configurazione: i dati del titolare sono solo
// quelli che il pacchetto accetta (datiAmmessi).
function locale(manifesto) {
  const dati = datiLocaleDa(v('DATI_LOCALE'))
  if (dati.problemi.length) rifiuta(dati.problemi.join('; '))
  const { ammessi, scartati } = datiAmmessi(dati.valori, manifesto.campiVenue)
  if (scartati.length) console.log(`::warning::Il pacchetto v${manifesto.versione} non conosce ${scartati.join(', ')}: nell'informativa resteranno da inserire.`)
  const input = { slug: v('SLUG'), nome: v('NOME') || v('SLUG'), profilo: v('PROFILO') || 'completo', ambiente: v('AMBIENTE'), datiLocale: ammessi }
  const fuori = chiaviVenueFuori(input, manifesto.campiVenue)
  if (fuori.length) rifiuta(`il pacchetto v${manifesto.versione} non accetta nel venue: ${fuori.join(', ')}`)
  return input
}

async function apri(cartella, ricordata) {
  const ver = versione()
  const { archivio, impronta } = await scaricaDallaRelease({ tipo: TIPO, versione: ver, cartella: join(v('LAVORO'), 'scarico'), ricordata })
  const p = apriPacchetto({ archivio, cartella, tipo: TIPO, versione: ver, ambiente: v('AMBIENTE'), commit: v('COMMIT_APP') })
  return { ...p, impronta }
}

async function strada() {
  const ver = versioneDelTag(v('REF_APP'))
  const demo = v('DEMO') === 'true'
  const esistente = v('ESISTENTE') === 'true'
  // Si chiede alla Release solo se servirebbe.
  const cè = ver && !demo && !esistente && v('STRADA') !== 'compilazione' ? await cèNellaRelease({ tipo: TIPO, versione: ver }) : false
  const s = stradaDi({ richiesta: v('STRADA') || 'auto', versione: ver, cèPacchetto: cè, demo, esistente })
  if (!s.strada) rifiuta(s.perche)
  console.log(`La strada: ${s.strada} (${s.perche}).`)
  uscita({ strada: s.strada, perche: s.perche })
}

async function verifica() {
  if (!v('LAVORO')) rifiuta('serve LAVORO')
  const p = await apri(join(v('LAVORO'), 'pacchetto'), v('IMPRONTA_RICORDATA'))
  locale(p.manifesto)
  console.log(`Pacchetto v${p.manifesto.versione} controllato prima di toccare il locale: commit ${p.manifesto.commit}, ${Object.keys(p.manifesto.file).length} file, impronta ${p.impronta}${v('IMPRONTA_RICORDATA') ? ' (quella che la regia ricorda)' : ''}.`)
  uscita({ impronta: p.impronta })
}

async function prepara() {
  if (!v('LAVORO') || !v('USCITA')) rifiuta('servono LAVORO e USCITA')
  if (!/^[0-9a-f]{64}$/.test(v('IMPRONTA_RICORDATA'))) rifiuta('manca l\'impronta verificata dal job controlla')
  const p = await apri(v('USCITA'), v('IMPRONTA_RICORDATA'))
  const input = locale(p.manifesto)
  const firebase = firebaseDa(JSON.parse(readFileSync(v('CONFIG_WEB'), 'utf8')))
  personalizzaPacchetto({ cartella: p.cartella, manifesto: p.manifesto, configurazione: configurazioneLocale({ ...input, firebase }), tmp: join(v('LAVORO'), 'personalizza') })
  console.log('Personalizzato per il locale e ricontrollato.')
}

async function riverifica() {
  for (const k of ['LAVORO', 'ARCHIVIO_APP', 'CONFIG_WEB', 'PROGETTO', 'GITHUB_WORKSPACE']) if (!v(k)) rifiuta(`serve ${k}`)
  if (!/^[0-9a-f]{64}$/.test(v('IMPRONTA_RICORDATA'))) rifiuta('manca l\'impronta verificata dal job controlla')
  const riferimento = await apri(join(v('LAVORO'), 'riferimento'), v('IMPRONTA_RICORDATA'))
  const m = riferimento.manifesto
  const { app, configurazione } = riverificaApp({ archivioApp: v('ARCHIVIO_APP'), cartella: join(v('LAVORO'), 'ricevuta'), riferimento, progetto: v('PROGETTO') })
  // La configurazione scritta nel sito è quella di questo locale: la regia la
  // ricalcola da quello che sa, e i campi che contano devono tornare.
  const input = locale(m)
  const firebase = firebaseDa(JSON.parse(readFileSync(v('CONFIG_WEB'), 'utf8')))
  const diversi = problemiDellaConfigurazione(configurazione, configurazioneLocale({ ...input, firebase }))
  if (diversi.length) rifiuta(`dist/configurazione.json non è quella di questo locale: ${diversi.join(', ')}`)
  if (!versioneStrumentoValida(m.strumenti['firebase-tools'])) rifiuta('firebase-tools del pacchetto non è una versione')
  // I due .env li scrive la regia, da quello che sa: quelli arrivati non contano.
  writeFileSync(join(app, '.env'), envDaFirebase(firebase))
  writeFileSync(join(app, `functions/.env.${v('PROGETTO')}`), envFunctions(input))
  const dest = join(v('GITHUB_WORKSPACE'), 'app')
  if (existsSync(dest)) rifiuta(`${dest} c'è già`)
  renameSync(app, dest)
  scrivi(env.GITHUB_ENV, { FIREBASE_TOOLS: `firebase-tools@${m.strumenti['firebase-tools']}`, VERSIONE: `v${m.versione}` })
  console.log(`App ricontrollata col pacchetto v${m.versione}: si pubblica con firebase-tools ${m.strumenti['firebase-tools']}.`)
}

const comandi = { strada, verifica, prepara, riverifica }
const quale = process.argv[2]
try {
  if (!comandi[quale]) rifiuta(`comando «${quale}» sconosciuto (${Object.keys(comandi).join(', ')})`)
  await comandi[quale]()
} catch (e) {
  console.error(`::error::${e instanceof ErrorePacchetto ? 'Il pacchetto: ' : ''}${String(e.message).split('\n')[0]}`)
  console.error(e.message)
  if (!(e instanceof ErrorePacchetto)) console.error(e.stack)
  process.exitCode = 1
}
