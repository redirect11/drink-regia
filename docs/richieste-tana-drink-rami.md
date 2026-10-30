# Richieste per tana-drink: la build per cliente su develop e main

Scritto il 30/10/2026 dalla sessione della regia, da portare alla
sessione che lavora su tana-drink. La regia non modifica tana-drink.

## Il problema

Le regie, test e produzione, pubblicano l'app dei locali dal ramo
`feature/flotta` di tana-drink (`APP_REF` in `functions/.env.drink-regia*`).
Lì c'è quello che serve a un locale che non è la Tana. Ma il ramo è
fermo al 22/10/2026:

- **è indietro di 33 commit rispetto a `develop`**: i locali non ricevono
  le correzioni della 1.9.x che la Tana ha già;
- **contiene pezzi superati**: dal 29/10/2026 la flotta (Terraform,
  workflow di attivazione e aggiornamento, script delle istanze) sta nella
  regia;
- **il merge in `develop` va in conflitto** (provato con `git merge-tree`).

Decisione dell'utente del 30/10/2026: la build per cliente va su `develop`
e poi su `main` di tana-drink. Da lì la regia di test pubblica `develop`,
la produzione `main` o un tag `vX.Y.Z`.

## Cosa portare da `feature/flotta` in `develop`

È **l'app che sa essere di qualsiasi locale**, non il deploy delle istanze:

| Cosa | File, in `feature/flotta` |
|---|---|
| Il locale come dato | `clienti/` (`tana/venue.json`, `demo/`, `manifest.template.json`, `pluginCliente.js`, `README.md`), `vite.config.js` |
| La cartella di un cliente nuovo | `scripts/genera-cliente.mjs` (la regia la lancia con `--slug --nome`), `scripts/immagini-neutre.py` |
| La licenza coi moduli, la sospensione | `src/lib/licenza.js`, `src/components/FunzioneNonInclusa.jsx`, `src/components/InstallazioneSospesa.jsx` |
| Nome, logo e marchio del locale | `src/components/IdentitaLocale.jsx`, `src/lib/nomeApp.js`, il marchio, `public/manifest.webmanifest` |
| Le impostazioni migrate per locale | `src/lib/migrazioneChiavi.js` e le modifiche in `src/lib`, `src/components` |
| Il nome del locale nelle Functions | `functions/.env.tana-drink`, `functions/.env.tana-drink-test`, `VENUE_NAME` in `functions/index.js` |
| I test | `tests/unit/clienteBuild`, `venue`, `licenza`, `marchio`, `migrazioneChiavi`, `sezioni` e quelli toccati |
| Il deploy della Tana con `CLIENTE` | l'input `cliente` (predefinito `tana`) in `deploy.yml` e `firebase-hosting.yml` |

## Cosa non portare (sta nella regia, o non serve più)

- `.github/workflows/provisiona-istanza.yml` e `aggiorna-istanza.yml`;
- `infra/` (il Terraform delle istanze);
- `scripts/abilita-accesso-email.mjs`, `abilita-api.mjs`,
  `elimina-istanza.mjs`, `licenza-istanza.mjs`, `ruoli-provisioning.mjs`;
- in `firebase-hosting.yml`, la destinazione «flotta» (`PROGETTO_FLOTTA`,
  `drinkpos-demo`): l'istanza dimostrativa è un'istanza come le altre e la
  aggiorna la regia;
- il sito della regia, se ne resta traccia: sta in drink-regia dal
  22/10/2026.

`docs/flotta.md` e `docs/architettura-prodotto.md` vanno aggiornati: la
flotta è nella regia (drink-regia, `docs/flotta-nella-regia.md`).

## Come restano separate la Tana e le istanze

Dopo il merge tana-drink contiene un'app sola, la stessa per tutti. Non
contiene il deploy delle istanze:

1. **Il codice è uno.** La Tana è un cliente come gli altri:
   `clienti/tana/venue.json` e le impostazioni nel suo database. Una
   richiesta di Flavio che vale solo per la Tana diventa un'impostazione o
   un modulo, mai un `if` sul nome del locale.
2. **Ognuno pubblica il suo.**
   - I workflow di tana-drink pubblicano solo i progetti della Tana
     (`tana-drink`, `tana-drink-test`), con `CLIENTE=tana`.
   - I workflow della regia pubblicano solo i progetti `drinkpos-*`.
3. **Le credenziali sono separate.**
   - Nei segreti di tana-drink c'è solo l'account di deploy della Tana:
     da lì un'istanza non si può pubblicare, nemmeno per sbaglio.
   - L'account di provisioning sta solo negli environment della regia.
4. **Il rilascio è uno.**
   - Un tag `vX.Y.Z` su `main` di tana-drink va in produzione sulla Tana,
     come oggi.
   - Lo stesso tag diventa un rilascio nel backoffice della regia, che lo
     porta ai locali a ondate.
   - `develop` di tana-drink va sul test della Tana e, dalla regia di
     test, sulle istanze di prova.
5. **I test guardano tutti i clienti.** La CI di tana-drink compila
   sia la Tana sia il cliente `demo`, così una modifica pensata per la
   Tana che rompe gli altri si vede prima del rilascio.

## Quando è fatto

- [ ] Su `develop` di tana-drink: `node scripts/genera-cliente.mjs --slug prova-x --nome "Prova"` e `CLIENTE=prova-x npm run build` funzionano.
- [ ] La Tana di test, pubblicata da `develop`, è identica a prima.
- [ ] Un tag su `main` con la build per cliente.
- [ ] La regia mette `APP_REF=develop` sul test e `APP_REF=main` (poi il
      tag del rilascio) in produzione, e `feature/flotta` si chiude.
