# Cambiamenti della regia

Una voce per ogni cambiamento visibile, nello stesso commit del
cambiamento. La versione in cima è quella in lavorazione finché non ha la
data.

## 0.1.0 (non ancora pubblicata)

- La richiesta di attivazione dell'istanza la scrive il server, non il
  browser: la Function `chiediAttivazione` rilegge cliente, abbonamento e
  impostazioni e rifiuta chi non ha un abbonamento attivo, chi non ha
  confermato l'email o chi ha già un'attivazione in viaggio. Le regole
  Firestore non lasciano più creare richieste ai client (audit del
  22/10/2026, falla C2). Se il server rifiuta, la dashboard dice perché.
