// IL LAVORO DELLA FLOTTA SU GOOGLE (REQ-FLOTTA-138, docs/flotta-nella-regia.md).
// Gira in un Cloud Run Job del progetto della regia, come l'account della
// flotta di quella regia, senza chiave e senza GitHub. Fa quello che fanno i
// workflow provisiona, aggiorna ed elimina, negli stessi passi e con gli
// stessi script, ma l'app la prende dal pacchetto già compilato da
// tana-drink (REQ-FLOTTA-137): lo scarica, lo controlla, lo personalizza per
// il locale e lo pubblica.
//
//   COMANDO=attiva|aggiorna|elimina SLUG=… AMBIENTE=produzione|test
//   [VERSIONE=X.Y.Z] [NOME=…] [PIANO=…] [MODULI=…] [PROFILO=completo|leggero]
//   [UID_TITOLARE=…] [EMAIL_TITOLARE=…] [RUN_ID=…]  node scripts/flotta-lavoro.mjs
//
// Le impostazioni della regia (bucket, indirizzi, il segreto della callback)
// sono fissate sul lavoro: scripts/lib-lavoro.js, IMPOSTAZIONI.
//
// L'esito va sempre alla regia, anche quando qualcosa fallisce, con la
// stessa callback dei workflow. Il lavoro non ritenta da sé: i tentativi
// sono dentro i passi, come oggi.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMANDI, inputDelLavoro, impostazioniMancanti, nomeBlocco, bloccoMorto, firebaseDa, configurazioneLocale, envDaFirebase, envFunctions,
  soloDelDeploy, problemiDellElenco, importNonAmmessi, corpoEsito, mandaEsito, passi,
} from './lib-lavoro.js'
import { problemiDelManifesto, problemiDeiFile, versioneAmmessa, nomeArchivio, nomeImpronta } from './lib-pacchetto.js'

const REGIA = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = process.env
// IL SEGRETO DELLA CALLBACK FUORI DALL'AMBIENTE, subito: i comandi che il
// lavoro lancia lo erediterebbero, e il deploy carica il codice delle
// Functions di tana-drink con le sue dipendenze. Nei workflow il segreto
// stava solo nel passo dell'esito; qui resta solo in questa variabile.
const SEGRETO_CALLBACK = env.PROVISIONING_CALLBACK_SECRET
delete env.PROVISIONING_CALLBACK_SECRET
const TMP = mkdtempSync(join(tmpdir(), 'flotta-'))
// I segreti dell'app che le Functions di tana-drink dichiarano: come nei
// workflow (docs/handover.md §7).
const SEGRETI_APP = 'SUMUP_API_KEY'
const TIPO = 'locali'

class Fermo extends Error {}
const ferma = (msg) => { throw new Fermo(msg) }
const passo = (nome) => console.log(`\n── ${nome} ──`)
const attendi = (s) => new Promise((ok) => setTimeout(ok, s * 1000))

// Un comando, con gli argomenti separati: mai una riga di shell con dentro
// un input. `cattura` restituisce l'uscita invece di mostrarla.
function esegui(cmd, args, { cwd = REGIA, cattura = false, envExtra = {}, envSolo = null, ammesso = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env: envSolo || { ...env, ...envExtra },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: cattura ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (r.error) throw r.error
  if (r.status !== 0 && !ammesso) {
    if (cattura && r.stderr) process.stderr.write(r.stderr)
    ferma(`${cmd} ${args[0] || ''} è uscito con ${r.status}`)
  }
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '' }
}
// Come esegui, ma mostra l'uscita e la tiene anche per leggerla dopo.
function eseguiRegistrando(cmd, args, opz = {}) {
  const r = esegui(cmd, args, { ...opz, cattura: true, ammesso: true })
  process.stdout.write(r.out)
  process.stderr.write(r.err)
  return { ...r, testo: r.out + r.err }
}

const gcloud = (args, opz) => esegui('gcloud', [...args, '--quiet'], opz)
const terraform = (args, opz = {}) => esegui('terraform', args, { cwd: join(REGIA, 'infra/istanza'), ...opz })
const firebase = (args, opz) => esegui('firebase', args, opz)
const nodeRegia = (script, args, opz) => esegui('node', [join('scripts', script), ...args], opz)

// L'account con cui gira il lavoro: lo dice il server dei metadati di
// Google (FLOTTA_SA lo sovrascrive per le prove fuori da Cloud Run).
async function accountDelLavoro() {
  if (env.FLOTTA_SA) return env.FLOTTA_SA
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', { headers: { 'Metadata-Flavor': 'Google' } })
  if (!r.ok) ferma(`il server dei metadati non dice l'account del lavoro (${r.status})`)
  return (await r.text()).trim()
}

// ── IL BLOCCO ─────────────────────────────────────────────────────────
// Un oggetto nel bucket dello stato, creato solo se non c'è. Se c'è, un'altra
// esecuzione lavora sullo stesso locale: si aspetta, come la coda dei
// workflow (concurrency), al più 20 minuti; un blocco più vecchio del
// tempo massimo è di un'esecuzione morta e si toglie.
async function prendiBlocco(input) {
  const oggetto = `gs://${env.TFSTATE_BUCKET}/${nomeBlocco(input.slug)}`
  const file = join(TMP, 'blocco.json')
  writeFileSync(file, JSON.stringify({ run_id: input.runId, comando: input.comando, creato_il: new Date().toISOString() }))
  for (let giro = 0; giro < 40; giro++) {
    if (gcloud(['storage', 'cp', file, oggetto, '--if-generation-match=0'], { cattura: true, ammesso: true }).ok) {
      const d = JSON.parse(gcloud(['storage', 'objects', 'describe', oggetto, '--format=json'], { cattura: true }).out)
      console.log(`Blocco preso: ${oggetto}`)
      return { oggetto, generazione: d.generation }
    }
    const d = gcloud(['storage', 'objects', 'describe', oggetto, '--format=json'], { cattura: true, ammesso: true })
    if (d.ok) {
      const o = JSON.parse(d.out)
      if (bloccoMorto(o.creation_time || o.timeCreated)) {
        console.log(`Il blocco di ${input.slug} è di un'esecuzione morta (${o.creation_time || o.timeCreated}): lo tolgo.`)
        gcloud(['storage', 'rm', oggetto, `--if-generation-match=${o.generation}`], { ammesso: true })
        continue
      }
    }
    console.log(`Un'altra esecuzione lavora su drinkpos-${input.slug}: aspetto 30 secondi.`)
    await attendi(30)
  }
  ferma(`un'altra esecuzione lavora su drinkpos-${input.slug} da più di 20 minuti`)
}
function lasciaBlocco(blocco) {
  if (!blocco) return
  // Solo il nostro: se nel frattempo qualcuno l'ha tolto come morto e ne ha
  // preso un altro, la precondizione lo lascia stare.
  gcloud(['storage', 'rm', blocco.oggetto, `--if-generation-match=${blocco.generazione}`], { ammesso: true })
}

// ── IL PROGETTO È DI QUESTA REGIA? ─────────────────────────────────────
// Come nei workflow (REQ-FLOTTA-048, REQ-FLOTTA-100): l'etichetta `ambiente`
// del progetto. All'attivazione un progetto che non c'è va bene: lo crea il
// Terraform. All'eliminazione serve anche lo stato Terraform.
function progettoDellaRegia(input) {
  const r = gcloud(['projects', 'describe', input.progetto, '--format=value(labels.ambiente)'], { cattura: true, ammesso: true })
  if (!r.ok) {
    if (input.comando === 'attiva') return console.log(`${input.progetto} non esiste ancora: lo crea il Terraform, con l'etichetta ambiente «${input.ambiente}».`)
    ferma(`${input.progetto} non si legge: non lo tocco`)
  }
  const etichetta = r.out.trim()
  if (etichetta !== input.ambiente) ferma(`${input.progetto} ha l'etichetta ambiente «${etichetta || 'nessuna'}», non «${input.ambiente}»: non è un locale di questa regia, non lo tocco`)
  if (input.comando === 'elimina') {
    const s = gcloud(['storage', 'ls', `gs://${env.TFSTATE_BUCKET}/istanze/${input.slug}/`], { cattura: true, ammesso: true })
    if (!s.ok || !s.out.trim()) ferma(`nessuno stato Terraform per ${input.slug}: il progetto non l'ha creato la regia, non lo tocco`)
  }
  console.log(`${input.progetto} è un locale di questa regia (${input.ambiente}).`)
}

// ── IL PACCHETTO ──────────────────────────────────────────────────────
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
function fileDi(cartella) {
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
const controllaFile = (cartella, m, opz) => {
  const p = problemiDeiFile(m, (f) => (existsSync(join(cartella, f)) ? sha256(join(cartella, f)) : null), fileDi(cartella), opz)
  if (p.length) ferma(`il pacchetto non torna${opz?.dopo ? ' dopo la personalizzazione' : ''}:\n  ${p.join('\n  ')}`)
}

// personalizza.mjs e i file che importa: solo moduli di Node e file del
// pacchetto (importNonAmmessi), seguiti fino in fondo.
function controllaPersonalizza(cartella) {
  const visti = new Set()
  const giro = (rel) => {
    if (visti.has(rel)) return
    visti.add(rel)
    const pieno = resolve(cartella, rel)
    if (!pieno.startsWith(resolve(cartella) + sep)) ferma(`personalizza.mjs importa un file fuori dal pacchetto: ${rel}`)
    if (!existsSync(pieno)) ferma(`personalizza.mjs importa un file che non c'è: ${rel}`)
    const sorgente = readFileSync(pieno, 'utf8')
    const no = importNonAmmessi(sorgente)
    if (no.length) ferma(`${rel} importa moduli che non sono di Node né del pacchetto: ${no.join(', ')}`)
    for (const m of sorgente.matchAll(/['"](\.{1,2}\/[^'"]+)['"]/g)) giro(relative(cartella, resolve(dirname(pieno), m[1])).split(sep).join('/'))
  }
  giro('personalizza.mjs')
}

function scaricaPacchetto(input) {
  const scarico = join(TMP, 'scarico')
  mkdirSync(scarico)
  const archivio = join(scarico, 'pacchetto.tgz')
  const impronta = join(scarico, 'pacchetto.tgz.sha256')
  // Prima l'impronta: se non c'è, il caricamento non è finito (tana-drink la
  // carica dopo l'archivio).
  const base = `gs://${env.RILASCI_BUCKET}/`
  if (!gcloud(['storage', 'cp', base + nomeImpronta(TIPO, input.versione), impronta], { cattura: true, ammesso: true }).ok) ferma(`il pacchetto della versione ${input.versione} non c'è (o non è completo) in ${base}`)
  gcloud(['storage', 'cp', base + nomeArchivio(TIPO, input.versione), archivio], { cattura: true })
  const attesa = (readFileSync(impronta, 'utf8').match(/[0-9a-f]{64}/) || [])[0]
  if (!attesa || attesa !== sha256(archivio)) ferma(`l'archivio della versione ${input.versione} non ha l'impronta dichiarata`)
  const elenco = esegui('tar', ['-tvzf', archivio], { cattura: true }).out.split('\n')
  const p = problemiDellElenco(elenco)
  if (p.length) ferma(`l'archivio contiene voci non ammesse:\n  ${p.join('\n  ')}`)
  const cartella = join(TMP, 'pacchetto')
  mkdirSync(cartella)
  esegui('tar', ['-xzf', archivio, '-C', cartella, '--no-same-owner', '--no-same-permissions'])
  const m = JSON.parse(readFileSync(join(cartella, 'pacchetto.json'), 'utf8'))
  const pm = problemiDelManifesto(m, { versioneAttesa: input.versione, tipoAtteso: TIPO })
  if (pm.length) ferma(`pacchetto.json non va:\n  ${pm.join('\n  ')}`)
  if (!versioneAmmessa(input.versione, input.ambiente === 'test' ? 'test' : 'produzione', m)) ferma(`la versione ${input.versione} non si dà a un locale di ${input.ambiente}`)
  // La stessa firebase-tools del pacchetto e dell'immagine (interfaccia 16).
  if (env.FIREBASE_TOOLS_VERSIONE && m.strumenti['firebase-tools'] !== env.FIREBASE_TOOLS_VERSIONE) ferma(`il pacchetto vuole firebase-tools ${m.strumenti['firebase-tools']}, il lavoro ha la ${env.FIREBASE_TOOLS_VERSIONE}`)
  controllaFile(cartella, m)
  controllaPersonalizza(cartella)
  console.log(`Pacchetto ${input.versione} controllato: commit ${m.commit}, ${Object.keys(m.file).length} file.`)
  return { cartella, manifesto: m }
}

// ── IL TERRAFORM ──────────────────────────────────────────────────────
function variabiliTerraform(input, profilo, account) {
  return {
    TF_VAR_slug: input.slug,
    TF_VAR_ambiente: input.ambiente,
    TF_VAR_billing_account: env.BILLING_ACCOUNT_ID,
    TF_VAR_org_id: env.ORG_ID || '',
    TF_VAR_regia_sa_email: env.REGIA_SA_EMAIL,
    TF_VAR_provisioning_sa_email: account,
    TF_VAR_profilo: profilo,
  }
}
const terraformInit = (input) => terraform(['init', '-input=false', '-reconfigure', `-backend-config=bucket=${env.TFSTATE_BUCKET}`, `-backend-config=prefix=istanze/${input.slug}`])
const nelloStato = (risorsa, envExtra) => terraform(['state', 'show', risorsa], { cattura: true, ammesso: true, envExtra }).ok
const importa = (risorsa, id, envExtra) => terraform(['import', '-input=false', risorsa, id], { cattura: true, ammesso: true, envExtra }).ok

async function terraformAttiva(input, account) {
  const v = variabiliTerraform(input, input.profilo, account)
  terraformInit(input)
  // Senza Organizzazione il progetto l'ha creato una persona: si importa
  // (provisiona-istanza.yml, «Importa il progetto se esiste già»).
  if (!nelloStato('google_project.istanza', v)) {
    if (!env.ORG_ID) {
      if (!importa('google_project.istanza', input.progetto, v)) ferma(`senza ORG_ID il progetto ${input.progetto} va creato prima a mano (infra/README.md)`)
    }
  }
  if (nelloStato('google_project.istanza', v)) {
    if (!nelloStato('google_firestore_database.db', v) && importa('google_firestore_database.db', `projects/${input.progetto}/databases/(default)`, v)) console.log('Firestore c\'era già: importato nello stato.')
    if (input.profilo === 'completo' && !nelloStato('google_artifact_registry_repository.gcf_artifacts[0]', v)
      && importa('google_artifact_registry_repository.gcf_artifacts[0]', `projects/${input.progetto}/locations/europe-west1/repositories/gcf-artifacts`, v)) console.log('gcf-artifacts c\'era già: importato nello stato.')
  }
  // Un account di Google che non c'è ancora (REQ-FLOTTA-132): si riprova una
  // volta, dopo un minuto, solo per quell'errore.
  const r = eseguiRegistrando('terraform', ['apply', '-input=false', '-auto-approve'], { cwd: join(REGIA, 'infra/istanza'), envExtra: v })
  if (r.ok) return
  if (!/Unknown service account|service account .* does not exist/i.test(r.testo)) ferma('terraform apply non riuscito')
  console.log('Un account di Google non c\'è ancora: riprovo il Terraform fra 60 secondi.')
  await attendi(60)
  terraform(['apply', '-input=false', '-auto-approve'], { envExtra: v })
}

// Da leggero a completo (REQ-FLOTTA-015), come aggiorna-istanza.yml: solo un
// progetto della regia, solo se non è già completo.
function terraformCompleto(input, account) {
  const v = variabiliTerraform(input, 'completo', account)
  terraformInit(input)
  if (!nelloStato('google_project.istanza', v)) return console.log(`Nessuno stato Terraform per ${input.slug}: il progetto non l'ha creato la regia, non si tocca.`)
  if (terraform(['state', 'list'], { cattura: true, envExtra: v }).out.includes('google_project_service.api["cloudfunctions.googleapis.com"]')) return console.log('Il progetto è già completo.')
  if (!nelloStato('google_artifact_registry_repository.gcf_artifacts[0]', v)
    && importa('google_artifact_registry_repository.gcf_artifacts[0]', `projects/${input.progetto}/locations/europe-west1/repositories/gcf-artifacts`, v)) console.log('gcf-artifacts c\'era già: importato nello stato.')
  terraform(['apply', '-input=false', '-auto-approve'], { envExtra: v })
}

// ── LA CONFIGURAZIONE WEB ─────────────────────────────────────────────
function configurazioneWeb(input) {
  if (input.comando === 'attiva') {
    const c = JSON.parse(terraform(['output', '-json', 'config_web'], { cattura: true }).out)
    const url = terraform(['output', '-raw', 'url'], { cattura: true }).out.trim()
    return { firebase: firebaseDa(c), url }
  }
  // La web app del sito, non «una» web app (aggiorna-istanza.yml).
  const s = firebase(['hosting:sites:get', input.progetto, '--project', input.progetto, '--json'], { cattura: true, ammesso: true })
  let appId = ''
  try { appId = JSON.parse(s.out).result?.appId || '' } catch { /* senza id */ }
  const c = firebase(['apps:sdkconfig', 'web', ...(appId ? [appId] : []), '--project', input.progetto, '--json'], { cattura: true })
  return { firebase: firebaseDa(JSON.parse(c.out)), url: `https://${input.progetto}.web.app` }
}

// ── LA PERSONALIZZAZIONE ──────────────────────────────────────────────
// Il codice di tana-drink gira con un ambiente vuoto: niente variabili del
// lavoro (il segreto della callback sta lì). Il server dei metadati resta
// raggiungibile, ed è il motivo del controllo sugli import.
function personalizza(input, pacchetto, firebaseWeb) {
  const conf = join(TMP, 'configurazione.json')
  writeFileSync(conf, JSON.stringify(configurazioneLocale({ ...input, firebase: firebaseWeb }), null, 2))
  esegui('node', ['personalizza.mjs', '--dist', 'dist', '--configurazione', conf], { cwd: pacchetto.cartella, envSolo: { PATH: env.PATH, HOME: TMP } })
  if (!existsSync(join(pacchetto.cartella, 'dist/configurazione.json'))) ferma('personalizza.mjs non ha scritto dist/configurazione.json')
  controllaFile(pacchetto.cartella, pacchetto.manifesto, { dopo: true })
}

// ── IL DEPLOY ─────────────────────────────────────────────────────────
// I tentativi dei workflow: all'attivazione le Functions rimaste a metà si
// cancellano e si riprova subito (REQ-FLOTTA-130), gli altri errori si
// riprovano due volte a 90 secondi. All'aggiornamento solo i tre tentativi.
async function deploy(input, cartella) {
  const solo = soloDelDeploy(input.profilo)
  let tentativo = 1
  let cancellate = 0
  for (;;) {
    const r = eseguiRegistrando('firebase', ['deploy', '--only', solo, '--project', input.progetto, '--force'], { cwd: cartella })
    if (r.ok) return
    if (input.comando === 'attiva' && cancellate < 40) {
      const log = join(TMP, 'deploy.log')
      writeFileSync(log, r.testo)
      const aMeta = nodeRegia('funzioni-fallite.mjs', ['--cambio-di-tipo', log], { cattura: true }).out.trim()
      if (aMeta) {
        for (const riga of aMeta.split('\n')) {
          const [nome, regione] = riga.trim().split(/\s+/)
          console.log(`La Function ${nome} (${regione}) è rimasta a metà: la cancello prima di riprovare.`)
          firebase(['functions:delete', nome, '--region', regione, '--project', input.progetto, '--force'], { cwd: cartella, ammesso: true })
          cancellate++
        }
        continue
      }
    }
    if (tentativo >= 3) ferma('deploy non riuscito dopo tre tentativi')
    console.log(`Deploy non riuscito al tentativo ${tentativo}: riprovo fra 90 secondi.`)
    await attendi(90)
    tentativo++
  }
}

// ── ATTIVA E AGGIORNA ─────────────────────────────────────────────────
async function pubblica(input, stato) {
  const account = await accountDelLavoro()
  passo('Il pacchetto')
  const pacchetto = scaricaPacchetto(input)
  stato.commit = pacchetto.manifesto.commit
  if (input.comando === 'attiva') {
    passo('Il Terraform')
    await terraformAttiva(input, account)
  } else if (input.profilo === 'completo') {
    passo('Il profilo completo nel progetto')
    terraformCompleto(input, account)
  }
  passo('La configurazione web')
  const web = configurazioneWeb(input)
  stato.url = web.url
  passo('La personalizzazione')
  personalizza(input, pacchetto, web.firebase)
  writeFileSync(join(pacchetto.cartella, `functions/.env.${input.progetto}`), envFunctions(input))
  const envApp = join(TMP, 'app.env')
  writeFileSync(envApp, envDaFirebase(web.firebase))
  if (input.comando === 'attiva') {
    passo('Licenza e nome del locale')
    nodeRegia('licenza-istanza.mjs', ['--project', input.progetto, '--slug', input.slug, '--nome', input.nome, '--piano', input.piano, '--moduli', input.moduli, '--regia', env.REGIA_URL])
  }
  if (input.profilo === 'completo') {
    passo('Lo Storage e i segreti')
    nodeRegia('storage-istanza.mjs', ['--project', input.progetto])
    nodeRegia('segreti-istanza.mjs', ['--project', input.progetto, '--segreti', SEGRETI_APP])
    if (input.comando === 'aggiorna' && !nodeRegia('account-ai-locale.mjs', ['--project', input.progetto], { ammesso: true }).ok) {
      console.log(`Attenzione: l'account ai-locale di ${input.progetto} non si crea, l'AI di questo locale resta spenta.`)
    }
  }
  passo('Il deploy')
  await deploy(input, pacchetto.cartella)
  if (input.email) {
    passo('Il titolare')
    nodeRegia('titolare-istanza.mjs', ['--project', input.progetto, '--uid', input.uid, '--email', input.email, '--env', envApp, '--sito', web.url])
  }
  stato.versione = pacchetto.manifesto.versione
}

// ── ELIMINA ───────────────────────────────────────────────────────────
// Come elimina-istanza.yml: il backup, l'archivio, la verifica, e solo con
// il backup verificato il progetto e il suo stato.
function elimina(input, stato) {
  const percorso = `istanze/${input.slug}/${new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z')}`
  const archivio = join(TMP, 'archivio')
  const zip = join(TMP, 'archivio.zip')
  passo('Il backup leggibile')
  nodeRegia('archivia-istanza.mjs', ['--project', input.progetto, '--slug', input.slug, '--out', archivio])
  esegui('zip', ['-qr', zip, '.'], { cwd: archivio })
  const byte = statSync(zip).size
  passo("L'export nativo del database")
  gcloud(['firestore', 'export', `gs://${input.progetto}.firebasestorage.app/_backup-eliminazione/${percorso}`, '--project', input.progetto, '--database=(default)'])
  passo("Nell'archivio")
  const dest = `gs://${env.ARCHIVIO_BUCKET}/${percorso}`
  gcloud(['storage', 'cp', zip, `${dest}/archivio.zip`])
  gcloud(['storage', 'cp', join(archivio, 'manifesto.json'), `${dest}/manifesto.json`])
  gcloud(['storage', 'cp', '-r', `gs://${input.progetto}.firebasestorage.app/_backup-eliminazione/${percorso}/*`, `${dest}/firestore-nativo/`])
  passo('Il backup è completo?')
  const caricato = Number(gcloud(['storage', 'ls', '-l', `${dest}/archivio.zip`], { cattura: true }).out.trim().split(/\s+/)[0])
  if (caricato !== byte) ferma(`lo zip nell'archivio è di ${caricato} byte, quello fatto di ${byte}: non elimino`)
  gcloud(['storage', 'ls', `${dest}/manifesto.json`], { cattura: true })
  if (!/overall_export_metadata$/m.test(gcloud(['storage', 'ls', '-r', `${dest}/firestore-nativo/`], { cattura: true }).out)) ferma("l'export nativo nell'archivio non è completo: non elimino")
  const conteggi = JSON.parse(readFileSync(join(archivio, 'manifesto.json'), 'utf8')).conteggi ?? null
  console.log(`Backup verificato: ${dest}`)
  passo('Elimina il progetto')
  gcloud(['projects', 'delete', input.progetto])
  stato.archivio = { percorso, zip: `${percorso}/archivio.zip`, byte, conteggi }
  if (!gcloud(['storage', 'rm', '-r', `gs://${env.TFSTATE_BUCKET}/istanze/${input.slug}/`], { ammesso: true }).ok) console.log(`Nessuno stato di Terraform per ${input.slug}.`)
}

// ── IL LAVORO ─────────────────────────────────────────────────────────
async function principale() {
  const { input, problemi } = inputDelLavoro(env)
  const mancanti = impostazioniMancanti({ ...env, PROVISIONING_CALLBACK_SECRET: SEGRETO_CALLBACK })
  console.log(`Lavoro della flotta: ${input.comando} ${input.progetto} (${input.ambiente}), esecuzione ${input.runId}`)
  if (problemi.length || mancanti.length) {
    console.error(`Fermo prima di cominciare:\n  ${[...problemi, ...mancanti.map((k) => `manca l'impostazione ${k}`)].join('\n  ')}`)
    // Con uno slug o un comando che non tornano l'esito non avrebbe a chi
    // andare, o direbbe un'operazione che nessuno ha chiesto.
    const aChi = !problemi.includes('slug non valido') && COMANDI.includes(input.comando)
    if (aChi && !mancanti.includes('REGIA_CALLBACK_URL') && !mancanti.includes('PROVISIONING_CALLBACK_SECRET')) await esito(input, false, {}, `Input del lavoro non validi: ${problemi.join('; ')}`.slice(0, 500))
    return 1
  }
  console.log(`Passi: ${passi(input).join(' → ')}`)
  const stato = {}
  let blocco = null
  let riuscito = false
  let errore = null
  try {
    passo('Il blocco')
    blocco = await prendiBlocco(input)
    passo('Il progetto è di questa regia?')
    progettoDellaRegia(input)
    if (input.comando === 'elimina') elimina(input, stato)
    else await pubblica(input, stato)
    riuscito = true
  } catch (e) {
    console.error(`\nFERMO: ${e.message}`)
    if (!(e instanceof Fermo)) console.error(e.stack)
    errore = `${input.comando === 'elimina' ? 'Eliminazione' : input.comando === 'attiva' ? 'Attivazione' : 'Aggiornamento'} non riuscita (lavoro della flotta, esecuzione ${input.runId}): ${e.message}`.slice(0, 500)
  } finally {
    lasciaBlocco(blocco)
  }
  const arrivato = await esito(input, riuscito, stato, errore)
  rmSync(TMP, { recursive: true, force: true })
  return riuscito && arrivato ? 0 : 1
}

async function esito(input, riuscito, stato, errore) {
  passo('Esito alla regia')
  const corpo = corpoEsito({ input, riuscito, url: stato.url, versione: stato.versione, commit: stato.commit, archivio: stato.archivio, errore })
  try {
    const s = await mandaEsito({ url: env.REGIA_CALLBACK_URL, segreto: SEGRETO_CALLBACK, corpo })
    console.log(`regia: ${s}`)
    return s != null && s < 300
  } catch (e) {
    console.error(`regia: ${e?.message || e}`)
    return false
  }
}

process.exitCode = await principale()
