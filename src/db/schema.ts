import type { DBSchema } from 'idb';
import type { ImportedAdapterRecord, SeriesMapping, SyncLogEntry, TitleAlias } from '../shared/types';

export interface MangaSyncDb extends DBSchema {
  seriesMappings: {
    key: string;
    value: SeriesMapping;
    indexes: {
      'by-site': string;
      'by-siteSeriesId': string;
    };
  };
  titleAliases: {
    key: string;
    value: TitleAlias;
    indexes: {
      'by-site': string;
    };
  };
  syncLog: {
    key: string;
    value: SyncLogEntry;
    indexes: {
      'by-siteSeriesId': string;
      'by-syncedAt': number;
    };
  };
  customAdapters: {
    key: string;
    value: ImportedAdapterRecord;
    indexes: {
      'by-enabled': number;
    };
  };
}

export const DB_NAME = 'manga-sync-extension';
export const DB_VERSION = 2;
