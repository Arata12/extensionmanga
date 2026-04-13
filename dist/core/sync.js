import { fetchMediaWithEntry, saveMediaProgress, searchManga } from './anilist';
import { isStrongMatch, normalizeTitle, rankCandidates } from './matcher';
import { getSettings } from './storage';
import { deleteSeriesMapping, deleteSyncLogEntry, getSeriesMapping, getSyncLogEntry, getTitleAlias, listSeriesMappings, saveSeriesMapping, saveSyncLogEntry, saveTitleAlias, } from '../db/indexeddb';
function buildSearchQueries(title) {
    const trimmed = title.trim();
    const normalized = normalizeTitle(trimmed);
    const variants = [
        trimmed,
        trimmed.replace(/\s+-\s+.*$/, '').trim(),
        trimmed.replace(/\([^)]*\)/g, '').trim(),
        normalized.replace(/\b(ch|chapter|capitulo|capítulo)\b.*$/i, '').trim(),
    ];
    return [...new Set(variants.filter((value) => value && value.length >= 2))];
}
async function searchCandidatesForTitle(title) {
    const queries = buildSearchQueries(title);
    for (const query of queries) {
        const results = await searchManga(query);
        const candidates = rankCandidates(query, results);
        if (candidates.length) {
            return candidates;
        }
    }
    return [];
}
async function findEquivalentMappings(record) {
    const normalizedTitle = normalizeTitle(record.siteTitle);
    const allMappings = await listSeriesMappings();
    return allMappings.filter((mapping) => mapping.site === record.site &&
        mapping.anilistMediaId === record.anilistMediaId &&
        normalizeTitle(mapping.siteTitle) === normalizedTitle);
}
async function saveCanonicalMapping(mapping) {
    const equivalents = await findEquivalentMappings(mapping);
    const confirmedByUser = mapping.confirmedByUser || equivalents.some((item) => item.confirmedByUser);
    for (const equivalent of equivalents) {
        if (equivalent.key !== mapping.key) {
            await deleteSeriesMapping(equivalent.key);
        }
    }
    const canonicalMapping = { ...mapping, confirmedByUser };
    await saveSeriesMapping(canonicalMapping);
    return canonicalMapping;
}
export async function resolveSeries(context) {
    const exact = await getSeriesMapping(context.site, context.siteSeriesId);
    if (exact) {
        return { state: 'mapped', mapping: exact };
    }
    const alias = await getTitleAlias(context.site, normalizeTitle(context.siteSeriesTitle));
    if (alias) {
        const equivalents = await findEquivalentMappings({
            site: context.site,
            siteTitle: context.siteSeriesTitle,
            anilistMediaId: alias.anilistMediaId,
        });
        const existing = equivalents.find((mapping) => mapping.confirmedByUser) ?? equivalents[0];
        if (existing) {
            return { state: 'mapped', mapping: existing };
        }
        return {
            state: 'mapped',
            mapping: {
                key: `${context.site}|${context.siteSeriesId}`,
                site: context.site,
                siteSeriesId: context.siteSeriesId,
                siteTitle: context.siteSeriesTitle,
                anilistMediaId: alias.anilistMediaId,
                anilistTitle: alias.anilistTitle,
                confirmedByUser: false,
                updatedAt: Date.now(),
            },
        };
    }
    const candidates = await searchCandidatesForTitle(context.siteSeriesTitle);
    if (!candidates.length) {
        return { state: 'unresolved' };
    }
    if (isStrongMatch(candidates)) {
        return { state: 'needs_choice', candidates };
    }
    return { state: 'needs_choice', candidates };
}
export async function buildDetectionUi(context) {
    const settings = await getSettings();
    if (!settings.authToken) {
        return { state: 'auth_required' };
    }
    try {
        const resolution = await resolveSeries(context);
        if (resolution.state === 'mapped' && resolution.mapping) {
            return {
                state: 'mapped',
                title: resolution.mapping.anilistTitle,
                mediaId: resolution.mapping.anilistMediaId,
                confirmed: resolution.mapping.confirmedByUser,
            };
        }
        if (resolution.state === 'needs_choice') {
            return { state: 'needs_choice', candidates: resolution.candidates ?? [] };
        }
    }
    catch (error) {
        return { state: 'invalid', message: error instanceof Error ? error.message : String(error) };
    }
    return { state: 'unresolved' };
}
export async function confirmSeriesMapping(context, candidate) {
    const mapping = await saveCanonicalMapping({
        key: `${context.site}|${context.siteSeriesId}`,
        site: context.site,
        siteSeriesId: context.siteSeriesId,
        siteTitle: context.siteSeriesTitle,
        anilistMediaId: candidate.mediaId,
        anilistTitle: candidate.title,
        confirmedByUser: true,
        updatedAt: Date.now(),
    });
    await saveTitleAlias({
        key: `${context.site}|${normalizeTitle(context.siteSeriesTitle)}`,
        site: context.site,
        normalizedTitle: normalizeTitle(context.siteSeriesTitle),
        anilistMediaId: candidate.mediaId,
        anilistTitle: candidate.title,
        updatedAt: Date.now(),
    });
    return mapping;
}
function ensureIntegerChapter(context) {
    if (typeof context.chapterNumber !== 'number')
        return null;
    if (!Number.isInteger(context.chapterNumber))
        return null;
    if (context.chapterNumber < 0)
        return null;
    return context.chapterNumber;
}
async function performSync(context, mapping) {
    const settings = await getSettings();
    if (!settings.authToken) {
        return { state: 'auth_required' };
    }
    const chapterNumber = ensureIntegerChapter(context);
    if (chapterNumber === null) {
        return { state: 'skipped', reason: 'Only clean integer chapters are synced in v1.' };
    }
    const chapterKey = context.chapterId ?? String(chapterNumber);
    const existingLog = await getSyncLogEntry(context.site, context.siteSeriesId, chapterKey);
    if (existingLog) {
        return { state: 'skipped', reason: 'This chapter was already synced.' };
    }
    const media = await fetchMediaWithEntry(mapping.anilistMediaId, settings.authToken);
    if (!media) {
        return { state: 'error', message: 'AniList entry could not be loaded.' };
    }
    const currentProgress = media.mediaListEntry?.progress ?? 0;
    if (chapterNumber <= currentProgress) {
        await saveSyncLogEntry({
            key: `${context.site}|${context.siteSeriesId}|${chapterKey}`,
            site: context.site,
            siteSeriesId: context.siteSeriesId,
            chapterKey,
            chapterNumber,
            chapterUrl: context.chapterUrl,
            anilistMediaId: mapping.anilistMediaId,
            syncedAt: Date.now(),
            result: 'skipped',
            reason: `Chapter ${chapterNumber} is not ahead of AniList progress ${currentProgress}.`,
        });
        return { state: 'skipped', reason: 'AniList progress is already ahead or equal.' };
    }
    const saveResult = await saveMediaProgress({
        token: settings.authToken,
        mediaId: mapping.anilistMediaId,
        progress: chapterNumber,
        status: media.mediaListEntry ? undefined : 'CURRENT',
    });
    await saveSyncLogEntry({
        key: `${context.site}|${context.siteSeriesId}|${chapterKey}`,
        site: context.site,
        siteSeriesId: context.siteSeriesId,
        chapterKey,
        chapterNumber,
        chapterUrl: context.chapterUrl,
        anilistMediaId: mapping.anilistMediaId,
        syncedAt: Date.now(),
        result: 'synced',
    });
    return { state: 'synced', title: mapping.anilistTitle, progress: saveResult.progress };
}
export async function handleRead(context) {
    const settings = await getSettings();
    if (!settings.authToken) {
        return { state: 'auth_required' };
    }
    const resolution = await resolveSeries(context);
    if (resolution.state === 'needs_choice') {
        return { state: 'needs_choice', candidates: resolution.candidates ?? [] };
    }
    if (resolution.state !== 'mapped' || !resolution.mapping) {
        return { state: 'error', message: 'No AniList match available for this manga yet.' };
    }
    const chapterNumber = ensureIntegerChapter(context);
    if (chapterNumber === null) {
        return { state: 'skipped', reason: 'Only clean integer chapters are synced in v1.' };
    }
    if (settings.syncMode === 'manual') {
        return { state: 'manual' };
    }
    if (settings.syncMode === 'ask') {
        return { state: 'confirm_sync', title: resolution.mapping.anilistTitle, chapterNumber };
    }
    return performSync(context, resolution.mapping);
}
export async function confirmReadSync(context) {
    const resolution = await resolveSeries(context);
    if (resolution.state !== 'mapped' || !resolution.mapping) {
        return { state: 'error', message: 'No confirmed AniList mapping available.' };
    }
    return performSync(context, resolution.mapping);
}
export async function debugSync(context) {
    const resolution = await resolveSeries(context);
    if (resolution.state !== 'mapped' || !resolution.mapping) {
        return { state: 'error', message: 'No AniList mapping available for debug sync.' };
    }
    const chapterNumber = ensureIntegerChapter(context);
    if (chapterNumber === null) {
        return { state: 'error', message: 'Current chapter is not a clean integer.' };
    }
    await deleteSyncLogEntry(context.site, context.siteSeriesId, context.chapterId ?? String(chapterNumber));
    return performSync(context, resolution.mapping);
}
export { listSeriesMappings };
