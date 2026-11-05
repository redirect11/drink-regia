# I temi dei locali nella regia: in licenza, e sempre elencati (REQ-FLOTTA-039)

Richiesta da tana-drink, 05/11/2026. Scritta dalla sessione di tana-drink,
da portare alla sessione della regia: la regia non la scrive tana-drink.

## La richiesta dell'utente

> «I temi esclusivi per la Tana dovrebbero essere anche visibili in regia,
> come se la Tana li avesse acquistati. […] La regia deve sempre elencare
> moduli e temi acquistati in app.» — «Deve essere sempre tutto
> sincronizzato.»

## Il problema, oggi

1. **La licenza che scrive la regia non ha `temi`.** In tana-drink uno
   stile «in licenza» (oggi «Notte», presto «Meraviglie», tutti e due solo
   della Tana) si accende solo se `licenza.temi` lo nomina
   (`src/lib/stileMenu.js`, REQ-LIC-010). La Tana oggi li ha perché la sua
   licenza la scrive il deploy da `clienti/tana/licenza-iniziale.json`
   (`"temi": ["notte"]`). `licenzaProtetta` in `functions/lib/licenza.js`
   non scrive `temi`, e `CHIAVI_PROTETTA` non lo confronta. **Il giorno in
   cui per la Tana si sceglie «La licenza la scrive la regia», i suoi temi
   spariscono** e il menù torna allo stile classico. Va fatto prima di quel
   passo (docs/la-tana-nella-regia.md di tana-drink, punto 6).
2. **Nessuna scheda di locale nel backoffice dice quali temi ha.** I
   moduli sì, dalla scelta del cliente; i temi né quelli in licenza né
   quelli installati.
3. **I temi e gli stili gratis installati dall'app** stanno solo nelle
   impostazioni del locale (`settings/bar`): la regia non li vede.

## Cosa serve nella regia

### 1. I temi del cliente, nella sua scheda e nella licenza

- Nel documento del cliente (`clienti/{uid}`), accanto a `moduli`, un
  campo **`temi`**: l'elenco degli id degli stili che il locale ha in
  licenza, esclusivi o acquistati (oggi tutti gratis: il catalogo a
  pagamento è REQ-LIC-011 di tana-drink, da fare).
- `licenzaProtetta` lo scrive in **`licenza.temi`**, e `CHIAVI_PROTETTA`
  lo confronta, così un cambio dei temi riscrive la licenza come un cambio
  di moduli.
- **Si mettono dal backoffice**, nella scheda del locale (l'admin; un tema
  esclusivo non si compra, lo assegna il fornitore), e dal modulo «Locale
  esistente», così la Tana entra nella regia **con i suoi temi già
  scritti**: `notte` e `meraviglie`.
- Gli id validi sono gli stili `inLicenza` di tana-drink (`STILI_MENU` in
  `src/lib/stileMenu.js`): oggi `notte`; a breve `meraviglie`. Un id che
  l'app non conosce l'app lo ignora (resta il classico), quindi si possono
  scrivere anche prima che l'app li abbia.

### 2. Moduli e temi, sempre elencati nella scheda del locale

Una sezione «Moduli e temi» nella scheda del locale del backoffice, con
tre elenchi:

| Cosa | Da dove | Esempio per la Tana |
|---|---|---|
| Moduli | la scelta del cliente e la licenza (c'è già) | menù ai tavoli, magazzino, fatture… |
| Temi in licenza | `clienti/{uid}.temi` (punto 1) | Notte, Meraviglie |
| Temi e stili installati dall'app | letti **dalle impostazioni del locale**, al momento | Lavagna, Déco; lo stile in uso adesso |

### 3. Quelli installati dall'app: la regia li legge dal locale

**La regia legge, l'app non comunica.** La fonte della verità di cosa un
locale ha installato è il suo `settings/bar`: leggerlo quando si apre la
scheda è sempre esatto, per costruzione, senza un protocollo di
sincronizzazione che può restare indietro (un tablet senza rete, una
modifica fatta dalla console). L'account delle Functions della regia ha
già `roles/datastore.user` su ogni progetto dei locali — serve a scrivere
`licenza/attuale` — quindi non servono permessi nuovi.

Si leggono, da `settings/bar` del progetto del locale, e **non si
salvano nella regia** (la regia non tiene dati operativi dei locali):

| Campo | Cosa |
|---|---|
| `stili_installati` | gli id degli stili gratis installati (REQ-MENU-022) |
| `temi_installati` | i temi del marketplace installati, ognuno con `id`, `nome`, `stile`, `tavolozza` (REQ-MENU-023) |
| `stile_menu` | lo stile in uso adesso |

Una Function callable per l'admin (per esempio `temiDelLocale(slug)`)
legge il documento con l'Admin SDK sul progetto dell'istanza e restituisce
i tre elenchi; il backoffice la chiama all'apertura della scheda. Se il
progetto non risponde, la scheda lo dice e mostra gli altri due elenchi.

## Cosa fa tana-drink, dal suo lato

- Lo stile «Meraviglie» per la Tana (`inLicenza`, coi suoi colori come
  tavolozza scelta col tema e cambiabile), e `meraviglie` nei temi di
  `clienti/tana/licenza-iniziale.json`.
- Nessuna chiamata nuova verso la regia: i campi del punto 3 ci sono già.

## Fatto nella regia (05/11/2026, ramo `feature/temi-in-licenza`)

Tutti e tre i punti, con due scelte da sapere:

- `temi` si pulisce (`temiPuliti` in `functions/lib/temi.js`: minuscolo,
  senza doppioni, in ordine, fino a 20 id) e **non dipende dal piano**: un
  esclusivo assegnato dal fornitore resta anche a chi torna al Free.
- `temiDelLocale` restituisce dei temi installati solo `id`, `nome` e
  `stile`, non la tavolozza: la scheda mostra i nomi, non i colori.

Prima di collegare la Tana alla regia: registrarla con «Notte» e
«Meraviglie» spuntati nel modulo «Locale esistente», o assegnarli dalla
scheda con «Temi…». Poi «La licenza la scrive la regia» non toglie niente.
