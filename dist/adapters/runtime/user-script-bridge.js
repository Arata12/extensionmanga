// ============================================================================
// User Script Bridge - Handles chrome.userScripts API integration
// ============================================================================
import { runtimeMessageValidator } from './adapter-runtime';
/**
 * User Script Bridge for chrome.userScripts context
 * Handles communication between adapter scripts and background service worker
 */
export class UserScriptBridge {
    requestId = 0;
    pendingRequests = new Map();
    config;
    initialized = false;
    constructor(config) {
        this.config = config;
    }
    /**
     * Initialize the bridge and register message listeners
     */
    async init() {
        if (this.initialized)
            return;
        // Set up message listener for responses from background
        this.setupMessageListener();
        // Send initialization
        const response = await this.sendMessage({
            type: 'INIT',
            payload: {
                adapterId: this.config.adapterId,
                adapterVersion: this.config.adapterVersion,
                siteUrl: this.config.siteUrl,
            },
        });
        if (response.success) {
            this.initialized = true;
            console.log(`[UserScriptBridge] Initialized for adapter: ${this.config.adapterId}`);
        }
        else {
            throw new Error(`Failed to initialize bridge: ${response.error?.message}`);
        }
    }
    /**
     * Send a message to background and wait for response
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            const requestId = `req_${++this.requestId}_${Date.now()}`;
            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request ${requestId} timed out`));
            }, 10000);
            // Store pending request
            this.pendingRequests.set(requestId, {
                resolve: resolve,
                reject,
                timeout,
            });
            // Send via chrome.runtime.sendMessage or window.postMessage
            this.dispatchMessage({ ...message, requestId });
        });
    }
    /**
     * Dispatch message to background
     */
    dispatchMessage(message) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage(message);
        }
        else {
            // Fallback for development/testing
            window.postMessage({ ...message, source: 'EXTMG_ADAPTER' }, '*');
        }
    }
    /**
     * Set up listener for incoming messages
     */
    setupMessageListener() {
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
            chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
                if (this.handleMessage(message)) {
                    sendResponse({ received: true });
                }
                return false;
            });
        }
        else {
            window.addEventListener('message', (event) => {
                if (event.data?.source === 'EXTMG_BACKGROUND') {
                    this.handleMessage(event.data);
                }
            });
        }
    }
    /**
     * Handle incoming message
     */
    handleMessage(message) {
        if (!runtimeMessageValidator.validate(message)) {
            return false;
        }
        // Handle response messages (those with requestId)
        const msg = message;
        if (msg.requestId) {
            const pending = this.pendingRequests.get(msg.requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(msg.requestId);
                pending.resolve(message);
                return true;
            }
        }
        // Forward to adapter's message handler
        this.config.onMessage(message);
        return true;
    }
    /**
     * Clean up resources
     */
    dispose() {
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
        }
        this.pendingRequests.clear();
    }
}
/**
 * Create a user script bridge for the current context
 */
export function createUserScriptBridge(adapterMeta, siteUrl, onMessage) {
    return new UserScriptBridge({
        adapterId: adapterMeta.id,
        adapterVersion: adapterMeta.version,
        siteUrl,
        onMessage,
    });
}
/**
 * Check if chrome.userScripts is available
 */
export function isUserScriptsAvailable() {
    return typeof chrome !== 'undefined' && 'userScripts' in chrome;
}
