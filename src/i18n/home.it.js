// ── I TESTI DELLA PRIMA PAGINA, IN ITALIANO (DESIGN.md §5) ────────────
//
// Le stesse chiavi di home.en.js (un test le confronta). Nessuna frase sta
// nei componenti: si cambia qui. I numeri non si scrivono: arrivano dal
// listino (functions/piani.json) nei segnaposto `{…}`, e il nome del
// prodotto da src/lib/prodotto.js.
//
// Il registro (DESIGN.md §2): fatti specifici al posto degli aggettivi,
// la frase del titolare e non quella dello sviluppatore, niente urgenza,
// niente superlativi, niente punti esclamativi. Il pubblico è la
// ristorazione in generale, bar e ristoranti (l'utente, 30/10/2026): il
// prodotto prende le comande e tiene conti e cassa, non è solo per bar.

import { MODULI, PIANI } from '../lib/piani.js'

export default {
  meta: {
    titolo: 'Gestionale per bar e ristoranti, nato dietro un banco',
    descrizione:
      'Comande, conti e cassa, menù con QR, magazzino, statistiche e personale in un’app sola, scritta nel cocktail bar che la usa ogni sera. Ogni locale ha la sua installazione e i suoi dati, e lavora anche senza rete.',
  },
  barra: {
    principale: 'Principale',
    menu: 'Menu',
    funzioni: 'Funzioni',
    prezzi: 'Prezzi',
    domande: 'Domande',
    accedi: 'Accedi',
    attiva: 'Attiva il tuo locale',
    dashboard: 'Dashboard',
    backoffice: 'Backoffice',
    esci: 'Esci',
    lingua: 'Lingua',
    // Il primo tasto della pagina, per chi usa la tastiera (REQ-FLOTTA-125).
    salta: 'Salta al contenuto',
  },
  piede: {
    // Il sottotitolo del marchio (decisione dell'utente del 09/11/2026: «Lime – SmartOrders e poi il sottotitolo lo metti»).
    sottotitolo: 'Comande, cassa e gestione del locale, in un’app sola.',
    descrizione: 'Scritta dietro il banco di un cocktail bar, in servizio ogni sera. Comande, cassa, menù, magazzino e personale, con un’installazione per ogni locale.',
    prodotto: 'Prodotto',
    account: 'Account',
    informazioni: 'Informazioni',
    funzioni: 'Funzioni',
    prezzi: 'Prezzi',
    demo: 'Installazione dimostrativa',
    accedi: 'Accedi',
    registrati: 'Registra il locale',
    termini: 'Termini di servizio',
    privacy: 'Privacy',
    nota: 'Importi IVA esclusa. Lo scontrino sulla stampante termica non è uno scontrino fiscale.',
    versione: 'Versione',
    inItaliano: '',
  },
  // L'avviso che propone QUESTA lingua a chi è sulla pagina dell'altra:
  // è scritto nella lingua che propone, perché lo legga chi la parla.
  avvisoLingua: {
    etichetta: 'Lingua della pagina',
    testo: 'Questa pagina è disponibile anche in italiano.',
    vai: 'Leggi in italiano',
    resta: 'Resta in inglese',
  },
  // Sulla pagina inglese dice che registrazione e account sono in
  // italiano; su quella italiana non serve.
  soloItaliano: '',
  // L'anteprima (REQ-FLOTTA-043): la sola pagina che la produzione mostra
  // finché il sito non è aperto al pubblico. Niente prezzi, niente promesse.
  anteprima: {
    occhiello: 'Gestionale per bar e ristoranti',
    titolo: 'Il sito apre a breve.',
    testo: 'Lime è il gestionale per bar e ristoranti nato in un cocktail bar: comande, cassa, menù con QR, magazzino, personale e statistiche in un’app sola. Stiamo preparando il sito.',
    // Daniele, 14/11/2026 (REQ-FLOTTA-106): «Per informazioni», col contatto.
    contatto: 'Per informazioni',
    accedi: 'Area riservata',
  },
  hero: {
    occhiello: 'Gestionale per bar e ristoranti',
    // Lo slogan del 17/11/2026 (REQ-FLOTTA-131), scelto da Daniele sul
    // canvas di design dopo aver scartato le proposte «piatte e scontate»:
    // «Tu servi. Lime fa i conti.» — «questo mi piace»; poi, lo stesso giorno,
    // «tu servi lui fa i conti non mi piace. Il tu servi lo cambierei», e fra
    // le proposte ha scelto «Pensa al tuo locale. Ai conti pensa Lime.». Due
    // frasi in croce,
    // e la categoria resta nell'occhiello qui sopra, che risponde ancora a
    // «nella parte iniziale non è chiaro cosa vendiamo» (07/11/2026). Quello
    // di prima, «Il gestionale del tuo locale. Dalla comanda alla cassa.»,
    // e la sua storia sono in DESIGN.md §5.1.
    titolo: 'Pensa al tuo locale. Ai conti pensa Lime.',
    sottotitolo: 'Comande, cassa, menù con QR, magazzino, personale e statistiche in un’app sola, nata in un cocktail bar.',
    attiva: 'Attiva il tuo locale',
    dashboard: 'La mia dashboard',
    demo: 'Prova la demo',
    nuovaScheda: '(si apre in una nuova scheda)',
    fatti: 'In breve',
    da: 'Da {prezzo} al mese',
    free: 'Piano Free per provare',
    // Dal 02/11/2026 c'è anche l'annuale (DEC-0005).
    mensile: 'Abbonamento mensile o annuale',
    prova: '{giorni} giorni di prova',
    // L'attivazione è automatica solo se si paga online o si parte dal Free;
    // con i pagamenti online spenti (come in produzione all'avvio) la
    // richiesta passa da noi (REQ-FLOTTA-017). Home sceglie la frase giusta.
    automatica: 'Attivazione automatica',
    concordata: 'Attivazione concordata con noi',
  },
  // Le cinque diapositive del carosello (REQ-FLOTTA-131, prima
  // REQ-FLOTTA-061). Parlano al titolare, non al cliente del locale:
  // Daniele, 16/11/2026, «ordina si riferisce al cliente del locale, le
  // altre al nostro cliente. Dovremmo dire più che altro: gestisci gli
  // ordini… anche offline, acquisti dal menù, segui le comande (stampate e
  // non, prevediamo una comanda digitale), conti sempre in ordine, tieni
  // d'occhio il magazzino». Ogni riga sotto il titolo l'ha scelta lui, una
  // per una (le tre del 15/11 su «Ordina», «Prepara» e «Incassa» sono
  // rientrate nelle righe). Nella seconda «paga» non c'è: l'app non fa
  // ancora pagare il cliente dal menù, e la pagina non lo promette.
  gesti: {
    titolo: 'Il lavoro del locale, in cinque gesti',
    carosello: 'carosello',
    voci: {
      ordini: { parola: 'Gestisci gli ordini.', testo: 'Dal tavolo al banco, in un tocco. Anche senza rete.' },
      menu: { parola: 'Acquisti dal menù.', testo: 'Inquadra il QR code, ordina e il cliente è servito. Gestisci le ordinazioni direttamente dai tavoli.' },
      comande: { parola: 'Segui le comande.', testo: 'Stampate al banco o sullo schermo: lo vedi, lo prepari, lo spunti.' },
      conti: { parola: 'Conti sempre in ordine.', testo: 'Tieni d’occhio i conti della serata e del locale, fino all’ultimo centesimo.' },
      magazzino: { parola: 'Tieni d’occhio il magazzino.', testo: 'Mai più senza scorte. Con Lime ti accorgi subito se un prodotto sta finendo.' },
    },
    precedente: 'Gesto precedente',
    successiva: 'Gesto successivo',
    vaiA: '{parola} Gesto {n} di {totale}',
    nota: '* I filmati di questa pagina sono dimostrativi, generati con l’intelligenza artificiale.',
    // I nomi del tasto di pausa e play, che a schermo è solo un'icona.
    ferma: 'Metti in pausa il carosello',
    riprendi: 'Fai ripartire il carosello',
  },
  funzioni: {
    occhiello: 'Funzioni',
    titolo: 'Dalla prima comanda alla chiusura di cassa.',
    // La prima frase è di Daniele (11/11/2026). Quella di prima, «Ogni
    // funzione è entrata perché serviva al banco», l'ha bocciata: «questa
    // cosa non si può leggere… devi usare questo tipo di frasi».
    sotto: 'Ogni funzione è frutto dell’esperienza dietro al banco.',
    punti: 'Cosa comprende',
    voci: {
      conti: {
        occhiello: 'Comande e conti',
        titolo: 'Dal tavolo al banco, senza passaggi a voce.',
        // La stampa automatica è una scelta del locale (tana-drink,
        // REQ-STAMPA-001). Il prezzo dei terminali oltre quelli del piano
        // stava qui fra i punti: dal 12/11/2026 sta solo nei prezzi
        // (REQ-FLOTTA-068, Daniele: «si»).
        testo: 'La prendi al tavolo o al banco: arriva subito e, se lo scegli, si stampa da sola. Il conto ha già tutto sopra e si chiude in contanti o con carta; lo scontrino di cortesia esce sulla stampante termica.',
        punti: ['Comanda stampata al banco', 'Contanti e carta', 'Scontrino di cortesia'],
        // Le schermate (REQ-FLOTTA-131) sono vere: la demo di tana-drink col
        // tema Lime e il locale «Bancone 21». Il testo alternativo dice cosa
        // si vede, non cosa vendiamo.
        schermata: 'Il conto di un tavolo aperto sul tablet: i prodotti del menù a sinistra, a destra le righe del conto, il totale e il tasto Pagamento.',
      },
      menu: {
        occhiello: 'Menù digitale e ordini dal tavolo',
        // Il titolo del canvas di design (REQ-FLOTTA-131): il vantaggio,
        // non la tecnologia. Il QR resta nel testo sotto.
        titolo: 'Cambi un prezzo, il menù è già giusto.',
        testo: 'Il cliente inquadra il QR, vede il menù con i prezzi aggiornati, ordina e segue lo stato del suo ordine. Niente app da scaricare e niente menù di carta da ristampare quando cambi un prezzo.',
        punti: ['Menù sempre aggiornato', 'Ordini che arrivano dritti al banco', 'Nessuna app da scaricare'],
        schermata: 'Il menù del locale sul telefono del cliente: i drink della casa e il numero dell’ordine che si sta servendo.',
      },
      magazzino: {
        occhiello: 'Magazzino',
        // Si scarica quando la comanda è pronta, o alla riscossione se il
        // locale non segue gli stati (tana-drink, REQ-MAG-003); l'avviso è la
        // soglia di riordino del prodotto (REQ-MAG-006). Il titolo è quello
        // del canvas di design (REQ-FLOTTA-131).
        titolo: 'Ogni drink servito scala la sua bottiglia.',
        testo: 'Ogni comanda preparata scarica gli ingredienti della sua ricetta; quando una giacenza scende sotto la soglia di riordino, l’app te lo segnala. L’inventario periodico e le fatture dei fornitori tengono i conti allineati.',
        punti: ['Giacenze e soglie di riordino', 'Inventario periodico', 'Fatture dei fornitori'],
        schermata: 'Il magazzino: i prodotti per categoria, con prezzo, costo al centilitro, scorte e quanto ne resterà a fine serata.',
      },
      statistiche: {
        occhiello: 'Statistiche',
        titolo: 'Quanto hai incassato, a che ora, con cosa.',
        testo: 'Incassi per serata e per periodo, venduto per fascia oraria, bilancio per categorie. Le ore di punta e il confronto con la settimana scorsa sono già calcolati, senza fogli Excel.',
        punti: ['Confronto tra periodi', 'Le ore di punta', 'Il bilancio per macro-categorie'],
        schermata: 'Le statistiche di una serata: incasso, ordini, scontrino medio, drink venduti, ora di punta e l’incasso per fascia oraria.',
      },
    },
    // Sulla pagina inglese dice che le schermate sono in italiano, perché
    // l'app lo è; qui non serve.
    schermateInItaliano: '',
    minori: {
      staff: 'Le ore e le paghe del personale, e le chiamate allo staff, nello stesso gestionale.',
      sumup: 'Il conto passa al lettore SumUp e torna già pagato.',
    },
  },
  // «Pronto in 3 passi»: Daniele, 12/11/2026 (REQ-FLOTTA-070). Vero col
  // terzo passo concordato; quello automatico aspetta l'Organizzazione
  // Google Cloud, senza la quale il progetto del locale si crea a mano.
  passi: {
    titolo: 'Pronto in 3 passi',
    voci: [
      { titolo: 'Registra il tuo locale.', testo: 'Nome, dati di fatturazione e un referente, poi la conferma dell’email.' },
      { titolo: 'Scegli piano e moduli.', testo: 'Parti dal {base} e aggiungi i moduli quando ti servono, anche dopo.' },
      {
        titolo: 'Apri la cassa.',
        testo: 'La tua installazione nasce da sola, con il suo indirizzo. Entri dal tablet e lavori.',
        concordata: 'Ci accordiamo sul pagamento e attiviamo la tua installazione, con il suo indirizzo. Entri dal tablet e lavori.',
      },
    ],
  },
  prezzi: {
    // Descrittivo: c'è un canone fisso, l'attivazione e il Completo a
    // pacchetto, quindi «paghi solo quello che usi» non era esatto.
    titolo: 'Un canone al mese, e i moduli che ti servono.',
    // DEC-0005: prezzi IVA esclusa, col totale IVA inclusa accanto.
    // «Assistenza inclusa»: Daniele, 16/11/2026, «assistenza inclusa e
    // basta» (REQ-PREZZI-001, REQ-FLOTTA-131).
    sotto: 'Abbonamento mensile o annuale, assistenza inclusa. Prezzi IVA esclusa (IVA al {iva}), con il totale IVA inclusa accanto. Attivazione una tantum: {attivazione} ({lordo}).',
    // La prova (DEC-0005). Si dice solo cosa vale: la durata, e che il
    // canone parte alla fine. Come si paga l'attivazione durante la prova
    // è da decidere (vedi i Termini, §3).
    prova: 'I primi {giorni} giorni sono di prova: il canone parte alla fine della prova.',
    alMese: '/ mese',
    piuIvaAlMese: '+ IVA al mese',
    piuIva: '{prezzo} + IVA',
    ivaInclusa: '{prezzo} IVA inclusa',
    annuale: 'Pagando un anno in anticipo: {prezzo} ({lordo}), pari a {mesi} mensilità.',
    // L'offerta di lancio (DEC-0005), in una riga e senza contatori: chi
    // rientra lo vede al pagamento, perché i posti li conta il server.
    fondatori: {
      titolo: 'Offerta Fondatori',
      testo: 'I primi {posti} locali: {piani}; {attivazione}.',
      piano: '{nome} a {prezzo} al mese ({lordo}) per {mesi} mesi dall’attivazione, poi {listino} come da listino',
      attivazioneGratuita: 'attivazione gratuita',
      attivazione: 'attivazione a {prezzo}',
      regola: 'I posti vanno ai primi abbonamenti a pagamento attivati, in ordine di attivazione. Le condizioni complete sono nei termini di servizio.',
    },
    ore: { uno: '{n} ora', piu: '{n} ore' },
    assistenza: 'L’assistenza da remoto è inclusa fino a {ore} al mese; oltre, a preventivo.',
    stampante:
      // Daniele, 16/11/2026: «metterei che supportiamo stampanti su
      // richiesta, basta che ci fanno sapere il modello». Il modello si dice
      // nella scelta del piano (REQ-FLOTTA-081); il preventivo resta nei
      // termini (REQ-FLOTTA-131).
      'Usi un’altra stampante? La supportiamo su richiesta: indicaci il modello quando scegli il piano, oppure scrivici.',
    piano: 'Piano {nome}',
    tuttoIncluso: 'Tutto incluso',
    inizia: 'Inizia con {nome}',
    terminali: { uno: '{n} terminale', piu: '{n} terminali' },
    piani: {
      free: {
        nome: PIANI.free.nome,
        descrizione:
          'Per provare il servizio: la cassa, fino a {prodotti} prodotti nel menù e {conti} conti aperti insieme, senza stati di servizio, senza stampa e senza moduli. {terminali}.',
      },
      base: {
        nome: PIANI.base.nome,
        descrizione: 'Per partire: cassa, comande, scontrino sulla stampante, menù digitale con il QR al tavolo e lavoro senza rete. {terminali}.',
      },
      completo: {
        nome: PIANI.completo.nome,
        descrizione: 'Tutti i moduli, dal menù digitale al magazzino, già inclusi. {terminali}.',
      },
    },
    // Il confronto fra i piani e l'elenco dei moduli a scomparsa
    // (REQ-FLOTTA-063). I valori delle celle nascono dal listino; qui ci
    // sono solo le parole.
    confronto: {
      apri: 'Confronta i piani',
      didascalia: 'Cosa comprende ogni piano, e quanto costa ogni modulo dove si compra a parte.',
      gruppoLavoro: 'Il lavoro di ogni giorno',
      gruppoModuli: 'I moduli',
      righe: {
        comande: 'Stati di servizio (in preparazione, pronto, servito)',
        stampa: 'Stampa di comande e scontrino',
        prodotti: 'Prodotti nel menù',
        conti: 'Conti aperti insieme',
        utenti: 'Utenti',
        sconti: 'Sconti',
        storico: 'Storico',
        terminali: 'Terminali inclusi',
        marchio: 'Scritta in fondo a scontrino e menù',
      },
      si: 'Sì',
      no: 'No',
      finoA: 'Fino a {n}',
      senzaLimite: 'Senza limite',
      soloTitolare: 'Solo il titolare',
      giorni: 'Ultimi {n} giorni',
      tutto: 'Tutto',
      marchio: '«Creato con {nome}»',
      nessuna: 'Nessuna',
      nonDisponibile: 'Non disponibile',
      nota: 'Dove c’è un prezzo, è al mese e IVA esclusa: sotto, il totale IVA inclusa.',
      nelPiano: 'Nel piano {piano}',
      inclusoInTutti: 'Compreso nel {base} e nel {completo}.',
      aParteEIncluso: 'Sul {base} si aggiunge a {prezzo} al mese ({lordo}). Nel {completo} è compreso.',
      aParte: 'Si aggiunge a {prezzo} al mese ({lordo}).',
      terminaliNelPiano: '{base}: {n_base}. {completo}: {n_completo}. Ogni terminale in più: {lordo}.',
    },
    tabella: {
      titolo: 'I moduli, uno per uno',
      incluso: 'Incluso',
      terminale: 'Terminale in più',
      terminaleTesto: 'Un altro tablet o telefono sulla stessa cassa, oltre a quelli del piano.',
      terminaliInclusi: { uno: '{n} incluso', piu: '{n} inclusi' },
    },
    convenienza: 'Il {base} con tutti i moduli costa {totale} al mese; il {completo} li include tutti a {completo_prezzo}.',
    notaScontrino:
      'Lo scontrino esce su una stampante termica ed è un conto di cortesia, non uno scontrino fiscale. Per quello serve il registratore telematico del locale.',
  },
  // I moduli in italiano parlano con le parole del listino: un posto solo.
  moduli: Object.fromEntries(MODULI.map((m) => [m.id, { nome: m.nome, descrizione: m.descrizione }])),
  domande: {
    titolo: 'Domande frequenti',
    voci: [
      [
        // Le risposte sui dati dicono quello che dicono i Termini
        // (Legali.jsx §5, §6 e §7), con le loro parole.
        'Chi vede i dati del mio locale?',
        'Nessun altro locale. Ogni locale ha un’installazione separata, con il suo database. I dati sono del locale, e noi li trattiamo solo per erogare il servizio, come scritto nei termini.',
      ],
      [
        'E se cade la connessione?',
        'La cassa continua a lavorare. Conti, comande e incassi restano sul dispositivo e si sincronizzano da soli quando la rete torna. I pagamenti con il lettore SumUp, invece, hanno bisogno della rete.',
      ],
      [
        'Lo scontrino è fiscale?',
        'No. È un conto di cortesia su stampante termica. Lo scontrino fiscale resta del registratore telematico del locale, che l’app non sostituisce.',
      ],
      [
        'Cosa mi serve per cominciare?',
        'Un tablet o un telefono con un browser aggiornato. Per lo scontrino, una stampante termica Epson in rete, o un altro modello su richiesta; per le carte, un lettore SumUp.',
      ],
      [
        'Posso cambiare piano o disdire?',
        'Sì. Il cambio di piano si chiede dalla tua pagina. L’abbonamento, mensile o annuale, si disdice in qualunque momento: il servizio resta attivo fino alla fine del periodo già pagato.',
      ],
      [
        'Cosa succede ai dati se chiudo il locale?',
        'Chiudendo l’installazione dalla tua pagina l’app si ferma subito, e dopo 30 giorni i dati vengono cancellati; fino ad allora la chiusura si può annullare. Prima della cancellazione facciamo un backup completo, che puoi scaricare dalla tua pagina per 180 giorni.',
      ],
      [
        'Chi pensa agli aggiornamenti?',
        'Noi. Gli aggiornamenti arrivano alla tua installazione senza che tu debba fare niente, e senza interruzioni programmate.',
      ],
    ],
  },
  chiusura: {
    // Dal canvas di design (REQ-FLOTTA-131): due tempi, come il titolo
    // della prima schermata.
    titolo: 'Provala con il tuo menù. Decidi dopo.',
    testo: 'Attiva il tuo locale, oppure scrivici: te la mostriamo caricata con il tuo menù e i tuoi prezzi.',
    attiva: 'Attiva il tuo locale',
    dashboard: 'La mia dashboard',
    scrivici: 'Scrivici',
  },
}
