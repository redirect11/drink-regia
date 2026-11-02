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

// Cosa fare, dato l'utente che c'è (o null): crearlo, dargli il ruolo
// (null se è già admin), mandargli il link per la password.
function cosaFareColTitolare(utente) {
  const claims = utente?.customClaims || {}
  const haPassword = Boolean(utente?.passwordHash) || (utente?.providerData || []).some((p) => p?.providerId === 'password')
  const maiEntrato = !utente?.metadata?.lastSignInTime
  return {
    crea: !utente,
    ruolo: claims.role === 'admin' ? null : { ...claims, role: 'admin' },
    // Finché non ha una password e non è mai entrato: un deploy dopo
    // l'altro, il link gli arriva di nuovo, invece di restare fuori.
    link: !haPassword && maiEntrato,
  }
}

module.exports = { emailTitolare, cosaFareColTitolare }
