import { STORAGE_SETTINGS_KEY } from '../shared/constants';
import { DEFAULT_SETTINGS } from '../shared/types';
export async function getSettings() {
    const result = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
    return {
        ...DEFAULT_SETTINGS,
        ...result[STORAGE_SETTINGS_KEY],
    };
}
export async function updateSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: next });
    return next;
}
export async function clearAuth() {
    return updateSettings({ authToken: null, viewer: null });
}
