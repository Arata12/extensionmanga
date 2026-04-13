// ============================================================================
// Content Bridge - UI Layer for content script communication
// Bridges runtime events to toast/overlay UI
// ============================================================================
import { showToast, hideToast } from './ui/toast';
import { showOverlay, hideOverlay } from './ui/overlay';
class ContentBridge {
    config;
    currentState = { status: 'idle' };
    messageListener = null;
    constructor(config = {}) {
        this.config = config;
    }
    /**
     * Initialize the content bridge
     */
    init() {
        this.setupMessageListener();
        this.setupRuntimeListener();
        console.log('[ContentBridge] Initialized');
    }
    /**
     * Clean up resources
     */
    dispose() {
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
        }
        hideToast();
        hideOverlay();
    }
    /**
     * Handle incoming content events
     */
    handleEvent(event) {
        console.log('[ContentBridge] Event:', event);
        switch (event.type) {
            case 'chapter_detected':
                this.handleChapterDetected(event.payload);
                break;
            case 'chapter_match':
                this.handleChapterMatch(event.payload);
                break;
            case 'chapter_choices':
                this.handleChapterChoices(event.payload);
                break;
            case 'chapter_ready':
                this.handleChapterReady(event.payload);
                break;
            case 'chapter_read':
                this.handleChapterRead(event.payload);
                break;
            case 'synced':
                this.handleSynced(event.payload);
                break;
            case 'error':
                this.handleError(event.payload);
                break;
        }
    }
    /**
     * Update current UI state
     */
    setState(newState) {
        this.currentState = newState;
    }
    // --- Event Handlers ---
    handleChapterDetected(payload) {
        this.setState({ status: 'detected', data: payload });
        showToast({
            message: `Chapter detected: ${payload.chapterTitle || payload.chapterId}`,
            type: 'info',
            duration: 3000,
        });
    }
    handleChapterMatch(payload) {
        this.setState({ status: 'matched', data: payload });
        showToast({
            message: `Matched: ${payload.matchedTitle}`,
            type: 'success',
            duration: 3000,
        });
    }
    handleChapterChoices(payload) {
        this.setState({ status: 'choices', data: payload });
        showOverlay({
            title: 'Select Match',
            content: 'Which entry matches this chapter?',
            state: this.currentState,
            actions: [
                {
                    label: 'Cancel',
                    onClick: () => hideOverlay(),
                },
            ],
        });
        // Handle choice selection
        setTimeout(() => {
            const buttons = document.querySelectorAll('.extmg-choice-btn');
            buttons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    if (id && this.config.onMatchChoice) {
                        this.config.onMatchChoice(id);
                    }
                    hideOverlay();
                });
            });
        }, 100);
    }
    handleChapterReady(payload) {
        this.setState({ status: 'ready', data: payload });
        showOverlay({
            title: 'Reading Progress',
            content: 'Chapter is loading...',
            state: this.currentState,
        });
    }
    handleChapterRead(payload) {
        this.setState({ status: 'reading', data: { ...payload, progress: payload.progress } });
        // Update overlay progress
        this.updateProgressDisplay(payload.progress);
        // Request sync if configured
        if (this.config.onSyncRequest) {
            this.config.onSyncRequest(payload);
        }
    }
    handleSynced(payload) {
        this.setState({ status: 'synced', data: payload });
        showToast({
            message: 'Synced to AniList!',
            type: 'success',
            duration: 2000,
        });
        hideOverlay();
    }
    handleError(payload) {
        this.setState({ status: 'error', data: payload });
        showToast({
            message: payload.message,
            type: 'error',
            duration: 5000,
            action: payload.retryable
                ? {
                    label: 'Retry',
                    onClick: () => this.retry(),
                }
                : undefined,
        });
    }
    // --- Message Handling ---
    setupMessageListener() {
        this.messageListener = (event) => {
            // Handle messages from adapter runtime
            if (event.data?.source === 'EXTMG_ADAPTER') {
                const contentEvent = event.data;
                if (contentEvent.type) {
                    this.handleEvent(contentEvent);
                }
            }
        };
        window.addEventListener('message', this.messageListener);
    }
    setupRuntimeListener() {
        // Listen for chrome.runtime messages if available
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
                if (message?.source === 'EXTMG_BACKGROUND') {
                    const contentEvent = message;
                    if (contentEvent.type) {
                        this.handleEvent(contentEvent);
                        sendResponse({ received: true });
                    }
                }
            });
        }
    }
    // --- Helpers ---
    updateProgressDisplay(progress) {
        const progressBar = document.querySelector('.extmg-progress__bar');
        const progressText = document.querySelector('.extmg-progress__text');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (progressText) {
            progressText.textContent = `${progress}% read`;
        }
    }
    retry() {
        // Send retry message to background
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'RETRY_LAST' });
        }
    }
    /**
     * Get current UI state
     */
    getState() {
        return this.currentState;
    }
    /**
     * Check if bridge is active
     */
    isActive() {
        return this.messageListener !== null;
    }
}
// Export singleton instance factory
let bridgeInstance = null;
export function createContentBridge(config) {
    if (bridgeInstance) {
        bridgeInstance.dispose();
    }
    bridgeInstance = new ContentBridge(config);
    return bridgeInstance;
}
export function getContentBridge() {
    return bridgeInstance;
}
