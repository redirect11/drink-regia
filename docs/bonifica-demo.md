# La pulizia di drinkpos-demo (REQ-FLOTTA-019)

Scritta il 02/11/2026, dopo la revisione di sicurezza della demo. Il
progetto `drinkpos-demo` è nato come app vera: la 1.10.0-beta del 22/10, col
profilo completo, la registrazione aperta, le Functions e lo Storage. La
demo nuova (la build `CLIENTE=demo` di tana-drink, `docs/modalita-demo.md`)
non usa niente di tutto questo. Il workflow `aggiorna-istanza.yml` pubblica
il database e lo Storage chiusi, ma non toglie quello che c'è già. Questa è
la lista di quello che va tolto a mano.

**Ogni comando di scrittura si lancia solo col via libera dell'utente**: è un
progetto vero, e il sito è pubblico. I comandi di sola lettura si possono
lanciare quando si vuole.

## 0. Subito: il sito vecchio non si apre più

Finché la demo nuova non è pubblicata, il sito vecchio fa registrare
chiunque in un progetto che nessuno sorveglia. Si spegne l'hosting (il
prossimo deploy lo riaccende):

```sh
firebase hosting:disable --project drinkpos-demo
```

## 1. Cosa c'è (sola lettura)

```sh
firebase functions:list --project drinkpos-demo
gcloud functions list --project drinkpos-demo --regions europe-west1
gcloud run services list --project drinkpos-demo
gcloud scheduler jobs list --project drinkpos-demo --location europe-west1
gcloud secrets list --project drinkpos-demo
gcloud storage buckets list --project drinkpos-demo
gcloud services api-keys list --project drinkpos-demo
firebase hosting:channel:list --project drinkpos-demo
firebase apps:list --project drinkpos-demo
gcloud projects get-iam-policy drinkpos-demo
# I provider di accesso e la registrazione aperta
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: drinkpos-demo" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/drinkpos-demo/config"
# Le regole in vigore (Firestore e Storage)
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://firebaserules.googleapis.com/v1/projects/drinkpos-demo/releases"
```

Nella console: Authentication → Users (quanti utenti), Firestore (quali
collezioni), e sulla regia di test `istanze/<slug della demo>`
(`licenza_dalla_regia`, `cliente`, `progetto`).

## 2. La pulizia (col via libera)

Nell'ordine:

1. **Le Functions**, con i loro job pianificati: i nomi dal punto 1.
   ```sh
   firebase functions:delete <nome> [<nome> …] --project drinkpos-demo --region europe-west1 --force
   ```
2. **Il segreto di SumUp** e gli altri del punto 1:
   ```sh
   gcloud secrets delete SUMUP_API_KEY --project drinkpos-demo
   ```
3. **L'accesso**: in Authentication → Sign-in method si spengono Email e
   Google, e in Settings → User actions «Enable create (sign-up)». Poi si
   cancellano gli utenti (Users → seleziona tutti → Delete). Con gli utenti
   cancellati i loro token non si rinnovano più.
4. **Il database**: i dati scritti dai visitatori del sito vecchio. Le regole
   chiuse li rendono illeggibili, ma restano dati personali da non tenere.
   ```sh
   firebase firestore:delete --all-collections --project drinkpos-demo --force
   ```
5. **I file**: le foto caricate nel bucket del punto 1 (la demo nuova ha le
   sue nella build).
   ```sh
   gcloud storage rm --recursive "gs://<bucket>/**"
   ```
6. **I canali di anteprima** dell'hosting del punto 1:
   ```sh
   firebase hosting:channel:delete <canale> --project drinkpos-demo --force
   ```
7. **La chiave API**: la demo nuova non la usa (la sua configurazione è
   finta). Si restringe ai due indirizzi del sito, o si cancella:
   ```sh
   gcloud services api-keys update <KEY_ID> --project drinkpos-demo \
     --allowed-referrers="https://drinkpos-demo.web.app/*,https://drinkpos-demo.firebaseapp.com/*"
   ```

## 3. La demo nuova

Dalla regia di test, sulla scheda della demo: «La aggiorna la regia» con la
cartella `demo`, poi «Aggiorna subito». La regia di test pubblica `develop`
di tana-drink (`APP_REF` in `functions/.env.drink-regia-test`), che ha la
modalità demo. Il workflow:

- scrive una configurazione finta (`demo-drinkpos`), non quella del progetto;
- non dà alla build l'indirizzo di nessuna regia;
- controlla che il pacchetto sia la demo e non porti il progetto vero;
- pubblica il database e lo Storage chiusi;
- aggiunge le intestazioni di sicurezza (`infra/demo/intestazioni.json`):
  con `connect-src 'self'` è il browser stesso a non lasciar uscire niente.

Poi si controlla dal browser: `https://drinkpos-demo.web.app` mostra la
fascia della demo, la scelta del ruolo, e nessuna richiesta verso
`googleapis.com` o `cloudfunctions.net` negli strumenti di sviluppo.

Quando la modalità demo arriverà su `main` di tana-drink, la demo si potrà
registrare anche nella regia di produzione e aggiornarsi da lì con i
rilasci.
