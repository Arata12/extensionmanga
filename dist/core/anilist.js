import { ANILIST_API, ANILIST_MEDIA_WITH_ENTRY_QUERY, ANILIST_SAVE_MUTATION, ANILIST_SEARCH_QUERY, ANILIST_VIEWER_QUERY, } from '../shared/constants';
async function gql(query, variables, token) {
    const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
        throw new Error(`AniList request failed (${response.status})`);
    }
    const json = (await response.json());
    if (json.errors?.length) {
        throw new Error(json.errors[0].message);
    }
    if (!json.data) {
        throw new Error('AniList returned no data');
    }
    return json.data;
}
export async function validateToken(token) {
    try {
        const data = await gql(ANILIST_VIEWER_QUERY, undefined, token);
        return data.Viewer;
    }
    catch {
        return null;
    }
}
export async function searchManga(search) {
    const data = await gql(ANILIST_SEARCH_QUERY, {
        search,
        page: 1,
        perPage: 10,
    });
    return data.Page.media;
}
export async function fetchMediaWithEntry(mediaId, token) {
    const data = await gql(ANILIST_MEDIA_WITH_ENTRY_QUERY, { id: mediaId }, token);
    return data.Media;
}
export async function saveMediaProgress(input) {
    const data = await gql(ANILIST_SAVE_MUTATION, {
        mediaId: input.mediaId,
        progress: input.progress,
        status: input.status,
    }, input.token);
    return data.SaveMediaListEntry;
}
