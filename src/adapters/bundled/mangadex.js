// ==MangaSyncAdapter==
// @id mangadex
// @name MangaDex
// @version 0.1.0
// @site mangadex
// @description Detect MangaDex chapters and mark them as read after 15s + 85% scroll.
// @match https://mangadex.org/chapter/*
// @match https://www.mangadex.org/chapter/*
// @match https://canary.mangadex.dev/chapter/*
// ==/MangaSyncAdapter==

MangaSync.defineAdapter({
  start(ctx) {
    let currentKey = '';
    let currentChapterRef = '';
    let readSentFor = '';
    let retryTimer = null;
    let readCleanup = null;

    const notifyCleared = () => {
      chrome.runtime.sendMessage({
        type: 'USER_SCRIPT_EVENT',
        adapterId: 'mangadex',
        eventType: 'chapter_cleared',
        payload: null,
      }).catch(() => {});
    };

    const normalize = (value) => (value || '').trim();
    const normalizeKey = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

    const getOgTitle = () => normalize(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
    const getDescription = () =>
      normalize(document.querySelector('meta[name="description"]')?.getAttribute('content')) ||
      normalize(document.querySelector('meta[property="og:description"]')?.getAttribute('content'));

    const parseSeriesTitleFromMeta = () => {
      const ogTitle = getOgTitle();
      if (ogTitle) {
        const match = ogTitle.match(/^(.*?)\s+-\s+(?:Vol\.?\s*[^-]+\s+-\s+)?Ch\.?\s*[^-]+(?:\s+-\s+MangaDex)?$/i);
        if (match?.[1]) return normalize(match[1]);
        return normalize(ogTitle.replace(/\s*-\s*MangaDex.*$/i, ''));
      }

      const description = getDescription();
      const descMatch = description.match(/^Read\s+(.+?)\s+(?:Vol\.?\s*[^\s]+\s+)?Ch\.?\s*[^\s]+\s+on\s+MangaDex!?$/i);
      return descMatch?.[1] ? normalize(descMatch[1]) : '';
    };

    const parseChapterNumberFromMeta = () => {
      const ogTitle = getOgTitle();
      const description = getDescription();
      const combined = `${ogTitle} ${description}`;
      const match = combined.match(/\bCh\.?\s*([0-9]+)\b/i);
      return match ? Number.parseInt(match[1], 10) : null;
    };

    const pickTitleLink = () => {
      const links = Array.from(document.querySelectorAll('a[href*="/title/"]'));
      return links.find((link) => {
        const href = link.getAttribute('href') || '';
        const text = normalize(link.textContent);
        return /\/title\//.test(href) && UUID_RE.test(href) && text && text.length > 1;
      }) || null;
    };

    const extract = () => {
      const url = location.href;
      const path = location.pathname;
      const chapterId =
        (path.match(/\/chapter\/([^/?#]+)/i) || [])[1] ||
        (url.match(/\/chapter\/([^/?#]+)/i) || [])[1];
      if (!chapterId) return null;

      const titleLink = pickTitleLink();
      const titleHref = titleLink ? titleLink.getAttribute('href') || '' : '';
      const titleFromMeta = parseSeriesTitleFromMeta();
      const description = getDescription();
      const descriptionFallbackTitle = normalize(description.replace(/^Read\s+/i, '').replace(/\s+(?:Vol\.?\s*[^\s]+\s+)?Ch\.?\s*[^\s]+\s+on\s+MangaDex!?$/i, ''));
      const fallbackTitle = titleFromMeta || descriptionFallbackTitle;
      const siteSeriesId =
        (titleHref.match(/\/title\/([a-f0-9-]+)/i) || [])[1] ||
        (fallbackTitle ? `title:${normalizeKey(fallbackTitle)}` : `chapter:${chapterId}`);
      const siteSeriesTitle =
        fallbackTitle ||
        normalize(document.querySelector('main a[href*="/title/"] span')?.textContent) ||
        normalize(titleLink && titleLink.textContent) ||
        descriptionFallbackTitle ||
        (document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').replace(/\s*-\s*MangaDex.*$/i, '') ||
        document.title.replace(/\s*-\s*MangaDex.*$/i, '').trim();

      const candidateTexts = [
        document.querySelector('h1')?.textContent,
        document.querySelector('h2')?.textContent,
        document.querySelector('[data-testid="breadcrumb-title"]')?.textContent,
        document.querySelector('[class*="chapter"]')?.textContent,
        document.title,
      ].filter(Boolean);

      const chapterText = candidateTexts.join(' ');
      const numberMatch = chapterText.match(/(?:chapter|ch\.?|cap[ií]tulo)\s*([0-9]+)/i);
      const chapterNumber = numberMatch ? Number.parseInt(numberMatch[1], 10) : parseChapterNumberFromMeta();

      return {
        site: 'mangadex',
        siteSeriesId,
        siteSeriesTitle: siteSeriesTitle || 'Unknown title',
        chapterId,
        chapterNumber,
        chapterTitle: candidateTexts[0] ? String(candidateTexts[0]).trim() : undefined,
        chapterUrl: url,
      };
    };

    const clearCurrentState = () => {
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      if (readCleanup) {
        readCleanup();
        readCleanup = null;
      }
      currentKey = '';
      currentChapterRef = '';
      readSentFor = '';
    };

    const detect = () => {
      const context = extract();
      if (!context) return false;
      if (!context.siteSeriesTitle || context.siteSeriesTitle === 'Unknown title') return false;
      const nextKey = `${context.siteSeriesId}:${context.chapterId ?? context.chapterUrl}`;
      if (nextKey === currentKey) return true;
      currentKey = nextKey;
      currentChapterRef = context.chapterId || context.chapterUrl;
      readSentFor = '';
      if (readCleanup) {
        readCleanup();
        readCleanup = null;
      }
      ctx.emitDetected(context);
      ctx.showStatus({ kind: 'info', message: `Detected: ${context.siteSeriesTitle}${context.chapterNumber ? ` · Ch ${context.chapterNumber}` : ''}` });
      readCleanup = ctx.whenRead({ minSeconds: 15, minScrollPercent: 85 }, () => {
        if (readSentFor === nextKey) return;
        readSentFor = nextKey;
        ctx.emitRead(context, { trigger: 'scroll-time-threshold' });
      });
      return true;
    };

    const scheduleRetries = () => {
      if (retryTimer) clearInterval(retryTimer);
      retryTimer = setInterval(() => {
        if (detect()) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 1000);
      setTimeout(() => {
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 20000);
    };

    if (!detect()) scheduleRetries();
    ctx.onUrlChange(() => setTimeout(() => {
      const latest = extract();
      const nextChapterRef = latest ? (latest.chapterId || latest.chapterUrl) : '';
      if (nextChapterRef && nextChapterRef === currentChapterRef) {
        return;
      }
      clearCurrentState();
      if (!latest) {
        notifyCleared();
        return;
      }
      if (!detect()) scheduleRetries();
    }, 300));
    new MutationObserver(() => {
      const latest = extract();
      if (!latest && currentChapterRef) {
        clearCurrentState();
        notifyCleared();
        return;
      }
      detect() || undefined;
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
    });
    window.addEventListener('load', () => {
      if (!detect()) scheduleRetries();
    }, { once: true });
    window.addEventListener('pagehide', () => {
      clearCurrentState();
      notifyCleared();
    });
  },
});
