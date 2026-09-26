-- Configurazione opzionale del relay associato a ciascun varco.
-- L'aggiunta è compatibile con i varchi già presenti nel database.

ALTER TABLE gates ADD COLUMN relay_type TEXT NOT NULL DEFAULT 'NONE'
    CHECK (relay_type IN ('NONE', 'SHELLY_RPC'));

ALTER TABLE gates ADD COLUMN relay_host TEXT;

ALTER TABLE gates ADD COLUMN relay_channel INTEGER NOT NULL DEFAULT 0
    CHECK (relay_channel BETWEEN 0 AND 31);

ALTER TABLE gates ADD COLUMN pulse_ms INTEGER NOT NULL DEFAULT 1000
    CHECK (pulse_ms BETWEEN 100 AND 60000);
