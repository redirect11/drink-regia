// =====================================================================
//  UN MEMBRO IN PIÙ IN UNA POLICY IAM, senza toccare il resto.
//
//  Per scripts/ruoli-provisioning.mjs: la stessa regola vale per i
//  progetti, l'account di fatturazione e i bucket, che leggono e scrivono
//  la policy ognuno con la sua API. Qui solo la parte pura, che si prova:
//  la lettura e la scrittura le fa chi chiama. Un binding con una
//  condizione non si tocca: vale solo a quella condizione, e aggiungerci
//  il membro gli darebbe meno di quello che si voleva.
// =====================================================================
export function conIRuoli(policy, membro, ruoli) {
  const bindings = (policy?.bindings || []).map((b) => ({ ...b, members: [...(b.members || [])] }))
  let nuovi = 0
  for (const role of ruoli) {
    let b = bindings.find((x) => x.role === role && !x.condition)
    if (!b) bindings.push((b = { role, members: [] }))
    if (!b.members.includes(membro)) {
      b.members.push(membro)
      nuovi += 1
    }
  }
  return { policy: { ...policy, bindings }, nuovi }
}

// IL SERVICE AGENT DELLO STORAGE E IL SUO RUOLO (REQ-FLOTTA-124): le regole
// di Storage che leggono Firestore (la licenza) vogliono questo ruolo su di
// lui. Il nome si costruisce dal numero del progetto.
export const RUOLO_REGOLE_STORAGE = 'roles/firebaserules.firestoreServiceAgent'
export const agenteStorage = (numeroProgetto) => `service-${numeroProgetto}@gcp-sa-firebasestorage.iam.gserviceaccount.com`

// Il service agent nasce col bucket e può arrivare qualche istante dopo:
// finché Google risponde che non esiste, si riprova (400 «Service account …
// does not exist», visto su drinkpos-prova-storage il 17/11/2026).
export const agenteNonAncoraNato = (risposta) => /service account .* does not exist/i.test(risposta?.error?.message || '')
