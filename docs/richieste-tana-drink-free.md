# Richieste per tana-drink: il piano Free

La regia (drink-regia) ha il piano **Free** dal 30/10/2026 (REQ-FLOTTA-015).
Due cose le può fare solo l'app, cioè tana-drink. Questo documento va
portato alla sessione che lavora su tana-drink: la regia non modifica
tana-drink.

Finché queste due cose non ci sono, nella regia il Free resta **fuori
vendita** (interruttore «Piano Free in vendita» nel backoffice).

## 1. Far rispettare i limiti scritti nella licenza

La regia scrive in `settings/bar.licenza` dell'istanza, accanto a `piano` e
`moduli`, la voce `limiti`:

```json
"limiti": {
  "prodotti_max": 10,
  "conti_aperti_max": 5,
  "sconti": false,
  "storico_giorni": 7,
  "utenti_max": 1,
  "marchio": true
}
```

**La regola che conta: senza `limiti`, nessun limite.** Se la voce manca o
vale `null`, l'app lavora come oggi. I piani a pagamento scrivono `null`. La
Tana e la Tana di test non hanno la voce, e non devono accorgersi di niente;
un test lo deve verificare. Il limite non è mai il comportamento di partenza.

Quando `limiti` c'è, l'app:

| Limite | Cosa fa l'app | Il messaggio, in sostanza |
|---|---|---|
| `prodotti_max` | non lascia creare un prodotto del menù oltre il numero; quelli che ci sono restano | «Nel piano Free il menù ha al massimo 10 prodotti. Per aggiungerne passa a un piano a pagamento.» |
| `conti_aperti_max` | non lascia aprire un conto oltre il numero di conti aperti nello stesso momento | «Nel piano Free puoi avere al massimo 5 conti aperti insieme.» |
| `sconti: false` | nasconde o spegne sconti, omaggi e maggiorazioni sul conto | — |
| `storico_giorni` | mostra vendite e conti chiusi solo degli ultimi N giorni; i dati più vecchi restano nel database, non si vedono | «Nel piano Free lo storico mostra gli ultimi 7 giorni.» |
| `utenti_max: 1` | l'app la usa solo il titolare: niente account dello staff. Il comando per aggiungere un collaboratore si nasconde o dice che è dei piani a pagamento (senza Functions `staffAdmin` non c'è comunque) | «Nel piano Free l'app la usa solo il titolare. Per aggiungere lo staff passa a un piano a pagamento.» |
| `marchio: true` | una riga in fondo allo scontrino e al menù digitale: «Creato con [nome del prodotto]» | — |

Ogni messaggio porta all'indirizzo della regia (`licenza.regia_url`),
dove il titolare sceglie un piano a pagamento.

**Con piano Free i moduli sono tutti spenti** (`licenza.moduli`, come
oggi): l'app li tratta come per un Base senza moduli.

## 2. Funzionare senza Functions e senza Storage

Un locale Free è pubblicato col **profilo leggero**: solo regole di
Firestore e sito (`firebase deploy --only firestore,hosting`). Non ci sono
le Functions dell'app né il bucket di Storage, perché sono quello che costa
anche da fermo.

L'app su un profilo leggero deve:

- **non dare errori** se una Function non c'è: le notifiche degli ordini e
  della chiamata allo staff, `autoAdvancePaid`, il webhook di SumUp;
- **non chiamare Storage**: niente caricamento del logo o di file. Il
  comando si nasconde, oppure dice che è dei piani a pagamento;
- **non chiamare `staffAdmin`**: crea gli account dello staff, e nel Free
  non c'è. Il Free è a un solo utente, il titolare (`limiti.utenti_max: 1`,
  decisione del 30/10/2026); il titolare entra con l'account creato alla
  registrazione;
- **non contare sui pagamenti SumUp** (`createPaymentCheckout`,
  `readerCheckout`, `paymentWebhook`, `autoAdvancePaid` e le altre): nel
  Free il conto si chiude a mano, come pagato in contanti o fuori dall'app;
- **confermare che con un solo terminale `risolviNumeroDuplicato` non
  serve**. Se serve, va detto alla regia: il profilo leggero va rivisto.

Come capisce l'app di essere leggera: `licenza.piano === 'free'`, oppure
la variabile di build `VITE_PROFILO=leggero`, che la regia passa a ogni
build dei workflow delle istanze (`VITE_PROFILO` = il profilo).

**Fatto in tana-drink il 30/10/2026** (PR #239 e #240, REQ-LIC-003,
REQ-LIC-004). Una cosa da sapere: con un solo terminale
`risolviNumeroDuplicato` non serve, ma se il titolare apre l'app su due
dispositivi insieme può capitare, di rado, un numero del giorno doppio che
nessuno corregge. Non rompe i conti.

Quando il locale compra, la regia toglie i limiti dalla licenza e
ripubblica il progetto col profilo completo (Functions, Storage, segreti):
l'app non deve fare niente di speciale.

## 3. Le prove dei moduli (facoltativo)

Dal 30/10/2026 la regia fa provare i moduli (REQ-FLOTTA-016). Un modulo in
prova è acceso in `licenza.moduli` come uno comprato: l'app non deve fare
niente per farlo funzionare. In più `licenza.prove` dice fino a quando:

```json
"prove": { "magazzino": "2026-11-13T10:00:00.000Z" }
```

Se vuole, l'app lo mostra nella sezione del modulo («In prova fino al 13
novembre»). Alla scadenza la regia spegne il modulo da sola.

## 4. Un test per ognuna

- i limiti valgono solo con la voce `limiti` nella licenza;
- senza la voce, nessun limite: è il caso della Tana;
- l'app parte e funziona senza Functions né Storage;
- con `utenti_max: 1` non si aggiunge staff.
