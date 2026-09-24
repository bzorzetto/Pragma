
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';


class DatabaseManager {

    constructor(options = {}) {

        this.dbPath = options.dbPath || './data/parking.db';
        this.schemaPath = options.schemaPath || './database/schema.sql';

        // Risolve i percorsi relativi rispetto alla directory
        // da cui viene avviata l'applicazione.
        this.dbPath = path.resolve(this.dbPath);
        this.schemaPath = path.resolve(this.schemaPath);

        this.db = null;
    }


    // =========================================================
    // OPEN
    // =========================================================

    open() {

        if (this.db) {
            return;
        }

        // Crea la directory del database se non esiste.
        const dbDirectory = path.dirname(this.dbPath);

        if (!fs.existsSync(dbDirectory)) {
            fs.mkdirSync(dbDirectory, {
                recursive: true
            });
        }

        console.log(`Apertura database: ${this.dbPath}`);

        this.db = new Database(this.dbPath);

        // Foreign key SQLite
        this.db.pragma('foreign_keys = ON');

        // WAL migliora la robustezza e le prestazioni.
        this.db.pragma('journal_mode = WAL');

        console.log('Database SQLite aperto.');

        this.initialize();
    }


    // =========================================================
    // INITIALIZE
    // =========================================================

    initialize() {

        if (!this.db) {
            throw new Error('Database non aperto.');
        }

        if (!fs.existsSync(this.schemaPath)) {
            throw new Error(
                `Schema SQLite non trovato: ${this.schemaPath}`
            );
        }

        const schema = fs.readFileSync(
            this.schemaPath,
            'utf8'
        );

        this.db.exec(schema);

        console.log('Schema SQLite verificato.');
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

        const stmt = this.db.prepare(`
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
        `);

        return stmt.run({
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

        const stmt = this.db.prepare(`
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
        `);

        const result = stmt.run({
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

        const stmt = this.db.prepare(`
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
        `);

        const result = stmt.run({
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

        const stmt = this.db.prepare(`
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
        `);

        const result = stmt.run({
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

        const stmt = this.db.prepare(`
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
        `);

        const result = stmt.run({
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

        const stmt = this.db.prepare(`
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
        `);

        const result = stmt.run({
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

        const stmt = this.db.prepare(`
            INSERT INTO holidays (
                date,
                name
            )
            VALUES (
                @date,
                @name
            )
        `);

        const result = stmt.run({
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

        const stmt = this.db.prepare(`
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
        `);

        const resultData = stmt.run({
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
    // UTILITY
    // =========================================================

    transaction(callback) {

        return this.db.transaction(callback)();
    }


    get raw() {

        return this.db;
    }
}


export default DatabaseManager;
