# Sviluppi futuri: più prodotti, servizi base, dati e marketing

Scritto il 30/10/2026 su indicazione dell'utente («segnati tutte queste
cose come futuri sviluppi»). Oggi si lavora solo su drink. Questo documento
raccoglie dove si vuole arrivare, perché le decisioni di oggi non chiudano
quelle strade. Niente di quello che c'è qui è deciso nei dettagli: ogni
punto diventa un requisito quando lo si lavora.

L'architettura di oggi è in [architettura.md](architettura.md); come nasce
un prodotto nuovo in [nuovo-prodotto.md](nuovo-prodotto.md).

---

## 1. Più prodotti SaaS

Accanto a drink verranno altri prodotti, ognuno con la sua app e la sua
regia, sotto l'Organizzazione dell'azienda:

- **drink**: comande, conti e cassa per bar e ristoranti. È il primo.
- **gym-tracker**: gestione della palestra (ingressi, clienti, piani,
  corsi, appuntamenti, classi virtuali). Nasce dal primo tentativo,
  saas-portal ([saas-portal.md](saas-portal.md)).
- **un'altra app da saas-portal**, da decidere.

## 2. I servizi base, integrati nei prodotti

L'idea dell'utente: alcune funzioni servono a più attività, e diventano
**prodotti base** che i prodotti verticali si portano dentro.

| Servizio base | Cosa fa | Chi lo usa, ad esempio |
|---|---|---|
| **Inventario** | articoli, quantità, movimenti, fornitori, scorte minime | drink (il magazzino del bar), gym-tracker (i macchinari della palestra) |
| **Clienti** | anagrafica, contatti, storico, fidelizzazione | drink e gym-tracker, come modulo in più |
| **Finanze** | entrate e uscite dell'attività, conti collegati, una dashboard | tutti; e il titolare la ritrova nella sua finanza personale |

Ognuno ha **il suo backend e il suo frontend**, e si vende in due modi:

- **da solo**, come prodotto con la sua regia (un negozio che vuole solo
  l'inventario);
- **dentro un prodotto verticale**, come modulo che la licenza accende (il
  magazzino di drink diventa l'inventario generico).

Quando arriverà, **il magazzino di drink si separa nell'inventario
generico**, e drink lo usa come gli altri prodotti.

**Come integrarli senza perdere l'isolamento.** I dati di un cliente
restano nel suo progetto Google. Le strade, da scegliere col secondo
prodotto:

1. **Modulo condiviso**: il servizio base è un pacchetto (interfaccia,
   regole, Functions) che ogni app installa. I dati stanno nel progetto
   del cliente, in collezioni del servizio (`inventario/…`). È la più
   semplice e tiene l'isolamento di oggi.
2. **App accanto all'app**: il servizio base è un'app sua, pubblicata
   **nello stesso progetto** del cliente, su un secondo sito Hosting, con
   lo stesso accesso e lo stesso database. Il prodotto verticale la apre
   o la incorpora.
3. **Servizio centrale per tutti i clienti**, con le sue API: rompe
   l'isolamento per progetto, e va evitato per i dati operativi.

La 1 o la 2. La licenza dice quali servizi base un cliente ha, come oggi
dice i moduli. I microservizi di saas-portal (Express e Postgres) non si
riusano: sono un altro stack e non sono pronti ([saas-portal.md](saas-portal.md)).

**Finanze e finanza personale.** Il servizio finanze raccoglie i conti
che portano i soldi dell'attività e li mostra in una dashboard, anche
accanto alla finanza personale del titolare. Collegare i conti bancari
vuol dire passare per un aggregatore autorizzato PSD2: è un fornitore da
scegliere, con i suoi costi e i suoi contratti.

## 3. Statistiche aggregate, senza violare la privacy

Serve una vista d'insieme su tutti i prodotti: quanti locali, quanto
lavorano, cosa usano, cosa li fa comprare, chi abbandona. Ma i dati dei
clienti stanno nei loro progetti, ed è giusto così.

Il disegno:

- **un progetto analitico dell'azienda** (es. un dataset BigQuery), separato
  da regie e istanze;
- **le regie** ci mandano i loro dati: registrazioni, piani, conversioni
  dal Free, prove dei moduli, disdette. Sono dati dei clienti
  dell'azienda, già nella regia;
- **le istanze** ci mandano solo **aggregati anonimi**, calcolati dentro
  l'istanza da un job programmato: conteggi e somme per giorno (ordini,
  conti, prodotti, moduli usati). Mai righe, nomi, importi di un singolo
  cliente del locale. Sotto una soglia minima un aggregato non si manda;
- nel contratto con i titolari (termini e nomina a responsabile) va
  scritto che l'azienda usa statistiche aggregate e anonime del servizio.

Il principio di oggi resta: la regia non contiene i dati operativi dei
locali, e nemmeno il progetto analitico.

## 4. Marketing tra i prodotti

L'utente vuole raggiungere tutto il bacino dei prodotti: consigliare gli
altri prodotti, mandare comunicazioni promozionali ai titolari, fare
campagne.

**A chi si può scrivere, e a chi no:**

| Chi | Si può? | Come |
|---|---|---|
| **I titolari**, clienti dell'azienda, iscritti a una regia | sì | col consenso al marketing chiesto alla registrazione (la regia lo raccoglie già, nei consensi). Ai clienti si possono proporre prodotti simili ai loro con la sola possibilità di dire no a ogni messaggio (il «soft spam» del Codice privacy, art. 130 c. 4); per tutto il resto serve il consenso |
| **Gli utenti finali dei locali** (i clienti del bar, gli iscritti della palestra) | **no**, per l'azienda | quei dati sono del locale: l'azienda li tratta per conto suo, come responsabile, e non li può usare per sé. Il locale può fare il suo marketing, con gli strumenti del prodotto (modulo Clienti) |

Il disegno:

- **un elenco unico dei contatti dell'azienda** (un CRM, o una collezione
  nel progetto dell'azienda) che le regie alimentano: chi è, quali
  prodotti ha, quali consensi ha dato e quando;
- **la revoca vale ovunque**: chi si disiscrive da una regia è fuori da
  tutte le campagne;
- **un account unico** tra i prodotti, quando servirà: chi ha drink e
  gym-tracker entra con lo stesso account. È il «registro multi-prodotto»
  che saas-portal aveva disegnato (`platform_customers`,
  `customer_products`), da rifare in Firestore.

## 5. Il modello di business

Da fare con l'utente: la prima proposta è in
[modello-di-business.md](modello-di-business.md).

## 6. Cosa tenere a mente da oggi

Le scelte di oggi che tengono aperte queste strade:

- **Organizzazione col nome dell'azienda**, cartelle per prodotto: un
  progetto analitico e un CRM ci stanno senza toccare i prodotti.
- **Consensi raccolti alla registrazione, con data**: servono al marketing
  di domani.
- **La licenza è il punto unico** in cui un'app sa cosa ha acceso: i
  servizi base ci entreranno come moduli.
- **Il magazzino di drink** si tiene ordinato come un modulo a sé, così si
  stacca più facilmente quando diventa l'inventario generico.
- **I nomi tecnici dei progetti** sono per prodotto (`drinkpos-`): un
  prodotto nuovo ha il suo prefisso.
