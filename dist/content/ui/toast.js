// ============================================================================
// Toast Component - Small notification UI for content bridge
// ============================================================================
const ICONS = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
};
let activeToast = null;
let hideTimeout = null;
export function showToast(options) {
    const { message, type = 'info', duration = 3000, action } = options;
    // Remove existing toast
    hideToast();
    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'extmg-toast';
    toast.className = `extmg-toast extmg-toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
    <span class="extmg-toast__icon">${ICONS[type]}</span>
    <span class="extmg-toast__message">${escapeHtml(message)}</span>
    ${action ? `<button class="extmg-toast__action">${escapeHtml(action.label)}</button>` : ''}
    <button class="extmg-toast__close" aria-label="Dismiss">×</button>
  `;
    // Add action handler
    if (action) {
        const actionBtn = toast.querySelector('.extmg-toast__action');
        actionBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            action.onClick();
            hideToast();
        });
    }
    // Add close handler
    const closeBtn = toast.querySelector('.extmg-toast__close');
    closeBtn?.addEventListener('click', () => hideToast());
    // Add styles if not already present
    injectToastStyles();
    // Append to page
    document.body.appendChild(toast);
    activeToast = toast;
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('extmg-toast--visible');
    });
    // Auto-hide
    if (duration > 0) {
        hideTimeout = setTimeout(hideToast, duration);
    }
}
export function hideToast() {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    if (activeToast) {
        activeToast.classList.remove('extmg-toast--visible');
        activeToast.addEventListener('transitionend', () => {
            activeToast?.remove();
            activeToast = null;
        }, { once: true });
    }
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function injectToastStyles() {
    if (document.getElementById('extmg-toast-styles'))
        return;
    const styles = document.createElement('style');
    styles.id = 'extmg-toast-styles';
    styles.textContent = `
    .extmg-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: #1a1a2e;
      color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      max-width: 360px;
      transform: translateY(100px);
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .extmg-toast--visible {
      transform: translateY(0);
      opacity: 1;
    }
    .extmg-toast__icon { font-size: 16px; }
    .extmg-toast__message { flex: 1; }
    .extmg-toast__action {
      padding: 4px 12px;
      background: rgba(255,255,255,0.2);
      border: none;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
    }
    .extmg-toast__action:hover { background: rgba(255,255,255,0.3); }
    .extmg-toast__close {
      padding: 0 4px;
      background: none;
      border: none;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }
    .extmg-toast__close:hover { color: #fff; }
    .extmg-toast--success { border-left: 3px solid #4ade80; }
    .extmg-toast--error { border-left: 3px solid #f87171; }
    .extmg-toast--warning { border-left: 3px solid #fbbf24; }
    .extmg-toast--info { border-left: 3px solid #60a5fa; }
  `;
    document.head.appendChild(styles);
}
