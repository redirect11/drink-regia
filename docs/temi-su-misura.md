# I temi su misura: dal mockup di Canva, o fatti da noi (REQ-FLOTTA-040)

Scritto il 06/11/2026, ramo `feature/temi-su-misura`. Per chi lavora qui e
per tana-drink, che ha la sua parte (in fondo).

## La richiesta dell'utente

> «Stavamo pensando di aggiungere la possibilità di ricreare la pagina del
> menu e le sue sezioni utilizzando un output di Canva. Vorrei un servizio
> premium che mi consente di caricare un mockup di un tema fatto con Canva
> e, se il cassetto AI ha dei crediti, creare il tema da agganciare al menu
> e inserirlo tra i temi custom del gestore del bar. Altro servizio è la
> creazione da parte nostra di temi che possiamo fare ad hoc su richiesta.
> […] Dovremmo fare in modo che si possa scegliere tra varie strutture di
> menu (ad esempio tutto in una pagina, una pagina per categoria o una per
> macro categoria).»

## Le tre cose, in breve

1. **Il tema dal mockup** (servizio premium, col credito AI): il titolare
   carica dalla dashboard un'immagine o un PDF esportato da Canva, sceglie la
   struttura del menù e il modello ne ricava un tema; la regia lo controlla
   e lo mette fra i temi del locale.
2. **Il tema fatto da noi**: il titolare lo chiede dalla dashboard (una
   richiesta di contatto); l'admin lo scrive dalla scheda del locale, con
   la struttura del menù e, se serve, una ricetta.
3. **La struttura del menù**: una dimensione nuova della ricetta degli
   stili, `impaginazione`: `unica`, `per-categoria`, `per-macro-categoria`.

## Dove stanno i temi su misura

Un tema su misura è **di un locale**, non del catalogo di tutti:

- nella regia, in `clienti/{uid}/temi_su_misura/{id}`: lo legge il titolare
  (è suo) e l'admin; lo scrivono solo le Functions;
- nell'app, arriva con la licenza, in **`licenza.temi_su_misura`**: la regia
  la scrive già nel progetto del locale (`licenza/attuale`), e l'app la vede
  cambiare in tempo reale. Nessuna chiamata nuova, niente file in giro.

Il documento:

```json
{
  "id": "su-misura-mhz3k1a2",
  "nome": "Bosco",
  "descrizione": "Verde profondo e oro.",
  "prezzo": 0,
  "tavolozza": { "base": "tana-scuro", "colori": { "--bg": "#10201a", "…": "…" } },
  "stile": "deco",
  "ricetta": { "versione": 1, "caratteri": { "…": "…" }, "impaginazione": "per-categoria", "…": "…" },
  "origine": "mockup",
  "stato": "pubblicato",
  "da_verificare": ["Il carattere del mockup non c’è: usato Cormorant Garamond."],
  "mockup": { "media_type": "image/png", "struttura": "per-categoria", "costo_eur": 0.03 }
}
```

- **Un tema come gli altri** (`temaPulito`: una base della tavolozza, i
  colori, uno stile che l'app sa disegnare; mai un esclusivo) **più, se
  c'è, una ricetta sua** (`ricettaPulita` in `functions/lib/stili.js`, lo
  stesso vocabolario degli stili del repository). Un'app col motore delle
  ricette disegna la ricetta; una senza usa lo stile. Così un tema dal
  mockup si vede anche prima che il motore arrivi nell'app.
- `origine`: `mockup` (il modello) o `fornitore` (noi).
- `stato`: bozza, pubblicato, ritirato, come nel catalogo. Nella licenza
  vanno solo i pubblicati e ancora validi.
- Il mockup **non si conserva**: nel documento restano il tipo del file, la
  struttura scelta e il costo.

Nella licenza (`temiSuMisuraPerLicenza`): `{ id, nome, descrizione, prezzo,
tavolozza, stile, ricetta? }`, lo stesso oggetto del catalogo più la
ricetta intera (coi valori che non diceva, riempiti dalla regia), in ordine
di nome; `[]` se il locale non ne ha. `CHIAVI_PROTETTA` la confronta: un
tema nuovo, ritirato o ritoccato riscrive la licenza.

## 1. Il tema dal mockup

Nella dashboard, riquadro «Temi su misura → Dal tuo mockup» (con l'app
attiva): il file (JPEG, PNG, WebP fino a 5 MB; PDF fino a 20 MB), la
struttura del menù, una nota facoltativa. Poi `temaDaMockup` (callable, col
proprio account, email confermata):

1. **Il credito**: la stessa strada di `richiestaAI` (`interrogaClaude` in
   `functions/index.js`): il caso peggiore deve stare nel credito e nel
   tetto del cassetto AI del locale (`ai/{slug}`); senza cassetto, spento o
   finito si ferma con `resource-exhausted` e il perché.
2. **La chiamata**: la richiesta `tema` di `functions/lib/ai.js`, col
   mockup prima del testo, istruzioni fisse nel sistema e **uno schema che
   chiude ogni scelta** sui valori dell'app: le basi, gli stili non
   esclusivi (`stile_vicino`), i diciotto caratteri, il vocabolario della
   ricetta, i sette colori obbligatori. La struttura non è nello schema: la
   sceglie il titolare, la mette la regia. Sforzo medio, 8000 token.
3. **L'addebito**: il costo vero dalla usage, col cambio e il ricarico del
   listino, e la riga nei consumi (tipo «tema», mai il contenuto).
4. **Il controllo**: `temaDalMockup` passa la proposta dalle stesse regole
   di ogni tema e vuole che si legga (contrasto WCAG: 4,5 fra testo e
   sfondo e fra testo e card; 3 fra testo attenuato e sfondo e fra accento
   e sfondo). Se non regge, il tema non si scrive e **il tentativo resta
   addebitato**: la dashboard lo dice, col costo.
5. **La scrittura**: il tema nasce già **pubblicato** (l'utente: «creare il
   tema … e inserirlo tra i temi custom»), con le note `da_verificare` del
   modello (quello che l'app non può riprodurre: animazioni, immagini, un
   carattere che non c'è), e la licenza si riscrive. Il titolare lo vede
   nel riquadro, con l'anteprima, e nel marketplace dell'app; da lì lo
   prova e lo usa come ogni tema; dalla dashboard lo toglie («Rimuovi») e
   lo rimette.

Da un'installazione (`richiestaAI`, con la chiave del locale) «tema» non si
chiede: `TIPI_INSTALLAZIONE` resta descrizione e fattura. Il giorno che
l'app vorrà offrire il mockup dal suo marketplace, si apre lì.

**Il prezzo.** Oggi un tema dal mockup costa quello che costa al modello
(qualche centesimo, col ricarico del listino `functions/piani.json → ai`).
Un prezzo fisso per tema, da aggiungere all'addebito, è una decisione
dell'utente: si scriverebbe nel listino e si scalerebbe dallo stesso
cassetto.

## 2. Il tema fatto da noi

Nella dashboard, «Temi su misura → Fatto da noi»: il racconto del tema
(almeno dieci caratteri, fino a 500), la struttura del menù, un riferimento
(il link a Canva, un sito). `chiediTemaSuMisura` scrive una richiesta di
contatto (REQ-FLOTTA-017) in `contatti/<uid>_tema`, senza passare dai
pagamenti online: il costo si concorda. L'admin la trova in «Richieste» (con
la struttura e il riferimento) e la lavora dalla scheda del locale, «Moduli
e temi → Nuovo tema su misura…»: l'editor del catalogo con in più la
**struttura del menù** e la **ricetta scritta come JSON** (facoltativa: senza,
il tema usa lo stile scelto). Salva in bozza, salva e pubblica, ritira;
`gestisciTemiSuMisura` con `slug` scrive nella sottoraccolta del cliente e
riscrive la licenza. Un agente può scrivere la ricetta come per gli stili
del repository (`functions/temi/stili.json`).

Il titolare, dalla dashboard, **toglie e rimette** i suoi temi (ritira e
pubblica) ma non li scrive: `gestisciTemiSuMisura` senza admin accetta solo
quelle due azioni.

## 3. La struttura del menù

`impaginazione` nella ricetta (`functions/lib/stili.js`, `VALORI`):

| Valore | Cosa |
|---|---|
| `unica` | il menù di sempre, tutto in una pagina (il valore se la ricetta non lo dice) |
| `per-categoria` | una pagina per sezione del menù dei clienti, con le schede per passare |
| `per-macro-categoria` | una pagina per gruppo di sezioni; i gruppi li scrive il locale nella struttura del menù (tana-drink) |

La sceglie chi fa il tema: il titolare per il mockup, l'admin nell'editor.
Gli stili del repository non la dicono e valgono `unica`.

## Cosa serve in tana-drink

Scritto nel suo repository lo stesso giorno (requisito `todo` e
`docs/temi-su-misura.md`):

1. **`licenza.temi_su_misura` nel marketplace**: una sezione «I tuoi temi»
   coi temi della licenza, letti da `licenzaDi(settings)` come `temi`; si
   provano, si installano e si usano come quelli del catalogo (`leggiTema`
   li accetta già: stessa forma). Un tema con `ricetta` si disegna col
   motore degli stili a ricetta (`feature/stili-a-ricetta`), registrando
   uno stile con l'id del tema; senza motore, o senza ricetta, lo stile.
   Un tema che sparisce dalla licenza resta installato (ha la copia), ma
   non si reinstalla.
2. **`impaginazione` nel motore delle ricette**: `unica` com'è;
   `per-categoria` le sezioni come pagine con le schede fisse in alto (la
   forma di REQ-MENU-025 con la struttura personalizzata); e
   `per-macro-categoria`.
3. **Le macro categorie nella struttura del menù dei clienti**
   (REQ-MENU-025, e l'idea di REQ-MENU-029): un livello sopra le sezioni,
   `carta_sezioni.gruppo` (nome e ordine), scritto dall'editor; senza
   gruppi `per-macro-categoria` si disegna come `per-categoria`.
4. Niente da chiamare verso la regia: tutto arriva con la licenza.

## Come si prova

Sul test (`drink-regia-test`), con un locale attivo e un cassetto AI
carico (dal backoffice, «Ricarica a mano»): dalla dashboard, «Temi su
misura», un PNG esportato da Canva, una struttura, «Crea il tema col
credito AI». Il tema compare nel riquadro con l'anteprima e le note, nei
consumi del credito come «Tema dal mockup», e in
`licenza/attuale.temi_su_misura` nel progetto del locale. Dalla scheda del
locale nel backoffice: «Nuovo tema su misura…», una ricetta JSON, «Salva e
pubblica»; poi «Ritira». Gli script e le prove non vanno in produzione.
