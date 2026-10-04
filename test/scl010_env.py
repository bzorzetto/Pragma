#!/usr/bin/env python3
import json
import os
from pathlib import Path
import ssl
import threading
import urllib.error
import urllib.request

from dotenv import load_dotenv
from smartcard.CardMonitoring import CardMonitor, CardObserver

# Carica le variabili dal file .env nella stessa directory dello script.
load_dotenv(Path(__file__).with_name('.env'))

def env_required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"Variabile {name} non configurata. "
            f"Controlla il file .env nella directory dello script."
        )
    return value


API_URL = env_required("PRAGMA_URL")       # es. https://pragma.local:3443/api/reader/access
READER_ID = int(env_required("PRAGMA_READER_ID"))
GATE_ID = int(env_required("PRAGMA_GATE_ID"))
DIRECTION = os.getenv("PRAGMA_DIRECTION", "ENTRY")
TOKEN = env_required("PRAGMA_TOKEN")
CA_FILE = env_required("PRAGMA_CA")       # certificato CA/certificato server attendibile

# Se il percorso del certificato nel .env è relativo, lo considera relativo
# alla directory dello script.
ca_path = Path(CA_FILE)
if not ca_path.is_absolute():
    ca_path = Path(__file__).resolve().parent / ca_path

CA_FILE = str(ca_path)

tls_context = ssl.create_default_context(cafile=CA_FILE)


def invia_a_pragma(card):
    connection = card.createConnection()
    connected = False

    try:
        connection.connect()
        connected = True

        # Comando GET UID documentato per l'SCL010
        data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])

        if (sw1, sw2) != (0x90, 0x00):
            print(f"Errore lettura UID: SW={sw1:02X}{sw2:02X}", flush=True)
            return

        uid = bytes(data).hex().upper()
        payload = json.dumps({
            "readerId": READER_ID,
            "tag": uid,
            "gateId": GATE_ID,
            "direction": DIRECTION,
        }).encode("utf-8")

        request = urllib.request.Request(
            API_URL,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
            },
        )

        with urllib.request.urlopen(
            request, context=tls_context, timeout=8
        ) as response:
            result = response.read().decode("utf-8")
            print(f"UID {uid} → HTTP {response.status}: {result}", flush=True)

    except urllib.error.HTTPError as error:
        print(f"Errore HTTP {error.code}: {error.read().decode()}", flush=True)
    except Exception as error:
        print(f"Errore lettore/API: {error}", flush=True)
    finally:
        if connected:
            try:
                connection.disconnect()
            except Exception:
                pass
        try:
            connection.release()
        except Exception:
            pass


class Osservatore(CardObserver):
    def update(self, observable, azioni):
        aggiunte, rimosse = azioni

        for card in aggiunte:
            if "SCL010" not in str(card.reader):
                continue

            print(f"Tessera rilevata sul lettore {card.reader}", flush=True)
            # La richiesta di rete gira separatamente dal monitor PC/SC.
            threading.Thread(
                target=invia_a_pragma,
                args=(card,),
                daemon=True,
            ).start()

        for card in rimosse:
            if "SCL010" in str(card.reader):
                print("Tessera rimossa", flush=True)


if __name__ == "__main__":
    monitor = CardMonitor()
    osservatore = Osservatore()
    monitor.addObserver(osservatore)

    print("Monitor NFC attivo. Premi Ctrl+C per terminare.", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        monitor.deleteObserver(osservatore)
        print("\nMonitor terminato.", flush=True)
