function formatLabel(format) {
    switch (format) {
        case 'MANGA':
            return 'Manga';
        case 'NOVEL':
            return 'Light Novel';
        case 'ONE_SHOT':
            return 'One Shot';
        default:
            return format ? format.replace(/_/g, ' ') : 'Unknown';
    }
}
function formatWeight(format) {
    switch (format) {
        case 'MANGA':
            return 0.08;
        case 'ONE_SHOT':
            return 0.04;
        case 'NOVEL':
            return -0.18;
        default:
            return 0;
    }
}
export function normalizeTitle(input) {
    return input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function titleVariants(media) {
    return [
        media.title.userPreferred,
        media.title.romaji,
        media.title.english,
        media.title.native,
        ...(media.synonyms ?? []),
    ].filter((value) => Boolean(value));
}
function scoreCandidate(siteTitle, media) {
    const normalizedSiteTitle = normalizeTitle(siteTitle);
    let best = 0;
    for (const variant of titleVariants(media)) {
        const normalizedVariant = normalizeTitle(variant);
        if (!normalizedVariant)
            continue;
        if (normalizedVariant === normalizedSiteTitle) {
            return 1;
        }
        if (normalizedVariant.includes(normalizedSiteTitle) || normalizedSiteTitle.includes(normalizedVariant)) {
            best = Math.max(best, 0.9);
            continue;
        }
        const siteWords = new Set(normalizedSiteTitle.split(' '));
        const variantWords = new Set(normalizedVariant.split(' '));
        const overlap = [...siteWords].filter((word) => variantWords.has(word)).length;
        const score = overlap / Math.max(siteWords.size, variantWords.size, 1);
        best = Math.max(best, score);
    }
    return best;
}
export function rankCandidates(siteTitle, media) {
    return media
        .map((item) => {
        const baseScore = scoreCandidate(siteTitle, item);
        return {
            mediaId: item.id,
            title: item.title.userPreferred ?? item.title.english ?? item.title.romaji ?? item.title.native ?? `AniList #${item.id}`,
            chapters: item.chapters ?? null,
            format: item.format ?? null,
            formatLabel: formatLabel(item.format),
            score: Math.max(0, Math.min(1, baseScore + formatWeight(item.format))),
        };
    })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}
export function isStrongMatch(candidates) {
    if (!candidates.length)
        return false;
    const [first, second] = candidates;
    if (first.score >= 0.995)
        return true;
    return first.score >= 0.96 && (!second || first.score - second.score >= 0.25);
}
