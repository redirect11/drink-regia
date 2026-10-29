# Cambiamenti della regia

Una voce per ogni cambiamento visibile, nello stesso commit del
cambiamento. La versione in cima è quella in lavorazione finché non ha la
data.

## 0.2.1 (in lavorazione)

- Il piano Free: 0 €, un terminale, fino a 10 prodotti nel menù e 5 conti
  aperti insieme, senza sconti e senza moduli, storico di 7 giorni. Si
  sceglie dalla dashboard senza pagamento, e il locale nasce leggero, a
  costo zero; quando il titolare passa a un piano a pagamento i limiti
  cadono e il locale si completa da solo. Dal backoffice l'admin mette in
  vendita o toglie il Free e ogni modulo; il Free parte fuori vendita
  (REQ-FLOTTA-015).
- Le prove dei moduli: l'admin decide quali moduli si provano e per quanti
  giorni; il titolare ne prova uno dalla dashboard, una volta sola, e alla
  scadenza si spegne da solo se non lo aggiunge. Nel backoffice «Cambia
  piano» prende il posto di «Piano a mano»: piano, moduli e terminali, con
  Stripe o fuori da Stripe, e lo storico dei cambi (REQ-FLOTTA-016).
- La prima attivazione vera di un locale di prova (`prova-bar`, 29/10/2026)
  va fino in fondo: il progetto nasce con lo Storage dell'app, i segreti
  che l'app dichiara e gli agenti di Google che le sue Functions usano, e
  il deploy si riprova se Google non ha ancora finito di preparare i
  permessi (REQ-FLOTTA-013).
- Il backoffice mostra un locale per scheda: nome e stato colorato in
  alto, i dati in ordine, il link all'app del locale, le azioni a gruppi
  con Sospendi e Chiudi separati dalle altre (REQ-FLOTTA-005).
- Un locale si può eliminare col suo progetto, sempre dopo un backup
  completo e verificato. Il titolare lo chiede dalla sua dashboard: l'app
  si ferma subito, la cancellazione arriva dopo 30 giorni e fino ad allora
  si annulla. L'admin, per un locale già chiuso, la fa anche subito. Si
  conferma scrivendo il nome dell'app. Il backup resta 180 giorni e lo
  scarica solo il titolare. Termini e privacy aggiornati (REQ-FLOTTA-014).

## 0.2.0 (in lavorazione)

- L'attivazione e l'aggiornamento dei locali partono dalla regia: il
  Terraform e i workflow stanno qui, e l'app arriva da tana-drink alla
  versione scelta. La regia di test lavora sui suoi locali di prova, col
  suo account di fatturazione, e può sospenderli e chiuderli come la
  produzione (REQ-FLOTTA-013).
- I rilasci di tana-drink arrivano ai locali a ondate: istanze di prova,
  installazioni interne, locali pilota, tutti gli altri. Dal riquadro
  «Rilasci» del backoffice l'admin crea un rilascio da un tag e avvia
  ogni ondata quando la precedente è finita senza errori; il gruppo di
  ogni locale si sceglie dalla sua riga. «Aggiorna tutte le istanze
  attive» non c'è più (REQ-FLOTTA-012).
- Un aggiornamento fallito non segna più il locale «in errore»: il locale
  resta attivo, la riga dice cosa è fallito, il rilascio si ferma, e si
  riprova o si torna alla versione di prima (REQ-FLOTTA-012).
- Il credito AI di ogni locale: nella dashboard il titolare vede il
  credito, lo speso del mese contro il tetto e gli ultimi consumi, e
  ricarica a pacchetti con Stripe. Finito il credito si fermano solo le
  funzioni AI dell'app. Nel backoffice l'admin ricarica a mano, cambia il
  tetto, accende o spegne l'AI e crea la chiave dell'installazione; con
  «Locale esistente» registra un locale che ha già la sua app, come la
  Tana, senza attivazione e senza toccarne il progetto (REQ-AI-003).

## 0.1.0 (non ancora pubblicata)

- Il sito di test (`drink-regia-test.web.app`) porta un nastro «TEST» con
  la versione, e il piè di pagina dice la versione pubblicata anche in
  produzione.
- La richiesta di attivazione dell'istanza la scrive il server, non il
  browser: la Function `chiediAttivazione` rilegge cliente, abbonamento e
  impostazioni e rifiuta chi non ha un abbonamento attivo, chi non ha
  confermato l'email o chi ha già un'attivazione in viaggio. Le regole
  Firestore non lasciano più creare richieste ai client (audit del
  22/10/2026, falla C2). Se il server rifiuta, la dashboard dice perché.
