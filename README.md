# Pragma

Sistema locale di controllo accessi basato su Node.js e SQLite.

## Add-on Home Assistant

Il repository include un add-on Home Assistant con interfaccia via Ingress e database persistente. Per installarlo, aggiungi `https://github.com/bzorzetto/Pragma` come repository nello Store dei componenti aggiuntivi, installa Pragma e configura una password amministratore di almeno 12 caratteri. La documentazione completa è in [addon/pragma/DOCS.md](addon/pragma/DOCS.md).

L'add-on usa il token temporaneo di Supervisor per invocare i servizi di Home Assistant. L'API HTTPS dei lettori NFC è opzionale e richiede un certificato TLS nella cartella `/ssl` e la porta 3443 raggiungibile dai lettori.

## Avvio dell'interfaccia

Richiede una versione recente di Node.js. Dalla cartella del progetto:

```bash
npm install
npm start
```

Apri [http://127.0.0.1:3000](http://127.0.0.1:3000). Il server applica automaticamente le migrazioni al database `data/parking.db` all'avvio. Per interromperlo, premi `Ctrl+C` nel terminale.

Al primo avvio, copia `.env.example` in `.env` e imposta `PRAGMA_USERNAME` e `PRAGMA_PASSWORD` con credenziali personali; la password deve contenere almeno 12 caratteri. L'interfaccia e le API amministrative richiedono il login. La sessione usa un cookie HttpOnly e scade dopo 12 ore; riavviare il server invalida le sessioni attive. Dopo dieci accessi falliti dallo stesso indirizzo, i tentativi vengono temporaneamente limitati.

Durante lo sviluppo puoi usare `npm run dev` per riavviare automaticamente il server quando cambiano i file.

Per attivare l'API HTTPS dei lettori, copia `.env.example` in `.env` e configura certificato e chiave TLS. Il certificato deve essere attendibile dal lettore NFC e valido per l'hostname usato dal lettore. Mantieni la chiave privata fuori dal repository e leggibile solo dall'utente di sistema che esegue Pragma. Senza entrambi i file TLS l'API lettori non viene avviata; la pagina amministrativa locale continua a funzionare.

Per usare Home Assistant, configura `HOME_ASSISTANT_URL` (ad esempio `http://homeassistant.local:8123`) e `HOME_ASSISTANT_TOKEN` nel `.env`, quindi riavvia Pragma. Crea un token di accesso a lunga durata dal profilo Home Assistant e mantienilo privato. Nella configurazione del varco seleziona Home Assistant, scegli `switch.turn_on`, `automation.turn_on` o `automation.trigger` e inserisci l'ID dell'entità corrispondente. `automation.turn_on` abilita l'automazione; `automation.trigger` ne esegue subito le azioni. Pragma invia al server Home Assistant una richiesta REST autenticata; il token resta sul server e non viene salvato nel database. Per l'API REST e le chiamate ai servizi, consulta la [documentazione ufficiale Home Assistant](https://developers.home-assistant.io/docs/api/rest/).

## Funzioni incluse

- consultazione, creazione e modifica delle anagrafiche;
- abilitazione e disabilitazione degli utenti;
- eliminazione definitiva dell'utente e dei relativi badge, veicoli, regole e fasce (i log restano, scollegati dall'utente);
- associazione manuale e disattivazione dei token NFC;
- creazione e disattivazione delle regole di accesso e gestione delle fasce settimanali;
- creazione e modifica dei varchi, direzione, abilitazione e configurazione dell'uscita Shelly RPC o Home Assistant;
- associazione di uno o più varchi autorizzati a ciascun utente;
- registrazione dei lettori, assegnazione dei varchi e credenziale bearer casuale mostrata una sola volta.
- consultazione paginata del registro degli accessi, con esito, utente, varco, lettore e motivo.

Le API HTTP implementate sono:

| Metodo | Percorso | Operazione |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Accesso amministratore |
| `POST` | `/api/auth/logout` | Uscita |
| `GET` | `/api/auth/session` | Verifica sessione |
| `GET` | `/api/users` | Elenco utenti e relativi token |
| `POST` | `/api/users` | Creazione utente |
| `PUT` | `/api/users/:id` | Modifica utente |
| `DELETE` | `/api/users/:id` | Elimina utente e dati collegati, conservando i log |
| `PUT` | `/api/users/:id/gates` | Sostituisce l'elenco dei varchi autorizzati all'utente |
| `GET` | `/api/readers` | Elenco lettori (mai le credenziali) |
| `POST` | `/api/readers` | Registra un lettore e genera la credenziale |
| `PUT` | `/api/readers/:id` | Modifica nome, abilitazione e varchi del lettore |
| `DELETE` | `/api/readers/:id` | Revoca disabilitando il lettore |
| `POST` | `/api/reader/access` | Valuta un badge e, se autorizzato, comanda il relay (solo HTTPS) |
| `POST` | `/api/users/:id/tokens` | Associazione token |
| `DELETE` | `/api/tokens/:id` | Disattivazione token |
| `POST` | `/api/users/:id/access-rules` | Crea una regola di accesso |
| `POST` | `/api/access-rules/:id/schedules` | Aggiunge una fascia settimanale |
| `DELETE` | `/api/access-rules/:id` | Disattiva una regola |
| `DELETE` | `/api/schedules/:id` | Elimina una fascia settimanale |
| `GET` | `/api/gates` | Elenco varchi |
| `GET` | `/api/access-logs` | Registro accessi paginato e filtrabile (`limit`, `offset`, `name`, `dateFrom`, `dateUntil`, `gateId`) |
| `POST` | `/api/gates` | Crea un varco |
| `PUT` | `/api/gates/:id` | Modifica un varco |
| `DELETE` | `/api/gates/:id` | Elimina un varco e le sue assegnazioni |
| `DELETE` | `/api/readers/:id` | Elimina un lettore e revoca la credenziale |

Per `/api/access-logs`, `name` cerca nome o cognome; `dateFrom` e `dateUntil` delimitano un intervallo in UTC nel formato `AAAA-MM-GG HH:MM:SS` (`dateUntil` è esclusivo); `gateId` seleziona un varco. I filtri si possono combinare.

## Configurazione e limiti di questa bozza

L'interfaccia amministrativa ascolta solo su `127.0.0.1`. L'API per i lettori viene esposta separatamente in HTTPS quando sono configurati certificato e chiave. Registra un lettore dalla pagina, assegnagli uno o più varchi e salva il bearer token mostrato una sola volta. Il lettore invia `POST /api/reader/access` con `Authorization: Bearer <credenziale>` e JSON come `{"readerId":1,"tag":"04AABBCCDDEE","gateId":1,"direction":"ENTRY"}` (il campo `direction` serve per i varchi bidirezionali). Il server risponde `{"result":"ok"}` oppure `{"result":"nok","reason":"..."}`; gli esiti sono registrati nel log accessi, incluso il lettore.

L'accesso è concesso solo se credenziale e lettore sono attivi, il lettore è associato al varco, badge e utente sono attivi, l'utente è associato al varco e almeno una sua regola è valida per data e fascia oraria correnti. Le eccezioni della regola vengono applicate alla data corrente e le festività bloccano l'accesso se non c'è un'eccezione consentita. Solo dopo questi controlli Pragma invia allo Shelly `Switch.Set` con `toggle_after` usando la durata impulso configurata; `ok` indica che lo Shelly ha accettato il comando, non conferma il movimento meccanico del cancello. Il Raspberry usa il proprio fuso orario locale per valutare giorni e orari: configurarlo correttamente. Proteggi la rete dei relay; il comando Shelly avviene sulla LAN tramite HTTP locale.

Il flusso NFC corrente identifica il tag dal valore letto (ad esempio UID) e non esegue autenticazione crittografica tra carta e lettore. Un UID da solo non è una credenziale anti-clonazione: per installazioni che richiedono maggiore sicurezza, prevedi tag e lettori con autenticazione reciproca e chiavi, ad esempio una soluzione basata su MIFARE DESFire ([funzioni di sicurezza NXP](https://www.nxp.com/products/rfid-nfc/mifare-hf/mifare-desfire/mifare-desfire-light%3AMIFARE_DESFIRE_LIGHT)).
