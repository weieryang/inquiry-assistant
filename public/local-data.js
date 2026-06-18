(function () {
    'use strict';

    const DB_NAME = 'inquiry-assistant-local';
    const DB_VERSION = 1;
    const SESSION_STORE = 'sessions';
    const META_STORE = 'meta';
    const LEGACY_SESSION_KEY = 'inquiry_sessions_v3';
    const BACKUP_FORMAT = 'xunpan-backup';
    const BACKUP_VERSION = 1;
    const PBKDF2_ITERATIONS = 250000;

    let dbPromise;

    function openDatabase() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(SESSION_STORE)) {
                    const sessions = db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
                    sessions.createIndex('updatedAt', 'updatedAt');
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('无法打开本地数据库'));
            request.onblocked = () => reject(new Error('本地数据库正在被其他页面占用，请关闭旧页面后重试'));
        });

        return dbPromise;
    }

    function transactionDone(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('本地数据库操作失败'));
            transaction.onabort = () => reject(transaction.error || new Error('本地数据库操作已取消'));
        });
    }

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('读取本地数据失败'));
        });
    }

    function normalizeSession(id, value = {}) {
        return {
            id,
            messages: Array.isArray(value.messages) ? value.messages : [],
            documentContext: typeof value.documentContext === 'string' ? value.documentContext : '',
            documentName: typeof value.documentName === 'string' ? value.documentName : '',
            createdAt: value.createdAt || value.updatedAt || new Date().toISOString(),
            updatedAt: value.updatedAt || new Date().toISOString()
        };
    }

    async function listSessions() {
        const db = await openDatabase();
        const transaction = db.transaction(SESSION_STORE, 'readonly');
        const rows = await requestResult(transaction.objectStore(SESSION_STORE).getAll());
        await transactionDone(transaction);

        return rows
            .map(row => normalizeSession(row.id, row))
            .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    }

    async function putSession(id, value) {
        const db = await openDatabase();
        const transaction = db.transaction(SESSION_STORE, 'readwrite');
        const session = normalizeSession(id, {
            ...value,
            updatedAt: new Date().toISOString()
        });
        transaction.objectStore(SESSION_STORE).put(session);
        await transactionDone(transaction);
        return session;
    }

    async function deleteSession(id) {
        const db = await openDatabase();
        const transaction = db.transaction(SESSION_STORE, 'readwrite');
        transaction.objectStore(SESSION_STORE).delete(id);
        await transactionDone(transaction);
    }

    async function clearSessions() {
        const db = await openDatabase();
        const transaction = db.transaction(SESSION_STORE, 'readwrite');
        transaction.objectStore(SESSION_STORE).clear();
        await transactionDone(transaction);
    }

    async function getMeta(key) {
        const db = await openDatabase();
        const transaction = db.transaction(META_STORE, 'readonly');
        const value = await requestResult(transaction.objectStore(META_STORE).get(key));
        await transactionDone(transaction);
        return value ? value.value : null;
    }

    async function setMeta(key, value) {
        const db = await openDatabase();
        const transaction = db.transaction(META_STORE, 'readwrite');
        transaction.objectStore(META_STORE).put({ key, value });
        await transactionDone(transaction);
    }

    async function migrateLegacySessions() {
        if (await getMeta('legacy-sessions-migrated')) return { migrated: 0 };

        let parsed = {};
        try {
            parsed = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) || '{}');
        } catch {
            parsed = {};
        }

        let migrated = 0;
        for (const [id, session] of Object.entries(parsed)) {
            if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) continue;
            await putSession(id, session);
            migrated += 1;
        }

        await setMeta('legacy-sessions-migrated', new Date().toISOString());
        if (migrated) {
            localStorage.removeItem(LEGACY_SESSION_KEY);
        }
        return { migrated };
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    }

    async function deriveKey(password, salt, usage) {
        const baseKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                hash: 'SHA-256',
                salt,
                iterations: PBKDF2_ITERATIONS
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            [usage]
        );
    }

    async function encryptBackup(payload, password) {
        if (!password || password.length < 8) {
            throw new Error('备份密码至少需要 8 位');
        }

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt, 'encrypt');
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

        return JSON.stringify({
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            encryption: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA256',
            iterations: PBKDF2_ITERATIONS,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
            data: bytesToBase64(new Uint8Array(ciphertext))
        });
    }

    async function decryptBackup(text, password) {
        let envelope;
        try {
            envelope = JSON.parse(text);
        } catch {
            throw new Error('这不是有效的询盘助手数据包');
        }

        if (envelope.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION) {
            throw new Error('数据包格式或版本不受支持');
        }
        if (!password) throw new Error('请输入数据包密码');

        try {
            const salt = base64ToBytes(envelope.salt);
            const iv = base64ToBytes(envelope.iv);
            const ciphertext = base64ToBytes(envelope.data);
            const key = await deriveKey(password, salt, 'decrypt');
            const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            const payload = JSON.parse(new TextDecoder().decode(plaintext));
            validateBackupPayload(payload);
            return payload;
        } catch (error) {
            if (error.message && error.message.includes('数据包')) throw error;
            throw new Error('数据包密码错误，或文件已经损坏');
        }
    }

    function validateBackupPayload(payload) {
        if (!payload || payload.product !== 'inquiry-assistant' || !Array.isArray(payload.sessions)) {
            throw new Error('数据包内容不完整');
        }
        payload.sessions.forEach(session => {
            if (!session || !/^[a-zA-Z0-9_-]{1,80}$/.test(String(session.id || ''))) {
                throw new Error('数据包中包含无效客户 ID');
            }
        });
    }

    function createBackupPayload(sessions, preferences, scope) {
        return {
            product: 'inquiry-assistant',
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            scope,
            sessions: sessions.map(session => normalizeSession(session.id, session)),
            preferences: preferences || {}
        };
    }

    function uniqueImportedId(id, existingIds) {
        if (!existingIds.has(id)) return id;
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let sequence = 1;
        let candidate = `${id}-imported-${datePart}`;
        while (existingIds.has(candidate)) {
            sequence += 1;
            candidate = `${id}-imported-${datePart}-${sequence}`;
        }
        return candidate;
    }

    async function importSessions(payload) {
        validateBackupPayload(payload);
        const existing = await listSessions();
        const existingIds = new Set(existing.map(session => session.id));
        const imported = [];
        const renamed = [];

        for (const source of payload.sessions) {
            const id = uniqueImportedId(source.id, existingIds);
            existingIds.add(id);
            const session = await putSession(id, {
                ...source,
                id,
                importedFrom: source.id,
                updatedAt: new Date().toISOString()
            });
            imported.push(session);
            if (id !== source.id) renamed.push({ from: source.id, to: id });
        }

        return { imported, renamed, preferences: payload.preferences || {} };
    }

    window.LocalDataStore = {
        clearSessions,
        createBackupPayload,
        decryptBackup,
        deleteSession,
        encryptBackup,
        importSessions,
        listSessions,
        migrateLegacySessions,
        openDatabase,
        putSession
    };
})();
