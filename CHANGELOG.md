# Cambiamenti della regia

Una voce per ogni cambiamento visibile, nello stesso commit del
cambiamento. La versione in cima è quella in lavorazione finché non ha la
data.

## Prossima release (da decidere)

- Il titolare prova, aggiunge e disdice un modulo dall'app del suo locale
  («Marketplace → Moduli»): la regia espone il listino dei moduli in
  vendita e cambia l'abbonamento Stripe col conguaglio, e la licenza
  dell'istanza segue. I motivi di un rifiuto sono scritti in forma
  impersonale, uguali sulla dashboard e nell'app (REQ-FLOTTA-037).

- Ogni deploy dopo un acquisto passa dall'amministratore finché non accende
  il deploy automatico, anche quando un locale Free compra un piano
  (REQ-FLOTTA-011). Il codice sconto si scrive nella scelta del piano e il
  pagamento lo applica; col prezzo Fondatori vale il più conveniente, e un
  codice al 100% attiva il piano senza pagamento (REQ-FLOTTA-028).
- L'IVA: Stripe aggiunge il 22% ai canoni, all'attivazione, ai cambi di
  piano e alle ricariche del credito AI, con un'aliquota fissa che la regia
  trova o crea da sola; i prezzi restano IVA esclusa. Il Checkout chiede
  l'indirizzo di fatturazione e la partita IVA. I cambi di piano mandano
  a Stripe righe che una subscription accetta (prima no) (REQ-FLOTTA-035).
- Il webhook di Stripe elabora ogni evento una volta sola (registro
  `eventi_stripe`), e un evento arrivato in ritardo non riporta indietro lo
  stato: un pagamento vecchio non riapre un abbonamento disdetto. Legge la
  subscription delle fatture anche nella forma delle API Stripe più recenti
  (REQ-FLOTTA-036, audit M4).
- Il titolare, sul suo documento, cambia solo i dati anagrafici, con la
  partita IVA sempre valida e i consensi che non si cancellano (audit H1).

- Il listino deciso il 02/11/2026 (DEC-0005): Base a 32,70 € + IVA al mese
  con tre terminali (anche il Completo ne ha tre), attivazione 82 € + IVA
  addebitata al Checkout, prezzi a schermo «+ IVA» con il totale IVA
  inclusa accanto, pagamento annuale a 10 mensilità, offerta Fondatori
  (i primi 20 abbonamenti al Base: 25 € + IVA per 12 mesi, poi il listino;
  attivazione gratuita), assistenza da remoto inclusa fino a 1 ora al mese,
  stampanti non supportate a preventivo. La prova di 30 giorni è pronta ma
  spenta (`prova_nel_checkout`) finché non si decide quando si paga
  l'attivazione (REQ-FLOTTA-031, REQ-PREZZI-001).

## 0.3.0 (in lavorazione)

- La demo pubblica si ripubblica di nuovo dalla regia, e più chiusa: una
  configurazione finta al posto di quella del progetto, nessuna chiamata
  alla regia, lo Storage chiuso come il database, le intestazioni di
  sicurezza. La regia non le scrive più licenza né dati (REQ-FLOTTA-019).
- Gli stili a ricetta: la forma del menù (caratteri, voci, separatori,
  cornici, sfondo) si pubblica dalla regia come un tema, e l'app la disegna
  da sé. Sette stili nuovi (Osteria, Bauhaus, Tiki, Quaderno, Dattilo,
  Insegna, Giardino) e sette temi che li usano. Arrivano nei locali con la
  versione dell'app che sa disegnarli (REQ-FLOTTA-034).
- Otto temi nuovi nel catalogo, disegnati da noi e pubblicati col deploy:
  Smeraldo, Bordeaux, Agrumi, Ardesia, Seppia, Velluto, Menta, Neon. Dal
  backoffice si vedono e si ritirano (REQ-FLOTTA-033).
- Il catalogo dei temi: nella sezione «Temi» del backoffice si crea un tema
  (una base, uno stile del menù, i colori ritoccati, con l'anteprima), si
  pubblica e si ritira; l'app dei locali lo trova nel suo marketplace dei
  temi. Per ora tutti gratis (REQ-FLOTTA-032).
- «Apri la tua app»: dalla sua area il titolare entra nella sua app senza
  password, con un codice che vale una volta sola e un minuto; e a ogni
  deploy l'app riceve nome, indirizzo, telefono e intestazione fiscale del
  locale, dove non li ha già (REQ-FLOTTA-030).
- A ogni attivazione e aggiornamento, chi ha sottoscritto l'abbonamento è
  l'admin del suo locale, e riceve l'email per impostare la password:
  prima un locale nuovo nasceva senza nessuno che potesse entrare
  (REQ-FLOTTA-029).
- L'account del titolare nel suo locale ha lo stesso identificativo
  (uid) che ha nella regia: prima l'attivazione lo riceveva e non lo usava.
  I locali attivati prima, al prossimo aggiornamento, ricevono l'account
  giusto se quello creato allora non è mai stato usato; uno già usato resta
  com'è (REQ-FLOTTA-029, M7).
- Anche con Stripe la licenza ha una durata: scade 7 giorni dopo la fine
  del periodo pagato, e alla scadenza la regia controlla lo stato vero su
  Stripe. Chi disdice, con «solo finché si paga», passa al Free; chi torna
  a pagare entro i 90 giorni riapre il locale. Il titolare gestisce
  l'abbonamento da solo, dal portale di Stripe (REQ-FLOTTA-023).
- Comunicazioni automatiche per email: promemoria dei pagamenti a mano (7
  giorni prima e alla scadenza), pagamento ricevuto, locale passato al
  Free, locale riattivato. Le ricevute e i pagamenti falliti con Stripe li
  manda Stripe (REQ-FLOTTA-027).
- Codici sconto: si creano in «Vendita», con percentuale e durata in mesi o
  illimitata, e si applicano dalla scheda del locale. Al 100% illimitato il
  locale non paga e non scade. Un locale esistente, come la Tana, può avere
  la licenza scritta dalla regia dal suo piano (REQ-FLOTTA-028).
- Un titolare non può più cambiarsi da solo moduli, terminali o prove dal
  browser: solo i suoi dati anagrafici.
- L'app di ogni locale si presenta alla regia al primo avvio di una
  versione nuova, da qualunque deploy arrivi: la regia sa quale versione
  gira davvero e, se al locale manca la licenza, la riscrive.
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
