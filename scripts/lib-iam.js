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
