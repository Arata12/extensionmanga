// ============================================================================
// Adapter Runtime - Manages adapter lifecycle and communication
// Designed for chrome.userScripts execution context
// ============================================================================
import { extractAdapterParts, validateAdapterCode } from '../metadata-parser';
// --- Runtime Configuration ---
const SDK_VERSION = '1.0.0';
const RUNTIME_TIMEOUT_MS = 10000;
export const runtimeMessageValidator = {
    schema: {
        INIT: ['adapterId', 'adapterVersion', 'siteUrl'],
        CHAPTER_DETECTED: ['chapterId', 'chapterTitle', 'url'],
        CHAPTER_MATCHED: ['chapterId', 'matchedId', 'matchedTitle', 'confidence'],
        CHAPTER_READY: ['chapterId', 'progress'],
        CHAPTER_READ: ['chapterId', 'mangaId', 'readAt', 'progress'],
        REQUEST_MATCH: ['chapterId', 'chapterTitle', 'url'],
        REQUEST_SYNC: ['chapterId', 'mangaId', 'progress', 'readAt'],
        PING: [],
    },
    validate(message) {
        if (!message || typeof message !== 'object')
            return false;
        const msg = message;
        if (typeof msg.type !== 'string')
            return false;
        if (!Object.keys(this.schema).includes(msg.type))
            return false;
        if (typeof msg.payload !== 'object' && msg.payload !== undefined)
            return false;
        return true;
    },
};
export function createRuntimeBridge() {
    return {
        sendToBackground: (message) => {
            return new Promise((resolve) => {
                const requestId = generateRequestId();
                // Listen for response
                const responseHandler = (event) => {
                    if (event.data?.requestId === requestId) {
                        window.removeEventListener('message', responseHandler);
                        clearTimeout(timeout);
                        resolve(event.data);
                    }
                };
                window.addEventListener('message', responseHandler);
                // Timeout
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', responseHandler);
                    resolve({
                        success: false,
                        error: { code: 'TIMEOUT', message: 'Request timed out' },
                        requestId,
                    });
                }, RUNTIME_TIMEOUT_MS);
                // Send via chrome.runtime if available, else window.postMessage
                if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({ ...message, requestId });
                }
                else {
                    window.postMessage({ ...message, requestId }, '*');
                }
            });
        },
        onBackgroundMessage: (handler) => {
            if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
                chrome.runtime.onMessage.addListener((message) => {
                    if (runtimeMessageValidator.validate(message)) {
                        handler(message);
                    }
                });
            }
            else {
                window.addEventListener('message', (event) => {
                    if (event.data?.source === 'EXTMG_BACKGROUND') {
                        const message = event.data;
                        if (runtimeMessageValidator.validate(message)) {
                            handler(message);
                        }
                    }
                });
            }
        },
        getAdapterMeta: () => {
            if (typeof __ADAPTER_META__ !== 'undefined') {
                return __ADAPTER_META__;
            }
            return null;
        },
    };
}
export async function loadAdapterFromSource(jsSource) {
    const { metadata, code } = extractAdapterParts(jsSource);
    if (!metadata) {
        console.error('[AdapterRuntime] No valid metadata found in adapter');
        return null;
    }
    // Validate adapter code security
    const validation = validateAdapterCode(code);
    if (!validation.valid) {
        console.error('[AdapterRuntime] Adapter code validation failed:', validation.issues);
        return null;
    }
    return {
        meta: metadata.meta,
        code,
        enabled: true,
    };
}
export function createAdapterEnv(bridge) {
    return {
        bridge,
        sdkVersion: SDK_VERSION,
        emit: (type, payload) => {
            bridge.sendToBackground({ type, payload });
        },
    };
}
// --- Utility ---
function generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
// --- SDK Event Contract ---
// These are the only events an adapter should emit via bridge
export const SDK_EVENTS = {
    CHAPTER_DETECTED: 'CHAPTER_DETECTED',
    CHAPTER_MATCHED: 'CHAPTER_MATCHED',
    CHAPTER_READY: 'CHAPTER_READY',
    CHAPTER_READ: 'CHAPTER_READ',
};
export const REQUIRED_PAYLOAD_FIELDS = {
    CHAPTER_DETECTED: ['chapterId', 'chapterTitle', 'url'],
    CHAPTER_MATCHED: ['chapterId', 'matchedId', 'matchedTitle', 'confidence'],
    CHAPTER_READY: ['chapterId', 'progress'],
    CHAPTER_READ: ['chapterId', 'mangaId', 'readAt', 'progress'],
};
export function validateSDKPEvent(type, payload) {
    if (typeof payload !== 'object' || payload === null)
        return false;
    const fields = REQUIRED_PAYLOAD_FIELDS[type];
    return fields.every(field => field in payload);
}
