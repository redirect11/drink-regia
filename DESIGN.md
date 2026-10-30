# DESIGN.md — la home della regia

Come deve essere la prima pagina del sito del prodotto
(`src/pages/Home.jsx`, REQ-FLOTTA-002): cosa dice, in che ordine, con che
parole, con che aspetto, in italiano e in inglese. Chi la tocca — persona
o agente — segue questo file. I valori operativi (colori, misure) vivono
in `src/index.css`; se cambiano lì, si aggiornano qui nello stesso commit.

Nasce il 29/10/2026 dalla richiesta dell'utente: «la home dovrebbe essere
più moderna… una roba fatta bene e con slogan migliori. Non segue nessuna
regola di marketing e le info nei box sembrano scritte da un bambino di 8
anni. E poi vorrei che fosse sia in inglese che in italiano».

Il gestionale dei locali ha il suo `DESIGN.md` in tana-drink: lì le regole
sono per chi lavora al banco. Questa pagina è una **vetrina**: parla a chi
decide se comprare.

---

## 1. Cosa non va oggi

- **Il titolo è il nome del prodotto.** «Drink» non dice niente a chi non
  lo conosce; il messaggio vero sta in una riga più piccola, sotto.
- **Le card descrivono il software, non il vantaggio.** «Si apre un conto,
  si aggiungono i drink, si incassa» racconta un'azione ovvia e non dice
  perché dovrebbe importare. Il tono è elementare, da istruzioni.
- **Nessun ordine persuasivo.** Le sezioni sono un elenco (funzioni, come
  funziona, prezzi, domande) invece di un percorso: problema → promessa
  → prove → prezzo → dubbi → azione.
- **Il punto più forte è nascosto.** Che ogni locale abbia la sua
  installazione e che la cassa lavori senza rete sono le due cose che
  nessun concorrente in abbonamento dice: oggi stanno in tre etichette
  grigie e in una domanda frequente.
- **Un solo blocco di testo grigio dopo l'altro.** Niente immagini
  dell'app, niente numeri, niente ritmo visivo.

## 2. Il registro: persuasivo, non da venditore

`CLAUDE.md` vuole «niente toni da venditore nemmeno nella pagina dei
prezzi». Non è in conflitto con il marketing: è una regola su **come** si
convince. Si convince con fatti specifici, non con aggettivi.

**Sì:**
- benefici concreti, in una frase, con il dettaglio che li rende veri;
- numeri veri (prezzi, terminali, tempi) presi dal codice, mai inventati;
- la frase del titolare, non quella dello sviluppatore («il Wi-Fi cade a
  mezzanotte», non «sincronizzazione offline-first»);
- frasi brevi, verbi attivi, seconda persona singolare (tu / you);
- un'azione principale per schermata.

**No:**
- superlativi non dimostrabili: «il migliore», «rivoluzionario»,
  «definitivo», «n. 1»;
- urgenza finta: «solo per oggi», «ultimi posti», conti alla rovescia;
- recensioni, loghi di clienti o numeri di locali che non esistono;
- punti esclamativi, maiuscole urlate, emoji;
- promesse che il prodotto non mantiene: lo scontrino **non è fiscale**,
  e la pagina lo dice chiaramente.

La prova vera che abbiamo oggi è una sola, e va usata: l'app è nata e
lavora ogni sera al banco di un cocktail bar vero. Se citarlo per nome
lo decide l'utente (§9).

## 3. Per chi è, e cosa promettiamo

**Chi legge:** il titolare o il gestore di un locale della ristorazione —
un bar, un cocktail bar, un ristorante, una pizzeria —, con 1–3
postazioni. L'utente, 30/10/2026: il prodotto prende le comande e tiene
conti e cassa nella ristorazione in generale, non è solo per bar (e non è
un POS: lo scontrino fiscale resta del registratore del locale). Oggi usa un registratore di cassa,
un gestionale generico, carta e fogli Excel. Decide da solo o con un
socio, spesso dal telefono, tra un servizio e l'altro.

**Cosa lo preoccupa:** la serata piena e la cassa che si blocca; le
comande che si perdono; non sapere quanto costa davvero un drink; il
magazzino tenuto a mente; i dati del locale in mano a qualcun altro.

**La promessa, in una riga:** *la cassa e il gestionale del tuo locale,
che non si fermano nemmeno quando il Wi-Fi cade, e che sono solo tuoi.*

**I tre pilastri** (tutta la pagina si appoggia qui):

| Pilastro | Cosa vuol dire | La prova |
|---|---|---|
| Non si ferma | conti, comande e incassi continuano senza rete | è la prima regola dell'app; si sincronizza da sola al ritorno della rete |
| È tuo | ogni locale ha un'installazione separata, con il suo database e il suo indirizzo | un progetto per locale, isolato (docs/flotta-nella-regia.md) |
| Pensato per il servizio | comanda al banco, scontrino sulla stampante, magazzino che si scala dalle ricette | nato al banco di un cocktail bar |

## 4. L'aspetto

### Atmosfera

Moderno, scuro, caldo. Il riferimento è un bar di sera ben illuminato,
non un'app da ufficio. Si mantiene il tema della regia (sfondo quasi
nero, accento oro), ma con più aria, contrasti più netti, titoli più
grandi e immagini dell'app vera.

### Colori

Si parte dai token di `src/index.css`; se ne aggiungono due.

| Token | Valore | Ruolo |
|---|---|---|
| `--bg` | `#0e0e15` | sfondo della pagina |
| `--bg-2` | `#171724` | card, sezioni alternate |
| `--bg-3` | `#1f1f30` | superfici sopra le card |
| `--text` | `#ececf3` | testo |
| `--muted` | `#9b9ba8` | testo secondario (mai per informazioni critiche) |
| `--line` | `rgba(255,255,255,.1)` | bordi |
| `--accent` | `#e3b23c` | azione principale, evidenze |
| `--accent-soft` | `rgba(227,178,60,.14)` | aloni, sfondi di evidenza |
| `--accent-2` (nuovo) | `#f0c96b` | testo oro su sfondo scuro (contrasto ≥ 4,5:1) |
| `--ok` (nuovo) | `#5fd3a1` | spunte e conferme nella tabella dei piani |

Contrasto: 4,5:1 per il testo normale, 3:1 per il testo grande (WCAG AA).
L'oro `--accent` sul bottone ha il testo scuro `#1a1a1a`, mai bianco.

### Tipografia

- **Titoli** (`h1`, `h2`): `Playfair Display`, la firma di casa (la usa
  anche l'app), self-hosted in `public/fonts/` in formato woff2, solo i
  pesi 600 e 700. Niente font caricati da servizi esterni.
- **Testo e interfaccia**: `system-ui`, come oggi.
- **Scala** (desktop / telefono): `h1` 3,5rem / 2,25rem, interlinea 1,05,
  spaziatura −0,02em; `h2` 2,25rem / 1,75rem; testo 1,0625rem / 1rem,
  interlinea 1,6; occhielli 0,8125rem, maiuscoletto, spaziatura +0,08em,
  colore `--accent-2`.
- Le righe di testo non superano i 65 caratteri (`max-width: 38rem`).

### Spazi e griglia

- Scala degli spazi: 4, 8, 12, 16, 24, 32, 48, 64, 96 px.
- Contenuto largo al massimo 1120px, margini laterali 20px sul telefono e
  32px dal tablet in su.
- Tra una sezione e l'altra: 96px su desktop, 64px sul telefono.
- Griglia a 12 colonne su desktop; le card stanno su 3 colonne da 1024px,
  2 da 640px, 1 sotto.

### Immagini

- **Si mostra l'app vera**: schermate della demo (`drinkpos-demo`) dentro
  una cornice da tablet, mai disegni generici di «dashboard». Servono
  quattro schermate: il conto aperto, la coda delle comande, il menù
  digitale sul telefono, il magazzino.
- La foto del banco (`public/hero.jpg`) resta come fondo della prima
  schermata, scurita (velo `--bg` al 60%), con la cornice del tablet sopra.
- Formato WebP o AVIF, larghezza 1600px al massimo, `loading="lazy"`
  sotto la prima schermata, `width` e `height` sempre scritti.

### Movimento

- Le sezioni entrano con una dissolvenza e uno spostamento di 12px, 250ms,
  una volta sola.
- Niente parallax, niente caroselli automatici, niente video in
  riproduzione automatica.
- Con `prefers-reduced-motion: reduce` non si muove niente.

### Accessibilità e prestazioni

- Un solo `h1`; i titoli seguono l'ordine. Bersagli di tocco ≥ 44px.
- Il menù in alto e la tabella dei piani si usano anche da tastiera.
- LCP sotto 2,5 s su un telefono medio in 4G; la prima schermata pesa meno
  di 300 KB tra immagini e font.

## 5. La pagina, sezione per sezione

Ogni sezione ha un compito. I testi qui sotto sono quelli da usare; le
alternative dei titoli sono marcate, la scelta la fa l'utente (§9).

### 5.0 La barra in alto

Marchio a sinistra; a destra: Funzioni · Prezzi · Domande · Accedi, il
selettore di lingua **IT / EN** e il bottone principale.

| | Italiano | English |
|---|---|---|
| menù | Funzioni · Prezzi · Domande · Accedi | Features · Pricing · FAQ · Log in |
| bottone | Attiva il tuo locale | Get started |

### 5.1 La prima schermata (hero)

**Compito:** in cinque secondi, cosa è, per chi, perché è diverso, cosa
fare adesso.

| | Italiano | English |
|---|---|---|
| occhiello | Comande, conti e cassa per bar e ristoranti | Orders, bills and till for bars and restaurants |
| titolo **A** (consigliato) | La serata non si ferma. Nemmeno quando cade il Wi-Fi. | The night keeps going. Even when the Wi-Fi doesn't. |
| titolo B | Tutto il tuo locale in un tablet. E resta tuo. | Your whole bar on one tablet. And it stays yours. |
| titolo C | Meno tempo alla cassa. Più tempo al banco. | Less time at the till. More time behind the bar. |
| sottotitolo | Comande, conti, cassa, menù digitale e magazzino in un'unica app pensata per il servizio, al banco e in sala. Ogni locale ha la sua installazione e i suoi dati, separati da tutti gli altri. | Orders, bills, till, a digital menu and stock control in one app built for service, at the bar and on the floor. Every venue gets its own installation and its own data, kept apart from everyone else's. |
| bottone principale | Attiva il tuo locale | Get started |
| bottone secondario | Prova la demo | Try the live demo |
| sotto i bottoni | Da 24 € al mese · Abbonamento mensile · Attivazione automatica | From €24 a month · Monthly subscription · Automatic setup |

Il titolo A è consigliato perché si appoggia al pilastro che nessuno
nell'abbonamento promette, ed è una scena che ogni titolare ha vissuto.
Ogni frase della riga sotto i bottoni è verificabile: «da 24 €» viene da
`piani.json`, «mensile» dai termini, «automatica» dal workflow
dell'attivazione. Niente tempi («in pochi minuti»): l'attivazione dura un
quarto d'ora, e finché non c'è l'organizzazione Google ha un passo a mano.

### 5.2 Il problema

**Compito:** far riconoscere il lettore, in tre frasi. Una fascia a tutta
larghezza, testo grande, niente card.

| Italiano | English |
|---|---|
| **Venerdì sera, locale pieno.** | **Friday night, a full house.** |
| La rete salta e la cassa si blocca. Una comanda si perde tra la sala e il banco. A fine serata nessuno sa quante bottiglie sono uscite davvero. | The network drops and the till freezes. An order gets lost between the tables and the bar. At closing time nobody knows how many bottles actually went out. |
| Lo abbiamo vissuto al nostro banco. Per questo l'abbiamo costruita così. | We lived it behind our own bar. That's why we built it this way. |

### 5.3 I tre pilastri

**Compito:** la promessa, in tre colonne con un'icona, un titolo di 3–5
parole e due righe.

| Italiano | English |
|---|---|
| **Non si ferma mai.** Conti, comande e incassi continuano anche senza rete. Quando la connessione torna, tutto si allinea da solo. | **It never stops.** Tabs, orders and payments carry on without a connection. When it comes back, everything syncs on its own. |
| **I tuoi dati sono solo tuoi.** Ogni locale ha la sua installazione, il suo database e il suo indirizzo. Nessun altro locale li vede. | **Your data stays yours.** Every venue has its own installation, its own database and its own address. No other venue can see it. |
| **Fatta per il servizio.** Nata al banco di un cocktail bar, pensata per lavorare in fretta con il locale pieno, al banco e in sala. | **Built for service.** Born behind a cocktail bar, designed for working fast on a full night, at the bar and on the floor. |

### 5.4 Le funzioni

**Compito:** far vedere l'app. Alternanza immagine–testo, una schermata
vera per riga, a sinistra e a destra a turno. Ogni riga: occhiello, titolo
che dice il vantaggio, una frase, tre punti brevi.

**1. Conti e comande**
- IT — *Dalla comanda al conto, senza passaggi in più.* La comanda arriva
  al banco e si stampa da sola; il conto si chiude in contanti o con
  carta. · Comanda stampata al banco · Contanti e carta · Più terminali
  sulla stessa cassa
- EN — *From order to bill, with no extra steps.* Orders reach the bar and
  print on their own; bills are settled in cash or by card. · Orders
  printed at the bar · Cash and card · Several devices on the same till

**2. Menù digitale e ordini dal tavolo**
- IT — *Il menù sul telefono del cliente.* Il QR sul tavolo apre il menù
  con i prezzi; il cliente ordina e segue lo stato del suo ordine. · Menù
  sempre aggiornato · Ordini che arrivano dritti al banco · Nessuna app da
  scaricare
- EN — *Your menu on your guests' phones.* A QR code on the table opens
  the menu with prices; guests order and follow the status of their order.
  · Always up to date · Orders go straight to the bar · No app to download

**3. Magazzino**
- IT — *Il magazzino si aggiorna a ogni vendita.* Ogni vendita scarica gli
  ingredienti della ricetta: sai cosa sta finendo prima che finisca. ·
  Giacenze e scorte minime · Inventario periodico · Fatture dei fornitori
- EN — *Stock updates with every sale.* Each sale deducts the recipe's
  ingredients, so you know what's running low before it runs out. ·
  Stock levels and minimums · Periodic stock counts · Supplier invoices

**4. Statistiche**
- IT — *I numeri della serata, chiari.* Incassi per serata e periodo,
  venduto per fascia oraria, bilancio per categorie. · Confronto tra
  periodi · Le ore di punta · Il bilancio per macro-categorie
- EN — *Your night in clear numbers.* Takings by night and period, sales
  by hour, a breakdown by category. · Period comparisons · Peak hours ·
  Results by category

**5. Personale e pagamenti** (riga più piccola, due colonne)
- IT — *Ore e paghe del personale.* · *Il conto va al lettore SumUp e torna
  pagato da solo.*
- EN — *Staff hours and pay.* · *The bill goes to the SumUp reader and
  comes back paid.*

Ogni funzione che sta in un modulo a pagamento porta l'etichetta del
modulo (es. «Modulo Magazzino» / «Stock module»): niente sorprese al
momento del prezzo.

### 5.5 Come si comincia

**Compito:** togliere la paura del passaggio. Tre passi in fila, numerati.

| Italiano | English |
|---|---|
| **1. Registra il locale.** Nome, dati di fatturazione e un referente. Cinque minuti. | **1. Register your venue.** Name, billing details and a contact person. Five minutes. |
| **2. Scegli il piano.** Parti dal Base e aggiungi i moduli quando ti servono, anche dopo. | **2. Choose your plan.** Start with Base and add modules whenever you need them. |
| **3. Apri la cassa.** La tua installazione nasce da sola, con il suo indirizzo. Entri dal tablet e lavori. | **3. Open the till.** Your installation is created automatically, at its own address. Log in from your tablet and start working. |

### 5.6 Prezzi

**Compito:** prezzo chiaro, nessuna sorpresa, il piano giusto evidenziato.
I numeri vengono **solo** da `functions/piani.json` (si cambiano solo su
decisione dell'utente).

| | Italiano | English |
|---|---|---|
| titolo | Prezzi chiari. Paghi solo quello che usi. | Simple pricing. Pay only for what you use. |
| sotto | Abbonamento mensile, IVA esclusa. Attivazione una tantum: 250 €. | Monthly subscription, VAT excluded. One-off activation: €250. |
| Base | **Base** — 24 €/mese. Per partire: cassa, comande, scontrino, menù, lavoro senza rete. 1 terminale. | **Base** — €24/month. To get started: till, orders, receipts, menu, offline mode. 1 device. |
| Completo | **Completo** — 69 €/mese. Etichetta: **Tutto incluso**. Tutti i moduli, 2 terminali. | **Complete** — €69/month. Label: **Everything included**. Every module, 2 devices. |
| bottoni | Inizia con Base · Inizia con Completo | Start with Base · Start with Complete |

L'etichetta del Completo è «Tutto incluso», non «Il più scelto»: quella
si scrive solo quando i numeri dei clienti lo dicono davvero.

Sotto le due card: la tabella dei moduli, con una colonna per il prezzo
sul Base e una spunta (`--ok`) per il Completo. Una riga sola dice quanto
conviene il Completo: la somma dei moduli sul Base contro 69 €, calcolata
dal listino, mai scritta a mano.

Nota obbligatoria, in piccolo ma leggibile (`--muted` va bene perché il
punto è ripetuto nelle domande):
- IT — Lo scontrino esce su una stampante termica ed è un conto di
  cortesia, non uno scontrino fiscale. Per quello serve il registratore
  telematico del locale.
- EN — Receipts print on a thermal printer and are courtesy bills, not
  fiscal receipts. Italian venues still need their own registered fiscal
  till.

### 5.7 Domande frequenti

**Compito:** rispondere alle obiezioni, in ordine di peso. Risposte di due
o tre frasi, la prima frase risponde subito.

1. **I miei dati sono al sicuro?** / **Is my data safe?**
   IT — Sì. Ogni locale ha un'installazione separata, con il suo database:
   nessun altro locale la vede. Noi entriamo solo per manutenzione e
   aggiornamenti, come scritto nei termini.
   EN — Yes. Every venue has a separate installation with its own
   database, and no other venue can see it. We only access it for
   maintenance and updates, as stated in the terms.
2. **E se cade la connessione?** / **What if the internet goes down?**
   IT — La cassa continua a lavorare. Conti, comande e incassi restano sul
   dispositivo e si sincronizzano da soli quando la rete torna.
   EN — The till keeps working. Tabs, orders and payments stay on the
   device and sync automatically once you're back online.
3. **Lo scontrino è fiscale?** / **Are the receipts fiscal receipts?**
   IT — No. È un conto di cortesia su stampante termica. Lo scontrino
   fiscale resta del registratore telematico del locale, che l'app non
   sostituisce.
   EN — No. It's a courtesy bill on a thermal printer. In Italy, fiscal
   receipts still come from the venue's registered till, which the app
   doesn't replace.
4. **Cosa mi serve per cominciare?** / **What do I need to get started?**
   IT — Un tablet o un telefono con un browser aggiornato. Per lo
   scontrino, una stampante termica Epson in rete; per le carte, un
   lettore SumUp.
   EN — A tablet or phone with an up-to-date browser. For receipts, a
   networked Epson thermal printer; for cards, a SumUp reader.
5. **Posso cambiare piano o disdire?** / **Can I change plan or cancel?**
   IT — Sì, dalla tua pagina, quando vuoi: l'abbonamento è mensile. Dopo la
   disdetta i dati restano consultabili per il periodo scritto nei
   termini.
   EN — Yes, from your account, at any time: it's a monthly subscription.
   After cancelling, your data stays available for the period set out in
   the terms.
6. **Chi pensa agli aggiornamenti?** / **Who takes care of updates?**
   IT — Noi. L'app migliora di continuo e gli aggiornamenti arrivano alla
   tua installazione senza che tu faccia niente.
   EN — We do. The app keeps improving, and updates reach your
   installation without you lifting a finger.

### 5.8 La chiusura

**Compito:** un'ultima azione, chiara. Fascia con alone oro.

| | Italiano | English |
|---|---|---|
| titolo | Pronto per il prossimo venerdì sera? | Ready for next Friday night? |
| testo | Attiva il tuo locale, oppure scrivici e te lo mostriamo con il tuo menù. | Get your venue started, or write to us and we'll show it to you with your own menu. |
| bottoni | Attiva il tuo locale · Scrivici | Get started · Contact us |

### 5.9 Il piè di pagina

Marchio, una riga di descrizione, i link (Termini, Privacy, Contatti,
Accedi), il selettore di lingua, la versione pubblicata (c'è già).

## 6. Le due lingue

- **Italiano** è la lingua predefinita e quella dei testi legali.
- **Indirizzi**: la home italiana su `/`, quella inglese su `/en`. Ogni
  pagina ha `<html lang>`, il `<title>` e la descrizione nella sua lingua,
  e i link `hreflang` tra le due versioni (servono a Google).
- **La scelta**: alla prima visita si propone la lingua del browser con un
  avviso discreto, mai un reindirizzamento forzato. Il selettore IT / EN
  sta nella barra e nel piè di pagina; la scelta si ricorda nel browser.
- **I testi** stanno in file per lingua (`src/i18n/home.it.js`,
  `src/i18n/home.en.js`), con le stesse chiavi; nessuna frase scritta
  dentro i componenti. Un test controlla che le due lingue abbiano le
  stesse chiavi.
- **Prezzi e numeri**: dal listino, formattati per lingua («24 €» in
  italiano, «€24» in inglese) da `importo()` in `src/lib/lingua.js`, a
  mano come `euro()`: il Node della CI non ha i dati di lingua.
- **Come è fatto** (30/10/2026): `src/lib/lingua.js` sceglie la lingua
  dall'indirizzo, legge e scrive la preferenza in `localStorage` (con
  `try/catch`: se il browser non lascia, non c'è preferenza e la pagina
  va lo stesso) e propone la lingua del browser, con ripiego
  sull'italiano per le altre lingue. Solo la preferenza scelta col
  selettore o con l'avviso porta da `/` a `/en`. Il selettore sta sulla
  prima pagina soltanto, perché il resto del sito è in italiano.
- **Il resto del sito** (registrazione, dashboard, termini, privacy) per
  ora resta in italiano. Dalla home inglese, i link che portano lì lo
  dicono («in Italian»). La traduzione dei testi legali va rivista da un
  consulente prima di pubblicarla.
- L'inglese è **inglese internazionale**, semplice: niente modi di dire
  americani, niente giochi di parole intraducibili.

### Glossario

| Italiano | English |
|---|---|
| conto | bill / tab |
| comanda | order |
| banco | bar |
| cassa | till |
| terminale | device |
| scontrino di cortesia | courtesy bill |
| registratore telematico | registered fiscal till |
| magazzino | stock |
| giacenza | stock level |
| scorta minima | minimum stock |
| installazione | installation |
| attivazione | activation |
| piano / modulo | plan / module |

## 7. Cosa non cambia

- Il nome visibile e il dominio vengono da `src/lib/prodotto.js`: il nome
  è ancora un segnaposto, e il titolo della pagina non dipende da lui.
- I prezzi vengono da `functions/piani.json`.
- Le rotte di registrazione, accesso e dashboard, e chi è già collegato
  vede «La mia dashboard» al posto di «Attiva il tuo locale».

## 8. Quando è fatta

- [ ] Ogni sezione del §5, nell'ordine, in tutte e due le lingue.
- [ ] Nessun testo scritto nei componenti; un test confronta le chiavi.
- [ ] Prezzi e confronto Base/Completo calcolati dal listino.
- [ ] Quattro schermate vere dell'app, in WebP, con dimensioni scritte.
- [ ] Contrasto AA controllato su testo, bottoni e testo oro.
- [ ] Con `prefers-reduced-motion` niente movimento.
- [ ] LCP < 2,5 s sul telefono (Lighthouse, profilo mobile).
- [ ] `/en` con `lang`, `hreflang`, titolo e descrizione in inglese.
- [ ] La nota sullo scontrino non fiscale c'è, in tutte e due le lingue.
- [ ] `tests/Home.test.jsx` aggiornato; REQ-FLOTTA-002 aggiornato.

Stato al 30/10/2026 (ramo `feature/home-nuova`): fatti tutti tranne le
schermate (decisione §9.5; la foto del banco resta in JPEG, 50 KB) e la
misura Lighthouse, che va fatta sul sito di test. Il contrasto è
calcolato sui token: testo secondario su `--bg-3` 5,9:1, oro `--accent-2`
su `--bg` 12:1, testo scuro sul bottone 8,9:1, velo della prima schermata
all'88% perché anche sul punto più chiaro della foto il testo secondario
resti sopra 4,5:1.

## 9. Da decidere con l'utente

1. **Il titolo**: A, B o C del §5.1 (consigliato A).
2. **Il nome del prodotto**: «Drink» è un segnaposto. La pagina funziona
   anche senza, ma il marchio in alto e il `<title>` lo usano.
3. **La prova sociale**: si può dire che l'app è nata e lavora alla Tana
   del Coniglio, con il nome e magari una frase del titolare? Senza
   permesso, si resta su «nata al banco di un cocktail bar».
4. **Una prova gratuita**: oggi non c'è. Se arriva, cambia il bottone
   principale («Prova gratis 14 giorni» / «Start your free trial»).
5. **Le schermate**: dalla demo, o dalla Tana con i dati oscurati.
