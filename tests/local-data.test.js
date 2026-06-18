const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

global.window = {};
global.crypto = webcrypto;
global.btoa = value => Buffer.from(value, 'binary').toString('base64');
global.atob = value => Buffer.from(value, 'base64').toString('binary');

require('../public/local-data');

const store = global.window.LocalDataStore;

test('encrypted backup round-trips through the production browser module', async () => {
    const payload = store.createBackupPayload([
        {
            id: 'buyer-001',
            messages: [{ role: 'user', content: 'Need 20 sofas' }],
            documentContext: 'Customer requested dark gray fabric.'
        }
    ], { replyLang: 'en' }, 'all');

    const encrypted = await store.encryptBackup(payload, 'strong-password');
    const decrypted = await store.decryptBackup(encrypted, 'strong-password');

    assert.equal(decrypted.sessions[0].id, 'buyer-001');
    assert.equal(decrypted.sessions[0].messages[0].content, 'Need 20 sofas');
    assert.equal(decrypted.preferences.replyLang, 'en');
    assert.doesNotMatch(encrypted, /Need 20 sofas/);
});

test('encrypted backup rejects the wrong password', async () => {
    const payload = store.createBackupPayload([], {}, 'all');
    const encrypted = await store.encryptBackup(payload, 'correct-password');

    await assert.rejects(
        store.decryptBackup(encrypted, 'wrong-password'),
        /密码错误|已经损坏/
    );
});

test('encrypted backup requires a meaningful password', async () => {
    const payload = store.createBackupPayload([], {}, 'all');
    await assert.rejects(store.encryptBackup(payload, 'short'), /至少需要 8 位/);
});
