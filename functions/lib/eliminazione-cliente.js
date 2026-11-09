// ── L'ADMIN ELIMINA UN CLIENTE SENZA ISTANZA (REQ-FLOTTA-059) ─────────────
//
// Un cliente registrato che non ha mai attivato l'app, o la cui istanza è
// già stata eliminata col suo progetto (REQ-FLOTTA-014), oggi resta nella
// regia per sempre: il backoffice sa chiudere ed eliminare un'istanza, non
// un cliente. Serve a due cose: il diritto alla cancellazione di chi si è
// registrato e ci ripensa (GDPR, art. 17), e il collaudo automatico dei
// rilasci, che si registra davvero sul test e poi deve sparire
// (e2e/collaudo-registrazione.spec.js).
//
// Qui la parte pura: cosa impedisce l'eliminazione e cosa si cancella. La
// Function eliminaCliente (index.js) legge i documenti, applica queste
// regole, cancella in un batch e toglie l'account di Auth.

// Perché non si può eliminare, o null se si può. Un'istanza con un progetto
// vivo si chiude e si elimina prima, dalla sua scheda: il progetto Google
// e il backup dei dati passano di lì, non da qui. Un'attivazione in coda o
// in corso sta scrivendo: si aspetta che finisca.
function percheNonEliminabile({ istanza = null, richiesta = null } = {}) {
  if (istanza?.progetto && istanza.stato !== 'eliminata') return 'Il cliente ha un’istanza: prima si chiude e si elimina quella, dalla sua scheda.'
  if (['in coda', 'in corso'].includes(richiesta?.stato)) return 'C’è un’attivazione in corso: aspetta che finisca.'
  return null
}

// I documenti del cliente nella regia: il suo, la richiesta di attivazione,
// le richieste di contatto (la sua e quella del tema su misura), l'istanza
// eliminata. I temi su misura sono una sottocollezione e li legge la
// Function. Un percorso che non esiste si cancella senza errore.
function documentiDaCancellare(uid, slug) {
  return [`clienti/${uid}`, `richieste/${slug}`, `contatti/${uid}`, `contatti/${uid}_tema`, `istanze/${slug}`]
}

module.exports = { percheNonEliminabile, documentiDaCancellare }
