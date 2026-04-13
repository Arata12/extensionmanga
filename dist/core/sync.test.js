import { beforeEach, describe, expect, it, vi } from 'vitest';
const searchManga = vi.fn();
const fetchMediaWithEntry = vi.fn();
const saveMediaProgress = vi.fn();
const getSettings = vi.fn();
const getSeriesMapping = vi.fn();
const getSyncLogEntry = vi.fn();
const getTitleAlias = vi.fn();
const listSeriesMappings = vi.fn();
const saveSeriesMapping = vi.fn();
const saveSyncLogEntry = vi.fn();
const saveTitleAlias = vi.fn();
const deleteSyncLogEntry = vi.fn();
vi.mock('./anilist', () => ({
    searchManga,
    fetchMediaWithEntry,
    saveMediaProgress,
}));
vi.mock('./storage', () => ({
    getSettings,
}));
vi.mock('../db/indexeddb', () => ({
    getSeriesMapping,
    getSyncLogEntry,
    getTitleAlias,
    listSeriesMappings,
    saveSeriesMapping,
    saveSyncLogEntry,
    saveTitleAlias,
    deleteSyncLogEntry,
}));
describe('sync matching regression coverage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        getSettings.mockResolvedValue({ authToken: 'token', viewer: { name: 'user' }, syncMode: 'ask', enabledBuiltinAdapterIds: [] });
        getSeriesMapping.mockResolvedValue(undefined);
        getTitleAlias.mockResolvedValue(undefined);
    });
    it('reuses a stored title alias before searching AniList', async () => {
        getTitleAlias.mockResolvedValue({
            key: 'mangadex|hangyaku no nijigasaki',
            site: 'mangadex',
            normalizedTitle: 'hangyaku no nijigasaki',
            anilistMediaId: 179454,
            anilistTitle: 'Hangyaku no Nijigasaki',
            updatedAt: Date.now(),
        });
        const { resolveSeries } = await import('./sync');
        const result = await resolveSeries({
            site: 'mangadex',
            siteSeriesId: 'title:hangyaku-no-nijigasaki',
            siteSeriesTitle: 'Hangyaku no Nijigasaki',
            chapterUrl: 'https://mangadex.org/chapter/abc/1',
        });
        expect(result.state).toBe('mapped');
        expect(searchManga).not.toHaveBeenCalled();
        expect(saveSeriesMapping).toHaveBeenCalledTimes(1);
    });
    it('tries cleaned search queries for noisy extracted titles', async () => {
        searchManga
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
            {
                id: 179454,
                title: { userPreferred: 'Hangyaku no Nijigasaki', romaji: 'Hangyaku no Nijigasaki', english: null, native: null },
                synonyms: [],
                chapters: 12,
                format: 'MANGA',
            },
        ]);
        const { resolveSeries } = await import('./sync');
        const result = await resolveSeries({
            site: 'mangadex',
            siteSeriesId: 'title:hangyaku-no-nijigasaki',
            siteSeriesTitle: 'Read Hangyaku no Nijigasaki Ch. 1 on MangaDex!',
            chapterUrl: 'https://mangadex.org/chapter/abc/1',
        });
        expect(searchManga).toHaveBeenCalledTimes(2);
        expect(searchManga.mock.calls[0][0]).toBe('Read Hangyaku no Nijigasaki Ch. 1 on MangaDex!');
        expect(searchManga.mock.calls[1][0]).toContain('hangyaku no nijigasaki');
        expect(searchManga.mock.calls[1][0]).not.toContain('mangadex');
        expect(searchManga.mock.calls[1][0]).not.toContain('ch');
        expect(result.state).toBe('needs_choice');
        expect(result.candidates?.[0]?.title).toBe('Hangyaku no Nijigasaki');
    });
    it('surfaces AniList search failures as visible detection errors', async () => {
        searchManga.mockRejectedValue(new Error('AniList rate limited'));
        const { buildDetectionUi } = await import('./sync');
        const result = await buildDetectionUi({
            site: 'mangadex',
            siteSeriesId: 'title:hangyaku-no-nijigasaki',
            siteSeriesTitle: 'Hangyaku no Nijigasaki',
            chapterUrl: 'https://mangadex.org/chapter/abc/1',
        });
        expect(result).toEqual({ state: 'invalid', message: 'AniList rate limited' });
    });
});
