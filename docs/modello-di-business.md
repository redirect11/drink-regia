# Modello di business: prima proposta

Scritto il 30/10/2026 su richiesta dell'utente («ci serve un modello di
business»). È una **bozza da discutere**: i prezzi li decide l'utente, e
qui quelli di oggi (`functions/piani.json`) sono solo il punto di
partenza. Le domande aperte sono in fondo.

## 1. Cosa vendiamo, e a chi

- **A chi**: le attività (bar, ristoranti, poi palestre e altre), cioè i
  titolari. Non vendiamo agli utenti finali dei locali.
- **Cosa**: un'app tutta loro, un progetto per cliente con i suoi dati,
  pubblicata, aggiornata e garantita da noi. Il valore non è solo l'app:
  è non doversi occupare di niente. Installazione, aggiornamenti, backup
  e sicurezza sono nostri.
- **Il modello**: abbonamento mensile (SaaS) con una porta d'ingresso
  gratuita (freemium) e moduli in più (add-on).

## 2. Da dove arrivano i ricavi

| Voce | Oggi in drink | Note |
|---|---|---|
| **Abbonamento** al piano | Base 24 €, Completo 69 € al mese, IVA esclusa | la voce principale, ricorrente |
| **Moduli in più** | da 6 a 15 € al mese l'uno (menù ai tavoli, ordini del cliente, clienti, magazzino, statistiche, staff, SumUp) | il Completo li include: conviene da 4 o 5 moduli in su |
| **Terminali in più** | 12 € al mese l'uno | cresce con la dimensione del locale |
| **Attivazione** | 250 € una volta | copre configurazione e avvio; da valutare se è un freno alle vendite |
| **Credito AI** | pacchetti da 10, 25 e 50 € | oggi al costo (ricarico 1): il ricarico è da decidere |
| **Free** | 0 € | non è un ricavo: è il canale che porta clienti. Si misura col tasso di passaggio a pagamento |

Voci da valutare:

- **sconto annuale** (es. due mesi gratis pagando l'anno): incassa prima e
  riduce le disdette. saas-portal lo prevedeva;
- **servizi base** come prodotti a sé o moduli dei verticali (inventario,
  clienti, finanze), con un prezzo per prodotto e uno «dentro un altro
  prodotto» ([sviluppi-futuri.md](sviluppi-futuri.md) §2);
- **pacchetti tra prodotti**: chi ha già un prodotto paga meno il
  secondo;
- **rivenditori e consulenti** (commercialisti, fornitori di bevande, chi
  installa casse): una provvigione ricorrente su chi portano;
- **servizi a parte**: configurazione del menù, formazione, stampante e
  hardware.

## 3. Cosa costa un cliente

| Costo | Quanto, a grandi linee | Note |
|---|---|---|
| Google Cloud, Free (profilo leggero) | zero nelle soglie gratuite | database, sito e accesso. Occupa un posto nella quota dei progetti |
| Google Cloud, a pagamento (completo) | da pochi centesimi a qualche euro al mese, secondo l'uso | Functions, build, Storage. Va misurato sui primi locali veri |
| Stripe | una percentuale e una quota fissa per ogni pagamento | sulle carte europee standard l'ordine è 1,5% + 0,25 €: sui 24 € del Base circa 0,6 € al mese |
| AI | il costo dei modelli, coperto dal credito | il ricarico decide il margine |
| Assistenza | il costo vero dei primi anni | si abbassa con l'app che si spiega da sola e la documentazione |
| Strumenti | GitHub, domini, email | fissi, da dividere su tutti i clienti |

Il margine lordo sul software è alto. Il costo che conta è **acquisire un
cliente e tenerlo**, ed è lì che servono il Free, le prove dei moduli e il
marketing tra i prodotti.

## 4. I numeri da guardare

- **MRR**, il ricavo ricorrente del mese, e quanto cresce;
- **passaggio dal Free a pagamento**, e in quanti giorni;
- **prove dei moduli diventate acquisti**;
- **disdette al mese (churn)** e motivo;
- **ricavo medio per cliente (ARPA)**, e quanto pesano moduli e terminali;
- **costo per acquisire un cliente (CAC)** contro **valore nel tempo
  (LTV)**: la regola pratica è un LTV almeno tre volte il CAC.

Li darà il progetto analitico ([sviluppi-futuri.md](sviluppi-futuri.md)
§3); i primi si leggono già dalla regia.

## 5. Come si arriva ai clienti

1. **La Tana come caso vero**: un locale che ci lavora ogni sera.
2. **Il Free** come porta d'ingresso, con i limiti pensati perché, provata
   l'app completa, comprare sia quasi necessario.
3. **Locali pilota** a condizioni di favore, in cambio di riscontri e di
   una testimonianza.
4. **Rivenditori** sul territorio.
5. **Marketing tra i prodotti**, quando ce ne saranno più di uno, ai
   titolari che hanno dato il consenso.

## 6. Domande aperte per l'utente

1. L'**attivazione a 250 €** resta? Con il Free può diventare un costo solo
   per chi vuole l'installazione assistita.
2. **Sconto annuale**: sì o no, e quanto?
3. **Ricarico sul credito AI**: al costo, o con un margine?
4. **Pagamenti fuori da Stripe** (bonifico) anche dopo l'apertura dei
   pagamenti online, o solo finché sono spenti?
5. **Rivenditori**: li vogliamo? Con che provvigione?
6. Il **prezzo dei servizi base** da soli e dentro un verticale.
7. Il **confronto coi concorrenti** (le casse e i gestionali per la
   ristorazione, con le loro offerte a canone) da fare prima di fissare i
   prezzi di produzione.
