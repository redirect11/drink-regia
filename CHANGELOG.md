# Cambiamenti della regia

Una voce per ogni cambiamento visibile, nello stesso commit del
cambiamento. La versione in cima è quella in lavorazione finché non ha la
data.

## 0.3.0 (in lavorazione)

- L'app di ogni locale si presenta alla regia al primo avvio di una
  versione nuova, da qualunque deploy arrivi: la regia sa quale versione
  gira davvero e, se il locale non ha ancora la licenza, gliela scrive.
  La scheda del locale nel backoffice dice la versione vista dall'app
  (REQ-FLOTTA-026).
- Un locale fermo perché non paga, o chiuso, conserva i dati per 90 giorni,
  poi l'installazione si cancella, sempre dopo un backup che il titolare
  scarica per 180 giorni. Il titolare riceve un avviso subito, 7 giorni
  prima e il giorno prima, per email, nella sua area clienti e nell'app.
  Se torna a pagare, la cancellazione si annulla. Un locale tornato al Free
  non perde niente. I termini e l'informativa lo dicono (REQ-FLOTTA-025).
- La licenza dice all'app cosa fare quando scade (fermarsi o passare al
  Free) e scade al taglio della giornata, non a mezzanotte. La scadenza è
  scritta anche nella forma che le regole del database sanno leggere.
- Un piano più piccolo, un modulo tolto, il passaggio al Free o una
  sospensione per un pagamento mancato arrivano al locale al taglio della
  giornata (alle 5, o all'ora del locale), non durante il servizio: fino
  ad allora l'app resta com'è. Quello che si aggiunge arriva subito. La
  dashboard e la scheda del locale dicono quando (REQ-FLOTTA-024).
- Un locale nuovo riceve la licenza prima dell'app.
- Il piano Free non comprende le comande.
- Niente più controlli quotidiani: un locale si sospende, torna al Free o si
  chiude quando cambia lo stato del suo abbonamento. Con Stripe lo decidono
  i tentativi di pagamento di Stripe; fuori da Stripe si scrive «pagato
  fino al» e, a quella data più i giorni di grazia, il locale si ferma da
  solo. Prove dei moduli ed eliminazioni programmate scattano alla loro
  data (REQ-FLOTTA-023).
- La licenza di ogni locale si scrive anche in un documento suo, che
  dall'app non si può modificare: prima un bartender poteva cambiarsela.
  Nella sezione «Rilasci» si allineano e si verificano le licenze di tutti
  i locali. Ogni aggiornamento la scrive prima del deploy, e senza non
  parte (REQ-FLOTTA-022).
- Gli aggiornamenti si possono dare in due modi: automatici, come oggi, o
  a scelta del titolare, che vede prima le novità e decide se aggiornare o
  saltare la versione. E si possono legare al pagamento: chi non paga torna
  al Free e riceve solo i rilasci obbligatori. Le due regole si accendono
  dal backoffice («Rilasci»); chi ha già un piano le prende al rinnovo e
  riceve un avviso. Un rilascio si può segnare obbligatorio: arriva a tutti
  (REQ-FLOTTA-020). I termini del servizio (punti 3 e 5) lo dicono. La
  scelta fatta nell'app arriva alla regia subito, con l'accesso del
  titolare.
- La demo della prima pagina non scrive più nel suo database: la regia la
  pubblica sempre leggera e con il database chiuso a tutti, e la build
  della demo va solo sul suo progetto. I dati di prova e la sessione nel
  browser arrivano con la modalità demo di tana-drink (REQ-FLOTTA-019).
- Il backoffice è diviso in sezioni, con un sotto-menù: «Locali» (le schede,
  con la ricerca e la vista per stato), «Richieste» (deploy automatico,
  attivazioni da autorizzare, richieste di contatto), «Rilasci» (i rilasci a
  ondate e gli aggiornamenti falliti), «Vendita» e «Nuovo locale». Ogni
  sezione ha il suo indirizzo, quindi il tasto indietro e i link funzionano;
  un numero accanto alla voce dice quando c'è qualcosa da fare. Sulla scheda
  di un locale «Aggiorna» diventa «Aggiorna subito» e dice accanto cosa fa:
  porta solo quel locale all'ultima versione dell'app, mentre a tutti un
  rilascio arriva a ondate; l'esito dice la versione lanciata
  (REQ-FLOTTA-005).
- La Tana si può affidare alla regia per gli aggiornamenti: entra nelle
  ondate dei rilasci e «Aggiorna» la porta alla versione scelta, sul suo
  progetto, senza perdere SumUp, notifiche, App Check e Analytics. Il
  deploy da tana-drink resta, per il test e per la produzione. Di norma
  un locale esistente continua a pubblicare da sé (REQ-FLOTTA-018).
- La prima pagina è nuova, in italiano e in inglese. Il titolo dice la
  promessa («La serata non si ferma. Nemmeno quando cade il Wi-Fi.»), e la
  pagina segue un percorso: il problema, i tre pilastri (lavora anche senza
  rete, i dati sono tuoi, fatta per il servizio), le funzioni con il modulo
  che le porta, i tre passi, i prezzi con la tabella dei moduli e quanto conviene
  il Completo, le domande, l'ultima azione. Parla a bar e ristoranti. La
  versione inglese sta su `/en`; il selettore IT / EN nella barra e nel piè
  di pagina ricorda la scelta, e chi ha il browser in inglese vede un
  avviso che gliela propone. Registrazione, dashboard e testi legali
  restano in italiano. I testi su dati, chiusura e disdetta sono quelli dei
  Termini, e finché pagamenti online e Free sono spenti la pagina dice che
  l'attivazione si concorda con noi (REQ-FLOTTA-002).

## 0.2.1 (30/10/2026, la prima in produzione: comprende la 0.2.0 e la 0.1.0)

- In produzione un locale riceve solo l'app che è già uscita in produzione
  (su `main` di tana-drink), e l'attivazione si ferma prima di creare il
  progetto se quella versione dell'app non sa compilare per un cliente.
  Sulla regia di test resta `develop`. Lo script che dà i ruoli al
  service account di provisioning sta ora nella regia (REQ-FLOTTA-006,
  REQ-FLOTTA-009).
- I pagamenti online si accendono dal backoffice («Pagamenti online con
  Stripe» nel riquadro «Vendita»), e partono spenti. Spenti, chi sceglie
  un piano a pagamento ci lascia un recapito invece di pagare; le
  richieste stanno nel backoffice, il pagamento si concorda e il piano si
  attiva con «Cambia piano» fuori da Stripe. Anche la ricarica AI la fa
  l'admin. Termini aggiornati (REQ-FLOTTA-017).

- Il piano Free: 0 €, un terminale, fino a 10 prodotti nel menù e 5 conti
  aperti insieme, solo il titolare (niente staff), senza sconti e senza
  moduli, storico di 7 giorni. Si
  sceglie dalla dashboard senza pagamento, e il locale nasce leggero, a
  costo zero; quando il titolare passa a un piano a pagamento i limiti
  cadono e il locale si completa da solo. Dal backoffice l'admin mette in
  vendita o toglie il Free e ogni modulo; il Free parte fuori vendita.
  Il progetto di un locale Free ha la fatturazione collegata (senza,
  Google non accende l'accesso con email) ma solo database, sito e
  accesso, dentro le soglie gratuite (REQ-FLOTTA-015).
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

## 0.2.0 (mai pubblicata da sola: è dentro la 0.2.1)

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

## 0.1.0 (mai pubblicata da sola: è dentro la 0.2.1)

- Il sito di test (`drink-regia-test.web.app`) porta un nastro «TEST» con
  la versione, e il piè di pagina dice la versione pubblicata anche in
  produzione.
- La richiesta di attivazione dell'istanza la scrive il server, non il
  browser: la Function `chiediAttivazione` rilegge cliente, abbonamento e
  impostazioni e rifiuta chi non ha un abbonamento attivo, chi non ha
  confermato l'email o chi ha già un'attivazione in viaggio. Le regole
  Firestore non lasciano più creare richieste ai client (audit del
  22/10/2026, falla C2). Se il server rifiuta, la dashboard dice perché.
