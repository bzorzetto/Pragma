import DatabaseManager from './database/Database.js';

const database = new DatabaseManager({
    dbPath: './data/parking.db',
    migrationsPath: './database/migrations'
});

try {

    console.log('========================================');
    console.log(' TEST DATABASE');
    console.log('========================================\n');

    // --------------------------------------------------
    // Apertura database + migration
    // --------------------------------------------------

    database.open();

    console.log('\nDatabase aperto.');

    // --------------------------------------------------
    // Versione schema
    // --------------------------------------------------

    const schemaVersion = database.getSchemaVersion();

    console.log(`Versione schema: ${schemaVersion}`);

    // --------------------------------------------------
    // Gate iniziali
    // --------------------------------------------------

    console.log('\n--- GATE ---');

    const gates = database.getGates();

    for (const gate of gates) {
        console.log(
            `ID=${gate.id} | ` +
            `Nome="${gate.name}" | ` +
            `Direzione=${gate.direction} | ` +
            `Abilitato=${gate.enabled}`
        );
    }

    // --------------------------------------------------
    // Creazione utente
    // --------------------------------------------------

    console.log('\n--- CREAZIONE UTENTE ---');

    //const userId = database.createUser({
    //    first_name: 'Mario',
    //    last_name: 'Rossi',
    //    company: 'Azienda Demo',
    //    phone: '+39 333 1234567',
    //    email: 'mario.rossi@example.com',
    //    notes: 'Utente di test'
    //});

    const userId = database.createUser({
        firstName: 'Mario',
        lastName: 'Rossi',
        company: 'Azienda Demo',
        phone: '+39 333 1234567',
        email: 'mario.rossi@example.com',
        notes: 'Utente di test'
    });
    console.log(`Utente creato con ID: ${userId}`);

    // --------------------------------------------------
    // Lettura utente
    // --------------------------------------------------

    const user = database.getUserById(userId);

    console.log('Utente:');
    console.log(user);

    // --------------------------------------------------
    // Creazione token NFC
    // --------------------------------------------------

    console.log('\n--- TOKEN NFC ---');

    const tokenId = database.createToken({
        userId: userId,
        token: '04AABBCCDDEE',
        description: 'Badge NFC test'
    });

    console.log(`Token creato con ID: ${tokenId}`);

    // --------------------------------------------------
    // Verifica token
    // --------------------------------------------------

    const token = database.getTokenByValue('04AABBCCDDEE');

    console.log('Token trovato:');
    console.log(token);

    // --------------------------------------------------
    // Creazione regola di accesso
    // --------------------------------------------------

    console.log('\n--- REGOLA ACCESSO ---');

    const ruleId = database.createAccessRule({
        userId: userId,
        name: 'Accesso standard',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
        notes: 'Regola di test'
    });

    console.log(`Regola creata con ID: ${ruleId}`);

    // --------------------------------------------------
    // Aggiunta fasce orarie
    // --------------------------------------------------

    console.log('\n--- FASCE ORARIE ---');

    // Lunedì 08:00 - 12:30
    database.addSchedule({
        accessRuleId: ruleId,
        dayOfWeek: 1,
        timeFrom: '08:00',
        timeUntil: '12:30'
    });

    // Lunedì 14:00 - 18:00
    database.addSchedule({
        accessRuleId: ruleId,
        dayOfWeek: 1,
        timeFrom: '14:00',
        timeUntil: '18:00'
    });

    const schedules = database.getSchedules(ruleId);

    for (const schedule of schedules) {
        console.log(
            `Giorno=${schedule.day_of_week} | ` +
            `${schedule.time_from} - ${schedule.time_until}`
        );
    }

    // --------------------------------------------------
    // Regole dell'utente
    // --------------------------------------------------

    console.log('\n--- REGOLE UTENTE ---');

    const rules = database.getAccessRulesByUser(userId);

    for (const rule of rules) {
        console.log(rule);
    }

    // --------------------------------------------------
    // Verifica festività
    // --------------------------------------------------

    console.log('\n--- FESTIVITÀ ---');

    const christmas = database.isHoliday('2026-12-25');
    const normalDay = database.isHoliday('2026-12-24');

    console.log(`2026-12-25 festività: ${christmas}`);
    console.log(`2026-12-24 festività: ${normalDay}`);

    // --------------------------------------------------
    // Fine test
    // --------------------------------------------------

    console.log('\n========================================');
    console.log(' TEST COMPLETATO');
    console.log('========================================');

} catch (error) {

    console.error('\nERRORE DURANTE IL TEST:');
    console.error(error);

    process.exitCode = 1;

} finally {

    database.close();

    console.log('\nDatabase chiuso.');
}