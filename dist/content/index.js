if (!window.__extmgBridgeActive) {
    window.__extmgBridgeActive = true;
    const state = {};
    let toastEl = null;
    let overlayEl = null;
    function ensureToast() {
        if (toastEl)
            return toastEl;
        toastEl = document.createElement('div');
        toastEl.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'max-width:360px',
            'padding:12px 14px',
            'border-radius:10px',
            'background:#111827',
            'color:#fff',
            'font:13px/1.4 system-ui,sans-serif',
            'box-shadow:0 12px 32px rgba(0,0,0,.35)',
            'display:none',
        ].join(';');
        document.documentElement.appendChild(toastEl);
        return toastEl;
    }
    function showToast(message, tone = 'info', timeout = 2600) {
        const el = ensureToast();
        const border = tone === 'success' ? '#22c55e' : tone === 'error' ? '#ef4444' : '#60a5fa';
        el.style.display = 'block';
        el.style.borderLeft = `4px solid ${border}`;
        el.textContent = message;
        window.setTimeout(() => {
            if (toastEl === el)
                el.style.display = 'none';
        }, timeout);
    }
    function hideOverlay() {
        overlayEl?.remove();
        overlayEl = null;
    }
    function renderOverlay(html) {
        hideOverlay();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
      <div data-extmg-backdrop style="position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.45)"></div>
      <div data-extmg-card style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483646;width:min(92vw,420px);background:#111827;color:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);font:14px/1.45 system-ui,sans-serif;overflow:hidden">
        ${html}
      </div>
    `;
        overlayEl = wrapper;
        wrapper.addEventListener('click', (event) => {
            const target = event.target;
            if (target.dataset.extmgBackdrop !== undefined)
                hideOverlay();
        });
        document.documentElement.appendChild(wrapper);
        return wrapper;
    }
    function cardHeader(title, subtitle) {
        return `
      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">
        <div style="font-size:16px;font-weight:700">${escapeHtml(title)}</div>
        ${subtitle ? `<div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:13px">${escapeHtml(subtitle)}</div>` : ''}
      </div>
    `;
    }
    function actionButton(label, attrs = '') {
        return `<button ${attrs} style="appearance:none;border:none;border-radius:10px;padding:10px 12px;background:#374151;color:#fff;cursor:pointer;font:600 13px system-ui,sans-serif">${escapeHtml(label)}</button>`;
    }
    function renderFormatBadge(candidate) {
        if (!candidate.formatLabel)
            return '';
        const background = candidate.format === 'NOVEL'
            ? 'rgba(249,115,22,.18)'
            : candidate.format === 'MANGA'
                ? 'rgba(34,197,94,.18)'
                : 'rgba(96,165,250,.18)';
        const color = candidate.format === 'NOVEL'
            ? '#fdba74'
            : candidate.format === 'MANGA'
                ? '#86efac'
                : '#93c5fd';
        return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:${background};color:${color};font-size:11px;font-weight:700">${escapeHtml(candidate.formatLabel)}</span>`;
    }
    function showNeedsChoice(candidates) {
        state.pendingCandidates = candidates;
        const root = renderOverlay(`
      ${cardHeader('Choose AniList manga', state.context?.siteSeriesTitle)}
      <div style="padding:16px 18px;display:grid;gap:10px">
        ${candidates
            .map((candidate, index) => `
              <button data-choice="${index}" style="text-align:left;appearance:none;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#1f2937;color:#fff;padding:12px;cursor:pointer">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <div style="font-weight:700">${escapeHtml(candidate.title)}</div>
                  ${renderFormatBadge(candidate)}
                </div>
                <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">Match score ${(candidate.score * 100).toFixed(0)}%${candidate.chapters ? ` · ${candidate.chapters} chapters` : ''}</div>
              </button>
            `)
            .join('')}
      </div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${actionButton('Dismiss', 'data-dismiss="1"')}</div>
    `);
        root.querySelectorAll('[data-choice]').forEach((button) => {
            button.addEventListener('click', async () => {
                const index = Number(button.dataset.choice);
                const candidate = state.pendingCandidates?.[index];
                if (!candidate || !state.context || !state.adapterId)
                    return;
                const response = await chrome.runtime.sendMessage({
                    type: 'CHOOSE_MATCH',
                    adapterId: state.adapterId,
                    context: state.context,
                    candidate,
                });
                if (!response?.ok) {
                    showToast(response?.error || 'Could not save mapping.', 'error');
                    return;
                }
                hideOverlay();
                showToast(`Mapped to ${response.ui.title}`, 'success');
                if (state.pendingSync) {
                    state.pendingSync = false;
                    await onConfirmSync();
                }
            });
        });
        root.querySelector('[data-dismiss="1"]')?.addEventListener('click', hideOverlay);
    }
    function showConfirmSync(title, chapterNumber) {
        const root = renderOverlay(`
      ${cardHeader('Sync this chapter?', title)}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Chapter ${chapterNumber} is ready to sync to AniList.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end;gap:10px">
        ${actionButton('Skip', 'data-skip="1"')}
        ${actionButton('Sync now', 'data-confirm="1"')}
      </div>
    `);
        root.querySelector('[data-skip="1"]')?.addEventListener('click', () => {
            state.pendingSync = false;
            hideOverlay();
            showToast('Sync skipped.', 'info');
        });
        root.querySelector('[data-confirm="1"]')?.addEventListener('click', () => {
            void onConfirmSync();
        });
    }
    function showAuthRequired() {
        renderOverlay(`
      ${cardHeader('AniList login required')}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Open the extension options page, log into AniList with the pin flow, then return to this tab.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${actionButton('Close', 'data-close="1"')}</div>
    `).querySelector('[data-close="1"]')?.addEventListener('click', hideOverlay);
    }
    async function onConfirmSync() {
        if (!state.context || !state.adapterId)
            return;
        const response = await chrome.runtime.sendMessage({
            type: 'CONFIRM_SYNC',
            adapterId: state.adapterId,
            context: state.context,
        });
        if (!response?.ok) {
            showToast(response?.error || 'Sync failed.', 'error');
            return;
        }
        hideOverlay();
        handleReadUi(response.ui);
    }
    function handleDetectionUi(ui) {
        switch (ui?.state) {
            case 'auth_required':
                showAuthRequired();
                break;
            case 'mapped':
                hideOverlay();
                showToast(`Matched AniList: ${ui.title}`, 'success');
                break;
            case 'needs_choice':
                showNeedsChoice(ui.candidates || []);
                break;
            case 'unresolved':
                showToast('No AniList match found yet.', 'error', 4000);
                break;
            case 'invalid':
                showToast(ui.message, 'error', 4000);
                break;
            default:
                break;
        }
    }
    function handleReadUi(ui) {
        switch (ui?.state) {
            case 'auth_required':
                showAuthRequired();
                break;
            case 'needs_choice':
                state.pendingSync = true;
                showNeedsChoice(ui.candidates || []);
                break;
            case 'manual':
                showToast('Manual mode enabled. Use the options page debug button to sync.', 'info', 4500);
                break;
            case 'confirm_sync':
                showConfirmSync(ui.title, ui.chapterNumber);
                break;
            case 'synced':
                showToast(`Synced chapter on AniList: ${ui.title}`, 'success', 3200);
                break;
            case 'skipped':
                showToast(ui.reason, 'info', 4000);
                break;
            case 'error':
                showToast(ui.message, 'error', 4500);
                break;
            default:
                break;
        }
    }
    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
    }
    function handleRuntimeMessage(message) {
        if (!message || typeof message !== 'object')
            return;
        if (message.type === 'UI_TOAST') {
            const payload = message.payload;
            showToast(payload.message, payload.kind ?? 'info');
            return;
        }
        if (message.type === 'UI_DETECTION') {
            state.adapterId = message.adapterId;
            state.context = message.context;
            handleDetectionUi(message.ui);
            return;
        }
        if (message.type === 'UI_READ') {
            state.adapterId = message.adapterId;
            state.context = message.context;
            handleReadUi(message.ui);
        }
    }
    chrome.runtime.onMessage.addListener((message) => {
        handleRuntimeMessage(message);
    });
    void chrome.runtime.sendMessage({ type: 'CONTENT_READY' }).then((response) => {
        if (response?.ok && Array.isArray(response.messages)) {
            for (const message of response.messages) {
                handleRuntimeMessage(message);
            }
        }
    }).catch(() => {
        // ignore
    });
}
export {};
