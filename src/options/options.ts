import { ANILIST_AUTH_URL } from '../shared/constants';
import { parseAdapterMetadata, validateAdapterSource } from '../adapters/metadata-parser';
import type { AdapterListItem, SeriesMapping, SyncLogEntry, SyncMode } from '../shared/types';

const authStatus = document.getElementById('authStatus') as HTMLDivElement;
const runtimeStatus = document.getElementById('runtimeStatus') as HTMLDivElement;
const tokenInput = document.getElementById('tokenInput') as HTMLInputElement;
const syncModeSelect = document.getElementById('syncModeSelect') as HTMLSelectElement;
const adapterList = document.getElementById('adapterList') as HTMLDivElement;
const mappingList = document.getElementById('mappingList') as HTMLDivElement;
const syncLogList = document.getElementById('syncLogList') as HTMLDivElement;
const adapterSourceInput = document.getElementById('adapterSourceInput') as HTMLTextAreaElement;
const adapterFileInput = document.getElementById('adapterFileInput') as HTMLInputElement;
const debugOutput = document.getElementById('debugOutput') as HTMLDivElement;

type StatusResponse = {
  ok: boolean;
  settings: { viewer: { name: string } | null; syncMode: SyncMode };
  userScriptsAvailable: boolean;
  registeredScriptIds?: string[];
  lastRegistrationError?: string | null;
};

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

async function loadPage(): Promise<void> {
  const [status, adaptersResponse, mappingsResponse, syncLogResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }) as Promise<StatusResponse>,
    chrome.runtime.sendMessage({ type: 'LIST_ADAPTERS' }),
    chrome.runtime.sendMessage({ type: 'GET_MAPPINGS' }),
    chrome.runtime.sendMessage({ type: 'GET_SYNC_LOG', limit: 20 }),
  ]);

  authStatus.textContent = status.settings.viewer
    ? `Connected as ${status.settings.viewer.name}`
    : 'Not connected to AniList yet.';
  runtimeStatus.textContent = status.userScriptsAvailable
    ? `userScripts runtime is available.${status.registeredScriptIds?.length ? ` Registered: ${status.registeredScriptIds.join(', ')}` : ' No scripts registered yet.'}${status.lastRegistrationError ? ` Last error: ${status.lastRegistrationError}` : ''}`
    : 'userScripts runtime is unavailable. Enable Developer Mode / Allow User Scripts for this extension.';
  syncModeSelect.value = status.settings.syncMode;

  renderAdapters((adaptersResponse.adapters ?? []) as AdapterListItem[]);
  renderMappings((mappingsResponse.mappings ?? []) as SeriesMapping[]);
  renderSyncLog((syncLogResponse.entries ?? []) as SyncLogEntry[]);
}

function renderAdapters(adapters: AdapterListItem[]): void {
  adapterList.innerHTML = adapters
    .map(
      (adapter) => `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:700">${escapeHtml(adapter.meta.name)}</div>
              <div class="muted mono">${escapeHtml(adapter.meta.id)} · ${escapeHtml(adapter.sourceType)}</div>
              <div class="muted mono">${escapeHtml(adapter.meta.matches.join(', '))}</div>
            </div>
            <div class="row">
              <button class="secondary" data-toggle="${escapeHtml(adapter.id)}">${adapter.enabled ? 'Disable' : 'Enable'}</button>
              ${adapter.sourceType === 'imported' ? `<button class="danger" data-remove="${escapeHtml(adapter.id)}">Remove</button>` : ''}
            </div>
          </div>
        </div>
      `,
    )
    .join('');

  adapterList.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const adapterId = button.dataset.toggle;
      const enabled = button.textContent !== 'Disable';
      const adapter = adapters.find((item) => item.id === adapterId);
      if (!adapter) return;
      if (enabled) {
        const granted = await chrome.permissions.request({ origins: adapter.meta.matches });
        if (!granted) {
          window.alert('No se concedió permiso para ese sitio.');
          return;
        }
      }
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_ADAPTER', adapterId, enabled });
      if (!response?.ok) {
        window.alert(response?.error || 'Could not toggle adapter.');
        return;
      }
      await loadPage();
    });
  });

  adapterList.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      const adapterId = button.dataset.remove;
      if (!adapterId) return;
      const response = await chrome.runtime.sendMessage({ type: 'REMOVE_ADAPTER', adapterId });
      if (!response?.ok) {
        window.alert(response?.error || 'Could not remove adapter.');
        return;
      }
      await loadPage();
    });
  });
}

function renderMappings(mappings: SeriesMapping[]): void {
  if (!mappings.length) {
    mappingList.innerHTML = '<div class="muted">No remembered mappings yet.</div>';
    return;
  }

  mappingList.innerHTML = mappings
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(
      (mapping) => `
        <div class="card">
          <div style="font-weight:700">${escapeHtml(mapping.siteTitle)}</div>
          <div class="muted mono">${escapeHtml(mapping.site)} → ${escapeHtml(mapping.anilistTitle)}</div>
          <div class="row" style="justify-content:space-between;margin-top:8px">
            <span class="chip">${mapping.confirmedByUser ? 'confirmed' : 'auto learned'}</span>
            <button class="danger" data-delete-mapping="${escapeHtml(mapping.key)}">Delete</button>
          </div>
        </div>
      `,
    )
    .join('');

  mappingList.querySelectorAll<HTMLButtonElement>('[data-delete-mapping]').forEach((button) => {
    button.addEventListener('click', async () => {
      const key = button.dataset.deleteMapping;
      const response = await chrome.runtime.sendMessage({ type: 'DELETE_MAPPING', key });
      if (!response?.ok) {
        window.alert(response?.error || 'Could not delete mapping.');
        return;
      }
      await loadPage();
    });
  });
}

function renderSyncLog(entries: SyncLogEntry[]): void {
  syncLogList.innerHTML = entries.length
    ? entries
        .map(
          (entry) => `
            <div class="card">
              <div style="font-weight:700">${escapeHtml(entry.site)} · chapter ${entry.chapterNumber}</div>
              <div class="muted mono">${escapeHtml(entry.result)}${entry.reason ? ` · ${escapeHtml(entry.reason)}` : ''}</div>
              <div class="muted mono">${new Date(entry.syncedAt).toLocaleString()}</div>
            </div>
          `,
        )
        .join('')
    : '<div class="muted">No sync history yet.</div>';
}

document.getElementById('openLoginBtn')?.addEventListener('click', () => {
  window.open(ANILIST_AUTH_URL, '_blank', 'noopener,noreferrer');
});

document.getElementById('validateTokenBtn')?.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'SAVE_AUTH_TOKEN', token: tokenInput.value });
  if (!response?.ok) {
    window.alert(response?.error || 'Token validation failed.');
    return;
  }
  tokenInput.value = '';
  await loadPage();
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'LOGOUT' });
  await loadPage();
});

syncModeSelect.addEventListener('change', async () => {
  await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', patch: { syncMode: syncModeSelect.value } });
});

document.getElementById('importAdapterBtn')?.addEventListener('click', async () => {
  try {
    validateAdapterSource(adapterSourceInput.value);
    const meta = parseAdapterMetadata(adapterSourceInput.value);
    const granted = await chrome.permissions.request({ origins: meta.matches });
    if (!granted) {
      window.alert('No se concedió permiso para los sitios del adapter.');
      return;
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: 'IMPORT_ADAPTER', sourceCode: adapterSourceInput.value, enabled: true });
  if (!response?.ok) {
    window.alert(response?.error || 'Could not import adapter.');
    return;
  }
  adapterSourceInput.value = '';
  await loadPage();
});

adapterFileInput.addEventListener('change', async () => {
  const file = adapterFileInput.files?.[0];
  if (!file) return;
  adapterSourceInput.value = await file.text();
});

document.getElementById('debugSyncBtn')?.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'DEBUG_SYNC_ACTIVE_TAB' });
  debugOutput.textContent = JSON.stringify(response, null, 2);
});

document.getElementById('refreshBtn')?.addEventListener('click', () => {
  void loadPage();
});

void loadPage();
