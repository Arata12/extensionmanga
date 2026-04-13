export interface AniListUser {
  id: number;
  name: string;
  avatar?: { large?: string | null } | null;
}

export interface AniListTitleSet {
  userPreferred?: string | null;
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export interface AniListListEntry {
  id: number;
  progress: number;
  status: MediaListStatus | null;
  updatedAt?: number | null;
}

export interface AniListMedia {
  id: number;
  title: AniListTitleSet;
  synonyms?: string[];
  chapters?: number | null;
  status?: string | null;
  format?: string | null;
  siteUrl?: string | null;
  mediaListEntry?: AniListListEntry | null;
}

export type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';
export type SyncMode = 'ask' | 'automatic' | 'manual';

export interface ExtensionSettings {
  authToken: string | null;
  viewer: AniListUser | null;
  syncMode: SyncMode;
  enabledBuiltinAdapterIds: string[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  authToken: null,
  viewer: null,
  syncMode: 'ask',
  enabledBuiltinAdapterIds: [],
};

export interface AdapterMeta {
  id: string;
  name: string;
  version: string;
  site: string;
  description?: string;
  matches: string[];
}

export interface ImportedAdapterRecord {
  id: string;
  meta: AdapterMeta;
  sourceCode: string;
  enabled: boolean;
  importedAt: number;
  updatedAt: number;
}

export interface AdapterListItem {
  id: string;
  meta: AdapterMeta;
  enabled: boolean;
  sourceType: 'bundled' | 'imported';
}

export interface ChapterContext {
  site: string;
  siteSeriesId: string;
  siteSeriesTitle: string;
  chapterId?: string;
  chapterNumber?: number | null;
  chapterTitle?: string;
  chapterUrl: string;
}

export interface ChapterReadSignal {
  context: ChapterContext;
  trigger: string;
}

export interface SeriesMapping {
  key: string;
  site: string;
  siteSeriesId: string;
  siteTitle: string;
  anilistMediaId: number;
  anilistTitle: string;
  confirmedByUser: boolean;
  updatedAt: number;
}

export interface TitleAlias {
  key: string;
  site: string;
  normalizedTitle: string;
  anilistMediaId: number;
  anilistTitle: string;
  updatedAt: number;
}

export interface SyncLogEntry {
  key: string;
  site: string;
  siteSeriesId: string;
  chapterKey: string;
  chapterNumber: number;
  chapterUrl: string;
  anilistMediaId: number;
  syncedAt: number;
  result: 'synced' | 'skipped' | 'error';
  reason?: string;
}

export interface MatchCandidate {
  mediaId: number;
  title: string;
  score: number;
  chapters?: number | null;
  format?: string | null;
  formatLabel?: string;
}

export interface ResolutionResult {
  state: 'mapped' | 'needs_choice' | 'unresolved';
  mapping?: SeriesMapping;
  candidates?: MatchCandidate[];
}

export interface TabSession {
  adapterId: string;
  context: ChapterContext;
  resolution?: ResolutionResult;
}

export type DetectionUiResult =
  | { state: 'auth_required' }
  | { state: 'mapped'; title: string; mediaId: number; confirmed: boolean }
  | { state: 'needs_choice'; candidates: MatchCandidate[] }
  | { state: 'unresolved' }
  | { state: 'invalid'; message: string };

export type ReadUiResult =
  | { state: 'auth_required' }
  | { state: 'needs_choice'; candidates: MatchCandidate[] }
  | { state: 'manual' }
  | { state: 'confirm_sync'; title: string; chapterNumber: number }
  | { state: 'synced'; title: string; progress: number }
  | { state: 'skipped'; reason: string }
  | { state: 'error'; message: string };

export interface AdapterDomEvent<T = unknown> {
  adapterId: string;
  type: 'chapter_detected' | 'chapter_read' | 'show_status';
  payload: T;
}

export interface AdapterRpcRequest {
  requestId: string;
  method: 'get_settings' | 'get_known_mapping';
  params: Record<string, unknown>;
}

export interface AdapterRpcResponse {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
