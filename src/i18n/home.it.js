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
    testo: 'Lime è il gestionale per bar e ristoranti nato in un cocktail bar: comande, cassa, menù con QR, magazzino, personale e statistiche in un’app sola. Stiamo preparando il sito: prezzi, registrazione e attivazione arrivano qui.',
    contatto: 'Per sapere quando apre, o per vederlo prima, scrivici a',
    accedi: 'Area riservata',
  },
  hero: {
    occhiello: 'Gestionale per bar e ristoranti',
    // Riscritti il 07/11/2026 (l'utente: «nella parte iniziale non è chiaro
    // cosa vendiamo. Serve uno slogan facile e poche parole»): la categoria
    // nel titolo, il percorso del servizio nella seconda frase, una riga
    // sola sotto. Scelto fra tre proposte; quelli di prima in DESIGN.md §5.1.
    titolo: 'Il gestionale del tuo locale. Dalla comanda alla cassa.',
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
  // I cinque gesti del carosello (REQ-FLOTTA-061). Una parola e una frase
  // sola, corta: Daniele, sulla riga di prima di «Riordina» («Le giacenze
  // scendono da sole con le comande. Prima di aprire si vede cosa manca,
  // e l'ordine al fornitore parte da lì»): «quanto fa schifo questo
  // testo». Ogni frase dice una cosa che l'app fa, senza giri; «Conta» ne
  // ha una per modulo e si legge quella del primo in vendita.
  gesti: {
    titolo: 'Il lavoro del locale, in cinque gesti',
    carosello: 'carosello',
    voci: {
      sala: { parola: 'Ordina.', testo: 'La comanda parte dal tavolo e arriva subito al banco.' },
      banco: { parola: 'Prepara.', testo: 'Chi prepara vede cosa c’è da fare, in ordine.' },
      conto: { parola: 'Incassa.', testo: 'Il conto è già pronto: si incassa e si stampa.' },
      numeri: {
        parola: 'Conta.',
        frasi: {
          statistiche: 'L’incasso della serata è già fatto, senza rifare i conti.',
          staff: 'Le ore di chi ha lavorato sono già segnate.',
        },
      },
      scorta: { parola: 'Riordina.', testo: 'Sai cosa sta finendo prima che finisca.' },
    },
    precedente: 'Gesto precedente',
    successiva: 'Gesto successivo',
    vaiA: '{parola} Gesto {n} di {totale}',
    nota: 'I filmati di questa pagina sono dimostrativi, generati con l’intelligenza artificiale.',
    ferma: 'Ferma i filmati',
    riprendi: 'Fai ripartire i filmati',
  },
  funzioni: {
    occhiello: 'Funzioni',
    titolo: 'Dalla prima comanda alla chiusura di cassa.',
    // La prima frase è di Daniele (11/11/2026). Quella di prima, «Ogni
    // funzione è entrata perché serviva al banco», l'ha bocciata: «questa
    // cosa non si può leggere… devi usare questo tipo di frasi».
    sotto: 'Ogni funzione è frutto dell’esperienza dietro al banco. Cassa, comande e scontrino sono nel piano di partenza; il resto sono moduli, e ogni funzione dice qui a quale appartiene. I prezzi sono più sotto.',
    nelPiano: 'Nel piano {piano}',
    modulo: 'Modulo {nome}',
    punti: 'Cosa comprende',
    voci: {
      conti: {
        occhiello: 'Comande e conti',
        titolo: 'Dal tavolo al banco, senza passaggi a voce.',
        // La stampa automatica è una scelta del locale (tana-drink,
        // REQ-STAMPA-001); i terminali oltre quelli del piano (3 dal
        // 02/11/2026) si pagano a parte.
        testo: 'La prendi al tavolo o al banco: arriva subito e, se lo scegli, si stampa da sola. Il conto ha già tutto sopra e si chiude in contanti o con carta; lo scontrino di cortesia esce sulla stampante termica.',
        punti: ['Comanda stampata al banco', 'Contanti e carta', 'Altri terminali a {terminale} al mese'],
      },
      menu: {
        occhiello: 'Menù digitale e ordini dal tavolo',
        titolo: 'Il menù con un QR, l’ordine dal telefono del cliente.',
        testo: 'Il cliente inquadra il QR, vede il menù con i prezzi aggiornati, ordina e segue lo stato del suo ordine. Niente app da scaricare e niente menù di carta da ristampare quando cambi un prezzo.',
        punti: ['Menù sempre aggiornato', 'Ordini che arrivano dritti al banco', 'Nessuna app da scaricare'],
      },
      magazzino: {
        occhiello: 'Magazzino',
        // Si scarica quando la comanda è pronta, o alla riscossione se il
        // locale non segue gli stati (tana-drink, REQ-MAG-003); l'avviso è la
        // soglia di riordino del prodotto (REQ-MAG-006).
        titolo: 'Il magazzino si scarica da solo, dalle ricette.',
        testo: 'Ogni comanda preparata scarica gli ingredienti della sua ricetta; quando una giacenza scende sotto la soglia di riordino, l’app te lo segnala. L’inventario periodico e le fatture dei fornitori tengono i conti allineati.',
        punti: ['Giacenze e soglie di riordino', 'Inventario periodico', 'Fatture dei fornitori'],
      },
      statistiche: {
        occhiello: 'Statistiche',
        titolo: 'Quanto hai incassato, a che ora, con cosa.',
        testo: 'Incassi per serata e per periodo, venduto per fascia oraria, bilancio per categorie. Le ore di punta e il confronto con la settimana scorsa sono già calcolati, senza fogli Excel.',
        punti: ['Confronto tra periodi', 'Le ore di punta', 'Il bilancio per macro-categorie'],
      },
    },
    minori: {
      staff: 'Le ore e le paghe del personale, e le chiamate allo staff, nello stesso gestionale.',
      sumup: 'Il conto passa al lettore SumUp e torna già pagato.',
    },
  },
  passi: {
    titolo: 'Dalla registrazione alla prima comanda',
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
    sotto: 'Abbonamento mensile o annuale. Prezzi IVA esclusa (IVA al {iva}), con il totale IVA inclusa accanto. Attivazione una tantum: {attivazione} ({lordo}).',
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
      'Le stampanti supportate sono le termiche Epson in rete. Per collegare un’altra stampante facciamo un preventivo scritto, da accettare prima di cominciare il lavoro.',
    piano: 'Piano {nome}',
    tuttoIncluso: 'Tutto incluso',
    inizia: 'Inizia con {nome}',
    terminali: { uno: '{n} terminale', piu: '{n} terminali' },
    piani: {
      free: {
        nome: PIANI.free.nome,
        descrizione:
          'Per provare il servizio: la cassa, fino a {prodotti} prodotti nel menù e {conti} conti aperti insieme, senza comande e senza moduli. {terminali}.',
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
    tabella: {
      titolo: 'I moduli, uno per uno',
      didascalia: 'Prezzo di ogni modulo sul piano {base}, e cosa include il piano {completo}.',
      modulo: 'Modulo',
      cosaFa: 'Cosa fa',
      sulBase: 'Sul {base}',
      nelCompleto: 'Nel {completo}',
      incluso: 'Incluso',
      nonIncluso: 'Non incluso',
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
        'Un tablet o un telefono con un browser aggiornato. Per lo scontrino, una stampante termica Epson in rete; per le carte, un lettore SumUp.',
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
    titolo: 'Vedila con il tuo menù e i tuoi prezzi.',
    testo: 'Attiva il tuo locale, oppure scrivici: te la mostriamo caricata con il tuo menù e i tuoi prezzi, e decidi dopo.',
    attiva: 'Attiva il tuo locale',
    dashboard: 'La mia dashboard',
    scrivici: 'Scrivici',
  },
}
