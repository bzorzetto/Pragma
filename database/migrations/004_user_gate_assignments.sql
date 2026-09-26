-- Associa direttamente utenti e varchi autorizzati.
-- La rimozione di utente o varco elimina automaticamente le associazioni.

CREATE TABLE user_gates (
    user_id INTEGER NOT NULL,
    gate_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, gate_id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (gate_id)
        REFERENCES gates(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_user_gates_gate
    ON user_gates(gate_id);
