export const ANILIST_CLIENT_ID = 39084;
export const ANILIST_AUTH_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
export const ANILIST_API = 'https://graphql.anilist.co';

export const STORAGE_SETTINGS_KEY = 'extmg.settings';

export const ANILIST_VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    Viewer {
      id
      name
      avatar {
        large
      }
    }
  }
`;

export const ANILIST_SEARCH_QUERY = /* GraphQL */ `
  query SearchManga($search: String!, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: MANGA, search: $search, sort: SEARCH_MATCH) {
        id
        title {
          userPreferred
          romaji
          english
          native
        }
        synonyms
        chapters
        status
        format
        siteUrl
      }
    }
  }
`;

export const ANILIST_MEDIA_WITH_ENTRY_QUERY = /* GraphQL */ `
  query MediaWithEntry($id: Int!) {
    Media(id: $id, type: MANGA) {
      id
      chapters
      title {
        userPreferred
        romaji
        english
        native
      }
      synonyms
      status
      format
      siteUrl
      mediaListEntry {
        id
        progress
        status
        updatedAt
      }
    }
  }
`;

export const ANILIST_SAVE_MUTATION = /* GraphQL */ `
  mutation SaveMediaListEntry($mediaId: Int!, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
      id
      progress
      status
      updatedAt
    }
  }
`;

export const ADAPTER_EVENT_NAME = 'extmg:adapter:event';
export const ADAPTER_RPC_REQUEST_EVENT = 'extmg:adapter:rpc-request';
export const ADAPTER_RPC_RESPONSE_EVENT = 'extmg:adapter:rpc-response';
