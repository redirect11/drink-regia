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
| Lavora anche senza rete | conti, comande e incassi continuano quando la rete cade | è la prima regola dell'app (tana-drink, REQ-OFFLINE-001 e 006); le modifiche partono da sole al ritorno della rete. Non «non si ferma mai»: i Termini dicono «senza garanzia di continuità assoluta» |
| È tuo | ogni locale ha un'installazione separata, con il suo database e il suo indirizzo | un progetto per locale, isolato (docs/flotta-nella-regia.md) |
| Pensato per il servizio | comanda al banco, scontrino sulla stampante, magazzino che si scala dalle ricette | nato al banco di un cocktail bar |

## 4. L'aspetto

### La direzione del 07/11/2026

L'utente, 07/11/2026, dopo lo screenshot della pagina: «ridisegnare la
homepage di Drink perché sembri il sito curato di un prodotto reale, nato
e usato in un locale, non un template generico generato dall'AI. Deve
avere una personalità riconoscibile e comunicare fiducia a chi gestisce
un bar o un ristorante». La sua direzione, che da qui in poi vale per la
prima pagina:

**Da evitare.** Lo sfondo quasi tutto nero con bagliori, macchie sfocate
e puntini; l'hero centrato e simmetrico con slogan enorme, descrizione
breve e due bottoni standard; l'oro come gradiente o effetto luminoso su
ogni elemento; tante card scure identiche con bordi sottili e piccole
icone; sezioni tutte centrate, una sotto l'altra, senza ritmo; spazi
verticali vuoti; decorazioni che non rappresentano il prodotto;
glassmorphism, gradienti vistosi, animazioni gratuite, emoji, immagini
stock. Non basta cambiare colori e font: si ripensano gerarchia,
composizione e ritmo.

**La direzione creativa.** Un'identità editoriale contemporanea ispirata
al lavoro dietro il bancone: precisa, calda, competente e concreta. Con
carattere, senza i cliché del cocktail bar (neon, bicchieri decorativi,
texture rétro). Se ci sono schermate autentiche dell'app si usano con
cura; se no, tipografia, griglie e composizioni pulite, non riempitivi.
Niente schermate o funzioni inventate.

**Com'è fatta ora.** Stessi testi e stesso ordine (§5); cambia la messa in
scena, tutta in `src/index.css` sotto `.regia.vetrina` e `.landing`:

- **Il fondo è avorio** (`--bg #f6f2ea`), la carta dei pannelli
  `#fffdf8`, il testo quasi nero caldo `#1f1c18`. Il tema scuro resta al
  resto del sito (dashboard, backoffice): sulla prima pagina `App.jsx`
  mette la classe `vetrina` sulla radice, e barra e piè di pagina prendono
  i colori della vetrina.
- **Due sole sezioni scure, volute**: il problema e la chiusura, in un
  bruno caldo (`--scuro #1d1a16`), a tutta larghezza, col testo allineato
  a sinistra.
- **Un accento solo**, il verde bottiglia (`--accent #1f5a46`): i bottoni
  principali (testo bianco), i link, l'etichetta e il bordo del piano in
  evidenza, le spunte. **L'oro è un dettaglio** (`--oro #9a7424`, scurito
  perché regga sull'avorio): la seconda frase del titolo, i numeri dei
  pilastri, delle funzioni e dei passi, i filetti davanti agli occhielli,
  il bordo dell'offerta Fondatori. Niente gradienti, aloni, ombre
  luminose, vetro.
- **La prima schermata** non è centrata: da 900px il testo sta a sinistra
  su sette colonne e a destra, su quattro, la scheda dei fatti (prezzo,
  abbonamento, attivazione), che sono informazioni vere al posto di una
  decorazione. Niente immagini, niente luci.
- **Le composizioni si alternano**: il problema a due colonne (titolo e
  testo); i pilastri tre colonne con un filo sopra e il numero in oro,
  senza card né icone; le funzioni testo e pannello «cosa comprende»
  alternati, con un filo fra una riga e l'altra; i passi tre colonne
  numerate; i prezzi due pannelli di carta, il Completo col bordo verde;
  le domande righe editoriali; la chiusura scura con testo a sinistra e
  bottoni a destra.
- **Gli spazi** sono più stretti: sezioni a 56px sul telefono e 80px dal
  tablet (prima 72 e 120); ogni schermata mostra contenuto.
- **I bottoni** hanno angoli di 8px, nessuna ombra: pieni nel verde o col
  contorno scuro; sulle sezioni scure l'azione principale è avorio col
  testo scuro.
- **Gli occhielli** sono in minuscolo, con un filetto d'oro davanti: niente
  maiuscole spaziate.

### Colori

I token di `src/index.css`, ridefiniti sotto `.regia.vetrina` per la
prima pagina soltanto.

| Token | Valore | Ruolo |
|---|---|---|
| `--bg` | `#f6f2ea` | sfondo della pagina (avorio) |
| `--bg-2` | `#fffdf8` | pannelli di carta (scheda dei fatti, piani, tabella) |
| `--bg-3` | `#ece5d8` | superfici secondarie (piè di pagina, avviso della lingua) |
| `--text` | `#1f1c18` | testo |
| `--muted` | `#5d574e` | testo secondario (6,4:1 sull'avorio; mai per informazioni critiche) |
| `--line` | `#d9d0c0` | fili e bordi |
| `--accent` | `#1f5a46` | azioni, link, evidenze (bianco sopra 7,3:1) |
| `--accent-soft` | `rgba(31,90,70,.1)` | sfondi di evidenza (etichetta, riga del confronto) |
| `--oro` | `#9a7424` | dettagli: numeri, filetti, la seconda frase del titolo (4,6:1 sull'avorio) |
| `--scuro` / `--scuro-testo` / `--scuro-muted` | `#1d1a16` / `#f3ede2` / `#c4bbab` | le due sezioni scure |

Contrasto: 4,5:1 per il testo normale, 3:1 per il testo grande (WCAG AA).
I valori sopra sono calcolati sui token, non misurati con uno strumento
sulla pagina.

### Tipografia

- **Titoli** (`h1`, `h2`, i titoli delle funzioni, i numeri): `Playfair
  Display` 700, self-hosted in `public/fonts/` (woff2, solo i caratteri
  latini). È il secondo carattere, per pochi titoli; niente font da
  servizi esterni.
- **Testo e interfaccia**: `system-ui`.
- **Scala** più contenuta di prima: `h1` da 2,125rem a 3,5rem (interlinea
  1,08, larghezza massima 18 caratteri); `h2` da 1,75rem a 2,375rem (il
  problema fino a 2,75rem); i titoli delle funzioni da 1,5rem a 1,875rem;
  testo 1,0625rem dal tablet, 1rem sul telefono, interlinea 1,6; occhielli
  0,875rem in minuscolo. Le cifre di Playfair sono «da testo»: nei prezzi
  e nei numeri si usano quelle allineate (`lining-nums`).
- Le righe di testo non superano i 65 caratteri (`max-width` fra 34 e
  42rem).

### Spazi e griglia

- Scala degli spazi: 4, 8, 12, 16, 20, 24, 32, 48, 56, 64, 80 px.
- Contenuto largo al massimo 1120px, margini laterali 20px sul telefono e
  32px dal tablet in su.
- Tra una sezione e l'altra 56px sul telefono, 80px dal tablet.
- Da 640px due colonne per pilastri, funzioni minori e piani, e i tre passi
  in fila; da 900px l'hero, il problema, le funzioni, le domande e la
  chiusura vanno a due colonne; da 1024px i pilastri a tre.

### Immagini

- **Schermate vere dell'app, quando ci saranno** (§9.5): oggi la demo
  (`drinkpos-demo`) non è pubblicata e nel repository non c'è nessuna
  schermata, quindi la pagina non ne mostra: il pannello accanto a ogni
  funzione è la lista di cosa comprende, e le prenderà quando arriveranno.
  Servono quattro schermate: il conto aperto, la coda delle comande, il
  menù digitale sul telefono, il magazzino. Formato WebP o AVIF, larghezza
  1600px al massimo, `loading="lazy"`, `width` e `height` scritti.
- Niente fotografie di cocktail, niente immagini stock, niente
  illustrazioni generiche.

### Movimento

- Le sezioni entrano con una dissolvenza e uno spostamento di 12px, 250ms,
  una volta sola (`src/lib/comparsa.js`): breve e discreta.
- Niente parallax, niente caroselli, niente video in riproduzione
  automatica, niente ombre o trasformazioni al passaggio del mouse.
- Con `prefers-reduced-motion: reduce` non si muove niente.

### Accessibilità e prestazioni

- Un solo `h1`; i titoli seguono l'ordine. Bersagli di tocco ≥ 44px. Il
  fuoco visibile nel verde.
- Il menù in alto, le domande e la tabella dei piani si usano anche da
  tastiera; sul telefono la tabella dei moduli diventa una scheda per riga.
- Niente informazione affidata al solo colore: la seconda frase del titolo
  in oro è la stessa frase, l'etichetta del Completo ha il suo testo, le
  spunte hanno la parola «Incluso».
- LCP sotto 2,5 s su un telefono medio in 4G; la prima schermata non
  scarica immagini, solo il font dei titoli (23 KB).

### Com'era prima (03/11/2026, superato)

Il restyling del 03/11/2026 («più moderna, elegante e accattivante») era
un bar di sera: fondo quasi nero, luci sfocate disegnate dal CSS, titolo
grande con la svolta in oro sfumato, filo d'oro sulle carte, bottoni a
pillola con alone, pilastri in card numerate, passi come linea del tempo.
L'utente lo ha giudicato un template generico («sfondo quasi tutto nero
con bagliori, macchie sfocate e puntini decorativi… oro usato come
gradiente… tante card scure identiche») e il 07/11/2026 ha dato la
direzione sopra.

## 5. La pagina, sezione per sezione

Ogni sezione ha un compito. I testi qui sotto sono quelli da usare; le
alternative dei titoli sono marcate, la scelta la fa l'utente (§9). I
testi pubblicati stanno in `src/i18n/home.it.js` e `home.en.js`: se le due
versioni divergono, vale il codice, e questo file si riallinea.

**I numeri non si scrivono qui.** Dove un testo cita un prezzo c'è un
segnaposto — `{base}`, `{completo}`, `{attivazione}`, `{terminale}`,
`{da}` — che la pagina riempie da `functions/piani.json`.

**Le frasi devono reggere ai Termini** (`src/pages/Legali.jsx`) e a quello
che succede oggi in produzione (revisione della PR #20, 30/10/2026):
niente «non si ferma mai», nessuna promessa sui dati che i Termini non
fanno, e l'attivazione detta «automatica» solo quando lo è.

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
| occhiello | Gestionale per bar e ristoranti, nato in un cocktail bar | Management for bars and restaurants, born in a cocktail bar |
| titolo **A** (scelto dall'utente il 06/11/2026, «fatto da chi sta al banco») | Scritto dietro il banco. In servizio ogni sera. | Written behind the bar. In service every night. |
| titolo B («tutto il locale, in ordine») | Comande, cassa, magazzino. Tutto il locale, in ordine. | Orders, till, stock. The whole venue, in one place. |
| titolo C («un gestionale che è tuo») | Un'installazione per locale. I dati restano tuoi. | One installation per venue. The data stays yours. |
| sottotitolo | Comande, cassa, menù con QR, magazzino, statistiche e personale. L'app è nata nel cocktail bar che la usa ogni sera, ed è cresciuta su quello che serve davvero durante il servizio. Ogni locale ha la sua installazione e i suoi dati, e lavora anche senza rete. | Orders, till, QR menu, stock, statistics and staff. The app was born in the cocktail bar that uses it every night, and grew on what service actually requires. Every venue has its own installation and its own data, and works even without a connection. |
| bottone principale | Attiva il tuo locale | Get started |
| bottone secondario | Prova la demo | Try the live demo |
| sotto i bottoni | Da {da} al mese · Abbonamento mensile · Attivazione automatica *oppure* Attivazione concordata con noi | From {da} a month · Monthly subscription · Automatic setup *or* Setup arranged with us |

I testi del 06/11/2026. L'utente ha bocciato prima i titoli del 30/10
(«gli slogan sono orribili») e poi una proposta costruita sulla scena del
Wi-Fi che cade («bruttissime… fanno riferimento a questa feature in
particolare che non è l'unico pezzo forte dell'app… devono essere meno
stupide»). Da lì le tre direzioni della tabella, tutte senza trovate e
col prodotto raccontato per intero: A, la credibilità (scritto da chi
sta al banco, in servizio ogni sera: l'unica prova vera che abbiamo); B,
la completezza (un gestionale intero, non una cassa con una feature); C,
la proprietà (l'installazione separata, che nessun concorrente in
abbonamento dice). L'utente ha scelto A, e tutta la pagina segue quel
filo: il problema è «quello che si vede dal banco», i pilastri sono «tre
scelte fatte al banco», la chiusura «vedila con il tuo menù e i tuoi
prezzi». Regola per il futuro: niente scenette, niente figura furba,
niente feature sola nel titolo; frasi che un ristoratore legge pensando
«questi sanno di cosa parlano».
Ogni frase della riga sotto i bottoni è verificabile: «da …» viene da
`piani.json` (il piano a pagamento meno caro), «mensile» dai termini.
«Automatica» si scrive solo se i pagamenti online sono accesi o il Free è
in vendita (la vendita del backoffice): con tutti e due spenti, come parte
la produzione, chi sceglie un piano ci lascia un recapito e l'attivazione
si concorda (REQ-FLOTTA-017), e la pagina lo dice. Niente tempi («in pochi minuti»): l'attivazione dura un
quarto d'ora, e finché non c'è l'organizzazione Google ha un passo a mano.

### 5.2 Il problema

**Compito:** far riconoscere il lettore, in tre frasi. Una fascia a tutta
larghezza, testo grande, niente card.

| Italiano | English |
|---|---|
| **Quello che si vede dal banco.** | **What you see from behind the bar.** |
| Le comande su un blocco, i conti rifatti a voce, il registratore che tiene solo il totale. Il magazzino a memoria, le ore del personale su un foglio, l'incasso della serata ricostruito il giorno dopo. Ogni pezzo funziona per conto suo, e il quadro intero lo tiene in testa chi sta al banco. | Orders on a pad, bills worked out aloud, a till that only keeps the total. Stock from memory, staff hours on a sheet, the night's takings pieced together the next day. Each piece works on its own, and the whole picture lives in the head of whoever is behind the bar. |
| L'app è nata al banco di un cocktail bar per mettere quel quadro su un tablet, e lì lavora ogni sera. | The app was born behind the bar of a cocktail bar to put that picture on a tablet, and it works there every night. |

Dal 06/11/2026 la sezione è un contesto, non un dramma: il locale
gestito a pezzi, visto da chi sta al banco. Il registratore «tiene solo
il totale»: non si promette di sostituirlo, lo scontrino fiscale resta suo.

### 5.3 I tre pilastri

**Compito:** la promessa, in tre colonne con un'icona, un titolo di 3–5
parole e due righe.

| Italiano | English |
|---|---|
| **Lavora anche senza rete.** Al banco la connessione non è una certezza: comande, conti e incassi restano sul tablet e il servizio prosegue; quando la rete torna, le modifiche partono da sole. | **Works even without a connection.** Behind the bar a connection is never a given: orders, bills and payments stay on the tablet and service carries on; when the network returns, the changes go out on their own. |
| **Un'installazione per locale.** I numeri di un locale sono del locale. Il tuo ha la sua installazione, con i suoi dati e il suo indirizzo, separata da tutte le altre: nessun altro vede i tuoi conti, i tuoi prezzi, i tuoi incassi. | **One installation per venue.** A venue's numbers belong to the venue. Yours has its own installation, with its own data and its own address, separate from everyone else's: no one else sees your bills, your prices or your takings. |
| **Fatta per il servizio.** Ogni schermata è stata provata con il locale pieno e il tablet in mano, al banco e in sala: pochi passaggi, e niente che rallenti il servizio. | **Built for service.** Every screen was tried out with a full room and a tablet in hand, at the bar and on the floor: few steps, and nothing that slows service down. |

Il titolo della sezione è «Tre scelte fatte al banco» / «Three decisions
made behind the bar».

### 5.4 Le funzioni

**Compito:** far vedere l'app. Alternanza immagine–testo, una schermata
vera per riga, a sinistra e a destra a turno. Ogni riga: occhiello, titolo
che dice il vantaggio, una frase, tre punti brevi.

La sezione si apre con «Dalla prima comanda alla chiusura di cassa.» /
«From the first order to closing the till.» (dal 06/11/2026).

**1. Comande e conti**
- IT — *Dal tavolo al banco, senza passaggi a voce.* La prendi al tavolo o
  al banco: arriva subito e, se lo scegli, si stampa da sola. Il conto ha
  già tutto sopra e si chiude in contanti o con carta; lo scontrino di
  cortesia esce sulla stampante termica. · Comanda stampata al banco ·
  Contanti e carta · Altri terminali a {terminale} al mese
- EN — *From the table to the bar, with nothing to call out.* Take it at
  the table or at the bar: it arrives straight away and, if you choose,
  prints on its own. The bill already has everything on it and is settled
  in cash or by card; the courtesy bill prints on the thermal printer. ·
  Orders printed at the bar · Cash and card · Extra devices at
  {terminale} a month

La stampa automatica è una scelta del locale (tana-drink, REQ-STAMPA-001);
il Base ha un terminale e gli altri si pagano: «più terminali sulla
stessa cassa» sotto «Nel piano Base» li faceva sembrare inclusi.

**2. Menù digitale e ordini dal tavolo**
- IT — *Il menù con un QR, l'ordine dal telefono del cliente.* Il cliente
  inquadra il QR, vede il menù con i prezzi aggiornati, ordina e segue lo
  stato del suo ordine. Niente app da scaricare e niente menù di carta da
  ristampare quando cambi un prezzo. · Menù sempre aggiornato · Ordini
  che arrivano dritti al banco · Nessuna app da scaricare
- EN — *A QR menu, and orders from the guest's phone.* Guests scan the QR
  code, see the menu with current prices, order and follow the status of
  their order. No app to download, and no paper menus to reprint when a
  price changes. · Always up to date · Orders go straight to the bar · No
  app to download

**3. Magazzino**
- IT — *Il magazzino si scarica da solo, dalle ricette.* Ogni comanda
  preparata scarica gli ingredienti della sua ricetta; quando una
  giacenza scende sotto la soglia di riordino, l'app te lo segnala.
  L'inventario periodico e le fatture dei fornitori tengono i conti
  allineati. · Giacenze e soglie di riordino · Inventario periodico ·
  Fatture dei fornitori
- EN — *Stock is deducted on its own, from the recipes.* Every order that
  is prepared deducts the ingredients of its recipe; when a stock level
  drops below its reorder threshold, the app flags it. Periodic stock
  counts and supplier invoices keep the figures aligned. · Stock levels
  and reorder thresholds · Periodic stock counts · Supplier invoices

Lo scarico avviene quando la comanda è pronta, o alla riscossione se il
locale non segue gli stati (tana-drink, REQ-MAG-003); l'avviso è la soglia
di riordino del prodotto (REQ-MAG-006).

**4. Statistiche**
- IT — *Quanto hai incassato, a che ora, con cosa.* Incassi per serata e
  per periodo, venduto per fascia oraria, bilancio per categorie. Le ore
  di punta e il confronto con la settimana scorsa sono già calcolati,
  senza fogli Excel. · Confronto tra periodi · Le ore di punta · Il
  bilancio per macro-categorie
- EN — *How much you took, at what time, on what.* Takings by night and by
  period, sales by hour, results by category. Peak hours and the
  comparison with last week are already worked out, without a
  spreadsheet. · Period comparisons · Peak hours · Results by category

**5. Personale e pagamenti** (riga più piccola, due colonne)
- IT — *Le ore e le paghe del personale, e le chiamate allo staff, nello
  stesso gestionale.* · *Il conto passa al lettore SumUp e torna già
  pagato.*
- EN — *Staff hours and pay, and calls to the staff, in the same system.*
  · *The bill goes to the SumUp reader and comes back paid.*

Ogni funzione che sta in un modulo a pagamento porta l'etichetta del
modulo (es. «Modulo Magazzino» / «Stock module»): niente sorprese al
momento del prezzo.

### 5.5 Come si comincia

**Compito:** togliere la paura del passaggio. Tre passi in fila, numerati,
sotto il titolo «Dalla registrazione alla prima comanda» / «From sign-up
to the first order».

| Italiano | English |
|---|---|
| **1. Registra il tuo locale.** Nome, dati di fatturazione e un referente, poi la conferma dell'email. | **1. Register your venue.** Name, billing details and a contact person, then confirm your email. |
| **2. Scegli piano e moduli.** Parti dal Base e aggiungi i moduli quando ti servono, anche dopo. | **2. Choose your plan and modules.** Start with Base and add modules whenever you need them. |
| **3. Apri la cassa.** La tua installazione nasce da sola, con il suo indirizzo. Entri dal tablet e lavori. | **3. Open the till.** Your installation is created automatically, at its own address. Log in from your tablet and start working. |
| *(attivazione concordata)* **3. Apri la cassa.** Ci accordiamo sul pagamento e attiviamo la tua installazione, con il suo indirizzo. Entri dal tablet e lavori. | **3. Open the till.** We agree on payment and activate your installation, at its own address. Log in from your tablet and start working. |

Il terzo passo ha due versioni, con la stessa regola di «automatica» del
§5.1. Niente tempi («cinque minuti»): nessuno li ha misurati.

### 5.6 Prezzi

**Compito:** prezzo chiaro, nessuna sorpresa, il piano giusto evidenziato.
I numeri vengono **solo** da `functions/piani.json` (si cambiano solo su
decisione dell'utente).

| | Italiano | English |
|---|---|---|
| titolo | Un piano al mese, e i moduli che scegli. | A monthly plan, and the modules you choose. |
| sotto | Abbonamento mensile o annuale. Prezzi IVA esclusa (IVA al {iva}), con il totale IVA inclusa accanto. Attivazione una tantum: {attivazione} ({lordo}). | Monthly or yearly subscription. Prices exclude VAT ({iva} Italian VAT), with the total including VAT alongside. One-off activation: {attivazione} ({lordo}). |
| Base | **Base** — {base}/mese. Per partire: cassa, comande, scontrino, menù, lavoro senza rete. {terminali del Base}. | **Base** — {base}/month. To get started: till, orders, receipts, menu, offline mode. {devices}. |
| Completo | **Completo** — {completo}/mese. Etichetta: **Tutto incluso**. Tutti i moduli, {terminali del Completo}. | **Completo** — {completo}/month. Label: **Everything included**. Every module, {devices}. |
| bottoni | Inizia con Base · Inizia con Completo | Start with Base · Start with Completo |

**Dal listino del 02/11/2026 (DEC-0005, REQ-PREZZI-001)**: ogni prezzo è
l'imponibile «+ IVA» col totale IVA inclusa accanto (`conIva`), e sotto il
mensile l'annuale («Pagando un anno in anticipo: {prezzo} ({lordo}), pari a
{mesi} mensilità.»). Sotto le card, il riquadro sobrio «Offerta Fondatori»
(«I primi {posti} locali: {piano} a {prezzo} al mese ({lordo}) per {mesi}
mesi dall'attivazione, poi {listino} come da listino; attivazione
gratuita.»), mai coi posti rimasti; poi la prova, e in nota il tetto
dell'assistenza e le stampanti a preventivo. I testi esatti stanno in
`src/i18n`.

Il titolo era «Prezzi chiari. Paghi solo quello che usi.»: non era esatto
(c'è un canone fisso, l'attivazione, e il Completo è un pacchetto) e
suonava da venditore. I nomi dei piani vengono dal listino anche in
inglese: sono nomi propri del prodotto, e si cambiano in un posto solo.

L'etichetta del Completo è «Tutto incluso», non «Il più scelto»: quella
si scrive solo quando i numeri dei clienti lo dicono davvero.

Sotto le due card: la tabella dei moduli, con una colonna per il prezzo
sul Base e una spunta (`--ok`) per il Completo. Una riga sola dice quanto
conviene il Completo: la somma dei moduli sul Base contro il prezzo del
Completo, calcolata dal listino, mai scritta a mano.

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

1. **Chi vede i dati del mio locale?** / **Who can see my venue's data?**
   IT — Nessun altro locale. Ogni locale ha un'installazione separata, con
   il suo database. I dati sono del locale, e noi li trattiamo solo per
   erogare il servizio, come scritto nei termini.
   EN — No other venue. Every venue has a separate installation with its
   own database. The data belongs to the venue, and we process it only to
   provide the service, as stated in the terms.
   *(«li tratta solo per erogare il servizio» è la formula dei Termini, §6;
   «entriamo solo per manutenzione» i Termini non lo scrivono.)*
2. **E se cade la connessione?** / **What if the internet goes down?**
   IT — La cassa continua a lavorare. Conti, comande e incassi restano sul
   dispositivo e si sincronizzano da soli quando la rete torna. I
   pagamenti con il lettore SumUp, invece, hanno bisogno della rete.
   EN — The till keeps working. Bills, orders and payments stay on the
   device and sync automatically once you are back online. Payments with
   the SumUp reader, however, need a connection.
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
   IT — Sì. Il cambio di piano si chiede dalla tua pagina. L'abbonamento è
   mensile e si disdice in qualunque momento: il servizio resta attivo
   fino alla fine del periodo già pagato.
   EN — Yes. You request a change of plan from your account. The
   subscription is monthly and can be cancelled at any time: the service
   stays active until the end of the period already paid.
   *(Termini §7. «Si chiede»: con i pagamenti online spenti il cambio
   passa dall'admin.)*
6. **Cosa succede ai dati se chiudo il locale?** / **What happens to my data if I close my venue?**
   IT — Chiudendo l'installazione dalla tua pagina l'app si ferma subito,
   e dopo 30 giorni i dati vengono cancellati; fino ad allora la chiusura
   si può annullare. Prima della cancellazione facciamo un backup
   completo, che puoi scaricare dalla tua pagina per 180 giorni.
   EN — When you close the installation from your account, the app stops
   straight away, and the data is deleted after 30 days; until then you
   can undo the closure. Before deletion we make a full backup, which you
   can download from your account for 180 days.
   *(Termini §6: disdire e chiudere sono due cose diverse.)*
7. **Chi pensa agli aggiornamenti?** / **Who takes care of updates?**
   IT — Noi. Gli aggiornamenti arrivano alla tua installazione senza che
   tu debba fare niente, e senza interruzioni programmate.
   EN — We do. Updates reach your installation without you having to do
   anything, and without scheduled downtime.

### 5.8 La chiusura

**Compito:** un'ultima azione, chiara. Fascia con alone oro.

| | Italiano | English |
|---|---|---|
| titolo | Vedila con il tuo menù e i tuoi prezzi. | See it with your own menu and prices. |
| testo | Attiva il tuo locale, oppure scrivici: te la mostriamo caricata con il tuo menù e i tuoi prezzi, e decidi dopo. | Get your venue started, or write to us: we'll show it to you loaded with your own menu and prices, and you decide afterwards. |
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
- **Prezzi e numeri**: dal listino, formattati per lingua («32,70 €» in
  italiano, «€32.70» in inglese, i centesimi solo se ci sono) da `importo()` in `src/lib/lingua.js`, a
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

- [x] Ogni sezione del §5, nell'ordine, in tutte e due le lingue.
- [x] Nessun testo scritto nei componenti; un test confronta le chiavi.
- [x] Prezzi e confronto Base/Completo calcolati dal listino.
- [ ] Quattro schermate vere dell'app, in WebP, con dimensioni scritte
      (aspetta la decisione del §9.5; la foto del banco resta in JPEG,
      50 KB).
- [x] Contrasto AA controllato su testo, bottoni e testo oro (calcolato
      sui token: testo secondario su `--bg-3` 5,9:1, oro `--accent-2` su
      `--bg` 12:1, testo scuro sul bottone 8,9:1; il velo della prima
      schermata all'88% tiene il testo secondario sopra 4,5:1 anche sul
      punto più chiaro della foto). Non misurato con uno strumento sulla
      pagina.
- [x] Con `prefers-reduced-motion` niente movimento.
- [ ] LCP < 2,5 s sul telefono (Lighthouse, profilo mobile): da misurare
      sul sito di test.
- [x] `/en` con `lang`, `hreflang`, titolo e descrizione in inglese (scritti
      dal JavaScript: vedi il limite al §9.6).
- [x] La nota sullo scontrino non fiscale c'è, in tutte e due le lingue.
- [x] `tests/Home.test.jsx` aggiornato; REQ-FLOTTA-002 aggiornato.
- [x] Le frasi reggono ai Termini e alla produzione di oggi (revisione
      della PR #20).

## 9. Da decidere con l'utente

1. **Il titolo**: A del §5.1, «Scritto dietro il banco. In servizio ogni
   sera.», scelto dall'utente il 06/11/2026 fra tre direzioni; B e C
   restano lì come alternative.
2. **Il nome del prodotto**: «Drink» è un segnaposto. La pagina funziona
   anche senza, ma il marchio in alto e il `<title>` lo usano.
3. **La prova sociale**: si può dire che l'app è nata e lavora alla Tana
   del Coniglio, con il nome e magari una frase del titolare? Senza
   permesso, si resta su «nata al banco di un cocktail bar».
4. **Una prova gratuita**: oggi non c'è. Se arriva, cambia il bottone
   principale («Prova gratis 14 giorni» / «Start your free trial»).
5. **Le schermate**: dalla demo, o dalla Tana con i dati oscurati.
6. **`/en` per chi non esegue JavaScript** (anteprime dei link nei social e
   nelle chat, alcuni crawler): il sito è un'app a pagina singola, e
   `index.html` è lo stesso per tutte le rotte, in italiano. Lingua,
   titolo, descrizione e `hreflang` di `/en` li scrive il JavaScript, quindi
   chi non lo esegue vede `/en` in italiano. Google esegue il JavaScript e
   legge la versione giusta. È un limite accettato per ora; la soluzione è
   generare in build un `en/index.html` con i meta in inglese (Hosting lo
   serve prima della riscrittura su `/index.html`). Da decidere se e quando.
7. **Gli asset veri che servirebbero** (07/11/2026): quattro schermate
   dell'app (il conto aperto al banco, la coda delle comande, il menù
   digitale sul telefono del cliente, il magazzino con le giacenze), prese
   dalla demo quando sarà ripubblicata o dalla Tana coi dati oscurati; se
   si vuole, una foto vera del banco con il tablet in mano, senza
   bicchieri in posa. Finché non ci sono, la pagina resta senza immagini:
   il pannello accanto a ogni funzione mostra cosa comprende.
