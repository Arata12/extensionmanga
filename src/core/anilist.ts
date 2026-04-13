import {
  ANILIST_API,
  ANILIST_MEDIA_WITH_ENTRY_QUERY,
  ANILIST_SAVE_MUTATION,
  ANILIST_SEARCH_QUERY,
  ANILIST_VIEWER_QUERY,
} from '../shared/constants';
import type { AniListMedia, AniListUser, MediaListStatus } from '../shared/types';

interface GraphQlResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gql<T>(query: string, variables?: Record<string, unknown>, token?: string | null): Promise<T> {
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

  const json = (await response.json()) as GraphQlResult<T>;
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  if (!json.data) {
    throw new Error('AniList returned no data');
  }
  return json.data;
}

export async function validateToken(token: string): Promise<AniListUser | null> {
  try {
    const data = await gql<{ Viewer: AniListUser | null }>(ANILIST_VIEWER_QUERY, undefined, token);
    return data.Viewer;
  } catch {
    return null;
  }
}

export async function searchManga(search: string): Promise<AniListMedia[]> {
  const data = await gql<{ Page: { media: AniListMedia[] } }>(ANILIST_SEARCH_QUERY, {
    search,
    page: 1,
    perPage: 10,
  });
  return data.Page.media;
}

export async function fetchMediaWithEntry(mediaId: number, token: string): Promise<AniListMedia | null> {
  const data = await gql<{ Media: AniListMedia | null }>(ANILIST_MEDIA_WITH_ENTRY_QUERY, { id: mediaId }, token);
  return data.Media;
}

export async function saveMediaProgress(input: {
  token: string;
  mediaId: number;
  progress: number;
  status?: MediaListStatus;
}): Promise<{ progress: number; status: MediaListStatus | null }> {
  const data = await gql<{
    SaveMediaListEntry: { progress: number; status: MediaListStatus | null };
  }>(
    ANILIST_SAVE_MUTATION,
    {
      mediaId: input.mediaId,
      progress: input.progress,
      status: input.status,
    },
    input.token,
  );

  return data.SaveMediaListEntry;
}
