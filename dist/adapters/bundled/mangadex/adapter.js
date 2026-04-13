// ============================================================================
// MangaDex Bundled Adapter
// Detects chapters on mangadex.org and emits chapter_read after 15s + 85% scroll
// Handles SPA-like URL changes via MutationObserver
// ============================================================================
import { SDK_EVENTS } from '../../../adapters/runtime/adapter-runtime';
import { createRuntimeBridge, createAdapterEnv } from '../../../adapters/runtime/adapter-runtime';
import { createUserScriptBridge, isUserScriptsAvailable } from '../../../adapters/runtime/user-script-bridge';
const state = {
    chapterId: null,
    mangaId: null,
    chapterTitle: null,
    mangaTitle: null,
    startTime: null,
    lastProgress: 0,
    isReading: false,
};
// --- Configuration ---
const DETECTION_DEBOUNCE_MS = 500;
const READ_THRESHOLD_SECONDS = 15;
const SCROLL_THRESHOLD_PERCENT = 85;
const URL_POLL_INTERVAL_MS = 1000;
// --- Runtime Environment ---
let env = null;
// ============================================================================
// Chapter Detection
// ============================================================================
function extractChapterInfo() {
    // MangaDex URL patterns:
    // /chapter/{chapterId}
    // /read/{mangaId}/en/{chapterId}
    const url = window.location.href;
    // Match /chapter/{id} or /read/{mangaId}/.../{chapterId}
    const chapterMatch = url.match(/\/chapter\/([a-f0-9-]+)/i)
        || url.match(/\/read\/[a-f0-9-]+\/[^\/]+\/([a-f0-9-]+)/i);
    if (!chapterMatch)
        return null;
    const chapterId = chapterMatch[1];
    // Extract mangaId from page data or URL
    let mangaId = '';
    let mangaTitle = '';
    let chapterTitle = '';
    // Try to get from page data attributes
    const mangaData = document.querySelector('[data-manga-id]');
    if (mangaData) {
        mangaId = mangaData.getAttribute('data-manga-id') || '';
    }
    const titleData = document.querySelector('[data-chapter-title]');
    if (titleData) {
        chapterTitle = titleData.getAttribute('data-chapter-title') || '';
    }
    const mangaTitleData = document.querySelector('[data-manga-title]');
    if (mangaTitleData) {
        mangaTitle = mangaTitleData.getAttribute('data-manga-title') || '';
    }
    // Fallback: extract from URL breadcrumb
    if (!mangaTitle) {
        const breadcrumb = document.querySelector('.breadcrumb a[href*="/manga/"]');
        if (breadcrumb) {
            mangaTitle = breadcrumb.textContent?.trim() || '';
        }
    }
    // Fallback: extract chapter number from page title
    if (!chapterTitle) {
        const h1 = document.querySelector('h1');
        if (h1) {
            chapterTitle = h1.textContent?.trim() || '';
        }
    }
    return { chapterId, mangaId, chapterTitle, mangaTitle };
}
function detectChapter() {
    const info = extractChapterInfo();
    if (!info) {
        // No chapter detected, reset state
        if (state.chapterId) {
            state.chapterId = null;
            state.mangaId = null;
            state.chapterTitle = null;
            state.mangaTitle = null;
            state.startTime = null;
            state.isReading = false;
        }
        return;
    }
    // Check if this is a new chapter
    if (state.chapterId !== info.chapterId) {
        console.log('[MangaDex Adapter] Chapter detected:', info);
        state.chapterId = info.chapterId;
        state.mangaId = info.mangaId;
        state.chapterTitle = info.chapterTitle;
        state.mangaTitle = info.mangaTitle;
        state.startTime = Date.now();
        state.lastProgress = 0;
        state.isReading = true;
        // Emit chapter_detected immediately
        const payload = {
            chapterId: info.chapterId,
            mangaId: info.mangaId,
            chapterTitle: info.chapterTitle,
            mangaTitle: info.mangaTitle,
            url: window.location.href,
        };
        env?.emit(SDK_EVENTS.CHAPTER_DETECTED, payload);
    }
}
// Debounced detection
let detectTimeout = null;
function debouncedDetect() {
    if (detectTimeout)
        clearTimeout(detectTimeout);
    detectTimeout = setTimeout(detectChapter, DETECTION_DEBOUNCE_MS);
}
// ============================================================================
// Progress Tracking
// ============================================================================
function calculateScrollProgress() {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.scrollY;
    if (documentHeight <= windowHeight)
        return 100;
    const maxScroll = documentHeight - windowHeight;
    return Math.round((scrollTop / maxScroll) * 100);
}
function checkReadProgress() {
    if (!state.chapterId || !state.startTime || !state.isReading)
        return;
    const elapsedSeconds = (Date.now() - state.startTime) / 1000;
    const scrollProgress = calculateScrollProgress();
    // Check if reading threshold met: 15s + 85% scroll
    if (elapsedSeconds >= READ_THRESHOLD_SECONDS && scrollProgress >= SCROLL_THRESHOLD_PERCENT) {
        console.log('[MangaDex Adapter] Chapter read threshold met:', {
            elapsed: elapsedSeconds,
            scrollProgress,
        });
        state.isReading = false;
        const payload = {
            chapterId: state.chapterId,
            mangaId: state.mangaId || '',
            readAt: Date.now(),
            progress: scrollProgress,
        };
        env?.emit(SDK_EVENTS.CHAPTER_READ, payload);
    }
    state.lastProgress = scrollProgress;
}
// Progress check interval
let progressInterval = null;
function startProgressTracking() {
    if (progressInterval)
        return;
    progressInterval = setInterval(checkReadProgress, 1000);
}
// ============================================================================
// SPA Navigation Handling
// ============================================================================
let lastUrl = window.location.href;
function handleUrlChange() {
    if (window.location.href !== lastUrl) {
        console.log('[MangaDex Adapter] URL changed:', lastUrl, '->', window.location.href);
        lastUrl = window.location.href;
        // Reset state for new page
        state.chapterId = null;
        state.mangaId = null;
        state.startTime = null;
        state.isReading = false;
        // Re-detect chapter on new page
        setTimeout(detectChapter, DETECTION_DEBOUNCE_MS);
    }
}
function setupSPAObserver() {
    // MutationObserver for DOM changes (handles SPA navigation)
    const observer = new MutationObserver(() => {
        handleUrlChange();
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
    // Fallback: periodic URL check for sites that don't trigger mutations
    setInterval(handleUrlChange, URL_POLL_INTERVAL_MS);
    // Also listen for popstate (browser back/forward)
    window.addEventListener('popstate', handleUrlChange);
}
// ============================================================================
// Adapter Initialization
// ============================================================================
async function initAdapter() {
    console.log('[MangaDex Adapter] Initializing...');
    // Create runtime environment
    const bridge = createRuntimeBridge();
    env = createAdapterEnv(bridge);
    if (!isUserScriptsAvailable()) {
        console.warn('[MangaDex Adapter] chrome.userScripts not available, using fallback bridge');
    }
    else {
        const adapterMeta = bridge.getAdapterMeta();
        if (adapterMeta) {
            const userScriptBridge = createUserScriptBridge(adapterMeta, window.location.origin, (message) => {
                console.log('[MangaDex Adapter] Background message:', message);
            });
            try {
                await userScriptBridge.init();
                console.log('[MangaDex Adapter] UserScript bridge initialized');
            }
            catch (error) {
                console.error('[MangaDex Adapter] Failed to initialize bridge:', error);
            }
        }
    }
    // Set up chapter detection
    detectChapter();
    debouncedDetect();
    // Set up progress tracking
    startProgressTracking();
    // Set up SPA navigation handling
    setupSPAObserver();
    // Listen for scroll events
    window.addEventListener('scroll', () => {
        if (state.isReading) {
            checkReadProgress();
        }
    });
    // Listen for visibility changes (tab focus)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && state.isReading) {
            checkReadProgress();
        }
    });
    console.log('[MangaDex Adapter] Initialized successfully');
}
// Start adapter
initAdapter();
