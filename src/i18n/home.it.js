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
    titolo: 'Cassa e comande per bar e ristoranti, anche senza rete',
    descrizione:
      'Comande, conti, cassa, menù con QR e magazzino in un’app sola. Lavora anche senza rete, e ogni locale ha la sua installazione e i suoi dati.',
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
    descrizione: 'Nata al banco di un cocktail bar. Un’installazione per ogni locale, e i dati restano suoi.',
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
  hero: {
    occhiello: 'Cassa, comande e magazzino per bar e ristoranti',
    // Riscritti il 06/11/2026 (l'utente: «gli slogan sono orribili… qualcosa
    // di più accattivante»), con una linea sola: il venerdì sera non aspetta
    // nessuno. Il titolo è la scena che ogni titolare ha vissuto, con la
    // svolta in oro; «non se n'è accorta» è una figura che il sottotitolo
    // rende letterale (il lavoro continua, le modifiche partono al ritorno
    // della rete). Alternative scartate in DESIGN.md §5.1.
    titolo: 'È caduto il Wi-Fi. La cassa non se n’è accorta.',
    sottotitolo:
      'Comande, conti, cassa, menù con QR e magazzino in un’unica app, pensata per il banco e la sala. Ogni locale ha la sua installazione e i suoi dati: nessun altro li vede, e quando la rete cade il lavoro continua.',
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
  problema: {
    titolo: 'Il venerdì sera non aspetta nessuno.',
    testo:
      'Non aspetta che torni la rete, con la cassa ferma. Non aspetta la comanda rimasta tra la sala e il banco. E a fine serata nessuno sa quante bottiglie sono uscite davvero.',
    // Neutro finché l'utente non decide se nominare il locale dove l'app è
    // nata (DESIGN.md §9.3).
    chiusa: 'È per serate così che l’app è nata, al banco di un cocktail bar.',
  },
  pilastri: {
    titolo: 'Tre cose che reggono a locale pieno',
    voci: [
      {
        // «Non si ferma mai» prometteva più dei Termini («senza garanzia di
        // continuità assoluta», Legali.jsx §5). Si dice quello che l'app fa
        // davvero (tana-drink, REQ-OFFLINE-001 e 006): le scritture restano
        // sul dispositivo e partono al ritorno della rete.
        titolo: 'La rete cade. Il servizio no.',
        testo: 'Comande, conti e incassi restano sul tablet e vanno avanti; appena la connessione torna, le modifiche partono da sole.',
      },
      {
        titolo: 'Un’installazione per locale. La tua.',
        testo: 'Il tuo locale ha il suo database e il suo indirizzo, separati da tutti gli altri. Nessun altro locale vede i tuoi conti, i tuoi prezzi, i tuoi numeri.',
      },
      {
        titolo: 'Nata al banco, non in un ufficio.',
        testo: 'È nata e lavora al banco di un cocktail bar vero, con il locale pieno: ogni schermata è fatta per andare in fretta, al banco e in sala.',
      },
    ],
  },
  funzioni: {
    occhiello: 'Funzioni',
    titolo: 'Dalla prima comanda alla chiusura di cassa.',
    sotto: 'Ogni funzione è nata da un bisogno vero al banco. Quelle che stanno in un modulo lo dicono qui; il prezzo lo trovi più sotto.',
    nelPiano: 'Nel piano {piano}',
    modulo: 'Modulo {nome}',
    punti: 'Cosa comprende',
    voci: {
      conti: {
        occhiello: 'Comande e conti',
        titolo: 'La comanda arriva al banco prima di te.',
        // La stampa automatica è una scelta del locale (tana-drink,
        // REQ-STAMPA-001); i terminali oltre quelli del piano (3 dal
        // 02/11/2026) si pagano a parte.
        testo: 'La prendi al tavolo o al banco: arriva subito e, se lo scegli, si stampa da sola. Il conto ha già tutto sopra e si chiude in contanti o con carta.',
        punti: ['Comanda stampata al banco', 'Contanti e carta', 'Altri terminali a {terminale} al mese'],
      },
      menu: {
        occhiello: 'Menù digitale e ordini dal tavolo',
        titolo: 'Il QR sul tavolo, il menù nel telefono, l’ordine al banco.',
        testo: 'Il cliente apre il menù con i prezzi, ordina e segue lo stato del suo ordine. Niente app da scaricare, niente menù di carta da ristampare quando cambi un prezzo.',
        punti: ['Menù sempre aggiornato', 'Ordini che arrivano dritti al banco', 'Nessuna app da scaricare'],
      },
      magazzino: {
        occhiello: 'Magazzino',
        // Si scarica quando la comanda è pronta, o alla riscossione se il
        // locale non segue gli stati (tana-drink, REQ-MAG-003); l'avviso è la
        // soglia di riordino del prodotto (REQ-MAG-006).
        titolo: 'Sai cosa sta finendo prima che finisca.',
        testo: 'Ogni comanda preparata scarica gli ingredienti della sua ricetta; quando una giacenza scende sotto la soglia, l’app te lo dice. L’inventario periodico e le fatture dei fornitori chiudono il cerchio.',
        punti: ['Giacenze e soglie di riordino', 'Inventario periodico', 'Fatture dei fornitori'],
      },
      statistiche: {
        occhiello: 'Statistiche',
        titolo: 'La serata in numeri, prima di chiudere.',
        testo: 'Incassi per serata e per periodo, venduto per fascia oraria, bilancio per categorie: vedi le ore di punta e il confronto con la settimana scorsa senza fogli Excel.',
        punti: ['Confronto tra periodi', 'Le ore di punta', 'Il bilancio per macro-categorie'],
      },
    },
    minori: {
      staff: 'Le ore e le paghe del personale, e le chiamate allo staff, in un posto solo.',
      sumup: 'Il conto passa al lettore SumUp e torna indietro già pagato.',
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
    titolo: 'Un piano, i moduli che ti servono, e il prezzo tutto scritto qui.',
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
        descrizione: 'Per partire: cassa, comande, scontrino sulla stampante, menù e lavoro senza rete. {terminali}.',
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
    titolo: 'Il prossimo venerdì sera arriva comunque.',
    testo: 'Attiva il tuo locale, oppure scrivici: te lo mostriamo con il tuo menù e i tuoi prezzi, e decidi dopo.',
    attiva: 'Attiva il tuo locale',
    dashboard: 'La mia dashboard',
    scrivici: 'Scrivici',
  },
}
