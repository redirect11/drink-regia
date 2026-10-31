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
    titolo: 'Comande, conti e cassa per bar e ristoranti',
    descrizione:
      'Comande, conti, cassa, menù digitale e magazzino in un’unica app. Funziona anche senza rete, e ogni locale ha la sua installazione e i suoi dati.',
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
    descrizione: 'Un’installazione per ogni locale. I dati restano suoi.',
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
    occhiello: 'Comande, conti e cassa per bar e ristoranti',
    // DESIGN.md §5.1, titolo A (consigliato): la scena che ogni titolare ha
    // vissuto, e il punto che nessun concorrente in abbonamento promette.
    titolo: 'La serata non si ferma. Nemmeno quando cade il Wi-Fi.',
    sottotitolo:
      'Comande, conti, cassa, menù digitale e magazzino in un’unica app pensata per il servizio, al banco e in sala. Ogni locale ha la sua installazione e i suoi dati, separati da tutti gli altri.',
    attiva: 'Attiva il tuo locale',
    dashboard: 'La mia dashboard',
    demo: 'Prova la demo',
    nuovaScheda: '(si apre in una nuova scheda)',
    fatti: 'In breve',
    da: 'Da {prezzo} al mese',
    free: 'Piano Free per provare',
    mensile: 'Abbonamento mensile',
    // L'attivazione è automatica solo se si paga online o si parte dal Free;
    // con i pagamenti online spenti (come in produzione all'avvio) la
    // richiesta passa da noi (REQ-FLOTTA-017). Home sceglie la frase giusta.
    automatica: 'Attivazione automatica',
    concordata: 'Attivazione concordata con noi',
  },
  problema: {
    titolo: 'Venerdì sera, locale pieno.',
    testo:
      'La rete salta e la cassa si blocca. Una comanda si perde tra la sala e il banco. A fine serata nessuno sa quante bottiglie sono uscite davvero.',
    // Neutro finché l'utente non decide se nominare il locale dove l'app è
    // nata (DESIGN.md §9.3).
    chiusa: 'L’app è nata al banco di un cocktail bar, proprio per serate così.',
  },
  pilastri: {
    titolo: 'Su cosa puoi contare',
    voci: [
      {
        // «Non si ferma mai» prometteva più dei Termini («senza garanzia di
        // continuità assoluta», Legali.jsx §5). Si dice quello che l'app fa
        // davvero (tana-drink, REQ-OFFLINE-001 e 006): le scritture restano
        // sul dispositivo e partono al ritorno della rete.
        titolo: 'Lavora anche senza rete.',
        testo: 'Comande, conti e incassi continuano quando la rete cade: le modifiche restano sul dispositivo e partono da sole appena la connessione torna.',
      },
      {
        titolo: 'I tuoi dati sono solo tuoi.',
        testo: 'Ogni locale ha la sua installazione, il suo database e il suo indirizzo. Nessun altro locale li vede.',
      },
      {
        titolo: 'Fatta per il servizio.',
        testo: 'Nata al banco di un cocktail bar, pensata per lavorare in fretta con il locale pieno, al banco e in sala.',
      },
    ],
  },
  funzioni: {
    occhiello: 'Funzioni',
    titolo: 'Tutto il servizio, in un’app sola',
    sotto: 'Ogni funzione nasce da una serata vera. Quelle che stanno in un modulo lo dicono: il prezzo lo trovi più sotto.',
    nelPiano: 'Nel piano {piano}',
    modulo: 'Modulo {nome}',
    punti: 'Cosa comprende',
    voci: {
      conti: {
        occhiello: 'Conti e comande',
        titolo: 'Dalla comanda al conto, senza passaggi in più.',
        // La stampa automatica è una scelta del locale (tana-drink,
        // REQ-STAMPA-001); il Base ha un terminale, gli altri si pagano a parte.
        testo: 'La comanda arriva al banco e, se lo scegli, si stampa da sola; il conto si chiude in contanti o con carta.',
        punti: ['Comanda stampata al banco', 'Contanti e carta', 'Altri terminali a {terminale} al mese'],
      },
      menu: {
        occhiello: 'Menù digitale e ordini dal tavolo',
        titolo: 'Il menù sul telefono del cliente.',
        testo: 'Il QR sul tavolo apre il menù con i prezzi; il cliente ordina e segue lo stato del suo ordine.',
        punti: ['Menù sempre aggiornato', 'Ordini che arrivano dritti al banco', 'Nessuna app da scaricare'],
      },
      magazzino: {
        occhiello: 'Magazzino',
        // Si scarica quando la comanda è pronta, o alla riscossione se il
        // locale non segue gli stati (tana-drink, REQ-MAG-003); l'avviso è la
        // soglia di riordino del prodotto (REQ-MAG-006).
        titolo: 'Il magazzino segue le comande.',
        testo: 'Ogni comanda preparata scarica gli ingredienti della sua ricetta, e la soglia di riordino ti dice cosa sta finendo.',
        punti: ['Giacenze e soglie di riordino', 'Inventario periodico', 'Fatture dei fornitori'],
      },
      statistiche: {
        occhiello: 'Statistiche',
        titolo: 'I numeri della serata, chiari.',
        testo: 'Incassi per serata e periodo, venduto per fascia oraria, bilancio per categorie.',
        punti: ['Confronto tra periodi', 'Le ore di punta', 'Il bilancio per macro-categorie'],
      },
    },
    minori: {
      staff: 'Ore e paghe del personale, e le chiamate allo staff.',
      sumup: 'Il conto va al lettore SumUp e torna pagato da solo.',
    },
  },
  passi: {
    titolo: 'Come si comincia',
    voci: [
      { titolo: 'Registra il locale.', testo: 'Nome, dati di fatturazione e un referente, poi la conferma dell’email.' },
      { titolo: 'Scegli il piano.', testo: 'Parti dal {base} e aggiungi i moduli quando ti servono, anche dopo.' },
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
    titolo: 'Un piano al mese, e i moduli che scegli.',
    sotto: 'Abbonamento mensile, IVA esclusa. Attivazione una tantum: {attivazione}.',
    alMese: '/ mese',
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
    convenienza: 'Il {base} con tutti i moduli costa {totale} al mese; il {completo} li include tutti a {completo_prezzo}, con {terminali}.',
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
        'Sì. Il cambio di piano si chiede dalla tua pagina. L’abbonamento è mensile e si disdice in qualunque momento: il servizio resta attivo fino alla fine del periodo già pagato.',
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
    titolo: 'Pronto per il prossimo venerdì sera?',
    testo: 'Attiva il tuo locale, oppure scrivici e te lo mostriamo con il tuo menù.',
    attiva: 'Attiva il tuo locale',
    dashboard: 'La mia dashboard',
    scrivici: 'Scrivici',
  },
}
