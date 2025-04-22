const storageService = require('../../../src/core/storage-service');
const fs = require('fs');
const path = require('path');

const DB_PATH = storageService.DB_PATH;

beforeAll(async () => {
    // Remove test DB if it exists
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    await storageService.init();
});

afterAll(done => {
    // Try to close any lingering sqlite3 handles
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(DB_PATH);
    db.close(() => done());
});

describe('StorageService', () => {
    beforeEach(async () => {
        // Clean tables for isolation
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(DB_PATH);
        await new Promise(res => db.run('DELETE FROM settings', res));
        await new Promise(res => db.run('DELETE FROM history', res));
        db.close();
    });

    it('should set and get a setting', async () => {
        await storageService.setSetting('theme', 'dark');
        const theme = await storageService.getSetting('theme');
        expect(theme).toBe('dark');
    });

    it('should store and retrieve secure (encrypted) data', async () => {
        await storageService.setSecure('api-key', 'secret-value');
        const sqlite3 = require('sqlite3').verbose();
        const db = new sqlite3.Database(DB_PATH);
        const row = await new Promise(res => db.get('SELECT value FROM settings WHERE key = ?', ['api-key'], (err, row) => res(row)));
        db.close();
        expect(row.value).not.toBe('secret-value'); // Should be encrypted
        const decrypted = await storageService.getSecure('api-key');
        expect(decrypted).toBe('secret-value');
    });

    it('should store and retrieve history', async () => {
        await storageService.addHistory('login', { user: 'bob' });
        const history = await storageService.getHistory(1);
        expect(history[0].event).toBe('login');
        expect(history[0].payload).toEqual({ user: 'bob' });
    });
});
