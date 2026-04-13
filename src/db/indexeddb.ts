import { openDB, type IDBPDatabase } from 'idb';
import type { ImportedAdapterRecord, SeriesMapping, SyncLogEntry, TitleAlias } from '../shared/types';
import { DB_NAME, DB_VERSION, type MangaSyncDb } from './schema';

let dbPromise: Promise<IDBPDatabase<MangaSyncDb>> | null = null;

function getDb(): Promise<IDBPDatabase<MangaSyncDb>> {
  if (!dbPromise) {
    dbPromise = openDB<MangaSyncDb>(DB_NAME, DB_VERSION, {
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

export async function saveSeriesMapping(record: SeriesMapping): Promise<void> {
  const db = await getDb();
  await db.put('seriesMappings', record);
}

export async function getSeriesMapping(site: string, siteSeriesId: string): Promise<SeriesMapping | undefined> {
  const db = await getDb();
  return db.get('seriesMappings', `${site}|${siteSeriesId}`);
}

export async function listSeriesMappings(): Promise<SeriesMapping[]> {
  const db = await getDb();
  return db.getAll('seriesMappings');
}

export async function deleteSeriesMapping(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('seriesMappings', key);
}

export async function saveTitleAlias(record: TitleAlias): Promise<void> {
  const db = await getDb();
  await db.put('titleAliases', record);
}

export async function getTitleAlias(site: string, normalizedTitle: string): Promise<TitleAlias | undefined> {
  const db = await getDb();
  return db.get('titleAliases', `${site}|${normalizedTitle}`);
}

export async function saveSyncLogEntry(record: SyncLogEntry): Promise<void> {
  const db = await getDb();
  await db.put('syncLog', record);
}

export async function getSyncLogEntry(site: string, siteSeriesId: string, chapterKey: string): Promise<SyncLogEntry | undefined> {
  const db = await getDb();
  return db.get('syncLog', `${site}|${siteSeriesId}|${chapterKey}`);
}

export async function deleteSyncLogEntry(site: string, siteSeriesId: string, chapterKey: string): Promise<void> {
  const db = await getDb();
  await db.delete('syncLog', `${site}|${siteSeriesId}|${chapterKey}`);
}

export async function listSyncLog(limit = 50): Promise<SyncLogEntry[]> {
  const db = await getDb();
  const rows = await db.getAll('syncLog');
  return rows.sort((a, b) => b.syncedAt - a.syncedAt).slice(0, limit);
}

export async function saveImportedAdapter(record: ImportedAdapterRecord): Promise<void> {
  const db = await getDb();
  await db.put('customAdapters', record);
}

export async function getImportedAdapter(id: string): Promise<ImportedAdapterRecord | undefined> {
  const db = await getDb();
  return db.get('customAdapters', id);
}

export async function listImportedAdapters(): Promise<ImportedAdapterRecord[]> {
  const db = await getDb();
  return db.getAll('customAdapters');
}

export async function deleteImportedAdapter(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('customAdapters', id);
}
