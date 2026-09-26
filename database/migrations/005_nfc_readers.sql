-- Lettori NFC registrati, credenziali di lunga durata e varchi consentiti.

CREATE TABLE readers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    credential_hash TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reader_gates (
    reader_id INTEGER NOT NULL,
    gate_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (reader_id, gate_id),
    FOREIGN KEY (reader_id) REFERENCES readers(id) ON DELETE CASCADE,
    FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE
);

CREATE INDEX idx_reader_gates_gate ON reader_gates(gate_id);

ALTER TABLE access_logs ADD COLUMN reader_id INTEGER
    REFERENCES readers(id) ON DELETE SET NULL;

CREATE INDEX idx_logs_reader ON access_logs(reader_id);

CREATE TRIGGER trg_readers_updated_at
AFTER UPDATE OF name, credential_hash, enabled
ON readers
FOR EACH ROW
BEGIN
    UPDATE readers SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
