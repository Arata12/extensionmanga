// ============================================================================
// Overlay/Card Component - Modal card UI for choices and detailed states
// ============================================================================
let activeOverlay = null;
export function showOverlay(options) {
    const { title, content, actions = [] } = options;
    // Remove existing overlay
    hideOverlay();
    // Create overlay backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'extmg-overlay-backdrop';
    backdrop.className = 'extmg-overlay-backdrop';
    // Create card
    const card = document.createElement('div');
    card.id = 'extmg-overlay';
    card.className = 'extmg-overlay';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    // Render content based on state
    const contentHtml = renderStateContent(options.state);
    const actionsHtml = renderActions(actions);
    card.innerHTML = `
    <div class="extmg-overlay__header">
      <h2 class="extmg-overlay__title">${escapeHtml(title)}</h2>
      <button class="extmg-overlay__close" aria-label="Close">×</button>
    </div>
    <div class="extmg-overlay__body">
      <div class="extmg-overlay__content">${content}</div>
      ${contentHtml ? `<div class="extmg-overlay__state">${contentHtml}</div>` : ''}
    </div>
    ${actionsHtml ? `<div class="extmg-overlay__actions">${actionsHtml}</div>` : ''}
  `;
    // Add event handlers
    const closeBtn = card.querySelector('.extmg-overlay__close');
    closeBtn?.addEventListener('click', hideOverlay);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            hideOverlay();
        }
    });
    // Add keyboard handler
    document.addEventListener('keydown', handleKeydown);
    // Add styles
    injectOverlayStyles();
    // Append to page
    document.body.appendChild(backdrop);
    document.body.appendChild(card);
    activeOverlay = card;
    // Trigger animation
    requestAnimationFrame(() => {
        backdrop.classList.add('extmg-overlay-backdrop--visible');
        card.classList.add('extmg-overlay--visible');
    });
}
export function hideOverlay() {
    if (activeOverlay) {
        const backdrop = document.getElementById('extmg-overlay-backdrop');
        activeOverlay.classList.remove('extmg-overlay--visible');
        backdrop?.classList.remove('extmg-overlay-backdrop--visible');
        const cleanup = () => {
            activeOverlay?.remove();
            backdrop?.remove();
            activeOverlay = null;
        };
        activeOverlay.addEventListener('transitionend', cleanup, { once: true });
        document.removeEventListener('keydown', handleKeydown);
    }
}
function renderStateContent(state) {
    switch (state.status) {
        case 'detected':
            return `
        <div class="extmg-state extmg-state--detected">
          <span class="extmg-state__icon">📖</span>
          <div class="extmg-state__text">
            <strong>Chapter Detected</strong>
            <span>${escapeHtml(state.data.chapterTitle || 'Unknown chapter')}</span>
          </div>
        </div>
      `;
        case 'matched':
            return `
        <div class="extmg-state extmg-state--matched">
          <span class="extmg-state__icon">✅</span>
          <div class="extmg-state__text">
            <strong>Matched: ${escapeHtml(state.data.matchedTitle)}</strong>
            <span>Confidence: ${Math.round(state.data.confidence * 100)}%</span>
          </div>
        </div>
      `;
        case 'choices':
            return `
        <div class="extmg-state extmg-state--choices">
          <span class="extmg-state__icon">🤔</span>
          <strong>Multiple matches found</strong>
          <ul class="extmg-state__list">
            ${state.data.candidates.map(c => `
              <li>
                <button class="extmg-choice-btn" data-id="${escapeHtml(c.id)}">
                  ${escapeHtml(c.title)} (${Math.round(c.confidence * 100)}%)
                </button>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
        case 'ready':
        case 'reading':
            return `
        <div class="extmg-state extmg-state--${state.status}">
          <div class="extmg-progress">
            <div class="extmg-progress__bar" style="width: ${state.data.progress}%"></div>
          </div>
          <span class="extmg-progress__text">${state.data.progress}% read</span>
        </div>
      `;
        case 'synced':
            return `
        <div class="extmg-state extmg-state--synced">
          <span class="extmg-state__icon">🔄</span>
          <strong>Synced to AniList</strong>
          <span>${new Date(state.data.syncedAt).toLocaleTimeString()}</span>
        </div>
      `;
        case 'error':
            return `
        <div class="extmg-state extmg-state--error">
          <span class="extmg-state__icon">❌</span>
          <strong>Error</strong>
          <span>${escapeHtml(state.data.message)}</span>
        </div>
      `;
        default:
            return '';
    }
}
function renderActions(actions) {
    if (!actions.length)
        return '';
    return actions.map(action => `
    <button 
      class="extmg-btn ${action.primary ? 'extmg-btn--primary' : ''}"
      data-action="${escapeHtml(action.label)}"
    >
      ${escapeHtml(action.label)}
    </button>
  `).join('');
}
function handleKeydown(e) {
    if (e.key === 'Escape') {
        hideOverlay();
    }
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function injectOverlayStyles() {
    if (document.getElementById('extmg-overlay-styles'))
        return;
    const styles = document.createElement('style');
    styles.id = 'extmg-overlay-styles';
    styles.textContent = `
    .extmg-overlay-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      background: rgba(0,0,0,0.5);
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .extmg-overlay-backdrop--visible { opacity: 1; }
    
    .extmg-overlay {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      z-index: 2147483646;
      width: 90%;
      max-width: 400px;
      background: #1a1a2e;
      color: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      font-family: system-ui, -apple-system, sans-serif;
      opacity: 0;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .extmg-overlay--visible {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
    
    .extmg-overlay__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .extmg-overlay__title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .extmg-overlay__close {
      padding: 0;
      background: none;
      border: none;
      color: rgba(255,255,255,0.6);
      font-size: 24px;
      cursor: pointer;
    }
    .extmg-overlay__close:hover { color: #fff; }
    
    .extmg-overlay__body { padding: 20px; }
    .extmg-overlay__content {
      font-size: 14px;
      color: rgba(255,255,255,0.7);
      margin-bottom: 16px;
    }
    
    .extmg-overlay__actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    
    .extmg-btn {
      padding: 8px 16px;
      background: rgba(255,255,255,0.1);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }
    .extmg-btn:hover { background: rgba(255,255,255,0.2); }
    .extmg-btn--primary {
      background: #6366f1;
    }
    .extmg-btn--primary:hover { background: #4f46e5; }
    
    .extmg-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
    }
    .extmg-state__icon { font-size: 32px; }
    .extmg-state__text {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .extmg-state__list {
      list-style: none;
      padding: 0;
      margin: 10px 0 0;
      width: 100%;
    }
    .extmg-choice-btn {
      width: 100%;
      padding: 10px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      margin-top: 6px;
    }
    .extmg-choice-btn:hover {
      background: rgba(255,255,255,0.2);
    }
    
    .extmg-progress {
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .extmg-progress__bar {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      transition: width 0.3s ease;
    }
    .extmg-progress__text {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
    }
  `;
    document.head.appendChild(styles);
}
