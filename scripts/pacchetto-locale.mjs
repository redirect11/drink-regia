// IL PACCHETTO NEI WORKFLOW (REQ-FLOTTA-140): provisiona-istanza e
// aggiorna-istanza lo chiamano per pubblicare un locale dal pacchetto della
// Release di tana-drink invece di compilarlo. Due comandi:
//
//   node scripts/pacchetto-locale.mjs strada
//     nel job `controlla`: decide la strada (lib-pacchetto.js, stradaDi) e la
//     scrive in GITHUB_OUTPUT (strada, perche).
//   node scripts/pacchetto-locale.mjs prepara
//     nel job senza credenziali, dove prima si compilava: scarica il
//     pacchetto, lo controlla tutto, lo personalizza per il locale e scrive i
//     due .env che il job `pubblica` usa. In GITHUB_OUTPUT: impronta,
//     versione, firebase_tools.
//
// Gli input arrivano come variabili d'ambiente, già passati da «Input
// validi» del workflow, e non entrano mai in una riga di shell: SLUG, NOME,
// PROFILO, AMBIENTE, PROGETTO, REF_APP, COMMIT_APP, STRADA, DEMO, ESISTENTE,
// DATI_LOCALE, IMPRONTA_RICORDATA, CONFIG_WEB (il file della configurazione
// web), USCITA (la cartella del sito pronto), LAVORO (una cartella di
// appoggio). Un rifiuto esce con 1 e dice il file e il motivo.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { versioneDelTag, stradaDi } from './lib-pacchetto.js'
import { firebaseDa, configurazioneLocale, chiaviVenueFuori, datiLocaleDa, envDaFirebase, envFunctions } from './lib-lavoro.js'
import { ErrorePacchetto, cèNellaRelease, scaricaDallaRelease, apriPacchetto, personalizzaPacchetto } from './pacchetto-su-disco.mjs'

const TIPO = 'locali'
const env = process.env
const v = (k) => (env[k] == null ? '' : String(env[k]))

function uscita(valori) {
  const righe = Object.entries(valori).map(([k, x]) => `${k}=${String(x).replace(/[\r\n]/g, ' ')}`).join('\n') + '\n'
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, righe)
  else process.stdout.write(righe)
}

async function strada() {
  const versione = versioneDelTag(v('REF_APP'))
  const demo = v('DEMO') === 'true'
  const esistente = v('ESISTENTE') === 'true'
  // Si chiede alla Release solo se servirebbe: la demo e i locali esistenti
  // non la usano comunque.
  const cè = versione && !demo && !esistente && v('STRADA') !== 'compilazione' ? await cèNellaRelease({ tipo: TIPO, versione }) : false
  const s = stradaDi({ richiesta: v('STRADA') || 'auto', versione, cèPacchetto: cè, demo, esistente })
  if (!s.strada) throw new ErrorePacchetto(s.perche)
  console.log(`La strada: ${s.strada} (${s.perche}).`)
  uscita({ strada: s.strada, perche: s.perche })
}

async function prepara() {
  const versione = versioneDelTag(v('REF_APP'))
  if (!versione) throw new ErrorePacchetto(`«${v('REF_APP')}» non è un tag di versione: il pacchetto c'è solo per i tag`)
  const dati = datiLocaleDa(v('DATI_LOCALE'))
  if (dati.problemi.length) throw new ErrorePacchetto(dati.problemi.join('; '))
  const input = { slug: v('SLUG'), nome: v('NOME') || v('SLUG'), profilo: v('PROFILO') || 'completo', ambiente: v('AMBIENTE'), datiLocale: dati.valori }
  const lavoro = v('LAVORO')
  const cartella = v('USCITA')
  if (!lavoro || !cartella) throw new ErrorePacchetto('servono LAVORO e USCITA')

  console.log(`Scarico il pacchetto ${TIPO} v${versione} dalla Release di tana-drink.`)
  const { archivio, impronta } = await scaricaDallaRelease({ tipo: TIPO, versione, cartella: join(lavoro, 'scarico'), ricordata: v('IMPRONTA_RICORDATA') })
  console.log(`Impronta dell'archivio: ${impronta}${v('IMPRONTA_RICORDATA') ? ' (uguale a quella che la regia ricorda)' : ''}.`)
  const { manifesto } = apriPacchetto({ archivio, cartella, tipo: TIPO, versione, ambiente: input.ambiente, commit: v('COMMIT_APP') })
  console.log(`Pacchetto controllato: commit ${manifesto.commit}, ${Object.keys(manifesto.file).length} file, firebase-tools ${manifesto.strumenti['firebase-tools']}.`)
  const fuori = chiaviVenueFuori(input, manifesto.campiVenue)
  if (fuori.length) throw new ErrorePacchetto(`il pacchetto v${versione} non accetta nel venue: ${fuori.join(', ')}`)

  const firebase = firebaseDa(JSON.parse(readFileSync(v('CONFIG_WEB'), 'utf8')))
  personalizzaPacchetto({ cartella, manifesto, configurazione: configurazioneLocale({ ...input, firebase }), tmp: join(lavoro, 'personalizza') })
  console.log('Personalizzato per il locale e ricontrollato.')

  // Dopo il controllo «dopo»: non sono file del pacchetto. Il .env della
  // radice lo legge il passo del titolare (la chiave API), come quello che
  // scriveva la build; quello delle Functions lo legge il deploy.
  writeFileSync(join(cartella, '.env'), envDaFirebase(firebase))
  writeFileSync(join(cartella, `functions/.env.${v('PROGETTO')}`), envFunctions(input))
  uscita({ impronta, versione: manifesto.versione, firebase_tools: manifesto.strumenti['firebase-tools'] })
}

const comandi = { strada, prepara }
const quale = process.argv[2]
try {
  if (!comandi[quale]) throw new ErrorePacchetto(`comando «${quale}» sconosciuto (strada, prepara)`)
  await comandi[quale]()
} catch (e) {
  console.error(`::error::${e instanceof ErrorePacchetto ? 'Il pacchetto: ' : ''}${String(e.message).split('\n')[0]}`)
  console.error(e.message)
  if (!(e instanceof ErrorePacchetto)) console.error(e.stack)
  process.exitCode = 1
}
