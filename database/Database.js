import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';


class DatabaseManager {

    constructor(options = {}) {

        this.dbPath = path.resolve(
            options.dbPath || './data/parking.db'
        );

        this.migrationsPath = path.resolve(
            options.migrationsPath || './database/migrations'
        );

        this.db = null;
    }


    // =========================================================
    // OPEN
    // =========================================================

    open() {

        if (this.db) {
            return;
        }

        const dbDirectory = path.dirname(this.dbPath);

        if (!fs.existsSync(dbDirectory)) {

            fs.mkdirSync(dbDirectory, {
                recursive: true
            });
        }

        console.log(`Apertura database: ${this.dbPath}`);

        this.db = new Database(this.dbPath);

        this.db.pragma('foreign_keys = ON');
        this.db.pragma('journal_mode = WAL');

        console.log('Database SQLite aperto.');

        this.runMigrations();
    }


    // =========================================================
    // MIGRATIONS TABLE
    // =========================================================

    createMigrationsTable() {

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }


    // =========================================================
    // MIGRATION RUNNER
    // =========================================================

    runMigrations() {

        if (!this.db) {
            throw new Error(
                'Database non aperto.'
            );
        }

        this.createMigrationsTable();

        if (!fs.existsSync(this.migrationsPath)) {

            throw new Error(
                `Directory migrations non trovata: ${this.migrationsPath}`
            );
        }


        // -----------------------------------------------------
        // Legge tutti i file .sql
        // -----------------------------------------------------

        const files = fs.readdirSync(
            this.migrationsPath
        )
        .filter(file => file.endsWith('.sql'))
        .sort();


        // -----------------------------------------------------
        // Controllo nomi migrazione
        // -----------------------------------------------------

        const migrations = files.map(file => {

            const match = file.match(
                /^(\d+)[-_](.+)\.sql$/i
            );

            if (!match) {

                throw new Error(
                    `Nome migrazione non valido: ${file}`
                );
            }

            return {
                version: Number(match[1]),
                name: match[2],
                file
            };
        });


        // -----------------------------------------------------
        // Controlla duplicati
        // -----------------------------------------------------

        const versions = new Set();

        for (const migration of migrations) {

            if (versions.has(migration.version)) {

                throw new Error(
                    `Versione migrazione duplicata: ${migration.version}`
                );
            }

            versions.add(migration.version);
        }


        // -----------------------------------------------------
        // Versione attuale
        // -----------------------------------------------------

        const current = this.db.prepare(`
            SELECT MAX(version) AS version
            FROM schema_migrations
        `).get();

        const currentVersion =
            current?.version ?? 0;


        // -----------------------------------------------------
        // Esegue le migrazioni mancanti
        // -----------------------------------------------------

        for (const migration of migrations) {

            if (migration.version <= currentVersion) {
                continue;
            }

            console.log(
                `Migrazione ${migration.version}: ${migration.name}`
            );

            const migrationPath = path.join(
                this.migrationsPath,
                migration.file
            );

            const sql = fs.readFileSync(
                migrationPath,
                'utf8'
            );


            // -------------------------------------------------
            // Ogni migrazione è atomica.
            // -------------------------------------------------

            const applyMigration = this.db.transaction(() => {

                this.db.exec(sql);

                this.db.prepare(`
                    INSERT INTO schema_migrations (
                        version,
                        name
                    )
                    VALUES (?, ?)
                `).run(
                    migration.version,
                    migration.name
                );
            });


            applyMigration();

            console.log(
                `Migrazione ${migration.version} completata.`
            );
        }


        console.log(
            `Database aggiornato alla versione ${this.getSchemaVersion()}.`
        );
    }


    // =========================================================
    // SCHEMA VERSION
    // =========================================================

    getSchemaVersion() {

        const result = this.db.prepare(`
            SELECT MAX(version) AS version
            FROM schema_migrations
        `).get();

        return result?.version ?? 0;
    }


    // =========================================================
    // CLOSE
    // =========================================================

    close() {

        if (!this.db) {
            return;
        }

        this.db.close();

        this.db = null;

        console.log('Database SQLite chiuso.');
    }


    // =========================================================
    // USER
    // =========================================================

    createUser({
        firstName,
        lastName,
        company = null,
        phone = null,
        email = null,
        notes = null
    }) {

        const stmt = this.db.prepare(`
            INSERT INTO users (
                first_name,
                last_name,
                company,
                phone,
                email,
                notes
            )
            VALUES (
                @firstName,
                @lastName,
                @company,
                @phone,
                @email,
                @notes
            )
        `);

        const result = stmt.run({
            firstName,
            lastName,
            company,
            phone,
            email,
            notes
        });

        return result.lastInsertRowid;
    }


    getUserById(id) {

        return this.db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(id);
    }


    getUsers() {

        return this.db.prepare(`
            SELECT *
            FROM users
            ORDER BY last_name, first_name
        `).all();
    }


    updateUser(id, {
        firstName,
        lastName,
        company = null,
        phone = null,
        email = null,
        notes = null,
        enabled = 1
    }) {

        return this.db.prepare(`
            UPDATE users
            SET
                first_name = @firstName,
                last_name = @lastName,
                company = @company,
                phone = @phone,
                email = @email,
                notes = @notes,
                enabled = @enabled
            WHERE id = @id
        `).run({
            id,
            firstName,
            lastName,
            company,
            phone,
            email,
            notes,
            enabled
        });
    }


    disableUser(id) {

        return this.db.prepare(`
            UPDATE users
            SET enabled = 0
            WHERE id = ?
        `).run(id);
    }


    // =========================================================
    // VEHICLES
    // =========================================================

    createVehicle({
        userId,
        plate,
        brand = null,
        model = null,
        color = null,
        notes = null
    }) {

        const result = this.db.prepare(`
            INSERT INTO vehicles (
                user_id,
                plate,
                brand,
                model,
                color,
                notes
            )
            VALUES (
                @userId,
                @plate,
                @brand,
                @model,
                @color,
                @notes
            )
        `).run({
            userId,
            plate: plate.toUpperCase().trim(),
            brand,
            model,
            color,
            notes
        });

        return result.lastInsertRowid;
    }


    getVehicleById(id) {

        return this.db.prepare(`
            SELECT *
            FROM vehicles
            WHERE id = ?
        `).get(id);
    }


    getVehiclesByUser(userId) {

        return this.db.prepare(`
            SELECT *
            FROM vehicles
            WHERE user_id = ?
            ORDER BY plate
        `).all(userId);
    }


    // =========================================================
    // NFC TOKENS
    // =========================================================

    createToken({
        userId,
        token,
        description = null
    }) {

        const result = this.db.prepare(`
            INSERT INTO access_tokens (
                user_id,
                token,
                description
            )
            VALUES (
                @userId,
                @token,
                @description
            )
        `).run({
            userId,
            token: token.trim().toUpperCase(),
            description
        });

        return result.lastInsertRowid;
    }


    getTokenByValue(token) {

        return this.db.prepare(`
            SELECT
                t.*,
                u.first_name,
                u.last_name,
                u.company,
                u.phone,
                u.email,
                u.enabled AS user_enabled
            FROM access_tokens t
            INNER JOIN users u
                ON u.id = t.user_id
            WHERE t.token = ?
        `).get(token.trim().toUpperCase());
    }


    getTokensByUser(userId) {

        return this.db.prepare(`
            SELECT *
            FROM access_tokens
            WHERE user_id = ?
            ORDER BY id
        `).all(userId);
    }


    disableToken(id) {

        return this.db.prepare(`
            UPDATE access_tokens
            SET enabled = 0
            WHERE id = ?
        `).run(id);
    }


    // =========================================================
    // ACCESS RULES
    // =========================================================

    createAccessRule({
        userId,
        name,
        validFrom,
        validUntil = null,
        notes = null
    }) {

        const result = this.db.prepare(`
            INSERT INTO access_rules (
                user_id,
                name,
                valid_from,
                valid_until,
                notes
            )
            VALUES (
                @userId,
                @name,
                @validFrom,
                @validUntil,
                @notes
            )
        `).run({
            userId,
            name,
            validFrom,
            validUntil,
            notes
        });

        return result.lastInsertRowid;
    }


    getAccessRulesByUser(userId) {

        return this.db.prepare(`
            SELECT *
            FROM access_rules
            WHERE user_id = ?
            ORDER BY valid_from
        `).all(userId);
    }


    getAccessRule(id) {

        return this.db.prepare(`
            SELECT *
            FROM access_rules
            WHERE id = ?
        `).get(id);
    }


    disableAccessRule(id) {

        return this.db.prepare(`
            UPDATE access_rules
            SET enabled = 0
            WHERE id = ?
        `).run(id);
    }


    // =========================================================
    // ACCESS SCHEDULES
    // =========================================================

    addSchedule({
        accessRuleId,
        dayOfWeek,
        timeFrom,
        timeUntil
    }) {

        const result = this.db.prepare(`
            INSERT INTO access_schedules (
                access_rule_id,
                day_of_week,
                time_from,
                time_until
            )
            VALUES (
                @accessRuleId,
                @dayOfWeek,
                @timeFrom,
                @timeUntil
            )
        `).run({
            accessRuleId,
            dayOfWeek,
            timeFrom,
            timeUntil
        });

        return result.lastInsertRowid;
    }


    getSchedules(accessRuleId) {

        return this.db.prepare(`
            SELECT *
            FROM access_schedules
            WHERE access_rule_id = ?
            ORDER BY day_of_week, time_from
        `).all(accessRuleId);
    }


    deleteSchedule(id) {

        return this.db.prepare(`
            DELETE FROM access_schedules
            WHERE id = ?
        `).run(id);
    }


    // =========================================================
    // GATES
    // =========================================================

    createGate({
        name,
        direction,
        notes = null
    }) {

        const result = this.db.prepare(`
            INSERT INTO gates (
                name,
                direction,
                notes
            )
            VALUES (
                @name,
                @direction,
                @notes
            )
        `).run({
            name,
            direction,
            notes
        });

        return result.lastInsertRowid;
    }


    getGates() {

        return this.db.prepare(`
            SELECT *
            FROM gates
            ORDER BY name
        `).all();
    }


    getGateById(id) {

        return this.db.prepare(`
            SELECT *
            FROM gates
            WHERE id = ?
        `).get(id);
    }


    // =========================================================
    // HOLIDAYS
    // =========================================================

    addHoliday({
        date,
        name = null
    }) {

        const result = this.db.prepare(`
            INSERT INTO holidays (
                date,
                name
            )
            VALUES (
                @date,
                @name
            )
        `).run({
            date,
            name
        });

        return result.lastInsertRowid;
    }


    isHoliday(date) {

        const result = this.db.prepare(`
            SELECT 1
            FROM holidays
            WHERE date = ?
              AND enabled = 1
        `).get(date);

        return !!result;
    }


    // =========================================================
    // ACCESS LOG
    // =========================================================

    logAccess({
        tokenId = null,
        userId = null,
        vehicleId = null,
        gateId = null,
        result,
        reason = null,
        direction = null
    }) {

        const resultData = this.db.prepare(`
            INSERT INTO access_logs (
                token_id,
                user_id,
                vehicle_id,
                gate_id,
                result,
                reason,
                direction
            )
            VALUES (
                @tokenId,
                @userId,
                @vehicleId,
                @gateId,
                @result,
                @reason,
                @direction
            )
        `).run({
            tokenId,
            userId,
            vehicleId,
            gateId,
            result,
            reason,
            direction
        });

        return resultData.lastInsertRowid;
    }


    getAccessLogs({
        limit = 100,
        offset = 0
    } = {}) {

        return this.db.prepare(`
            SELECT
                l.*,
                u.first_name,
                u.last_name,
                v.plate,
                g.name AS gate_name
            FROM access_logs l
            LEFT JOIN users u
                ON u.id = l.user_id
            LEFT JOIN vehicles v
                ON v.id = l.vehicle_id
            LEFT JOIN gates g
                ON g.id = l.gate_id
            ORDER BY l.timestamp DESC
            LIMIT ?
            OFFSET ?
        `).all(limit, offset);
    }


    // =========================================================
    // TRANSACTION
    // =========================================================

    transaction(callback) {

        return this.db.transaction(callback)();
    }


    // =========================================================
    // RAW DATABASE
    // =========================================================

    get raw() {

        return this.db;
    }
}


export default DatabaseManager;
