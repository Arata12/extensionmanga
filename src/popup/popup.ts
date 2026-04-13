import { parseAdapterMetadata, validateAdapterSource } from '../adapters/metadata-parser';

type AdapterItem = {
  id: string;
  meta: { name: string; matches: string[] };
  enabled: boolean;
  sourceType: 'bundled' | 'imported';
};

const statusText = document.getElementById('statusText') as HTMLSpanElement;
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const adapterList = document.getElementById('adapterList') as HTMLDivElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const openOptionsBtn = document.getElementById('openOptionsBtn') as HTMLButtonElement;

async function refresh(): Promise<void> {
  const [status, adaptersResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }),
    chrome.runtime.sendMessage({ type: 'LIST_ADAPTERS' }),
  ]);

  const adapters = (adaptersResponse?.adapters ?? []) as AdapterItem[];
  const enabledCount = adapters.filter((adapter) => adapter.enabled).length;
  statusDot.classList.toggle('inactive', enabledCount === 0);
  statusText.textContent = status?.settings?.viewer
    ? `${status.settings.viewer.name} · ${enabledCount} adapter${enabledCount === 1 ? '' : 's'} enabled`
    : `${enabledCount} adapter${enabledCount === 1 ? '' : 's'} enabled`;

  adapterList.innerHTML = adapters.length
    ? adapters
        .map(
          (adapter) => `
            <div class="adapter-item">
              <div class="adapter-info">
                <span class="adapter-name">${escapeHtml(adapter.meta.name)}</span>
                <span class="adapter-site">${escapeHtml(adapter.meta.matches[0] ?? adapter.sourceType)}</span>
              </div>
              <button class="toggle ${adapter.enabled ? 'active' : ''}" data-id="${escapeHtml(adapter.id)}"></button>
            </div>
          `,
        )
        .join('')
    : '<div style="opacity:.7;font-size:13px">No adapters installed yet.</div>';

  adapterList.querySelectorAll<HTMLButtonElement>('.toggle').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const adapter = adapters.find((item) => item.id === id);
      if (!adapter) return;
      const nextEnabled = !adapter.enabled;
      if (nextEnabled) {
        const granted = await chrome.permissions.request({ origins: adapter.meta.matches });
        if (!granted) {
          window.alert('No se concedió permiso para ese sitio.');
          return;
        }
      }
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_ADAPTER',
        adapterId: adapter.id,
        enabled: nextEnabled,
      });
      if (!response?.ok) {
        window.alert(response?.error || 'Could not toggle adapter.');
        return;
      }
      await refresh();
    });
  });
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

importBtn.addEventListener('click', async () => {
  const sourceCode = window.prompt('Paste adapter JavaScript:');
  if (!sourceCode) return;
  try {
    validateAdapterSource(sourceCode);
    const meta = parseAdapterMetadata(sourceCode);
    const granted = await chrome.permissions.request({ origins: meta.matches });
    if (!granted) {
      window.alert('No se concedió permiso para los sitios del adapter.');
      return;
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: 'IMPORT_ADAPTER', sourceCode, enabled: true });
  if (!response?.ok) {
    window.alert(response?.error || 'Could not import adapter.');
    return;
  }
  await refresh();
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

void refresh();
