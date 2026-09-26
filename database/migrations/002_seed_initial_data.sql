-- Migration 002
-- Dati iniziali del sistema

INSERT INTO gates (
    name,
    direction,
    enabled,
    notes
)
VALUES
    (
        'Ingresso principale',
        'ENTRY',
        1,
        'Varco principale di ingresso'
    ),
    (
        'Uscita principale',
        'EXIT',
        1,
        'Varco principale di uscita'
    );

-- Festività di esempio.
-- Può essere rimossa o sostituita con una gestione dedicata
-- delle festività aziendali.
INSERT INTO holidays (
    date,
    name,
    enabled
)
VALUES (
    '2026-12-25',
    'Natale',
    1
);