import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import DatabaseManager from './database/Database.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const environmentFile = path.join(here, '.env');
if (fs.existsSync(environmentFile)) {
    for (const line of fs.readFileSync(environmentFile, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || match[1] in process.env) continue;
        const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
        process.env[match[1]] = value;
    }
}
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const db = new DatabaseManager({
    dbPath: path.join(here, 'data', 'parking.db'),
    migrationsPath: path.join(here, 'database', 'migrations')
});
db.open();

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml'
};

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(data));
}

async function readJson(req) {
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 32_768) throw Object.assign(new Error('Richiesta troppo grande.'), { status: 413 });
    }
    try { return raw ? JSON.parse(raw) : {}; }
    catch { throw Object.assign(new Error('JSON non valido.'), { status: 400 }); }
}

function requiredText(value, label, max = 200) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
        throw Object.assign(new Error(`${label}: valore obbligatorio (massimo ${max} caratteri).`), { status: 400 });
    }
    return value.trim();
}

function optionalText(value, max = 500) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.trim().length > max) {
        throw Object.assign(new Error(`Testo non valido (massimo ${max} caratteri).`), { status: 400 });
    }
    return value.trim() || null;
}

function numericId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('Identificativo non valido.'), { status: 400 });
    return id;
}

function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseGate(body) {
    const name = requiredText(body.name, 'Nome varco', 200);
    const direction = requiredText(body.direction, 'Direzione', 5);
    if (!['ENTRY', 'EXIT', 'BOTH'].includes(direction)) throw Object.assign(new Error('Direzione del varco non valida.'), { status: 400 });
    const relayType = body.relayType === 'SHELLY_RPC' ? 'SHELLY_RPC' : body.relayType === 'NONE' || body.relayType == null ? 'NONE' : null;
    if (!relayType) throw Object.assign(new Error('Tipo di relay non valido.'), { status: 400 });
    const relayChannel = Number(body.relayChannel ?? 0);
    const pulseMs = Number(body.pulseMs ?? 1000);
    if (!Number.isInteger(relayChannel) || relayChannel < 0 || relayChannel > 31) throw Object.assign(new Error('Uscita relay non valida.'), { status: 400 });
    if (!Number.isInteger(pulseMs) || pulseMs < 100 || pulseMs > 60000) throw Object.assign(new Error('La durata impulso deve essere tra 100 e 60000 ms.'), { status: 400 });

    let relayHost = optionalText(body.relayHost, 253);
    if (relayType === 'SHELLY_RPC') {
        if (!relayHost || /[\s/@?#]/.test(relayHost)) throw Object.assign(new Error('Inserisci l’indirizzo IP o il nome host del relay, senza protocollo o percorso.'), { status: 400 });
        try {
            const parsed = new URL(`http://${relayHost}`);
            if (!parsed.hostname || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error();
            relayHost = parsed.hostname;
        } catch {
            throw Object.assign(new Error('Indirizzo del relay non valido.'), { status: 400 });
        }
    } else {
        relayHost = null;
    }
    return {
        name, direction, relayType, relayHost, relayChannel, pulseMs,
        notes: optionalText(body.notes),
        enabled: body.enabled === false || body.enabled === 0 ? 0 : 1
    };
}

function parseAssignedGateIds(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
        throw Object.assign(new Error('Associa almeno un varco al lettore.'), { status: 400 });
    }
    const ids = [...new Set(value.map(numericId))];
    const valid = new Set(db.getGates().map(gate => gate.id));
    if (ids.some(id => !valid.has(id))) throw Object.assign(new Error('Uno o più varchi selezionati non esistono.'), { status: 400 });
    return ids;
}

function hashCredential(value) {
    return createHash('sha256').update(value, 'utf8').digest();
}

async function handleApi(req, res, url) {
    const segments = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/api/users') {
        const users = db.getUsers().map(user => ({
            ...user,
            tokens: db.getTokensByUser(user.id),
            vehicle_count: db.raw.prepare('SELECT COUNT(*) AS count FROM vehicles WHERE user_id = ?').get(user.id).count,
            gateIds: db.getGateIdsByUser(user.id),
            accessRules: db.getAccessRulesByUser(user.id).map(rule => ({ ...rule, schedules: db.getSchedules(rule.id) }))
        }));
        return sendJson(res, 200, users);
    }
    if (req.method === 'POST' && url.pathname === '/api/users') {
        const body = await readJson(req);
        const firstName = requiredText(body.firstName, 'Nome');
        const lastName = requiredText(body.lastName, 'Cognome');
        const id = db.createUser({
            firstName, lastName,
            company: optionalText(body.company), phone: optionalText(body.phone, 100),
            email: optionalText(body.email, 254), notes: optionalText(body.notes)
        });
        return sendJson(res, 201, db.getUserById(id));
    }
    if (req.method === 'PUT' && segments.length === 3 && segments[1] === 'users') {
        const id = numericId(segments[2]);
        if (!db.getUserById(id)) return sendJson(res, 404, { error: 'Utente non trovato.' });
        const body = await readJson(req);
        db.updateUser(id, {
            firstName: requiredText(body.firstName, 'Nome'),
            lastName: requiredText(body.lastName, 'Cognome'),
            company: optionalText(body.company), phone: optionalText(body.phone, 100),
            email: optionalText(body.email, 254), notes: optionalText(body.notes),
            enabled: body.enabled === false || body.enabled === 0 ? 0 : 1
        });
        return sendJson(res, 200, db.getUserById(id));
    }
    if (req.method === 'DELETE' && segments.length === 3 && segments[1] === 'users') {
        const id = numericId(segments[2]);
        const result = db.deleteUser(id);
        return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Utente non trovato.' });
    }
    if (req.method === 'PUT' && segments.length === 4 && segments[1] === 'users' && segments[3] === 'gates') {
        const userId = numericId(segments[2]);
        if (!db.getUserById(userId)) return sendJson(res, 404, { error: 'Utente non trovato.' });
        const body = await readJson(req);
        if (!Array.isArray(body.gateIds) || body.gateIds.length > 100) throw Object.assign(new Error('Seleziona un elenco valido di varchi.'), { status: 400 });
        const gateIds = [...new Set(body.gateIds.map(numericId))];
        const existing = new Set(db.getGates().map(gate => gate.id));
        if (gateIds.some(gateId => !existing.has(gateId))) throw Object.assign(new Error('Uno o più varchi selezionati non esistono.'), { status: 400 });
        db.setUserGates(userId, gateIds);
        return sendJson(res, 200, { userId, gateIds: db.getGateIdsByUser(userId) });
    }
    if (req.method === 'POST' && segments.length === 4 && segments[1] === 'users' && segments[3] === 'tokens') {
        const userId = numericId(segments[2]);
        if (!db.getUserById(userId)) return sendJson(res, 404, { error: 'Utente non trovato.' });
        const body = await readJson(req);
        const token = requiredText(body.token, 'Token NFC', 200).toUpperCase();
        const id = db.createToken({ userId, token, description: optionalText(body.description) });
        return sendJson(res, 201, { id, userId, token, description: body.description || null });
    }
    if (req.method === 'DELETE' && segments.length === 3 && segments[1] === 'tokens') {
        const id = numericId(segments[2]);
        const result = db.disableToken(id);
        return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Token non trovato.' });
    }
    if (req.method === 'POST' && segments.length === 4 && segments[1] === 'users' && segments[3] === 'access-rules') {
        const userId = numericId(segments[2]);
        if (!db.getUserById(userId)) return sendJson(res, 404, { error: 'Utente non trovato.' });
        const body = await readJson(req);
        const validFrom = requiredText(body.validFrom, 'Valida dal', 10);
        const validUntil = optionalText(body.validUntil, 10);
        if (!isValidDate(validFrom) || (validUntil && !isValidDate(validUntil))) {
            throw Object.assign(new Error('Inserisci date valide nel formato AAAA-MM-GG.'), { status: 400 });
        }
        const id = db.createAccessRule({
            userId, name: requiredText(body.name, 'Nome regola'), validFrom, validUntil,
            notes: optionalText(body.notes)
        });
        return sendJson(res, 201, { ...db.getAccessRule(id), schedules: [] });
    }
    if (req.method === 'POST' && segments.length === 4 && segments[1] === 'access-rules' && segments[3] === 'schedules') {
        const ruleId = numericId(segments[2]);
        if (!db.getAccessRule(ruleId)) return sendJson(res, 404, { error: 'Regola non trovata.' });
        const body = await readJson(req);
        const dayOfWeek = Number(body.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) throw Object.assign(new Error('Giorno della settimana non valido.'), { status: 400 });
        const timeFrom = requiredText(body.timeFrom, 'Ora iniziale', 5);
        const timeUntil = requiredText(body.timeUntil, 'Ora finale', 5);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeFrom) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeUntil) || timeUntil <= timeFrom) {
            throw Object.assign(new Error('Inserisci un intervallo orario valido; l’ora finale deve essere successiva a quella iniziale.'), { status: 400 });
        }
        const id = db.addSchedule({ accessRuleId: ruleId, dayOfWeek, timeFrom, timeUntil });
        return sendJson(res, 201, { id, access_rule_id: ruleId, day_of_week: dayOfWeek, time_from: timeFrom, time_until: timeUntil });
    }
    if (req.method === 'DELETE' && segments.length === 3 && segments[1] === 'schedules') {
        const id = numericId(segments[2]);
        const result = db.deleteSchedule(id);
        return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Fascia oraria non trovata.' });
    }
    if (req.method === 'DELETE' && segments.length === 3 && segments[1] === 'access-rules') {
        const id = numericId(segments[2]);
        const result = db.disableAccessRule(id);
        return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Regola non trovata.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/gates') {
        return sendJson(res, 200, db.getGates());
    }
    if (req.method === 'POST' && url.pathname === '/api/gates') {
        const gate = parseGate(await readJson(req));
        const id = db.createGate(gate);
        return sendJson(res, 201, db.getGateById(id));
    }
    if (req.method === 'PUT' && segments.length === 3 && segments[1] === 'gates') {
        const id = numericId(segments[2]);
        if (!db.getGateById(id)) return sendJson(res, 404, { error: 'Varco non trovato.' });
        const gate = parseGate(await readJson(req));
        db.updateGate(id, gate);
        return sendJson(res, 200, db.getGateById(id));
    }
    if (req.method === 'GET' && url.pathname === '/api/readers') {
        return sendJson(res, 200, db.getReaders().map(reader => ({ ...reader, gateIds: db.getGateIdsByReader(reader.id) })));
    }
    if (req.method === 'POST' && url.pathname === '/api/readers') {
        const body = await readJson(req);
        const name = requiredText(body.name, 'Nome lettore', 200);
        const gateIds = parseAssignedGateIds(body.gateIds);
        const credential = randomBytes(32).toString('base64url');
        const id = db.createReader({ name, credentialHash: hashCredential(credential).toString('hex') });
        db.setReaderGates(id, gateIds);
        return sendJson(res, 201, { id, name, enabled: 1, gateIds, credential });
    }
    if (req.method === 'PUT' && segments.length === 3 && segments[1] === 'readers') {
        const id = numericId(segments[2]);
        if (!db.getReaderById(id)) return sendJson(res, 404, { error: 'Lettore non trovato.' });
        const body = await readJson(req);
        const name = requiredText(body.name, 'Nome lettore', 200);
        const gateIds = parseAssignedGateIds(body.gateIds);
        db.updateReader(id, { name, enabled: body.enabled === false || body.enabled === 0 ? 0 : 1 });
        db.setReaderGates(id, gateIds);
        return sendJson(res, 200, { ...db.getReaderById(id), gateIds });
    }
    if (req.method === 'DELETE' && segments.length === 3 && segments[1] === 'readers') {
        const id = numericId(segments[2]);
        const result = db.disableReader(id);
        return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'Lettore non trovato.' });
    }

    return sendJson(res, 404, { error: 'Endpoint non trovato.' });
}

function currentAccessTime(now = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    return { date, time, dayOfWeek };
}

function userHasActiveRule(userId, now = new Date()) {
    const { date, time, dayOfWeek } = currentAccessTime(now);
    return db.getAccessRulesByUser(userId).some(rule => {
        if (!rule.enabled || rule.valid_from > date || (rule.valid_until && rule.valid_until < date)) return false;
        const exceptions = db.raw.prepare(`
            SELECT allowed, time_from, time_until
            FROM access_exceptions
            WHERE access_rule_id = ? AND date = ?
        `).all(rule.id, date).filter(exception =>
            exception.time_from == null || (exception.time_from <= time && time < exception.time_until)
        );
        if (exceptions.length) {
            if (exceptions.some(exception => exception.allowed === 0)) return false;
            if (exceptions.some(exception => exception.allowed === 1)) return true;
        }
        if (db.isHoliday(date)) return false;
        const schedules = db.getSchedules(rule.id);
        if (schedules.length === 0) return true;
        return schedules.some(schedule => schedule.day_of_week === dayOfWeek && schedule.time_from <= time && time < schedule.time_until);
    });
}

async function activateGateRelay(gate) {
    if (gate.relay_type !== 'SHELLY_RPC' || !gate.relay_host) return false;
    const response = await fetch(`http://${gate.relay_host}/rpc/Switch.Set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: gate.relay_channel,
            on: true,
            toggle_after: Math.round((gate.pulse_ms / 1000) * 1000) / 1000
        }),
        signal: AbortSignal.timeout(5000)
    });
    const reply = await response.json().catch(() => null);
    return response.ok && !reply?.error;
}

async function handleReaderAccess(req, res) {
    if (req.method !== 'POST' || req.url.split('?')[0] !== '/api/reader/access') {
        return sendJson(res, 404, { error: 'Endpoint non trovato.' });
    }
    const body = await readJson(req);
    const readerId = numericId(body.readerId);
    const authorization = req.headers.authorization || '';
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
    if (!match) return sendJson(res, 401, { error: 'Credenziale lettore non valida.' });
    const reader = db.getReaderAuthById(readerId);
    const actualHash = hashCredential(match[1]);
    const expectedHash = reader ? Buffer.from(reader.credential_hash, 'hex') : Buffer.alloc(32);
    const validCredential = actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
    if (!reader || !reader.enabled || !validCredential) return sendJson(res, 401, { error: 'Credenziale lettore non valida.' });

    const deny = (reason, { token = null, gate = null, direction = null } = {}) => {
        db.logAccess({
            tokenId: token?.id ?? null,
            userId: token?.user_id ?? null,
            gateId: gate?.id ?? null,
            readerId: reader.id,
            result: 'DENIED',
            reason,
            direction
        });
        return sendJson(res, 200, { result: 'nok', reason });
    };

    const gateId = numericId(body.gateId);
    const gate = db.getGateById(gateId);
    const tokenValue = requiredText(body.tag, 'Tag NFC', 200).toUpperCase();
    const token = db.getTokenByValue(tokenValue);
    if (!gate) return deny('GATE_NOT_FOUND');
    const readerGateIds = db.getGateIdsByReader(reader.id);
    if (!readerGateIds.includes(gate.id)) return deny('READER_GATE_MISMATCH', { token, gate });
    if (!gate.enabled) return deny('GATE_DISABLED', { token, gate });

    let direction;
    if (gate.direction === 'BOTH') {
        direction = body.direction;
        if (!['ENTRY', 'EXIT'].includes(direction)) return deny('INVALID_DIRECTION', { token, gate });
    } else {
        direction = gate.direction;
        if (body.direction != null && body.direction !== direction) return deny('INVALID_DIRECTION', { token, gate, direction });
    }

    if (!token) return deny('UNKNOWN_TAG', { gate, direction });
    if (!token.enabled) return deny('TOKEN_DISABLED', { token, gate, direction });
    if (!token.user_enabled) return deny('USER_DISABLED', { token, gate, direction });
    if (!db.getGateIdsByUser(token.user_id).includes(gate.id)) return deny('USER_NOT_AUTHORIZED_FOR_GATE', { token, gate, direction });
    if (!userHasActiveRule(token.user_id)) return deny('NO_ACTIVE_ACCESS_RULE', { token, gate, direction });

    try {
        if (!await activateGateRelay(gate)) return deny('RELAY_ERROR', { token, gate, direction });
    } catch (error) {
        console.error(`Errore relay varco ${gate.id}:`, error.message);
        return deny('RELAY_ERROR', { token, gate, direction });
    }

    db.logAccess({
        tokenId: token.id,
        userId: token.user_id,
        gateId: gate.id,
        readerId: reader.id,
        result: 'GRANTED',
        reason: 'OPENED',
        direction
    });
    return sendJson(res, 200, { result: 'ok' });
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

        const requested = url.pathname === '/' ? '/index.html' : url.pathname;
        const publicRoot = path.resolve(here, 'public');
        const filePath = path.resolve(publicRoot, `.${decodeURIComponent(requested)}`);
        if (!filePath.startsWith(`${publicRoot}${path.sep}`)) return sendJson(res, 403, { error: 'Percorso non consentito.' });
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendJson(res, 404, { error: 'Pagina non trovata.' });
        res.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:"
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        const isUniqueConflict = error.code === 'SQLITE_CONSTRAINT_UNIQUE';
        const isConstraint = error.code?.startsWith('SQLITE_CONSTRAINT');
        const status = error.status || (isUniqueConflict ? 409 : isConstraint ? 400 : 500);
        const message = error.status ? error.message : isUniqueConflict ? 'Esiste già un record con questo valore.' : isConstraint ? 'I dati non rispettano i vincoli del database.' : 'Errore interno del server.';
        sendJson(res, status, { error: message });
        if (status === 500) console.error(error);
    }
});

server.listen(port, host, () => console.log(`Pragma disponibile su http://${host}:${port}`));

let readerServer = null;
const tlsCertFile = process.env.TLS_CERT_FILE;
const tlsKeyFile = process.env.TLS_KEY_FILE;
if (Boolean(tlsCertFile) !== Boolean(tlsKeyFile)) {
    throw new Error('Per avviare l’API lettori imposta sia TLS_CERT_FILE sia TLS_KEY_FILE.');
}
if (tlsCertFile && tlsKeyFile) {
    const readerHost = process.env.READER_API_HOST || '0.0.0.0';
    const readerPort = Number(process.env.READER_API_PORT || 3443);
    readerServer = https.createServer({
        cert: fs.readFileSync(path.resolve(tlsCertFile)),
        key: fs.readFileSync(path.resolve(tlsKeyFile))
    }, async (req, res) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000');
        try {
            await handleReaderAccess(req, res);
        } catch (error) {
            const status = error.status || 500;
            sendJson(res, status, { error: error.status ? error.message : 'Errore interno del server.' });
            if (status === 500) console.error(error);
        }
    });
    readerServer.listen(readerPort, readerHost, () => {
        console.log(`API lettori NFC HTTPS disponibile su https://${readerHost}:${readerPort}/api/reader/access`);
    });
} else {
    console.warn('API lettori NFC non avviata: configura TLS_CERT_FILE e TLS_KEY_FILE per abilitarla.');
}

function shutdown() {
    server.close(() => {
        if (readerServer) {
            readerServer.close(() => {
                db.close();
                process.exit(0);
            });
        } else {
            db.close();
            process.exit(0);
        }
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
