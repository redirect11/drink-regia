# drink-regia — istruzioni per chi lavora qui (persone e agenti)

Il sito del prodotto: prezzi, registrazione, dashboard dei clienti,
backoffice, abbonamento, Functions di attivazione e, dal 29/10/2026, la
flotta: il Terraform dei locali e i workflow che li attivano e li
aggiornano ([docs/flotta-nella-regia.md](docs/flotta-nella-regia.md)).
Progetto Firebase `drink-regia`. L'app dei locali sta nel repository
`tana-drink`: lì `docs/flotta.md` è il disegno intero, e le regole di
lavoro sono le stesse di quel repository.

- **Prima di tutto, [docs/handover.md](docs/handover.md)**: perimetro,
  processo di rilascio, stato del progetto, lavori aperti e contratti
  condivisi con tana-drink. È il punto di partenza di ogni sessione.
- **Tutto in italiano**: interfaccia, commenti, commit, PR.
- **GitFlow**: si lavora su `release/x.y.z` da `develop`; mai commit diretti
  su `develop` o `main`, merge solo via pull request. Un push su `develop` va sul sito di test
  (`drink-regia-test`); in produzione (`drink-regia`) va solo un tag su
  `main`. Un tag fuori da `main` non pubblica niente. Il lancio a mano di
  «Deploy to Firebase» su un ramo va sul test.
- **Prima di una PR**: `npm run lint`, `npm test`, `npm run build` puliti.
- **I test sono la specifica** (`tests/`), e il registro
  `requirements/requirements.yaml` è la mappa: ogni file di test è citato da
  un requisito, ogni test citato esiste (`tests/requisiti.test.js`). Ogni
  richiesta lavorata nasce o aggiorna la sua voce, nello stesso commit.
- **I commenti spiegano il perché.** Tono professionale a schermo: niente
  toni da venditore nemmeno nella pagina dei prezzi.
- **Non si scrive in produzione di propria iniziativa.** `firebase deploy`
  su `drink-regia` solo col via libera; gli script e le prove vanno sugli
  emulatori.
- **I prezzi** (`functions/piani.json`) e **il nome del prodotto** (`src/lib/prodotto.js`)
  si cambiano solo su decisione dell'utente.
- La regia **non contiene mai i dati operativi dei locali**: solo account,
  piani, abbonamenti, stato delle istanze.
