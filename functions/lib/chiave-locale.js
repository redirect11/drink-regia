'use strict'

// ── LA CHIAVE AI NEL LOCALE (REQ-FLOTTA-076) ───────────────────────────
//
// La «Chiave AI» di un locale (REQ-AI-003) si vede una volta sola nel
// backoffice; la regia ne tiene solo l'impronta. Il locale la usa dal suo
// segreto REGIA_AI_KEY (REQ-FLOTTA-075). Prima andava copiata a mano;
// dal 12/11/2026 la regia la scrive da sé, nel momento in cui la crea
// (Daniele: «si procedi»). Il permesso è il minimo: aggiungere versioni a
// quel segreto e basta (infra/istanza/main.tf, regia_chiave_ai).

const SEGRETO = 'REGIA_AI_KEY'

// Dove scriverla: { ok, progetto, perche }. Non dove non serve o non si può.
function doveScrivere(ist) {
  const no = (perche) => ({ ok: false, progetto: ist?.progetto || null, perche })
  if (!ist) return no('Il locale non ha ancora un’installazione.')
  if (ist.simulata) return no('Locale simulato: non ha un progetto dove scriverla.')
  if (ist.origine === 'esistente') return no('Un locale esistente tiene i suoi segreti: va scritta a mano.')
  if (!ist.progetto) return no('Il locale non ha ancora un progetto.')
  if (ist.profilo === 'leggero') return no('Profilo leggero: il locale non ha le Functions che usano l’AI.')
  return { ok: true, progetto: ist.progetto, perche: null }
}

// Il perché di un rifiuto di Google, detto per chi deve rimediare.
function percheNonScritta(status, progetto) {
  if (status === 403) return `La regia non ha ancora il permesso di scrivere in ${progetto}: arriva col prossimo «Aggiorna» del locale.`
  if (status === 404) return `In ${progetto} il segreto ${SEGRETO} non c’è ancora: arriva col primo «Aggiorna» con l’app che usa l’AI.`
  return `Google ha risposto ${status}.`
}

// Una versione nuova del segreto, con le API di Secret Manager. `token` è
// quello dell'account con cui girano le Functions della regia, `fetch` si
// passa da fuori per provarla.
async function scriviChiave({ progetto, chiave, token, fetch }) {
  const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${progetto}/secrets/${SEGRETO}:addVersion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { data: Buffer.from(chiave).toString('base64') } }),
  })
  if (res.ok) return { scritta: true, perche: null }
  return { scritta: false, perche: percheNonScritta(res.status, progetto) }
}

const comandoAMano = (progetto) => `firebase functions:secrets:set ${SEGRETO} --project ${progetto}`

module.exports = { SEGRETO, doveScrivere, percheNonScritta, scriviChiave, comandoAMano }
