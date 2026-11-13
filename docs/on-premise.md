# L'installazione on premise

REQ-FLOTTA-021, requisito di business, **da fare** (31/10/2026). Qui c'è
il prodotto e quello che tocca alla regia. Il lavoro sull'app è in
tana-drink: REQ-FLOTTA-021 e `docs/porte-e-adattatori.md`, ramo
`feature/porte-e-adattatori`.

## Cosa ha deciso l'utente

> «on premise viene ospitato tutto il gestionale con backup su cloud. Ha
> più senso. Per lo scatolotto e supporto alla stampante poi si vede caso
> per caso»
>
> «tana-drink è sempre lo stesso ma dove si installa e come si configura è
> roba di regia. Per l'installazione on premise io farei proprio delle
> immagini già pronte da installare e da mantenere aggiornate»
>
> «possiamo prevedere delle interfacce che implementano le logiche di
> firebase o altre logiche con altri db [...] Così possiamo riutilizzare
> tutto anche su cloud puro»

I livelli di installazione sono tre (proposta di tana-drink,
`docs/stampanti-e-livelli.md`):

1. **cloud**, quello di oggi: un progetto Firebase per locale;
2. **app** Android e iOS;
3. **on premise**: il gestionale intero gira su un apparecchio nel locale,
   e il cloud fa backup e consultazione da fuori.

Il server di stampa per le stampanti che il browser non raggiunge si
decide locale per locale.

## Cosa vendiamo

Un locale che **lavora tutto insieme anche senza internet**: sala, banco e
cucina si vedono attraverso l'apparecchio nella loro rete. Il cloud tiene
la copia dei dati, la consultazione da fuori e quello che arriva da fuori.
L'apparecchio lo prepariamo, lo aggiorniamo, lo controlliamo e lo
sostituiamo noi.

## Come è fatto

### L'app è sempre la stessa

tana-drink parla con delle porte sue (configurazione, dati, accesso, file,
server, notifiche). Nel cloud dietro le porte c'è Firebase. Nell'on
premise c'è un backend locale. Dove si installa e come si configura lo
decide la regia, con la configurazione che l'app legge all'avvio.

### Il backend locale

Si sceglie con un prototipo. Due cose sono già decise:

- **Niente emulatori di Firebase in produzione.** I token dell'emulatore
  di Auth non sono firmati, quindi un cliente sul Wi-Fi del locale potrebbe
  presentarsi come titolare. I comandi di amministrazione non sono
  protetti, e uno svuota il database. I dati stanno in memoria fino
  all'uscita, quindi con un blackout si perde la serata.
- **Un'istanza per locale**, come oggi un progetto per locale: non serve
  un database distribuito.

La candidata è **PocketBase con Litestream**: un solo programma (SQLite,
tempo reale, accesso, regole), e la copia continua del database su un
bucket nel cloud. L'alternativa più pesante è Supabase self-hosted
(Postgres). La logica del server di tana-drink gira in un piccolo servizio
Node accanto al database. Lo stesso insieme gira anche su una macchina
virtuale di un altro fornitore (AWS, Hetzner, Google): è il «cloud puro».

### Il cloud del locale

Ogni locale on premise ha il suo progetto `drinkpos-<slug>`, come gli
altri, ma con un altro compito:

- **il backup**: la copia continua del database e dei file, cifrata. Una
  scatola nuova si ripristina da qui;
- **la consultazione da fuori**: una copia in sola lettura, per il
  titolare da casa;
- **quello che arriva da fuori**: gli ordini dei clienti col 4G, le
  modifiche fatte da casa. Restano in una casella del cloud, e
  l'apparecchio la svuota con connessioni solo in uscita.

**I dati del locale non passano mai dalla regia**: la regia tiene solo
account, piani, abbonamenti e lo stato degli apparecchi (`CLAUDE.md`).

### L'immagine

La prepara e la aggiorna la regia:

- **all'inizio**: Debian minimale con l'app, il backend, un server web che
  rinnova il certificato da solo (Caddy) e l'agente della regia;
- **gli aggiornamenti**: l'agente scarica le versioni firmate. App e
  backend seguono le regole di REQ-FLOTTA-020 (obbligatori o a scelta);
  il sistema operativo e le correzioni di sicurezza sono sempre
  obbligatori;
- **quando gli apparecchi saranno tanti**: gli aggiornamenti su due
  partizioni (Mender o RAUC). Se un aggiornamento non parte, l'apparecchio
  torna da solo alla versione di prima.

### L'apparecchio

Siccome tiene i dati del locale:

- 8 GB di memoria e un SSD, niente schede SD, senza ventola, porta di rete
  via cavo, accensione automatica dopo un blackout. Un thin client
  ricondizionato (Dell Wyse 5070, Fujitsu Futro S740) basta, se
  configurato così;
- un piccolo gruppo di continuità;
- i dati cifrati sul disco;
- in comodato, proposta da decidere: resta nostro, e lo sostituiamo noi.
  La sostituta si ripristina dal backup.

### Il nome nella rete del locale

L'apparecchio ha un nome pubblico che punta al suo indirizzo nella rete
del locale, con un certificato vero (Let's Encrypt, verifica DNS). Così il
browser se ne fida, e il router del locale non si tocca.

- Il nome non dice il locale (`k7f3q2.locale.<dominio>`): i certificati
  finiscono nei registri pubblici.
- Il record della verifica lo scrive la regia, su richiesta firmata
  dall'apparecchio e solo per il suo nome. L'apparecchio non ha chiavi del
  DNS.
- Alcuni router bloccano un nome pubblico che punta a un indirizzo interno
  (la protezione dal «DNS rebinding»): va provato col prototipo, e serve
  una strada di riserva.

### L'attivazione e il controllo

- Dalla dashboard il titolare chiede un codice o un QR, valido pochi
  minuti e una volta sola. L'apparecchio lo scambia con una chiave sua,
  di cui la regia tiene solo l'impronta (come la chiave AI). Si revoca dal
  backoffice.
- L'apparecchio chiama la regia ogni pochi minuti, solo in uscita: è
  acceso, versione, ultimo backup riuscito. Nel backoffice, un apparecchio
  che tace o un backup che non arriva diventano un avviso.
- Licenza e sospensione arrivano dalla regia come per gli altri locali.

## Ordine di lavoro

1. **In tana-drink**: le porte con il solo adattatore Firebase, e la
   configurazione all'avvio (REQ-FLOTTA-021 di tana-drink). Non cambia
   niente per chi usa l'app.
2. **Il prototipo**: il backend locale scelto, il secondo adattatore,
   l'ospite Node, Litestream sul progetto del locale, su un thin client.
3. **Nella regia**: l'attivazione col codice, la chiave dell'apparecchio,
   il nome e i certificati, il controllo nel backoffice.
4. **L'immagine** e i suoi aggiornamenti.
5. **Il primo locale vero**, poi il cloud puro se serve.

## Domande aperte per l'utente

- **Prezzi**: l'on premise è un piano o un modulo? Costo una tantum e
  canone, e il tecnico a parte (`functions/piani.json` si cambia solo su
  decisione dell'utente).
- **Comodato o vendita** dell'apparecchio.
- **Il dominio** dei nomi nella rete dei locali, e il soggetto che apre
  dominio e account degli store.
- **La sostituzione**: in quanto tempo, scritto nel piano.
