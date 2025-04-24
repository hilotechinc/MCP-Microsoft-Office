/**
 * @fileoverview StorageService handles persistent storage using SQLite for MCP Desktop.
 * Provides async CRUD for settings/history and encryption for sensitive data. Modular and testable.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../../data/mcp.sqlite');
const ENCRYPTION_KEY = process.env.MCP_ENCRYPTION_KEY || 'dev_default_key_32bytes_long__!!';

if (Buffer.from(ENCRYPTION_KEY).length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes for AES-256-CBC');
}

function getDb() {
    return new sqlite3.Database(DB_PATH);
}

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('base64') + ':' + encrypted;
}

function decrypt(data) {
    const [ivStr, encrypted] = data.split(':');
    const iv = Buffer.from(ivStr, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function init() {
    if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = getDb();
    await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, secure INTEGER DEFAULT 0)`);
            db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, payload TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP)`);
            db.on('trace', () => {});
            db.on('profile', () => {});
            resolve();
        });
    });
    db.close();
}

async function setSetting(key, value) {
    const db = getDb();
    await new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO settings (key, value, secure) VALUES (?, ?, 0)', [key, JSON.stringify(value)], err => err ? reject(err) : resolve());
    });
    db.close();
}

async function getSetting(key) {
    const db = getDb();
    const row = await new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = ? AND secure = 0', [key], (err, row) => err ? reject(err) : resolve(row));
    });
    db.close();
    return row ? JSON.parse(row.value) : null;
}

async function setSecure(key, value) {
    const db = getDb();
    const enc = encrypt(value);
    await new Promise((resolve, reject) => {
        db.run('INSERT OR REPLACE INTO settings (key, value, secure) VALUES (?, ?, 1)', [key, enc], err => err ? reject(err) : resolve());
    });
    db.close();
}

async function getSecure(key) {
    const db = getDb();
    const row = await new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = ? AND secure = 1', [key], (err, row) => err ? reject(err) : resolve(row));
    });
    db.close();
    return row ? decrypt(row.value) : null;
}

async function addHistory(event, payload) {
    const db = getDb();
    await new Promise((resolve, reject) => {
        db.run('INSERT INTO history (event, payload) VALUES (?, ?)', [event, JSON.stringify(payload)], err => err ? reject(err) : resolve());
    });
    db.close();
}

async function getHistory(limit = 50) {
    const db = getDb();
    const rows = await new Promise((resolve, reject) => {
        db.all('SELECT event, payload, ts FROM history ORDER BY ts DESC LIMIT ?', [limit], (err, rows) => err ? reject(err) : resolve(rows));
    });
    db.close();
    return rows.map(row => ({ event: row.event, payload: JSON.parse(row.payload), ts: row.ts }));
}

module.exports = {
    init,
    setSetting,
    getSetting,
    setSecure,
    getSecure,
    addHistory,
    getHistory,
    DB_PATH
};
