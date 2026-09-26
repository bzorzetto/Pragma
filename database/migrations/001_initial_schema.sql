-- ============================================================
-- Migration 001
-- Initial parking access control schema
-- ============================================================

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,

    plate TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    color TEXT,
    notes TEXT,

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);


CREATE TABLE access_tokens (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,

    token TEXT NOT NULL UNIQUE,
    description TEXT,

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);


CREATE TABLE access_rules (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,

    name TEXT NOT NULL,

    valid_from TEXT NOT NULL,
    valid_until TEXT,

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),

    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        valid_until IS NULL
        OR valid_until >= valid_from
    ),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);


CREATE TABLE access_schedules (
    id INTEGER PRIMARY KEY,

    access_rule_id INTEGER NOT NULL,

    day_of_week INTEGER NOT NULL
        CHECK (day_of_week BETWEEN 1 AND 7),

    time_from TEXT NOT NULL,
    time_until TEXT NOT NULL,

    CHECK (
        time_from >= '00:00'
        AND time_from <= '23:59'
    ),

    CHECK (
        time_until >= '00:00'
        AND time_until <= '23:59'
    ),

    CHECK (time_until > time_from),

    FOREIGN KEY (access_rule_id)
        REFERENCES access_rules(id)
        ON DELETE CASCADE
);


CREATE TABLE access_exceptions (
    id INTEGER PRIMARY KEY,

    access_rule_id INTEGER NOT NULL,

    date TEXT NOT NULL,

    allowed INTEGER NOT NULL
        CHECK (allowed IN (0, 1)),

    time_from TEXT,
    time_until TEXT,

    reason TEXT,

    CHECK (
        (time_from IS NULL AND time_until IS NULL)
        OR
        (
            time_from IS NOT NULL
            AND time_until IS NOT NULL
            AND time_from >= '00:00'
            AND time_from <= '23:59'
            AND time_until >= '00:00'
            AND time_until <= '23:59'
            AND time_until > time_from
        )
    ),

    FOREIGN KEY (access_rule_id)
        REFERENCES access_rules(id)
        ON DELETE CASCADE
);


CREATE TABLE holidays (
    id INTEGER PRIMARY KEY,

    date TEXT NOT NULL UNIQUE,
    name TEXT,

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1))
);


CREATE TABLE gates (
    id INTEGER PRIMARY KEY,

    name TEXT NOT NULL UNIQUE,

    direction TEXT NOT NULL
        CHECK (direction IN ('ENTRY', 'EXIT', 'BOTH')),

    enabled INTEGER NOT NULL DEFAULT 1
        CHECK (enabled IN (0, 1)),

    notes TEXT
);


CREATE TABLE access_logs (
    id INTEGER PRIMARY KEY,

    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    token_id INTEGER,
    user_id INTEGER,
    vehicle_id INTEGER,
    gate_id INTEGER,

    result TEXT NOT NULL
        CHECK (result IN ('GRANTED', 'DENIED')),

    reason TEXT,

    direction TEXT
        CHECK (direction IN ('ENTRY', 'EXIT')),

    FOREIGN KEY (token_id)
        REFERENCES access_tokens(id)
        ON DELETE SET NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE SET NULL,

    FOREIGN KEY (gate_id)
        REFERENCES gates(id)
        ON DELETE SET NULL
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_vehicles_user
    ON vehicles(user_id);

CREATE INDEX idx_tokens_user
    ON access_tokens(user_id);

CREATE INDEX idx_rules_user
    ON access_rules(user_id);

CREATE INDEX idx_schedules_rule
    ON access_schedules(access_rule_id);

CREATE INDEX idx_exceptions_rule
    ON access_exceptions(access_rule_id);

CREATE INDEX idx_exceptions_date
    ON access_exceptions(date);

CREATE INDEX idx_logs_timestamp
    ON access_logs(timestamp);

CREATE INDEX idx_logs_user
    ON access_logs(user_id);

CREATE INDEX idx_logs_token
    ON access_logs(token_id);

CREATE INDEX idx_logs_vehicle
    ON access_logs(vehicle_id);

CREATE INDEX idx_logs_gate
    ON access_logs(gate_id);

CREATE INDEX idx_logs_result
    ON access_logs(result);


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE TRIGGER trg_users_updated_at
AFTER UPDATE OF
    first_name,
    last_name,
    company,
    phone,
    email,
    notes,
    enabled
ON users
FOR EACH ROW
BEGIN
    UPDATE users
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;


CREATE TRIGGER trg_vehicles_updated_at
AFTER UPDATE OF
    user_id,
    plate,
    brand,
    model,
    color,
    notes,
    enabled
ON vehicles
FOR EACH ROW
BEGIN
    UPDATE vehicles
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;


CREATE TRIGGER trg_access_tokens_updated_at
AFTER UPDATE OF
    user_id,
    token,
    description,
    enabled
ON access_tokens
FOR EACH ROW
BEGIN
    UPDATE access_tokens
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;


CREATE TRIGGER trg_access_rules_updated_at
AFTER UPDATE OF
    user_id,
    name,
    valid_from,
    valid_until,
    enabled,
    notes
ON access_rules
FOR EACH ROW
BEGIN
    UPDATE access_rules
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;