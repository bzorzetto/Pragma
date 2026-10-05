# Pragma

Pragma gestisce gli accessi a parcheggi e varchi: anagrafiche, badge NFC, regole orarie, lettori, dispositivi relay e registro degli accessi. L'add-on esegue l'applicazione e conserva il database nel volume persistente di Home Assistant.

## Installazione

1. Aggiungi il repository GitHub di Pragma a **Impostazioni → Componenti aggiuntivi → Store → ⋮ → Repository**.
2. Installa **Pragma** dallo store e apri la configurazione.
3. Imposta una password amministratore di almeno 12 caratteri, salva e avvia l'add-on.
4. Apri Pragma dal pulsante **Apri interfaccia web** o dal pannello laterale.

Le immagini installabili vengono pubblicate su GitHub Container Registry al rilascio di una versione. Se gestisci il repository, rendi pubblica l'immagine `pragma-addon` su GHCR dopo la prima pubblicazione, così Supervisor può scaricarla senza autenticazione.

L'interfaccia passa attraverso Home Assistant Ingress. Home Assistant verifica l'accesso al pannello e Pragma richiede anche le credenziali amministrative configurate nell'add-on. Database e dati applicativi si trovano in `/data` e sono inclusi nei backup dell'add-on.

## Configurazione

- `username`: nome utente per l'interfaccia amministrativa.
- `password`: password amministratore (almeno 12 caratteri).
- `reader_api_enabled`: abilita l'API HTTPS per i lettori NFC.
- `tls_cert_file` e `tls_key_file`: percorsi del certificato e della chiave, normalmente sotto `/ssl`.

Per abilitare l'API lettori, copia un certificato TLS e la relativa chiave privata nella cartella `/ssl` di Home Assistant, imposta i percorsi, abilita `reader_api_enabled` e avvia o riavvia l'add-on. La porta TCP 3443 deve essere raggiungibile dai lettori. Installa sui lettori la CA che ha emesso il certificato e usa un certificato valido per il nome host usato.

L'add-on usa il token API temporaneo fornito da Supervisor per invocare servizi di Home Assistant. Il token non viene salvato nel database né mostrato nella configurazione. Nel varco seleziona Home Assistant e il servizio da richiamare. Sono supportati `switch.turn_on`, `automation.turn_on` e `automation.trigger`.

Per usare Shelly, il dispositivo deve essere raggiungibile dalla rete interna di Home Assistant. Il fuso orario dell'add-on segue quello di Home Assistant per la valutazione delle fasce orarie.

## Dati e aggiornamenti

Il database SQLite e le migrazioni risiedono in `/data`. Non eliminare i dati dell'add-on se vuoi conservare utenti, badge e registro accessi. Prima di aggiornare, crea un backup di Home Assistant.

L'interfaccia web è accessibile tramite Ingress. L'API lettori NFC, quando abilitata, viene esposta sulla porta 3443 e protetta da TLS e credenziali bearer individuali dei lettori.

## Problemi comuni

- Se l'add-on non parte, verifica che la password abbia almeno 12 caratteri e consulta il registro dell'add-on.
- Se un comando Home Assistant non riesce, verifica che l'entità e il servizio configurati esistano e che il dispositivo sia disponibile.
- Se il lettore non si connette, verifica il mapping della porta 3443, il nome host nel certificato, la CA installata sul lettore e i percorsi dei file TLS.

## Licenza

Pragma è distribuito con licenza ISC; vedi `package.json`.
