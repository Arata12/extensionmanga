import mangadexSource from '../adapters/bundled/mangadex.js?raw';
import { parseAdapterMetadata, validateAdapterSource } from '../adapters/metadata-parser';
import { validateToken } from '../core/anilist';
import { buildDetectionUi, confirmReadSync, confirmSeriesMapping, debugSync, handleRead, listSeriesMappings, resolveSeries } from '../core/sync';
import { clearAuth, getSettings, updateSettings } from '../core/storage';
import { deleteImportedAdapter, deleteSeriesMapping, getImportedAdapter, listImportedAdapters, listSyncLog, saveImportedAdapter, } from '../db/indexeddb';
const bundledAdapters = new Map([
    ['mangadex', { meta: parseAdapterMetadata(mangadexSource), sourceCode: mangadexSource, sourceType: 'bundled' }],
]);
const tabSessions = new Map();
const lastUiMessageByTab = new Map();
let registrationPromise = null;
let lastRegistrationError = null;
function isUserScriptsAvailable() {
    const runtimeAny = chrome.runtime;
    return 'userScripts' in chrome && 'onUserScriptMessage' in runtimeAny;
}
function buildBootstrap(meta) {
    return `
(() => {
  const meta = ${JSON.stringify(meta)};
  let activeReadCleanup = null;
  let runtimeAlive = true;
  const invalidationPattern = /Extension context invalidated/i;

  function markRuntimeDead(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (invalidationPattern.test(message)) {
      runtimeAlive = false;
      if (activeReadCleanup) {
        try { activeReadCleanup(); } catch {}
        activeReadCleanup = null;
      }
      return true;
    }
    return false;
  }

  function dispatch(type, payload) {
    if (!runtimeAlive) return Promise.resolve({ ok: false, error: 'Extension context invalidated' });
    return chrome.runtime.sendMessage({
      type: 'USER_SCRIPT_EVENT',
      adapterId: meta.id,
      eventType: type,
      payload
    }).catch((error) => {
      if (markRuntimeDead(error)) {
        return { ok: false, error: 'Extension context invalidated' };
      }
      throw error;
    });
  }

  function rpc(method, params) {
    if (!runtimeAlive) {
      return Promise.reject(new Error('Extension context invalidated'));
    }
    return chrome.runtime.sendMessage({
      type: 'USER_SCRIPT_RPC',
      adapterId: meta.id,
      method,
      params
    }).then((response) => {
      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'RPC failed');
      }
      return response.result;
    }).catch((error) => {
      if (markRuntimeDead(error)) {
        throw new Error('Extension context invalidated');
      }
      throw error;
    });
  }

  function onUrlChange(callback) {
    let lastUrl = location.href;
    const interval = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        callback();
      }
    }, 500);
    window.addEventListener('popstate', callback);
    return () => {
      clearInterval(interval);
      window.removeEventListener('popstate', callback);
    };
  }

  function whenRead(rule, callback) {
    if (activeReadCleanup) activeReadCleanup();
    const startedAt = Date.now();
    let done = false;
    const check = () => {
      if (done) return;
      const elapsed = (Date.now() - startedAt) / 1000;
      const doc = document.documentElement;
      const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 0);
      const scrollPercent = maxScroll === 0 ? 100 : Math.round((window.scrollY / maxScroll) * 100);
      if (elapsed >= (rule.minSeconds || 0) && scrollPercent >= (rule.minScrollPercent || 0)) {
        done = true;
        cleanup();
        callback();
      }
    };
    const interval = setInterval(check, 1000);
    const onScroll = () => check();
    window.addEventListener('scroll', onScroll, { passive: true });
    const cleanup = () => {
      clearInterval(interval);
      window.removeEventListener('scroll', onScroll);
      activeReadCleanup = null;
    };
    activeReadCleanup = cleanup;
    return cleanup;
  }

    const ctx = {
      meta,
      emitDetected(payload) { dispatch('chapter_detected', payload); },
      emitRead(payload, extra) { dispatch('chapter_read', { context: payload, trigger: (extra && extra.trigger) || 'unknown' }); },
    showStatus(input) { dispatch('show_status', input); },
    getSettings() { return rpc('get_settings', {}); },
    getKnownMapping(input) { return rpc('get_known_mapping', input); },
    onUrlChange,
    whenRead,
  };

  globalThis.MangaSync = {
    defineAdapter(adapter) {
      Promise.resolve(adapter.start(ctx)).catch((error) => {
        dispatch('show_status', {
          kind: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      });
    }
  };
})();
`;
}
function buildRegisteredScriptCode(record) {
    return `${buildBootstrap(record.meta)}\n${record.sourceCode}`;
}
async function listAllAdapters() {
    const settings = await getSettings();
    const imported = await listImportedAdapters();
    const bundled = [...bundledAdapters.values()].map((record) => ({
        id: record.meta.id,
        meta: record.meta,
        enabled: settings.enabledBuiltinAdapterIds.includes(record.meta.id),
        sourceType: 'bundled',
    }));
    const importedItems = imported.map((record) => ({
        id: record.id,
        meta: record.meta,
        enabled: record.enabled,
        sourceType: 'imported',
    }));
    return [...bundled, ...importedItems].sort((a, b) => a.meta.name.localeCompare(b.meta.name));
}
async function getEnabledAdapterSources() {
    const settings = await getSettings();
    const imported = await listImportedAdapters();
    const enabledImported = imported.filter((record) => record.enabled).map((record) => ({
        meta: record.meta,
        sourceCode: record.sourceCode,
        sourceType: 'imported',
    }));
    const enabledBundled = settings.enabledBuiltinAdapterIds
        .map((id) => bundledAdapters.get(id))
        .filter((record) => Boolean(record));
    return [...enabledBundled, ...enabledImported];
}
async function syncUserScripts(records) {
    if (!isUserScriptsAvailable())
        return;
    await chrome.userScripts.configureWorld({ messaging: true });
    const existing = await chrome.userScripts.getScripts();
    if (existing.length) {
        await chrome.userScripts.unregister({ ids: existing.map((script) => script.id) });
    }
    if (!records.length)
        return;
    await chrome.userScripts.register(records.map((record) => ({
        id: record.meta.id,
        matches: record.meta.matches,
        js: [{ code: buildRegisteredScriptCode(record) }],
        runAt: 'document_idle',
        world: 'USER_SCRIPT',
    })));
}
async function syncAdapterRegistrations() {
    const records = await getEnabledAdapterSources();
    await syncUserScripts(records);
}
async function ensureUserScriptsRegistered(force = false) {
    if (!isUserScriptsAvailable())
        return;
    if (registrationPromise && !force) {
        return registrationPromise;
    }
    registrationPromise = (async () => {
        try {
            await syncAdapterRegistrations();
            lastRegistrationError = null;
        }
        catch (error) {
            lastRegistrationError = error instanceof Error ? error.message : String(error);
            throw error;
        }
        finally {
            registrationPromise = null;
        }
    })();
    return registrationPromise;
}
async function hasPermission(meta) {
    return chrome.permissions.contains({ origins: meta.matches });
}
function storeTabSession(tabId, adapterId, context) {
    if (typeof tabId !== 'number')
        return;
    tabSessions.set(tabId, { adapterId, context });
}
function matchPatternToRegex(pattern) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}
async function isSenderAllowedForAdapter(url, adapterId) {
    if (!url)
        return false;
    const bundled = bundledAdapters.get(adapterId);
    const imported = bundled ? undefined : await getImportedAdapter(adapterId);
    const meta = bundled?.meta ?? imported?.meta;
    if (!meta)
        return false;
    return meta.matches.some((pattern) => matchPatternToRegex(pattern).test(url));
}
function getSenderUrl(sender) {
    const extended = sender;
    return extended.documentUrl ?? extended.url ?? extended.tab?.pendingUrl ?? extended.tab?.url;
}
function extractChapterIdFromUrl(url) {
    if (!url)
        return null;
    const match = url.match(/\/chapter\/([^/?#]+)/i);
    return match?.[1] ?? null;
}
function isSameChapterUrl(a, b) {
    const aChapterId = extractChapterIdFromUrl(a);
    const bChapterId = extractChapterIdFromUrl(b);
    if (aChapterId && bChapterId) {
        return aChapterId === bChapterId;
    }
    return Boolean(a && b && a === b);
}
async function sendUiMessage(tabId, message) {
    if (typeof tabId !== 'number')
        return;
    lastUiMessageByTab.set(tabId, message);
    try {
        await chrome.tabs.sendMessage(tabId, message);
    }
    catch {
        // Content script may not be ready yet.
    }
}
function clearTabState(tabId) {
    if (typeof tabId !== 'number')
        return;
    tabSessions.delete(tabId);
    lastUiMessageByTab.delete(tabId);
}
async function handleUserScriptEvent(message, sender) {
    const adapterId = String(message.adapterId ?? '');
    if (!(await isSenderAllowedForAdapter(getSenderUrl(sender), adapterId))) {
        return;
    }
    if (message.eventType === 'show_status') {
        await sendUiMessage(sender.tab?.id, {
            type: 'UI_TOAST',
            adapterId,
            payload: message.payload,
        });
        return;
    }
    if (message.eventType === 'chapter_cleared') {
        clearTabState(sender.tab?.id);
        await sendUiMessage(sender.tab?.id, { type: 'UI_CLEAR', adapterId });
        return;
    }
    if (message.eventType === 'chapter_detected') {
        const context = message.payload;
        storeTabSession(sender.tab?.id, adapterId, context);
        const ui = await buildDetectionUi(context);
        const session = typeof sender.tab?.id === 'number' ? tabSessions.get(sender.tab.id) : undefined;
        if (session) {
            session.resolution = await resolveSeries(context);
        }
        await sendUiMessage(sender.tab?.id, { type: 'UI_DETECTION', adapterId, context, ui });
        return;
    }
    if (message.eventType === 'chapter_read') {
        const signal = message.payload;
        storeTabSession(sender.tab?.id, adapterId, signal.context);
        const ui = await handleRead(signal.context);
        await sendUiMessage(sender.tab?.id, { type: 'UI_READ', adapterId, context: signal.context, ui });
    }
}
async function handleUserScriptRpc(message, sender) {
    const adapterId = String(message.adapterId ?? '');
    if (!(await isSenderAllowedForAdapter(getSenderUrl(sender), adapterId))) {
        return { ok: false, error: 'Adapter sender not allowed for this tab.' };
    }
    if (message.method === 'get_settings') {
        const settings = await getSettings();
        return { ok: true, result: { syncMode: settings.syncMode } };
    }
    if (message.method === 'get_known_mapping') {
        const result = await resolveSeries({
            site: String(message.params?.site ?? ''),
            siteSeriesId: String(message.params?.siteSeriesId ?? ''),
            siteSeriesTitle: String(message.params?.siteSeriesTitle ?? ''),
            chapterUrl: sender.tab?.url ?? '',
        });
        return {
            ok: true,
            result: result.state === 'mapped' && result.mapping
                ? { anilistMediaId: result.mapping.anilistMediaId, anilistTitle: result.mapping.anilistTitle }
                : null,
        };
    }
    return { ok: false, error: 'Unknown RPC method.' };
}
chrome.runtime.onInstalled.addListener(() => {
    void ensureUserScriptsRegistered(true);
});
chrome.runtime.onStartup.addListener(() => {
    void ensureUserScriptsRegistered(true);
});
chrome.permissions.onAdded?.addListener(() => {
    void ensureUserScriptsRegistered(true);
});
chrome.permissions.onRemoved?.addListener(() => {
    void ensureUserScriptsRegistered(true);
});
chrome.tabs.onRemoved.addListener((tabId) => {
    clearTabState(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const nextUrl = changeInfo.url ?? tab.url;
    const session = tabSessions.get(tabId);
    if (!session || !nextUrl)
        return;
    if (!isSameChapterUrl(session.context.chapterUrl, nextUrl)) {
        clearTabState(tabId);
    }
});
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    const session = tabSessions.get(details.tabId);
    if (!session)
        return;
    if (!isSameChapterUrl(session.context.chapterUrl, details.url)) {
        clearTabState(details.tabId);
    }
});
chrome.webNavigation.onCommitted.addListener((details) => {
    const session = tabSessions.get(details.tabId);
    if (!session)
        return;
    if (!isSameChapterUrl(session.context.chapterUrl, details.url)) {
        clearTabState(details.tabId);
    }
});
const runtimeAny = chrome.runtime;
runtimeAny.onUserScriptMessage?.addListener((message, sender, sendResponse) => {
    void (async () => {
        try {
            if (message?.type === 'USER_SCRIPT_EVENT') {
                await handleUserScriptEvent(message, sender);
                sendResponse({ ok: true });
                return;
            }
            if (message?.type === 'USER_SCRIPT_RPC') {
                sendResponse(await handleUserScriptRpc(message, sender));
                return;
            }
            sendResponse({ ok: false, error: 'Unsupported user script message.' });
        }
        catch (error) {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
    })();
    return true;
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
        try {
            switch (message.type) {
                case 'GET_STATUS': {
                    await ensureUserScriptsRegistered();
                    const settings = await getSettings();
                    let registeredScriptIds = [];
                    if (isUserScriptsAvailable()) {
                        const scripts = await chrome.userScripts.getScripts();
                        registeredScriptIds = scripts.map((script) => script.id);
                    }
                    sendResponse({ ok: true, settings, userScriptsAvailable: isUserScriptsAvailable(), registeredScriptIds, lastRegistrationError });
                    break;
                }
                case 'SAVE_AUTH_TOKEN': {
                    const viewer = await validateToken(String(message.token ?? '').trim());
                    if (!viewer) {
                        sendResponse({ ok: false, error: 'Invalid AniList token.' });
                        break;
                    }
                    const settings = await updateSettings({ authToken: String(message.token).trim(), viewer });
                    sendResponse({ ok: true, viewer, settings });
                    break;
                }
                case 'LOGOUT': {
                    const settings = await clearAuth();
                    sendResponse({ ok: true, settings });
                    break;
                }
                case 'UPDATE_SETTINGS': {
                    const settings = await updateSettings(message.patch ?? {});
                    sendResponse({ ok: true, settings });
                    break;
                }
                case 'LIST_ADAPTERS': {
                    await ensureUserScriptsRegistered();
                    sendResponse({ ok: true, adapters: await listAllAdapters(), userScriptsAvailable: isUserScriptsAvailable(), lastRegistrationError });
                    break;
                }
                case 'IMPORT_ADAPTER': {
                    const sourceCode = String(message.sourceCode ?? '');
                    validateAdapterSource(sourceCode);
                    const meta = parseAdapterMetadata(sourceCode);
                    if (bundledAdapters.has(meta.id)) {
                        sendResponse({ ok: false, error: `Adapter id "${meta.id}" is reserved by a bundled adapter.` });
                        break;
                    }
                    const existingImported = await getImportedAdapter(meta.id);
                    if (existingImported) {
                        sendResponse({ ok: false, error: `An imported adapter with id "${meta.id}" already exists. Remove it first.` });
                        break;
                    }
                    const enabled = Boolean(message.enabled);
                    if (enabled && !(await hasPermission(meta))) {
                        sendResponse({ ok: false, error: 'Required site permission is missing.' });
                        break;
                    }
                    const now = Date.now();
                    await saveImportedAdapter({
                        id: meta.id,
                        meta,
                        sourceCode,
                        enabled,
                        importedAt: now,
                        updatedAt: now,
                    });
                    if (enabled) {
                        await ensureUserScriptsRegistered(true);
                    }
                    sendResponse({ ok: true, adapter: { meta, enabled } });
                    break;
                }
                case 'TOGGLE_ADAPTER': {
                    const adapterId = String(message.adapterId);
                    const enabled = Boolean(message.enabled);
                    const bundled = bundledAdapters.get(adapterId);
                    if (bundled) {
                        const settings = await getSettings();
                        let enabledBuiltinAdapterIds = settings.enabledBuiltinAdapterIds.filter((id) => id !== adapterId);
                        if (enabled) {
                            if (!(await hasPermission(bundled.meta))) {
                                sendResponse({ ok: false, error: 'Required site permission is missing.' });
                                break;
                            }
                            enabledBuiltinAdapterIds = [...enabledBuiltinAdapterIds, adapterId];
                        }
                        await updateSettings({ enabledBuiltinAdapterIds });
                        await ensureUserScriptsRegistered(true);
                        sendResponse({ ok: true });
                        break;
                    }
                    const imported = await getImportedAdapter(adapterId);
                    if (!imported) {
                        sendResponse({ ok: false, error: 'Adapter not found.' });
                        break;
                    }
                    if (enabled && !(await hasPermission(imported.meta))) {
                        sendResponse({ ok: false, error: 'Required site permission is missing.' });
                        break;
                    }
                    await saveImportedAdapter({ ...imported, enabled, updatedAt: Date.now() });
                    await ensureUserScriptsRegistered(true);
                    sendResponse({ ok: true });
                    break;
                }
                case 'REMOVE_ADAPTER': {
                    await deleteImportedAdapter(String(message.adapterId));
                    await ensureUserScriptsRegistered(true);
                    sendResponse({ ok: true });
                    break;
                }
                case 'GET_MAPPINGS': {
                    sendResponse({ ok: true, mappings: await listSeriesMappings() });
                    break;
                }
                case 'DELETE_MAPPING': {
                    await deleteSeriesMapping(String(message.key));
                    sendResponse({ ok: true });
                    break;
                }
                case 'GET_SYNC_LOG': {
                    sendResponse({ ok: true, entries: await listSyncLog(Number(message.limit) || 50) });
                    break;
                }
                case 'CONTENT_READY': {
                    await ensureUserScriptsRegistered();
                    if (!sender.tab?.id) {
                        sendResponse({ ok: true });
                        break;
                    }
                    const senderUrl = getSenderUrl(sender);
                    const session = tabSessions.get(sender.tab.id);
                    if (session && !isSameChapterUrl(session.context.chapterUrl, senderUrl)) {
                        clearTabState(sender.tab.id);
                    }
                    const lastUiMessage = lastUiMessageByTab.get(sender.tab.id);
                    if (!lastUiMessage) {
                        sendResponse({ ok: true });
                        break;
                    }
                    if ('context' in lastUiMessage && !isSameChapterUrl(lastUiMessage.context?.chapterUrl, senderUrl)) {
                        clearTabState(sender.tab.id);
                        sendResponse({ ok: true });
                        break;
                    }
                    sendResponse({ ok: true, message: lastUiMessage });
                    break;
                }
                case 'CHOOSE_MATCH': {
                    const context = message.context;
                    const candidate = message.candidate;
                    const mapping = await confirmSeriesMapping(context, candidate);
                    if (typeof sender.tab?.id === 'number') {
                        tabSessions.set(sender.tab.id, {
                            adapterId: String(message.adapterId),
                            context,
                            resolution: { state: 'mapped', mapping },
                        });
                    }
                    sendResponse({ ok: true, ui: { state: 'mapped', title: mapping.anilistTitle, mediaId: mapping.anilistMediaId, confirmed: true } });
                    break;
                }
                case 'CONFIRM_SYNC': {
                    const ui = await confirmReadSync(message.context);
                    sendResponse({ ok: true, ui });
                    break;
                }
                case 'GET_ADAPTER_SETTINGS': {
                    const settings = await getSettings();
                    sendResponse({ ok: true, result: { syncMode: settings.syncMode } });
                    break;
                }
                case 'GET_KNOWN_MAPPING': {
                    const resolution = await resolveSeries({
                        site: String(message.site),
                        siteSeriesId: String(message.siteSeriesId),
                        siteSeriesTitle: String(message.siteSeriesTitle),
                        chapterUrl: '',
                    });
                    sendResponse({
                        ok: true,
                        result: resolution.state === 'mapped' && resolution.mapping
                            ? { anilistMediaId: resolution.mapping.anilistMediaId, anilistTitle: resolution.mapping.anilistTitle }
                            : null,
                    });
                    break;
                }
                case 'DEBUG_SYNC_ACTIVE_TAB': {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!tab?.id) {
                        sendResponse({ ok: false, error: 'No active tab.' });
                        break;
                    }
                    const session = tabSessions.get(tab.id);
                    if (!session) {
                        sendResponse({ ok: false, error: 'No detected chapter on the active tab yet.' });
                        break;
                    }
                    const ui = await debugSync(session.context);
                    sendResponse({ ok: true, ui });
                    break;
                }
                default:
                    sendResponse({ ok: false, error: 'Unknown message type.' });
            }
        }
        catch (error) {
            sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
    })();
    return true;
});
