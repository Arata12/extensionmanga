import { openDB } from 'idb';
import { DB_NAME, DB_VERSION } from './schema';
let dbPromise = null;
function getDb() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('seriesMappings')) {
                    const store = db.createObjectStore('seriesMappings', { keyPath: 'key' });
                    store.createIndex('by-site', 'site');
                    store.createIndex('by-siteSeriesId', 'siteSeriesId');
                }
                if (!db.objectStoreNames.contains('titleAliases')) {
                    const store = db.createObjectStore('titleAliases', { keyPath: 'key' });
                    store.createIndex('by-site', 'site');
                }
                if (!db.objectStoreNames.contains('syncLog')) {
                    const store = db.createObjectStore('syncLog', { keyPath: 'key' });
                    store.createIndex('by-siteSeriesId', 'siteSeriesId');
                    store.createIndex('by-syncedAt', 'syncedAt');
                }
                if (!db.objectStoreNames.contains('customAdapters')) {
                    const store = db.createObjectStore('customAdapters', { keyPath: 'id' });
                    store.createIndex('by-enabled', 'enabled');
                }
            },
        });
    }
    return dbPromise;
}
export async function saveSeriesMapping(record) {
    const db = await getDb();
    await db.put('seriesMappings', record);
}
export async function getSeriesMapping(site, siteSeriesId) {
    const db = await getDb();
    return db.get('seriesMappings', `${site}|${siteSeriesId}`);
}
export async function listSeriesMappings() {
    const db = await getDb();
    return db.getAll('seriesMappings');
}
export async function deleteSeriesMapping(key) {
    const db = await getDb();
    await db.delete('seriesMappings', key);
}
export async function saveTitleAlias(record) {
    const db = await getDb();
    await db.put('titleAliases', record);
}
export async function getTitleAlias(site, normalizedTitle) {
    const db = await getDb();
    return db.get('titleAliases', `${site}|${normalizedTitle}`);
}
export async function saveSyncLogEntry(record) {
    const db = await getDb();
    await db.put('syncLog', record);
}
export async function getSyncLogEntry(site, siteSeriesId, chapterKey) {
    const db = await getDb();
    return db.get('syncLog', `${site}|${siteSeriesId}|${chapterKey}`);
}
export async function deleteSyncLogEntry(site, siteSeriesId, chapterKey) {
    const db = await getDb();
    await db.delete('syncLog', `${site}|${siteSeriesId}|${chapterKey}`);
}
export async function listSyncLog(limit = 50) {
    const db = await getDb();
    const rows = await db.getAll('syncLog');
    return rows.sort((a, b) => b.syncedAt - a.syncedAt).slice(0, limit);
}
export async function saveImportedAdapter(record) {
    const db = await getDb();
    await db.put('customAdapters', record);
}
export async function getImportedAdapter(id) {
    const db = await getDb();
    return db.get('customAdapters', id);
}
export async function listImportedAdapters() {
    const db = await getDb();
    return db.getAll('customAdapters');
}
export async function deleteImportedAdapter(id) {
    const db = await getDb();
    await db.delete('customAdapters', id);
}
