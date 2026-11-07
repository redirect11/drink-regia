// ── I TESTI DELLA PRIMA PAGINA, IN INGLESE (DESIGN.md §5 e §6) ────────
//
// Le stesse chiavi di home.it.js (un test le confronta). Inglese
// internazionale e semplice, senza modi di dire americani né giochi di
// parole, con le parole del glossario di DESIGN.md (conto = bill, comanda =
// order, cassa = till, terminale = device, magazzino = stock). I nomi e le
// descrizioni dei moduli sono tradotti qui, per id: il listino
// (functions/piani.json) resta in italiano e tiene solo i numeri. I nomi
// dei piani invece vengono dal listino, come in italiano: sono nomi propri
// del prodotto, e si cambiano in un posto solo.

import { PIANI } from '../lib/piani.js'

export default {
  meta: {
    titolo: 'Bar and restaurant management, born behind a bar',
    descrizione:
      'Orders, bills and till, QR menu, stock, statistics and staff in one app, written in the cocktail bar that uses it every night. Every venue has its own installation and its own data, and works even without a connection.',
  },
  barra: {
    principale: 'Main',
    menu: 'Menu',
    funzioni: 'Features',
    prezzi: 'Pricing',
    domande: 'FAQ',
    accedi: 'Log in',
    attiva: 'Get started',
    dashboard: 'Dashboard',
    backoffice: 'Back office',
    esci: 'Log out',
    lingua: 'Language',
  },
  piede: {
    descrizione: 'Written behind the bar of a cocktail bar, in service every night. Orders, till, menu, stock and staff, with one installation per venue.',
    prodotto: 'Product',
    account: 'Account',
    informazioni: 'Information',
    funzioni: 'Features',
    prezzi: 'Pricing',
    demo: 'Live demo',
    accedi: 'Log in',
    registrati: 'Register your venue',
    termini: 'Terms of service',
    privacy: 'Privacy',
    nota: 'Prices exclude VAT. Bills printed on the thermal printer are not fiscal receipts.',
    versione: 'Version',
    inItaliano: '(in Italian)',
  },
  avvisoLingua: {
    etichetta: 'Page language',
    testo: 'This page is also available in English.',
    vai: 'Read in English',
    resta: 'Stay on the Italian page',
  },
  soloItaliano: 'Sign-up, your account and the legal terms are in Italian for now.',
  anteprima: {
    occhiello: 'Management for bars and restaurants',
    titolo: 'The site opens soon.',
    testo: 'Drink is the management system for bars and restaurants born in a cocktail bar: orders, till, QR menu, stock, staff and statistics in a single app. We are getting the site ready: prices, sign-up and activation will be here.',
    contatto: 'To hear when it opens, or to see it before, write to',
    accedi: 'Sign in',
  },
  hero: {
    occhiello: 'Management for bars and restaurants, born in a cocktail bar',
    // Riscritti il 06/11/2026 insieme all'italiano (lì il perché).
    titolo: 'Written behind the bar. In service every night.',
    sottotitolo:
      'Orders, till, QR menu, stock, statistics and staff. The app was born in the cocktail bar that uses it every night, and grew on what service actually requires. Every venue has its own installation and its own data, and works even without a connection.',
    attiva: 'Get started',
    dashboard: 'My dashboard',
    demo: 'Try the live demo',
    nuovaScheda: '(opens in a new tab)',
    fatti: 'At a glance',
    da: 'From {prezzo} a month',
    free: 'Free plan to try it out',
    mensile: 'Monthly or yearly subscription',
    prova: '{giorni}-day trial',
    automatica: 'Automatic setup',
    concordata: 'Setup arranged with us',
  },
  problema: {
    titolo: 'What you see from behind the bar.',
    testo:
      'Orders on a pad, bills worked out aloud, a till that only keeps the total. Stock from memory, staff hours on a sheet, the night’s takings pieced together the next day. Each piece works on its own, and the whole picture lives in the head of whoever is behind the bar.',
    chiusa: 'The app was born behind the bar of a cocktail bar to put that picture on a tablet, and it works there every night.',
  },
  pilastri: {
    titolo: 'Three decisions made behind the bar',
    voci: [
      {
        titolo: 'Works even without a connection.',
        testo: 'Behind the bar a connection is never a given: orders, bills and payments stay on the tablet and service carries on; when the network returns, the changes go out on their own.',
      },
      {
        titolo: 'One installation per venue.',
        testo: 'A venue’s numbers belong to the venue. Yours has its own installation, with its own data and its own address, separate from everyone else’s: no one else sees your bills, your prices or your takings.',
      },
      {
        titolo: 'Built for service.',
        testo: 'Every screen was tried out with a full room and a tablet in hand, at the bar and on the floor: few steps, and nothing that slows service down.',
      },
    ],
  },
  funzioni: {
    occhiello: 'Features',
    titolo: 'From the first order to closing the till.',
    sotto: 'Every feature is there because it was needed behind the bar. Till, orders and receipts are in the starting plan; the rest are modules, and each feature says here which one it belongs to. Prices are further down.',
    nelPiano: 'Included in {piano}',
    modulo: '{nome} module',
    punti: 'What it includes',
    voci: {
      conti: {
        occhiello: 'Orders and bills',
        titolo: 'From the table to the bar, with nothing to call out.',
        testo: 'Take it at the table or at the bar: it arrives straight away and, if you choose, prints on its own. The bill already has everything on it and is settled in cash or by card; the courtesy bill prints on the thermal printer.',
        punti: ['Orders printed at the bar', 'Cash and card', 'Extra devices at {terminale} a month'],
      },
      menu: {
        occhiello: 'Digital menu and table ordering',
        titolo: 'A QR menu, and orders from the guest’s phone.',
        testo: 'Guests scan the QR code, see the menu with current prices, order and follow the status of their order. No app to download, and no paper menus to reprint when a price changes.',
        punti: ['Always up to date', 'Orders go straight to the bar', 'No app to download'],
      },
      magazzino: {
        occhiello: 'Stock',
        titolo: 'Stock is deducted on its own, from the recipes.',
        testo: 'Every order that is prepared deducts the ingredients of its recipe; when a stock level drops below its reorder threshold, the app flags it. Periodic stock counts and supplier invoices keep the figures aligned.',
        punti: ['Stock levels and reorder thresholds', 'Periodic stock counts', 'Supplier invoices'],
      },
      statistiche: {
        occhiello: 'Statistics',
        titolo: 'How much you took, at what time, on what.',
        testo: 'Takings by night and by period, sales by hour, results by category. Peak hours and the comparison with last week are already worked out, without a spreadsheet.',
        punti: ['Period comparisons', 'Peak hours', 'Results by category'],
      },
    },
    minori: {
      staff: 'Staff hours and pay, and calls to the staff, in the same system.',
      sumup: 'The bill goes to the SumUp reader and comes back paid.',
    },
  },
  passi: {
    titolo: 'From sign-up to the first order',
    voci: [
      { titolo: 'Register your venue.', testo: 'Name, billing details and a contact person, then confirm your email.' },
      { titolo: 'Choose your plan and modules.', testo: 'Start with {base} and add modules whenever you need them.' },
      {
        titolo: 'Open the till.',
        testo: 'Your installation is created automatically, at its own address. Log in from your tablet and start working.',
        concordata: 'We agree on payment and activate your installation, at its own address. Log in from your tablet and start working.',
      },
    ],
  },
  prezzi: {
    titolo: 'One monthly fee, and the modules you need.',
    sotto: 'Monthly or yearly subscription. Prices exclude VAT ({iva} Italian VAT), with the total including VAT alongside. One-off activation: {attivazione} ({lordo}).',
    prova: 'The first {giorni} days are a trial: the subscription fee starts when the trial ends.',
    alMese: '/ month',
    piuIvaAlMese: '+ VAT a month',
    piuIva: '{prezzo} + VAT',
    ivaInclusa: '{prezzo} incl. VAT',
    annuale: 'Paying a year in advance: {prezzo} ({lordo}), the price of {mesi} months.',
    fondatori: {
      titolo: 'Founders offer',
      testo: 'The first {posti} venues: {piani}; {attivazione}.',
      piano: '{nome} at {prezzo} a month ({lordo}) for {mesi} months from activation, then {listino} at list price',
      attivazioneGratuita: 'free activation',
      attivazione: 'activation at {prezzo}',
      regola: 'Places go to the first paid subscriptions activated, in order of activation. The full conditions are in the terms of service.',
    },
    ore: { uno: '{n} hour', piu: '{n} hours' },
    assistenza: 'Remote support is included up to {ore} a month; beyond that, by quote.',
    stampante:
      'Supported printers are networked Epson thermal printers. To connect a different printer we provide a written quote, to be accepted before any work starts.',
    piano: '{nome} plan',
    tuttoIncluso: 'Everything included',
    inizia: 'Start with {nome}',
    terminali: { uno: '{n} device', piu: '{n} devices' },
    piani: {
      free: {
        nome: PIANI.free.nome,
        descrizione:
          'To try the service: the till, up to {prodotti} items on the menu and {conti} open bills at a time, no orders and no modules. {terminali}.',
      },
      base: {
        nome: PIANI.base.nome,
        descrizione: 'To get started: till, orders, receipts on the printer, menu and offline mode. {terminali}.',
      },
      completo: {
        nome: PIANI.completo.nome,
        descrizione: 'Every module, from the digital menu to stock control, already included. {terminali}.',
      },
    },
    tabella: {
      titolo: 'The modules, one by one',
      didascalia: 'Price of each module on the {base} plan, and what the {completo} plan includes.',
      modulo: 'Module',
      cosaFa: 'What it does',
      sulBase: 'On {base}',
      nelCompleto: 'In {completo}',
      incluso: 'Included',
      nonIncluso: 'Not included',
      terminale: 'Extra device',
      terminaleTesto: 'Another tablet or phone on the same till, on top of those in the plan.',
      terminaliInclusi: { uno: '{n} included', piu: '{n} included' },
    },
    convenienza: '{base} with every module comes to {totale} a month; {completo} includes them all for {completo_prezzo}.',
    notaScontrino:
      'Receipts print on a thermal printer and are courtesy bills, not fiscal receipts. Italian venues still need their own registered fiscal till.',
  },
  moduli: {
    menu_tavoli: {
      nome: 'Digital menu and tables',
      descrizione: 'The menu on your guests’ phones, with a QR code on the table and the guest view in the app.',
    },
    ordini_cliente: {
      nome: 'Orders from guests’ phones',
      descrizione: 'Guests order from the digital menu and follow the status of their order. Requires the digital menu.',
    },
    clienti: {
      nome: 'Customer management',
      descrizione: 'Customer accounts, their orders, groups of bills.',
    },
    magazzino: {
      nome: 'Stock and suppliers',
      descrizione: 'Stock levels, automatic deduction from recipes, periodic stock counts, supplier orders and invoices.',
    },
    statistiche: {
      nome: 'Statistics and results',
      descrizione: 'Takings by night and period, sales by hour, results by main category.',
    },
    staff: {
      nome: 'Staff and hours',
      descrizione: 'Staff hours and pay, calls to the staff.',
    },
    sumup: {
      nome: 'Card payments with SumUp',
      descrizione: 'The bill goes to the card reader and comes back paid.',
    },
  },
  domande: {
    titolo: 'Frequently asked questions',
    voci: [
      [
        'Who can see my venue’s data?',
        'No other venue. Every venue has a separate installation with its own database. The data belongs to the venue, and we process it only to provide the service, as stated in the terms.',
      ],
      [
        'What if the internet goes down?',
        'The till keeps working. Bills, orders and payments stay on the device and sync automatically once you are back online. Payments with the SumUp reader, however, need a connection.',
      ],
      [
        'Are the receipts fiscal receipts?',
        'No. It is a courtesy bill on a thermal printer. In Italy, fiscal receipts still come from the venue’s registered till, which the app does not replace.',
      ],
      [
        'What do I need to get started?',
        'A tablet or phone with an up-to-date browser. For receipts, a networked Epson thermal printer; for cards, a SumUp reader.',
      ],
      [
        'Can I change plan or cancel?',
        'Yes. You request a change of plan from your account. The subscription, monthly or yearly, can be cancelled at any time: the service stays active until the end of the period already paid.',
      ],
      [
        'What happens to my data if I close my venue?',
        'When you close the installation from your account, the app stops straight away, and the data is deleted after 30 days; until then you can undo the closure. Before deletion we make a full backup, which you can download from your account for 180 days.',
      ],
      [
        'Who takes care of updates?',
        'We do. Updates reach your installation without you having to do anything, and without scheduled downtime.',
      ],
    ],
  },
  chiusura: {
    titolo: 'See it with your own menu and prices.',
    testo: 'Get your venue started, or write to us: we’ll show it to you loaded with your own menu and prices, and you decide afterwards.',
    attiva: 'Get started',
    dashboard: 'My dashboard',
    scrivici: 'Contact us',
  },
}
