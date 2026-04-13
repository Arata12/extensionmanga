import { STORAGE_SETTINGS_KEY } from '../shared/constants';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '../shared/types';

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_SETTINGS_KEY] as Partial<ExtensionSettings> | undefined),
  };
}

export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [STORAGE_SETTINGS_KEY]: next });
  return next;
}

export async function clearAuth(): Promise<ExtensionSettings> {
  return updateSettings({ authToken: null, viewer: null });
}
