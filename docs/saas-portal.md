# saas-portal: il punto prima di archiviarlo

Scritto il 30/10/2026 dopo un'analisi in sola lettura di
`redirect11/saas-portal` (privato). saas-portal è stato il primo tentativo
di creare tenant per più app. L'utente pensa di archiviarlo e toglierlo di
mezzo, portando prima qui quello che può servire. Questo documento serve
a non perdere niente.

## 1. Cos'era

- **Lo scopo**: un portale «SaaS Suite» dove un cliente si registra e si
  abbona a uno o più prodotti verticali (livelli Free, Plus, Pro e
  componenti aggiuntivi), con un accesso unico verso i prodotti.
- **Il prodotto vero**: Gym Tracker (palestre: ingressi, clienti, piani,
  corsi, appuntamenti, classi virtuali). «Risto Tracker» e «Personal
  Finance» erano solo righe di esempio.
- **Lo stack**: React e Vite davanti, microservizi Node/Express con
  Postgres dietro, su Railway e Docker; micro-frontend con Module
  Federation.
- **La storia**: 87 commit, 2/11–8/12/2025; molti scritti da agenti
  (Copilot, Codex) e accettati in giornata.
- **Lo stato: un prototipo a metà migrazione.**
  - SQLite e Postgres insieme;
  - il comando di avvio punta a un file che non c'è;
  - Stripe c'è solo come colonne del database;
  - nessun invio di email;
  - i test end-to-end probabilmente non girano.

## 2. Perché non è la base delle regie

- **Lo stack del backend è un altro**: da lì non si porta niente senza
  riscriverlo.
- **I tenant non sono isolati.** Il tenant lo sceglie il client (header
  `x-tenant-id`), parte delle rotte non chiede l'accesso, e il CORS
  accetta ogni origine con le credenziali.
- **Mancano i pezzi che rendono vendibile drink-regia**: abbonamento
  Stripe, email confermata, attivazione automatica, licenza, ambienti di
  test e produzione.
- **Il nucleo sta fuori**, in repository separati collegati come
  submodule (§4).

I suoi microservizi non conviene riusarli nemmeno per separare i servizi
base. L'idea di separare è giusta, ma va fatta nel nostro stack, con i
dati nel progetto del cliente ([sviluppi-futuri.md](sviluppi-futuri.md) §2).

## 3. Cosa portare via (le idee, non il codice)

| Idea | Dove stava | Che farne |
|---|---|---|
| **Registro multi-prodotto** | `services/customer-service/src/database/schema.sql` | Lo schema in sintesi è sotto. Diventa l'account unico tra le regie, quando servirà |
| **Catalogo dei componenti aggiuntivi con prezzo mensile e annuale**, acceso per tenant, controllato dal servizio con una cache | `deployment/database/plugins-schema.sql`, `pluginCheck.js` | drink lo fa già coi moduli e la licenza. Da prendere: il **prezzo annuale** |
| **Schema di fatturazione** pensato per Stripe: profili di fatturazione, metodi di pagamento, abbonamenti, fatture e righe, transazioni, voci da fatturare | `deployment/database/billing-schema.sql` | Riferimento per quando la regia emetterà fatture sue |
| **Ticket di supporto** nel backoffice | `services/portal/src/routes/` | Utile nella regia: i titolari aprono una richiesta, l'admin risponde |
| **Fatture e statistiche** nel backoffice | idem | Le statistiche vanno nel progetto analitico ([sviluppi-futuri.md](sviluppi-futuri.md) §3) |
| **Prove end-to-end** con Playwright | `tests/e2e/` | Da rifare sull'interfaccia, da zero |
| **Il dominio della palestra** (ingressi, certificati medici, corsi, classi virtuali) | `products/gym-tracker`, e i repository dei submodule | La base di gym-tracker quando si farà |

Il registro multi-prodotto, in sintesi:

```
platform_customers  id, name, email, slug (unico), status (trialing…), metadata, date
platform_products   id, key (unico), name, description, supports_end_users, date
customer_products   id, customer_id → platform_customers, product_key → platform_products,
                    status (inactive…), plan, tenant_slug (unico), config, date
```

## 4. Prima di archiviare: la lista

1. **I repository dei submodule non si archiviano con lui.** Sono separati e
   vanno decisi uno per uno:
   - `auth-microservice`;
   - `virtual-classes-microservice`;
   - `shared-utilities`;
   - `gym-tracker-frontend`;
   - `generic-api-gateway`;
   - e, sul ramo `feature/refactoring_architecture`, `gym-tracker-product`.

   Lì ci sono il sito, l'accesso, il gateway e il prodotto della palestra,
   che l'analisi non ha potuto vedere. **gym-tracker-product e
   gym-tracker-frontend vanno tenuti**: sono la base del prodotto palestra.
2. **Credenziali da considerare bruciate** se sono state usate su un deploy
   vero:
   - gli utenti di prova con una password debole in chiaro
     (`TEST_CREDENTIALS.md`), anche admin del portale;
   - gli hash e le email degli admin negli script SQL;
   - i segreti predefiniti nel codice (`JWT_SECRET`, `dev-internal-key`).

   Se Railway ha ancora servizi accesi con quei valori, vanno spenti o
   cambiati.
3. **Railway**: controllare che non restino servizi o database a
   pagamento.
4. **Il prompt per agenti di terzi** (`.github/agents/TaskSync*.agent.md`):
   dice agli agenti di non chiudere mai la sessione. Se un repository
   collegato lo contiene, va tolto prima di usarlo con Claude.
5. **Archiviare** su GitHub (Settings → Archive): si legge ancora, non si
   modifica, e si può riaprire.

Non ho trovato chiavi vere (Stripe, cloud, GitHub) né nel codice né nella
storia.
