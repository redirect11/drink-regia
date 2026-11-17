// =====================================================================
//  LE FUNCTIONS RIMASTE A METÀ IN UN DEPLOY (REQ-FLOTTA-130).
//
//    node scripts/funzioni-fallite.mjs [--cambio-di-tipo] <file con l'uscita del deploy>
//
//  Con --cambio-di-tipo stampa solo le Functions che firebase-tools ferma
//  col cambio di tipo (le sole rimaste davvero a metà): è quello che usa
//  provisiona-istanza.yml (REQ-FLOTTA-132).
//
//  Stampa una riga «nome regione» per ogni Function che firebase-tools
//  elenca come fallita. La usa provisiona-istanza.yml, nel deploy della
//  nascita di un locale, per cancellarle prima di riprovare: una Function
//  la cui prima creazione è fallita resta registrata, e il tentativo dopo
//  si ferma («Changing from an HTTPS function to a background triggered
//  function is not allowed», drinkpos-prova-storage, 17/11/2026).
//  Non scrive niente e non chiama nessuno: legge un file.
// =====================================================================
import { readFileSync } from 'node:fs'
import { funzioniFallite } from './lib-deploy.js'

const soloCambioDiTipo = process.argv.includes('--cambio-di-tipo')
const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Uso: node scripts/funzioni-fallite.mjs <file con l’uscita del deploy>')
  process.exit(1)
}
let testo = ''
try {
  testo = readFileSync(file, 'utf8')
} catch {
  // Senza file non c'è niente da cancellare: il deploy riprova e basta.
  process.exit(0)
}
for (const { nome, regione } of funzioniFallite(testo, { soloCambioDiTipo })) console.log(`${nome} ${regione}`)
