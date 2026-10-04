-- Configurazione Home Assistant per l'uscita del varco.
-- Il token di accesso rimane nelle variabili d'ambiente, non nel database.
ALTER TABLE gates ADD COLUMN ha_service TEXT
    CHECK (ha_service IN ('switch.turn_on', 'automation.turn_on'));

ALTER TABLE gates ADD COLUMN ha_entity_id TEXT;
