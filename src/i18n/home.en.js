// ── I TESTI DELLA PRIMA PAGINA, IN INGLESE (DESIGN.md §5 e §6) ────────
//
// Le stesse chiavi di home.it.js (un test le confronta). Inglese
// internazionale e semplice, senza modi di dire americani né giochi di
// parole, con le parole del glossario di DESIGN.md (conto = bill, comanda =
// order, cassa = till, terminale = device, magazzino = stock). I nomi e le
// descrizioni dei moduli sono tradotti qui, per id: il listino
// (functions/piani.json) resta in italiano e tiene solo i numeri.

export default {
  meta: {
    titolo: 'Orders, bills and till for bars and restaurants',
    descrizione:
      'Orders, bills, till, a digital menu and stock control in one app. It works without a connection, and every venue has its own installation and its own data.',
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
    descrizione: 'One installation per venue. The data stays with the venue.',
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
  hero: {
    occhiello: 'Orders, bills and till for bars and restaurants',
    titolo: 'The night keeps going. Even when the Wi-Fi doesn’t.',
    sottotitolo:
      'Orders, bills, till, a digital menu and stock control in one app built for service, at the bar and on the floor. Every venue gets its own installation and its own data, kept apart from everyone else’s.',
    attiva: 'Get started',
    dashboard: 'My dashboard',
    demo: 'Try the live demo',
    nuovaScheda: '(opens in a new tab)',
    fatti: 'At a glance',
    da: 'From {prezzo} a month',
    free: 'Free plan to try it out',
    mensile: 'Monthly subscription',
    automatica: 'Automatic setup',
  },
  problema: {
    titolo: 'Friday night, a full house.',
    testo:
      'The network drops and the till freezes. An order gets lost between the tables and the bar. At closing time nobody knows how many bottles actually went out.',
    chiusa: 'We lived it behind our own bar. That’s why we built it this way.',
  },
  pilastri: {
    titolo: 'What you can count on',
    voci: [
      {
        titolo: 'It never stops.',
        testo: 'Bills, orders and payments carry on without a connection. When it comes back, everything syncs on its own.',
      },
      {
        titolo: 'Your data stays yours.',
        testo: 'Every venue has its own installation, its own database and its own address. No other venue can see it.',
      },
      {
        titolo: 'Built for service.',
        testo: 'Born behind a cocktail bar, designed for working fast on a full night, at the bar and on the floor.',
      },
    ],
  },
  funzioni: {
    occhiello: 'Features',
    titolo: 'Your whole service, in one app',
    sotto: 'Every feature comes from a real night of service. Those that belong to a module say so, and you will find the price below.',
    nelPiano: 'Included in {piano}',
    modulo: '{nome} module',
    punti: 'What it includes',
    voci: {
      conti: {
        occhiello: 'Bills and orders',
        titolo: 'From order to bill, with no extra steps.',
        testo: 'Orders reach the bar and print on their own; bills are settled in cash or by card.',
        punti: ['Orders printed at the bar', 'Cash and card', 'Several devices on the same till'],
      },
      menu: {
        occhiello: 'Digital menu and table ordering',
        titolo: 'Your menu on your guests’ phones.',
        testo: 'A QR code on the table opens the menu with prices; guests order and follow the status of their order.',
        punti: ['Always up to date', 'Orders go straight to the bar', 'No app to download'],
      },
      magazzino: {
        occhiello: 'Stock',
        titolo: 'Stock updates with every sale.',
        testo: 'Each sale deducts the recipe’s ingredients, so you know what is running low before it runs out.',
        punti: ['Stock levels and minimums', 'Periodic stock counts', 'Supplier invoices'],
      },
      statistiche: {
        occhiello: 'Statistics',
        titolo: 'Your night in clear numbers.',
        testo: 'Takings by night and period, sales by hour, a breakdown by category.',
        punti: ['Period comparisons', 'Peak hours', 'Results by category'],
      },
    },
    minori: {
      staff: 'Staff hours and pay, and calls to the staff.',
      sumup: 'The bill goes to the SumUp reader and comes back paid.',
    },
  },
  passi: {
    titolo: 'How to get started',
    voci: [
      { titolo: 'Register your venue.', testo: 'Name, billing details and a contact person. Five minutes.' },
      { titolo: 'Choose your plan.', testo: 'Start with {base} and add modules whenever you need them.' },
      {
        titolo: 'Open the till.',
        testo: 'Your installation is created automatically, at its own address. Log in from your tablet and start working.',
      },
    ],
  },
  prezzi: {
    titolo: 'Simple pricing. Pay only for what you use.',
    sotto: 'Monthly subscription, VAT excluded. One-off activation: {attivazione}.',
    alMese: '/ month',
    piano: '{nome} plan',
    tuttoIncluso: 'Everything included',
    inizia: 'Start with {nome}',
    terminali: { uno: '{n} device', piu: '{n} devices' },
    piani: {
      free: {
        nome: 'Free',
        descrizione:
          'To try the service: till and orders, up to {prodotti} items on the menu and {conti} open bills at a time, no modules. {terminali}.',
      },
      base: {
        nome: 'Base',
        descrizione: 'To get started: till, orders, receipts on the printer, menu and offline mode. {terminali}.',
      },
      completo: {
        nome: 'Complete',
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
    convenienza: '{base} with every module comes to {totale} a month; {completo} includes them all for {completo_prezzo}, with {terminali}.',
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
        'Is my data safe?',
        'Yes. Every venue has a separate installation with its own database, and no other venue can see it. We only access it for maintenance and updates, as stated in the terms.',
      ],
      [
        'What if the internet goes down?',
        'The till keeps working. Bills, orders and payments stay on the device and sync automatically once you are back online.',
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
        'Yes, from your account, at any time: it is a monthly subscription. After cancelling, your data stays available for the period set out in the terms.',
      ],
      [
        'Who takes care of updates?',
        'We do. The app keeps improving, and updates reach your installation without you having to do anything.',
      ],
    ],
  },
  chiusura: {
    titolo: 'Ready for next Friday night?',
    testo: 'Get your venue started, or write to us and we will show it to you with your own menu.',
    attiva: 'Get started',
    dashboard: 'My dashboard',
    scrivici: 'Contact us',
  },
}
