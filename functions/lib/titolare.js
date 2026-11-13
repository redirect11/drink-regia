'use strict'

// ── IL TITOLARE, ADMIN DEL SUO LOCALE, LOGICA PURA (REQ-FLOTTA-029) ────
//
// L'utente, 02/11/2026: «Quando viene deployato qualcosa, bisogna sempre
// aggiungere come utente admin chi ha richiesto la sottoscrizione. Magari
// chiedere di creare una password o di crearla automaticamente.» Prima
// l'attivazione pubblicava l'app senza nessun account: la dashboard diceva
// di entrare con «password dimenticata», che però scrive solo a un account
// che esiste. prova-bar e prova-free erano senza nessuno che potesse
// entrare (verifica del 02/11/2026).
//
// A ogni deploy della regia, nel progetto del locale: l'account con
// l'email del cliente c'è (lo si crea, già verificato e senza password), ha
// il ruolo `admin` (nell'app il ruolo sta nei custom claims, come in
// functions/lib/staff-service.js di tana-drink), e finché non ha una
// password riceve l'email di Firebase per impostarla. La password non la
// genera nessuno: viaggerebbe in chiaro per email.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// L'email del titolare, pulita; '' se manca, null se non è un'email.
function emailTitolare(v) {
  const e = String(v ?? '').trim().toLowerCase()
  if (!e) return ''
  return EMAIL.test(e) && e.length <= 254 ? e : null
}

const haPasswordDi = (utente) => Boolean(utente?.passwordHash) || (utente?.providerData || []).some((p) => p?.providerId === 'password')
// Mai entrato: nessun rinnovo del token e nessun accesso dopo la creazione.
// L'emulatore di Auth (provato il 02/11/2026) scrive lastSignInTime uguale a
// creationTime già alla creazione con l'Admin SDK: guardare solo
// lastSignInTime faceva sembrare «usato» un segnaposto appena nato.
function maiEntratoDi(utente) {
  const m = utente?.metadata || {}
  if (m.lastRefreshTime) return false
  return !m.lastSignInTime || (Boolean(m.creationTime) && m.lastSignInTime === m.creationTime)
}

// Cosa fare, dato l'utente che c'è (o null): crearlo, dargli il ruolo
// (null se è già admin), mandargli il link per la password.
function cosaFareColTitolare(utente) {
  const claims = utente?.customClaims || {}
  return {
    crea: !utente,
    ruolo: claims.role === 'admin' ? null : { ...claims, role: 'admin' },
    // Finché non ha una password e non è mai entrato: un deploy dopo
    // l'altro, il link gli arriva di nuovo, invece di restare fuori.
    link: !haPasswordDi(utente) && maiEntratoDi(utente),
  }
}

// ── LO STESSO UID DELLA REGIA (M7, 02/11/2026) ─────────────────────────
//
// Il workflow riceveva l'uid del titolare (clienti/{uid}) e non lo usava:
// l'account nel locale nasceva con un uid suo, e regia e locale avevano
// due identità diverse per la stessa persona. Con lo stesso uid il
// titolare è lo stesso ovunque: nei log, nei passaggi fra regia e app, e
// se un giorno cambia email nella regia il locale lo riconosce ancora.
//
// L'uid di Firebase Auth non si cambia: un account che esiste con un uid
// diverso si può solo cancellare e ricreare. Si fa SOLO se è un segnaposto
// mai usato (nato dal passo di prima, senza password, mai entrato, senza
// altri accessi): non c'è niente di suo da perdere. Un account già usato
// resta com'è, con un avviso: chiuderlo fuori dal suo locale sarebbe peggio
// di due uid diversi.

// L'uid del titolare, pulito: '' se manca, null se non è un uid della regia
// (lo stesso controllo del workflow: lettere e cifre; Firebase arriva a 128).
function uidTitolare(v) {
  const u = String(v ?? '').trim()
  if (!u) return ''
  return /^[A-Za-z0-9]{1,128}$/.test(u) ? u : null
}

// Un account che il passo stesso ha creato e nessuno ha mai usato: si può
// ricreare con l'uid giusto. Claim diversi da { role: 'admin' } vogliono
// dire che qualcuno ci ha messo mano: allora non si tocca.
function segnaposto(utente) {
  if (!utente || haPasswordDi(utente) || !maiEntratoDi(utente)) return false
  if ((utente.providerData || []).length > 0) return false
  const claims = Object.keys(utente.customClaims || {})
  return claims.length === 0 || (claims.length === 1 && utente.customClaims.role === 'admin')
}

// Il piano, dati l'uid della regia ('' se non c'è), l'email, l'account
// trovato per uid e quello trovato per email (null se non ci sono):
//   azione   'crea'    → createUser({ uid?, email, emailVerified: true })
//            'ricrea'  → deleteUser(daCancellare), poi come 'crea'
//            'tieni'   → l'account `uid` c'è già: solo ruolo e link
//   uid      l'account su cui lavorare (null se lo sceglie Firebase)
//   ruolo    i claim da scrivere, o null se è già admin
//   link     se mandare l'email per impostare la password
//   avvisi   cose da far vedere nel log, che non fermano niente
// Rilanciato sullo stesso locale, dopo la prima volta dà sempre 'tieni'
// con ruolo null: è questo che rende il passo idempotente.
function pianoTitolare({ uid = '', email, perUid = null, perEmail = null }) {
  const avvisi = []
  const tieni = (utente) => {
    const c = cosaFareColTitolare(utente)
    // Il link va all'email: se l'email è di un altro account, il link
    // arriverebbe a quello, non al titolare.
    const suaEmail = emailTitolare(utente.email) === email
    return { azione: 'tieni', uid: utente.uid, ruolo: c.ruolo, link: c.link && suaEmail, avvisi, daCancellare: null }
  }
  const crea = (daCancellare = null) => ({ azione: daCancellare ? 'ricrea' : 'crea', uid: uid || null, ruolo: { role: 'admin' }, link: true, avvisi, daCancellare })

  if (!uid) {
    // Un lancio a mano senza uid: come prima di M7, per email.
    if (perEmail) return tieni(perEmail)
    avvisi.push('Nessun uid della regia: l’account nasce con un uid suo.')
    return crea()
  }
  if (perUid) {
    if (emailTitolare(perUid.email) !== email) avvisi.push(`L’account del titolare ha un’altra email (${perUid.email || 'nessuna'}): non si cambia da qui.`)
    if (perEmail && perEmail.uid !== uid) avvisi.push(`L’email ${email} è di un altro account (${perEmail.uid}): non si tocca.`)
    return tieni(perUid)
  }
  if (perEmail) {
    if (segnaposto(perEmail)) return crea(perEmail.uid)
    avvisi.push(`L’account ${email} c’è già con un altro uid (${perEmail.uid}) ed è stato usato: resta quello.`)
    return tieni(perEmail)
  }
  return crea()
}

module.exports = { emailTitolare, uidTitolare, cosaFareColTitolare, segnaposto, pianoTitolare }
