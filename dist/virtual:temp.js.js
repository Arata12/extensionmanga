const O = `// ==MangaSyncAdapter==
// @id mangadex
// @name MangaDex
// @version 0.1.0
// @site mangadex
// @description Detect MangaDex chapters and mark them as read after 15s + 85% scroll.
// @match https://mangadex.org/chapter/*
// ==/MangaSyncAdapter==

MangaSync.defineAdapter({
  start(ctx) {
    let currentKey = '';
    let readSentFor = '';

    const extract = () => {
      const url = location.href;
      const chapterId = (url.match(/\\/chapter\\/([a-f0-9-]+)/i) || [])[1];
      if (!chapterId) return null;

      const titleLink = document.querySelector('a[href*="/title/"]');
      const titleHref = titleLink ? titleLink.getAttribute('href') || '' : '';
      const siteSeriesId = (titleHref.match(/\\/title\\/([a-f0-9-]+)/i) || [])[1] || titleHref || 'unknown-series';
      const siteSeriesTitle =
        (titleLink && titleLink.textContent && titleLink.textContent.trim()) ||
        (document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').replace(/\\s*-\\s*MangaDex.*$/i, '') ||
        document.title.replace(/\\s*-\\s*MangaDex.*$/i, '').trim();

      const candidateTexts = [
        document.querySelector('h1')?.textContent,
        document.querySelector('h2')?.textContent,
        document.querySelector('[class*="chapter"]')?.textContent,
        document.title,
      ].filter(Boolean);

      const chapterText = candidateTexts.join(' ');
      const numberMatch = chapterText.match(/(?:chapter|ch\\.?|cap[ií]tulo)\\s*([0-9]+)/i);
      const chapterNumber = numberMatch ? Number.parseInt(numberMatch[1], 10) : null;

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

    const detect = () => {
      const context = extract();
      if (!context) return;
      const nextKey = \`\${context.siteSeriesId}:\${context.chapterId ?? context.chapterUrl}\`;
      if (nextKey === currentKey) return;
      currentKey = nextKey;
      readSentFor = '';
      ctx.emitDetected(context);
      ctx.whenRead({ minSeconds: 15, minScrollPercent: 85 }, () => {
        if (readSentFor === nextKey) return;
        readSentFor = nextKey;
        ctx.emitRead(context, { trigger: 'scroll-time-threshold' });
      });
    };

    detect();
    ctx.onUrlChange(() => setTimeout(detect, 300));
    new MutationObserver(() => detect()).observe(document.documentElement, {
      subtree: true,
      childList: true,
    });
    window.addEventListener('load', detect, { once: true });
  },
});
`, R = "// ==MangaSyncAdapter==", Z = "// ==/MangaSyncAdapter==";
function X(e) {
  const t = e.match(/^\/\/\s*@([a-zA-Z]+)\s+(.+)$/);
  return t ? { key: t[1], value: t[2].trim() } : null;
}
function $(e) {
  const t = e.indexOf(R), n = e.indexOf(Z);
  if (t === -1 || n === -1 || n <= t)
    throw new Error("Adapter metadata header is missing or malformed.");
  const r = e.slice(t + R.length, n).split(`
`).map((g) => g.trim()).filter(Boolean), a = {};
  for (const g of r) {
    const w = X(g);
    w && (a[w.key] ??= [], a[w.key].push(w.value));
  }
  const i = a.id?.[0], s = a.name?.[0], c = a.version?.[0], o = a.site?.[0], d = a.match ?? [];
  if (!i || !/^[a-z0-9_-]{3,64}$/i.test(i))
    throw new Error("Adapter @id is required and must be 3-64 chars (letters, numbers, _ or -).");
  if (!s) throw new Error("Adapter @name is required.");
  if (!c) throw new Error("Adapter @version is required.");
  if (!o) throw new Error("Adapter @site is required.");
  if (!d.length) throw new Error("Adapter needs at least one @match pattern.");
  return {
    id: i,
    name: s,
    version: c,
    site: o,
    description: a.description?.[0],
    matches: d
  };
}
function ee(e) {
  $(e);
  const t = [
    /\beval\s*\(/,
    /\bnew Function\s*\(/,
    /chrome\.runtime\.sendNativeMessage/
  ];
  for (const n of t)
    if (n.test(e))
      throw new Error("Adapter contains a disallowed runtime pattern.");
}
const te = "https://graphql.anilist.co", M = "extmg.settings", ne = (
  /* GraphQL */
  `
  query Viewer {
    Viewer {
      id
      name
      avatar {
        large
      }
    }
  }
`
), re = (
  /* GraphQL */
  `
  query SearchManga($search: String!, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: MANGA, search: $search, sort: SEARCH_MATCH) {
        id
        title {
          userPreferred
          romaji
          english
          native
        }
        synonyms
        chapters
        status
        format
        siteUrl
      }
    }
  }
`
), ae = (
  /* GraphQL */
  `
  query MediaWithEntry($id: Int!) {
    Media(id: $id, type: MANGA) {
      id
      chapters
      title {
        userPreferred
        romaji
        english
        native
      }
      synonyms
      status
      format
      siteUrl
      mediaListEntry {
        id
        progress
        status
        updatedAt
      }
    }
  }
`
), ie = (
  /* GraphQL */
  `
  mutation SaveMediaListEntry($mediaId: Int!, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
      id
      progress
      status
      updatedAt
    }
  }
`
);
async function b(e, t, n) {
  const r = await fetch(te, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...n ? { Authorization: `Bearer ${n}` } : {}
    },
    body: JSON.stringify({ query: e, variables: t })
  });
  if (!r.ok)
    throw new Error(`AniList request failed (${r.status})`);
  const a = await r.json();
  if (a.errors?.length)
    throw new Error(a.errors[0].message);
  if (!a.data)
    throw new Error("AniList returned no data");
  return a.data;
}
async function se(e) {
  try {
    return (await b(ne, void 0, e)).Viewer;
  } catch {
    return null;
  }
}
async function oe(e) {
  return (await b(re, {
    search: e,
    page: 1,
    perPage: 10
  })).Page.media;
}
async function ce(e, t) {
  return (await b(ae, { id: e }, t)).Media;
}
async function de(e) {
  return (await b(
    ie,
    {
      mediaId: e.mediaId,
      progress: e.progress,
      status: e.status
    },
    e.token
  )).SaveMediaListEntry;
}
function p(e) {
  return e.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function le(e) {
  return [
    e.title.userPreferred,
    e.title.romaji,
    e.title.english,
    e.title.native,
    ...e.synonyms ?? []
  ].filter((t) => !!t);
}
function ue(e, t) {
  const n = p(e);
  let r = 0;
  for (const a of le(t)) {
    const i = p(a);
    if (!i) continue;
    if (i === n)
      return 1;
    if (i.includes(n) || n.includes(i)) {
      r = Math.max(r, 0.9);
      continue;
    }
    const s = new Set(n.split(" ")), c = new Set(i.split(" ")), d = [...s].filter((g) => c.has(g)).length / Math.max(s.size, c.size, 1);
    r = Math.max(r, d);
  }
  return r;
}
function pe(e, t) {
  return t.map((n) => ({
    mediaId: n.id,
    title: n.title.userPreferred ?? n.title.english ?? n.title.romaji ?? n.title.native ?? `AniList #${n.id}`,
    chapters: n.chapters ?? null,
    score: ue(e, n)
  })).sort((n, r) => r.score - n.score).slice(0, 5);
}
function me(e) {
  if (!e.length) return !1;
  const [t, n] = e;
  return t.score >= 0.99 ? !0 : t.score >= 0.9 && (!n || t.score - n.score >= 0.2);
}
const fe = {
  authToken: null,
  viewer: null,
  syncMode: "ask",
  enabledBuiltinAdapterIds: []
};
async function u() {
  const e = await chrome.storage.local.get(M);
  return {
    ...fe,
    ...e[M]
  };
}
async function S(e) {
  const t = { ...await u(), ...e };
  return await chrome.storage.local.set({ [M]: t }), t;
}
async function he() {
  return S({ authToken: null, viewer: null });
}
const v = (e, t) => t.some((n) => e instanceof n);
let j, V;
function ge() {
  return j || (j = [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction
  ]);
}
function ye() {
  return V || (V = [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey
  ]);
}
const _ = /* @__PURE__ */ new WeakMap(), A = /* @__PURE__ */ new WeakMap(), I = /* @__PURE__ */ new WeakMap();
function we(e) {
  const t = new Promise((n, r) => {
    const a = () => {
      e.removeEventListener("success", i), e.removeEventListener("error", s);
    }, i = () => {
      n(m(e.result)), a();
    }, s = () => {
      r(e.error), a();
    };
    e.addEventListener("success", i), e.addEventListener("error", s);
  });
  return I.set(t, e), t;
}
function Se(e) {
  if (_.has(e))
    return;
  const t = new Promise((n, r) => {
    const a = () => {
      e.removeEventListener("complete", i), e.removeEventListener("error", s), e.removeEventListener("abort", s);
    }, i = () => {
      n(), a();
    }, s = () => {
      r(e.error || new DOMException("AbortError", "AbortError")), a();
    };
    e.addEventListener("complete", i), e.addEventListener("error", s), e.addEventListener("abort", s);
  });
  _.set(e, t);
}
let L = {
  get(e, t, n) {
    if (e instanceof IDBTransaction) {
      if (t === "done")
        return _.get(e);
      if (t === "store")
        return n.objectStoreNames[1] ? void 0 : n.objectStore(n.objectStoreNames[0]);
    }
    return m(e[t]);
  },
  set(e, t, n) {
    return e[t] = n, !0;
  },
  has(e, t) {
    return e instanceof IDBTransaction && (t === "done" || t === "store") ? !0 : t in e;
  }
};
function z(e) {
  L = e(L);
}
function be(e) {
  return ye().includes(e) ? function(...t) {
    return e.apply(D(this), t), m(this.request);
  } : function(...t) {
    return m(e.apply(D(this), t));
  };
}
function Ie(e) {
  return typeof e == "function" ? be(e) : (e instanceof IDBTransaction && Se(e), v(e, ge()) ? new Proxy(e, L) : e);
}
function m(e) {
  if (e instanceof IDBRequest)
    return we(e);
  if (A.has(e))
    return A.get(e);
  const t = Ie(e);
  return t !== e && (A.set(e, t), I.set(t, e)), t;
}
const D = (e) => I.get(e);
function Ae(e, t, { blocked: n, upgrade: r, blocking: a, terminated: i } = {}) {
  const s = indexedDB.open(e, t), c = m(s);
  return r && s.addEventListener("upgradeneeded", (o) => {
    r(m(s.result), o.oldVersion, o.newVersion, m(s.transaction), o);
  }), n && s.addEventListener("blocked", (o) => n(
    // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
    o.oldVersion,
    o.newVersion,
    o
  )), c.then((o) => {
    i && o.addEventListener("close", () => i()), a && o.addEventListener("versionchange", (d) => a(d.oldVersion, d.newVersion, d));
  }).catch(() => {
  }), c;
}
const Ee = ["get", "getKey", "getAll", "getAllKeys", "count"], Te = ["put", "add", "delete", "clear"], E = /* @__PURE__ */ new Map();
function q(e, t) {
  if (!(e instanceof IDBDatabase && !(t in e) && typeof t == "string"))
    return;
  if (E.get(t))
    return E.get(t);
  const n = t.replace(/FromIndex$/, ""), r = t !== n, a = Te.includes(n);
  if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(n in (r ? IDBIndex : IDBObjectStore).prototype) || !(a || Ee.includes(n))
  )
    return;
  const i = async function(s, ...c) {
    const o = this.transaction(s, a ? "readwrite" : "readonly");
    let d = o.store;
    return r && (d = d.index(c.shift())), (await Promise.all([
      d[n](...c),
      a && o.done
    ]))[0];
  };
  return E.set(t, i), i;
}
z((e) => ({
  ...e,
  get: (t, n, r) => q(t, n) || e.get(t, n, r),
  has: (t, n) => !!q(t, n) || e.has(t, n)
}));
const ke = ["continue", "continuePrimaryKey", "advance"], G = {}, N = /* @__PURE__ */ new WeakMap(), Y = /* @__PURE__ */ new WeakMap(), Me = {
  get(e, t) {
    if (!ke.includes(t))
      return e[t];
    let n = G[t];
    return n || (n = G[t] = function(...r) {
      N.set(this, Y.get(this)[t](...r));
    }), n;
  }
};
async function* ve(...e) {
  let t = this;
  if (t instanceof IDBCursor || (t = await t.openCursor(...e)), !t)
    return;
  t = t;
  const n = new Proxy(t, Me);
  for (Y.set(n, t), I.set(n, D(t)); t; )
    yield n, t = await (N.get(n) || t.continue()), N.delete(n);
}
function K(e, t) {
  return t === Symbol.asyncIterator && v(e, [IDBIndex, IDBObjectStore, IDBCursor]) || t === "iterate" && v(e, [IDBIndex, IDBObjectStore]);
}
z((e) => ({
  ...e,
  get(t, n, r) {
    return K(t, n) ? ve : e.get(t, n, r);
  },
  has(t, n) {
    return K(t, n) || e.has(t, n);
  }
}));
const _e = "manga-sync-extension", Le = 2;
let T = null;
function l() {
  return T || (T = Ae(_e, Le, {
    upgrade(e) {
      if (!e.objectStoreNames.contains("seriesMappings")) {
        const t = e.createObjectStore("seriesMappings", { keyPath: "key" });
        t.createIndex("by-site", "site"), t.createIndex("by-siteSeriesId", "siteSeriesId");
      }
      if (e.objectStoreNames.contains("titleAliases") || e.createObjectStore("titleAliases", { keyPath: "key" }).createIndex("by-site", "site"), !e.objectStoreNames.contains("syncLog")) {
        const t = e.createObjectStore("syncLog", { keyPath: "key" });
        t.createIndex("by-siteSeriesId", "siteSeriesId"), t.createIndex("by-syncedAt", "syncedAt");
      }
      e.objectStoreNames.contains("customAdapters") || e.createObjectStore("customAdapters", { keyPath: "id" }).createIndex("by-enabled", "enabled");
    }
  })), T;
}
async function P(e) {
  await (await l()).put("seriesMappings", e);
}
async function De(e, t) {
  return (await l()).get("seriesMappings", `${e}|${t}`);
}
async function Ne() {
  return (await l()).getAll("seriesMappings");
}
async function Pe(e) {
  await (await l()).delete("seriesMappings", e);
}
async function Q(e) {
  await (await l()).put("titleAliases", e);
}
async function Ce(e, t) {
  return (await l()).get("titleAliases", `${e}|${t}`);
}
async function F(e) {
  await (await l()).put("syncLog", e);
}
async function $e(e, t, n) {
  return (await l()).get("syncLog", `${e}|${t}|${n}`);
}
async function Be(e, t, n) {
  await (await l()).delete("syncLog", `${e}|${t}|${n}`);
}
async function xe(e = 50) {
  return (await (await l()).getAll("syncLog")).sort((r, a) => a.syncedAt - r.syncedAt).slice(0, e);
}
async function H(e) {
  await (await l()).put("customAdapters", e);
}
async function Ue(e) {
  return (await l()).get("customAdapters", e);
}
async function J() {
  return (await l()).getAll("customAdapters");
}
async function Oe(e) {
  await (await l()).delete("customAdapters", e);
}
async function h(e) {
  const t = await De(e.site, e.siteSeriesId);
  if (t)
    return { state: "mapped", mapping: t };
  const n = await Ce(e.site, p(e.siteSeriesTitle));
  if (n) {
    const i = {
      key: `${e.site}|${e.siteSeriesId}`,
      site: e.site,
      siteSeriesId: e.siteSeriesId,
      siteTitle: e.siteSeriesTitle,
      anilistMediaId: n.anilistMediaId,
      anilistTitle: n.anilistTitle,
      confirmedByUser: !1,
      updatedAt: Date.now()
    };
    return await P(i), { state: "mapped", mapping: i };
  }
  const r = await oe(e.siteSeriesTitle), a = pe(e.siteSeriesTitle, r);
  if (!a.length)
    return { state: "unresolved" };
  if (me(a)) {
    const i = a[0], s = {
      key: `${e.site}|${e.siteSeriesId}`,
      site: e.site,
      siteSeriesId: e.siteSeriesId,
      siteTitle: e.siteSeriesTitle,
      anilistMediaId: i.mediaId,
      anilistTitle: i.title,
      confirmedByUser: !1,
      updatedAt: Date.now()
    };
    return await P(s), await Q({
      key: `${e.site}|${p(e.siteSeriesTitle)}`,
      site: e.site,
      normalizedTitle: p(e.siteSeriesTitle),
      anilistMediaId: i.mediaId,
      anilistTitle: i.title,
      updatedAt: Date.now()
    }), { state: "mapped", mapping: s };
  }
  return { state: "needs_choice", candidates: a };
}
async function Re(e) {
  if (!(await u()).authToken)
    return { state: "auth_required" };
  const n = await h(e);
  return n.state === "mapped" && n.mapping ? {
    state: "mapped",
    title: n.mapping.anilistTitle,
    mediaId: n.mapping.anilistMediaId,
    confirmed: n.mapping.confirmedByUser
  } : n.state === "needs_choice" ? { state: "needs_choice", candidates: n.candidates ?? [] } : { state: "unresolved" };
}
async function je(e, t) {
  const n = {
    key: `${e.site}|${e.siteSeriesId}`,
    site: e.site,
    siteSeriesId: e.siteSeriesId,
    siteTitle: e.siteSeriesTitle,
    anilistMediaId: t.mediaId,
    anilistTitle: t.title,
    confirmedByUser: !0,
    updatedAt: Date.now()
  };
  return await P(n), await Q({
    key: `${e.site}|${p(e.siteSeriesTitle)}`,
    site: e.site,
    normalizedTitle: p(e.siteSeriesTitle),
    anilistMediaId: t.mediaId,
    anilistTitle: t.title,
    updatedAt: Date.now()
  }), n;
}
function B(e) {
  return typeof e.chapterNumber != "number" || !Number.isInteger(e.chapterNumber) || e.chapterNumber < 0 ? null : e.chapterNumber;
}
async function x(e, t) {
  const n = await u();
  if (!n.authToken)
    return { state: "auth_required" };
  const r = B(e);
  if (r === null)
    return { state: "skipped", reason: "Only clean integer chapters are synced in v1." };
  const a = e.chapterId ?? String(r);
  if (await $e(e.site, e.siteSeriesId, a))
    return { state: "skipped", reason: "This chapter was already synced." };
  const s = await ce(t.anilistMediaId, n.authToken);
  if (!s)
    return { state: "error", message: "AniList entry could not be loaded." };
  const c = s.mediaListEntry?.progress ?? 0;
  if (r <= c)
    return await F({
      key: `${e.site}|${e.siteSeriesId}|${a}`,
      site: e.site,
      siteSeriesId: e.siteSeriesId,
      chapterKey: a,
      chapterNumber: r,
      chapterUrl: e.chapterUrl,
      anilistMediaId: t.anilistMediaId,
      syncedAt: Date.now(),
      result: "skipped",
      reason: `Chapter ${r} is not ahead of AniList progress ${c}.`
    }), { state: "skipped", reason: "AniList progress is already ahead or equal." };
  const o = await de({
    token: n.authToken,
    mediaId: t.anilistMediaId,
    progress: r,
    status: s.mediaListEntry ? void 0 : "CURRENT"
  });
  return await F({
    key: `${e.site}|${e.siteSeriesId}|${a}`,
    site: e.site,
    siteSeriesId: e.siteSeriesId,
    chapterKey: a,
    chapterNumber: r,
    chapterUrl: e.chapterUrl,
    anilistMediaId: t.anilistMediaId,
    syncedAt: Date.now(),
    result: "synced"
  }), { state: "synced", title: t.anilistTitle, progress: o.progress };
}
async function Ve(e) {
  const t = await u();
  if (!t.authToken)
    return { state: "auth_required" };
  const n = await h(e);
  if (n.state === "needs_choice")
    return { state: "needs_choice", candidates: n.candidates ?? [] };
  if (n.state !== "mapped" || !n.mapping)
    return { state: "error", message: "No AniList match available for this manga yet." };
  const r = B(e);
  return r === null ? { state: "skipped", reason: "Only clean integer chapters are synced in v1." } : t.syncMode === "manual" ? { state: "manual" } : t.syncMode === "ask" ? { state: "confirm_sync", title: n.mapping.anilistTitle, chapterNumber: r } : x(e, n.mapping);
}
async function qe(e) {
  const t = await h(e);
  return t.state !== "mapped" || !t.mapping ? { state: "error", message: "No confirmed AniList mapping available." } : x(e, t.mapping);
}
async function Ge(e) {
  const t = await h(e);
  if (t.state !== "mapped" || !t.mapping)
    return { state: "error", message: "No AniList mapping available for debug sync." };
  const n = B(e);
  return n === null ? { state: "error", message: "Current chapter is not a clean integer." } : (await Be(e.site, e.siteSeriesId, e.chapterId ?? String(n)), x(e, t.mapping));
}
const U = /* @__PURE__ */ new Map([
  ["mangadex", { meta: $(O), sourceCode: O, sourceType: "bundled" }]
]), y = /* @__PURE__ */ new Map();
function C() {
  return typeof chrome.userScripts < "u";
}
function Ke(e) {
  return `
(() => {
  const meta = ${JSON.stringify(e)};
  const EVENT_NAME = 'extmg:adapter:event';
  const RPC_REQUEST_EVENT = 'extmg:adapter:rpc-request';
  const RPC_RESPONSE_EVENT = 'extmg:adapter:rpc-response';
  let activeReadCleanup = null;

  function dispatch(type, payload) {
    document.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { adapterId: meta.id, type, payload }
    }));
  }

  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const requestId = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const handler = (event) => {
        const detail = event.detail || {};
        if (detail.requestId !== requestId) return;
        document.removeEventListener(RPC_RESPONSE_EVENT, handler);
        if (detail.ok) resolve(detail.result); else reject(new Error(detail.error || 'RPC failed'));
      };
      document.addEventListener(RPC_RESPONSE_EVENT, handler);
      document.dispatchEvent(new CustomEvent(RPC_REQUEST_EVENT, {
        detail: { requestId, method, params }
      }));
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
function Fe(e) {
  return `${Ke(e.meta)}
${e.sourceCode}`;
}
async function He() {
  const e = await u(), t = await J(), n = [...U.values()].map((a) => ({
    id: a.meta.id,
    meta: a.meta,
    enabled: e.enabledBuiltinAdapterIds.includes(a.meta.id),
    sourceType: "bundled"
  })), r = t.map((a) => ({
    id: a.id,
    meta: a.meta,
    enabled: a.enabled,
    sourceType: "imported"
  }));
  return [...n, ...r].sort((a, i) => a.meta.name.localeCompare(i.meta.name));
}
async function We() {
  const e = await u(), n = (await J()).filter((a) => a.enabled).map((a) => ({
    meta: a.meta,
    sourceCode: a.sourceCode,
    sourceType: "imported"
  }));
  return [...e.enabledBuiltinAdapterIds.map((a) => U.get(a)).filter((a) => !!a), ...n];
}
async function ze(e) {
  if (!C()) return;
  const t = await chrome.userScripts.getScripts();
  t.length && await chrome.userScripts.unregister({ ids: t.map((n) => n.id) }), e.length && await chrome.userScripts.register(
    e.map((n) => ({
      id: n.meta.id,
      matches: n.meta.matches,
      js: [{ code: Fe(n) }],
      runAt: "document_idle",
      world: "USER_SCRIPT"
    }))
  );
}
async function f() {
  const e = await We();
  await ze(e);
}
async function k(e) {
  return chrome.permissions.request({ origins: e.matches });
}
function W(e, t, n) {
  typeof e == "number" && y.set(e, { adapterId: t, context: n });
}
chrome.runtime.onInstalled.addListener(() => {
  f();
});
chrome.runtime.onStartup.addListener(() => {
  f();
});
chrome.tabs.onRemoved.addListener((e) => {
  y.delete(e);
});
chrome.runtime.onMessage.addListener((e, t, n) => ((async () => {
  try {
    switch (e.type) {
      case "GET_STATUS": {
        const r = await u();
        n({ ok: !0, settings: r, userScriptsAvailable: C() });
        break;
      }
      case "SAVE_AUTH_TOKEN": {
        const r = await se(String(e.token ?? "").trim());
        if (!r) {
          n({ ok: !1, error: "Invalid AniList token." });
          break;
        }
        const a = await S({ authToken: String(e.token).trim(), viewer: r });
        n({ ok: !0, viewer: r, settings: a });
        break;
      }
      case "LOGOUT": {
        const r = await he();
        n({ ok: !0, settings: r });
        break;
      }
      case "UPDATE_SETTINGS": {
        const r = await S(e.patch ?? {});
        n({ ok: !0, settings: r });
        break;
      }
      case "LIST_ADAPTERS": {
        n({ ok: !0, adapters: await He(), userScriptsAvailable: C() });
        break;
      }
      case "IMPORT_ADAPTER": {
        const r = String(e.sourceCode ?? "");
        ee(r);
        const a = $(r), i = await k(a), s = Date.now();
        await H({
          id: a.id,
          meta: a,
          sourceCode: r,
          enabled: i,
          importedAt: s,
          updatedAt: s
        }), i && await f(), n({ ok: !0, adapter: { meta: a, enabled: i }, permissionGranted: i });
        break;
      }
      case "TOGGLE_ADAPTER": {
        const r = String(e.adapterId), a = !!e.enabled, i = U.get(r);
        if (i) {
          let o = (await u()).enabledBuiltinAdapterIds.filter((d) => d !== r);
          if (a) {
            if (!await k(i.meta)) {
              n({ ok: !1, error: "Site permission was not granted." });
              break;
            }
            o = [...o, r];
          }
          await S({ enabledBuiltinAdapterIds: o }), await f(), n({ ok: !0 });
          break;
        }
        const s = await Ue(r);
        if (!s) {
          n({ ok: !1, error: "Adapter not found." });
          break;
        }
        if (a && !await k(s.meta)) {
          n({ ok: !1, error: "Site permission was not granted." });
          break;
        }
        await H({ ...s, enabled: a, updatedAt: Date.now() }), await f(), n({ ok: !0 });
        break;
      }
      case "REMOVE_ADAPTER": {
        await Oe(String(e.adapterId)), await f(), n({ ok: !0 });
        break;
      }
      case "GET_MAPPINGS": {
        n({ ok: !0, mappings: await Ne() });
        break;
      }
      case "DELETE_MAPPING": {
        await Pe(String(e.key)), n({ ok: !0 });
        break;
      }
      case "GET_SYNC_LOG": {
        n({ ok: !0, entries: await xe(Number(e.limit) || 50) });
        break;
      }
      case "ADAPTER_DETECTED": {
        const r = e.context;
        W(t.tab?.id, String(e.adapterId), r);
        const a = await Re(r), i = typeof t.tab?.id == "number" ? y.get(t.tab.id) : void 0;
        i && (i.resolution = await h(r)), n({ ok: !0, ui: a });
        break;
      }
      case "ADAPTER_READ": {
        const r = e.signal;
        W(t.tab?.id, String(e.adapterId), r.context);
        const a = await Ve(r.context);
        n({ ok: !0, ui: a });
        break;
      }
      case "CHOOSE_MATCH": {
        const r = e.context, a = e.candidate, i = await je(r, a);
        typeof t.tab?.id == "number" && y.set(t.tab.id, {
          adapterId: String(e.adapterId),
          context: r,
          resolution: { state: "mapped", mapping: i }
        }), n({ ok: !0, ui: { state: "mapped", title: i.anilistTitle, mediaId: i.anilistMediaId, confirmed: !0 } });
        break;
      }
      case "CONFIRM_SYNC": {
        const r = await qe(e.context);
        n({ ok: !0, ui: r });
        break;
      }
      case "GET_ADAPTER_SETTINGS": {
        const r = await u();
        n({ ok: !0, result: { syncMode: r.syncMode } });
        break;
      }
      case "GET_KNOWN_MAPPING": {
        const r = await h({
          site: String(e.site),
          siteSeriesId: String(e.siteSeriesId),
          siteSeriesTitle: String(e.siteSeriesTitle),
          chapterUrl: ""
        });
        n({
          ok: !0,
          result: r.state === "mapped" && r.mapping ? { anilistMediaId: r.mapping.anilistMediaId, anilistTitle: r.mapping.anilistTitle } : null
        });
        break;
      }
      case "DEBUG_SYNC_ACTIVE_TAB": {
        const [r] = await chrome.tabs.query({ active: !0, currentWindow: !0 });
        if (!r?.id) {
          n({ ok: !1, error: "No active tab." });
          break;
        }
        const a = y.get(r.id);
        if (!a) {
          n({ ok: !1, error: "No detected chapter on the active tab yet." });
          break;
        }
        const i = await Ge(a.context);
        n({ ok: !0, ui: i });
        break;
      }
      default:
        n({ ok: !1, error: "Unknown message type." });
    }
  } catch (r) {
    n({ ok: !1, error: r instanceof Error ? r.message : String(r) });
  }
})(), !0));
