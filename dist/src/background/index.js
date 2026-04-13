(function(){"use strict";const K=`// ==MangaSyncAdapter==
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
        const match = ogTitle.match(/^(.*?)\\s+-\\s+(?:Vol\\.?\\s*[^-]+\\s+-\\s+)?Ch\\.?\\s*[^-]+(?:\\s+-\\s+MangaDex)?$/i);
        if (match?.[1]) return normalize(match[1]);
        return normalize(ogTitle.replace(/\\s*-\\s*MangaDex.*$/i, ''));
      }

      const description = getDescription();
      const descMatch = description.match(/^Read\\s+(.+?)\\s+(?:Vol\\.?\\s*[^\\s]+\\s+)?Ch\\.?\\s*[^\\s]+\\s+on\\s+MangaDex!?$/i);
      return descMatch?.[1] ? normalize(descMatch[1]) : '';
    };

    const parseChapterNumberFromMeta = () => {
      const ogTitle = getOgTitle();
      const description = getDescription();
      const combined = \`\${ogTitle} \${description}\`;
      const match = combined.match(/\\bCh\\.?\\s*([0-9]+)\\b/i);
      return match ? Number.parseInt(match[1], 10) : null;
    };

    const pickTitleLink = () => {
      const links = Array.from(document.querySelectorAll('a[href*="/title/"]'));
      return links.find((link) => {
        const href = link.getAttribute('href') || '';
        const text = normalize(link.textContent);
        return /\\/title\\//.test(href) && UUID_RE.test(href) && text && text.length > 1;
      }) || null;
    };

    const extract = () => {
      const url = location.href;
      const path = location.pathname;
      const chapterId =
        (path.match(/\\/chapter\\/([^/?#]+)/i) || [])[1] ||
        (url.match(/\\/chapter\\/([^/?#]+)/i) || [])[1];
      if (!chapterId) return null;

      const titleLink = pickTitleLink();
      const titleHref = titleLink ? titleLink.getAttribute('href') || '' : '';
      const titleFromMeta = parseSeriesTitleFromMeta();
      const description = getDescription();
      const descriptionFallbackTitle = normalize(description.replace(/^Read\\s+/i, '').replace(/\\s+(?:Vol\\.?\\s*[^\\s]+\\s+)?Ch\\.?\\s*[^\\s]+\\s+on\\s+MangaDex!?$/i, ''));
      const fallbackTitle = titleFromMeta || descriptionFallbackTitle;
      const siteSeriesId =
        (titleHref.match(/\\/title\\/([a-f0-9-]+)/i) || [])[1] ||
        (fallbackTitle ? \`title:\${normalizeKey(fallbackTitle)}\` : \`chapter:\${chapterId}\`);
      const siteSeriesTitle =
        fallbackTitle ||
        normalize(document.querySelector('main a[href*="/title/"] span')?.textContent) ||
        normalize(titleLink && titleLink.textContent) ||
        descriptionFallbackTitle ||
        (document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').replace(/\\s*-\\s*MangaDex.*$/i, '') ||
        document.title.replace(/\\s*-\\s*MangaDex.*$/i, '').trim();

      const candidateTexts = [
        document.querySelector('h1')?.textContent,
        document.querySelector('h2')?.textContent,
        document.querySelector('[data-testid="breadcrumb-title"]')?.textContent,
        document.querySelector('[class*="chapter"]')?.textContent,
        document.title,
      ].filter(Boolean);

      const chapterText = candidateTexts.join(' ');
      const numberMatch = chapterText.match(/(?:chapter|ch\\.?|cap[ií]tulo)\\s*([0-9]+)/i);
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

    const detect = () => {
      const context = extract();
      if (!context) return false;
      if (!context.siteSeriesTitle || context.siteSeriesTitle === 'Unknown title') return false;
      const nextKey = \`\${context.siteSeriesId}:\${context.chapterId ?? context.chapterUrl}\`;
      if (nextKey === currentKey) return true;
      currentKey = nextKey;
      currentChapterRef = context.chapterId || context.chapterUrl;
      readSentFor = '';
      ctx.emitDetected(context);
      ctx.whenRead({ minSeconds: 15, minScrollPercent: 85 }, () => {
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
      currentKey = '';
      currentChapterRef = '';
      readSentFor = '';
      if (!detect()) scheduleRetries();
    }, 300));
    new MutationObserver(() => detect() || undefined).observe(document.documentElement, {
      subtree: true,
      childList: true,
    });
    window.addEventListener('load', () => {
      if (!detect()) scheduleRetries();
    }, { once: true });
  },
});
`,H="// ==MangaSyncAdapter==",le="// ==/MangaSyncAdapter==";function ue(e){const t=e.match(/^\/\/\s*@([a-zA-Z]+)\s+(.+)$/);return t?{key:t[1],value:t[2].trim()}:null}function _(e){const t=e.indexOf(H),n=e.indexOf(le);if(t===-1||n===-1||n<=t)throw new Error("Adapter metadata header is missing or malformed.");const r=e.slice(t+H.length,n).split(`
`).map(A=>A.trim()).filter(Boolean),a={};for(const A of r){const C=ue(A);C&&(a[C.key]??=[],a[C.key].push(C.value))}const i=a.id?.[0],s=a.name?.[0],o=a.version?.[0],c=a.site?.[0],l=a.match??[];if(!i||!/^[a-z0-9_-]{3,64}$/i.test(i))throw new Error("Adapter @id is required and must be 3-64 chars (letters, numbers, _ or -).");if(!s)throw new Error("Adapter @name is required.");if(!o)throw new Error("Adapter @version is required.");if(!c)throw new Error("Adapter @site is required.");if(!l.length)throw new Error("Adapter needs at least one @match pattern.");return{id:i,name:s,version:o,site:c,description:a.description?.[0],matches:l}}function pe(e){_(e);const t=[/\beval\s*\(/,/\bnew Function\s*\(/,/chrome\.runtime\.sendNativeMessage/];for(const n of t)if(n.test(e))throw new Error("Adapter contains a disallowed runtime pattern.")}const me="https://graphql.anilist.co",L="extmg.settings",fe=`
  query Viewer {
    Viewer {
      id
      name
      avatar {
        large
      }
    }
  }
`,he=`
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
`,ge=`
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
`,ye=`
  mutation SaveMediaListEntry($mediaId: Int!, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
      id
      progress
      status
      updatedAt
    }
  }
`;async function E(e,t,n){const r=await fetch(me,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",...n?{Authorization:`Bearer ${n}`}:{}},body:JSON.stringify({query:e,variables:t})});if(!r.ok)throw new Error(`AniList request failed (${r.status})`);const a=await r.json();if(a.errors?.length)throw new Error(a.errors[0].message);if(!a.data)throw new Error("AniList returned no data");return a.data}async function we(e){try{return(await E(fe,void 0,e)).Viewer}catch{return null}}async function Se(e){return(await E(he,{search:e,page:1,perPage:10})).Page.media}async function be(e,t){return(await E(ge,{id:e},t)).Media}async function Ie(e){return(await E(ye,{mediaId:e.mediaId,progress:e.progress,status:e.status},e.token)).SaveMediaListEntry}function Te(e){switch(e){case"MANGA":return"Manga";case"NOVEL":return"Light Novel";case"ONE_SHOT":return"One Shot";default:return e?e.replace(/_/g," "):"Unknown"}}function ke(e){switch(e){case"MANGA":return .08;case"ONE_SHOT":return .04;case"NOVEL":return-.18;default:return 0}}function g(e){return e.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function Ae(e){return[e.title.userPreferred,e.title.romaji,e.title.english,e.title.native,...e.synonyms??[]].filter(t=>!!t)}function Ee(e,t){const n=g(e);let r=0;for(const a of Ae(t)){const i=g(a);if(!i)continue;if(i===n)return 1;if(i.includes(n)||n.includes(i)){r=Math.max(r,.9);continue}const s=new Set(n.split(" ")),o=new Set(i.split(" ")),l=[...s].filter(A=>o.has(A)).length/Math.max(s.size,o.size,1);r=Math.max(r,l)}return r}function Me(e,t){return t.map(n=>{const r=Ee(e,n);return{mediaId:n.id,title:n.title.userPreferred??n.title.english??n.title.romaji??n.title.native??`AniList #${n.id}`,chapters:n.chapters??null,format:n.format??null,formatLabel:Te(n.format),score:Math.max(0,Math.min(1,r+ke(n.format)))}}).sort((n,r)=>r.score-n.score).slice(0,5)}function ve(e){if(!e.length)return!1;const[t,n]=e;return t.score>=.995?!0:t.score>=.96&&(!n||t.score-n.score>=.25)}const xe={authToken:null,viewer:null,syncMode:"ask",enabledBuiltinAdapterIds:[]};async function p(){const e=await chrome.storage.local.get(L);return{...xe,...e[L]}}async function M(e){const t={...await p(),...e};return await chrome.storage.local.set({[L]:t}),t}async function Ce(){return M({authToken:null,viewer:null})}const D=(e,t)=>t.some(n=>e instanceof n);let W,Y;function _e(){return W||(W=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function Le(){return Y||(Y=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const U=new WeakMap,N=new WeakMap,v=new WeakMap;function De(e){const t=new Promise((n,r)=>{const a=()=>{e.removeEventListener("success",i),e.removeEventListener("error",s)},i=()=>{n(f(e.result)),a()},s=()=>{r(e.error),a()};e.addEventListener("success",i),e.addEventListener("error",s)});return v.set(t,e),t}function Ue(e){if(U.has(e))return;const t=new Promise((n,r)=>{const a=()=>{e.removeEventListener("complete",i),e.removeEventListener("error",s),e.removeEventListener("abort",s)},i=()=>{n(),a()},s=()=>{r(e.error||new DOMException("AbortError","AbortError")),a()};e.addEventListener("complete",i),e.addEventListener("error",s),e.addEventListener("abort",s)});U.set(e,t)}let P={get(e,t,n){if(e instanceof IDBTransaction){if(t==="done")return U.get(e);if(t==="store")return n.objectStoreNames[1]?void 0:n.objectStore(n.objectStoreNames[0])}return f(e[t])},set(e,t,n){return e[t]=n,!0},has(e,t){return e instanceof IDBTransaction&&(t==="done"||t==="store")?!0:t in e}};function Q(e){P=e(P)}function Ne(e){return Le().includes(e)?function(...t){return e.apply($(this),t),f(this.request)}:function(...t){return f(e.apply($(this),t))}}function Pe(e){return typeof e=="function"?Ne(e):(e instanceof IDBTransaction&&Ue(e),D(e,_e())?new Proxy(e,P):e)}function f(e){if(e instanceof IDBRequest)return De(e);if(N.has(e))return N.get(e);const t=Pe(e);return t!==e&&(N.set(e,t),v.set(t,e)),t}const $=e=>v.get(e);function $e(e,t,{blocked:n,upgrade:r,blocking:a,terminated:i}={}){const s=indexedDB.open(e,t),o=f(s);return r&&s.addEventListener("upgradeneeded",c=>{r(f(s.result),c.oldVersion,c.newVersion,f(s.transaction),c)}),n&&s.addEventListener("blocked",c=>n(c.oldVersion,c.newVersion,c)),o.then(c=>{i&&c.addEventListener("close",()=>i()),a&&c.addEventListener("versionchange",l=>a(l.oldVersion,l.newVersion,l))}).catch(()=>{}),o}const Re=["get","getKey","getAll","getAllKeys","count"],Be=["put","add","delete","clear"],R=new Map;function J(e,t){if(!(e instanceof IDBDatabase&&!(t in e)&&typeof t=="string"))return;if(R.get(t))return R.get(t);const n=t.replace(/FromIndex$/,""),r=t!==n,a=Be.includes(n);if(!(n in(r?IDBIndex:IDBObjectStore).prototype)||!(a||Re.includes(n)))return;const i=async function(s,...o){const c=this.transaction(s,a?"readwrite":"readonly");let l=c.store;return r&&(l=l.index(o.shift())),(await Promise.all([l[n](...o),a&&c.done]))[0]};return R.set(t,i),i}Q(e=>({...e,get:(t,n,r)=>J(t,n)||e.get(t,n,r),has:(t,n)=>!!J(t,n)||e.has(t,n)}));const Oe=["continue","continuePrimaryKey","advance"],Z={},B=new WeakMap,X=new WeakMap,qe={get(e,t){if(!Oe.includes(t))return e[t];let n=Z[t];return n||(n=Z[t]=function(...r){B.set(this,X.get(this)[t](...r))}),n}};async function*ze(...e){let t=this;if(t instanceof IDBCursor||(t=await t.openCursor(...e)),!t)return;t=t;const n=new Proxy(t,qe);for(X.set(n,t),v.set(n,$(t));t;)yield n,t=await(B.get(n)||t.continue()),B.delete(n)}function ee(e,t){return t===Symbol.asyncIterator&&D(e,[IDBIndex,IDBObjectStore,IDBCursor])||t==="iterate"&&D(e,[IDBIndex,IDBObjectStore])}Q(e=>({...e,get(t,n,r){return ee(t,n)?ze:e.get(t,n,r)},has(t,n){return ee(t,n)||e.has(t,n)}}));const Fe="manga-sync-extension",je=2;let O=null;function d(){return O||(O=$e(Fe,je,{upgrade(e){if(!e.objectStoreNames.contains("seriesMappings")){const t=e.createObjectStore("seriesMappings",{keyPath:"key"});t.createIndex("by-site","site"),t.createIndex("by-siteSeriesId","siteSeriesId")}if(e.objectStoreNames.contains("titleAliases")||e.createObjectStore("titleAliases",{keyPath:"key"}).createIndex("by-site","site"),!e.objectStoreNames.contains("syncLog")){const t=e.createObjectStore("syncLog",{keyPath:"key"});t.createIndex("by-siteSeriesId","siteSeriesId"),t.createIndex("by-syncedAt","syncedAt")}e.objectStoreNames.contains("customAdapters")||e.createObjectStore("customAdapters",{keyPath:"id"}).createIndex("by-enabled","enabled")}})),O}async function te(e){await(await d()).put("seriesMappings",e)}async function Ve(e,t){return(await d()).get("seriesMappings",`${e}|${t}`)}async function Ge(){return(await d()).getAll("seriesMappings")}async function Ke(e){await(await d()).delete("seriesMappings",e)}async function He(e){await(await d()).put("titleAliases",e)}async function We(e,t){return(await d()).get("titleAliases",`${e}|${t}`)}async function ne(e){await(await d()).put("syncLog",e)}async function Ye(e,t,n){return(await d()).get("syncLog",`${e}|${t}|${n}`)}async function Qe(e,t,n){await(await d()).delete("syncLog",`${e}|${t}|${n}`)}async function Je(e=50){return(await(await d()).getAll("syncLog")).sort((r,a)=>a.syncedAt-r.syncedAt).slice(0,e)}async function re(e){await(await d()).put("customAdapters",e)}async function q(e){return(await d()).get("customAdapters",e)}async function ae(){return(await d()).getAll("customAdapters")}async function Ze(e){await(await d()).delete("customAdapters",e)}function Xe(e){const t=e.trim(),n=g(t),r=[t,t.replace(/\s+-\s+.*$/,"").trim(),t.replace(/\([^)]*\)/g,"").trim(),n.replace(/\b(ch|chapter|capitulo|capítulo)\b.*$/i,"").trim()];return[...new Set(r.filter(a=>a&&a.length>=2))]}async function et(e){const t=Xe(e);for(const n of t){const r=await Se(n),a=Me(n,r);if(a.length)return a}return[]}async function h(e){const t=await Ve(e.site,e.siteSeriesId);if(t)return{state:"mapped",mapping:t};const n=await We(e.site,g(e.siteSeriesTitle));if(n){const a={key:`${e.site}|${e.siteSeriesId}`,site:e.site,siteSeriesId:e.siteSeriesId,siteTitle:e.siteSeriesTitle,anilistMediaId:n.anilistMediaId,anilistTitle:n.anilistTitle,confirmedByUser:!1,updatedAt:Date.now()};return await te(a),{state:"mapped",mapping:a}}const r=await et(e.siteSeriesTitle);return r.length?ve(r)?{state:"needs_choice",candidates:r}:{state:"needs_choice",candidates:r}:{state:"unresolved"}}async function ie(e){if(!(await p()).authToken)return{state:"auth_required"};try{const n=await h(e);if(n.state==="mapped"&&n.mapping)return{state:"mapped",title:n.mapping.anilistTitle,mediaId:n.mapping.anilistMediaId,confirmed:n.mapping.confirmedByUser};if(n.state==="needs_choice")return{state:"needs_choice",candidates:n.candidates??[]}}catch(n){return{state:"invalid",message:n instanceof Error?n.message:String(n)}}return{state:"unresolved"}}async function tt(e,t){const n={key:`${e.site}|${e.siteSeriesId}`,site:e.site,siteSeriesId:e.siteSeriesId,siteTitle:e.siteSeriesTitle,anilistMediaId:t.mediaId,anilistTitle:t.title,confirmedByUser:!0,updatedAt:Date.now()};return await te(n),await He({key:`${e.site}|${g(e.siteSeriesTitle)}`,site:e.site,normalizedTitle:g(e.siteSeriesTitle),anilistMediaId:t.mediaId,anilistTitle:t.title,updatedAt:Date.now()}),n}function z(e){return typeof e.chapterNumber!="number"||!Number.isInteger(e.chapterNumber)||e.chapterNumber<0?null:e.chapterNumber}async function F(e,t){const n=await p();if(!n.authToken)return{state:"auth_required"};const r=z(e);if(r===null)return{state:"skipped",reason:"Only clean integer chapters are synced in v1."};const a=e.chapterId??String(r);if(await Ye(e.site,e.siteSeriesId,a))return{state:"skipped",reason:"This chapter was already synced."};const s=await be(t.anilistMediaId,n.authToken);if(!s)return{state:"error",message:"AniList entry could not be loaded."};const o=s.mediaListEntry?.progress??0;if(r<=o)return await ne({key:`${e.site}|${e.siteSeriesId}|${a}`,site:e.site,siteSeriesId:e.siteSeriesId,chapterKey:a,chapterNumber:r,chapterUrl:e.chapterUrl,anilistMediaId:t.anilistMediaId,syncedAt:Date.now(),result:"skipped",reason:`Chapter ${r} is not ahead of AniList progress ${o}.`}),{state:"skipped",reason:"AniList progress is already ahead or equal."};const c=await Ie({token:n.authToken,mediaId:t.anilistMediaId,progress:r,status:s.mediaListEntry?void 0:"CURRENT"});return await ne({key:`${e.site}|${e.siteSeriesId}|${a}`,site:e.site,siteSeriesId:e.siteSeriesId,chapterKey:a,chapterNumber:r,chapterUrl:e.chapterUrl,anilistMediaId:t.anilistMediaId,syncedAt:Date.now(),result:"synced"}),{state:"synced",title:t.anilistTitle,progress:c.progress}}async function nt(e){const t=await p();if(!t.authToken)return{state:"auth_required"};const n=await h(e);if(n.state==="needs_choice")return{state:"needs_choice",candidates:n.candidates??[]};if(n.state!=="mapped"||!n.mapping)return{state:"error",message:"No AniList match available for this manga yet."};const r=z(e);return r===null?{state:"skipped",reason:"Only clean integer chapters are synced in v1."}:t.syncMode==="manual"?{state:"manual"}:t.syncMode==="ask"?{state:"confirm_sync",title:n.mapping.anilistTitle,chapterNumber:r}:F(e,n.mapping)}async function rt(e){const t=await h(e);return t.state!=="mapped"||!t.mapping?{state:"error",message:"No confirmed AniList mapping available."}:F(e,t.mapping)}async function at(e){const t=await h(e);if(t.state!=="mapped"||!t.mapping)return{state:"error",message:"No AniList mapping available for debug sync."};const n=z(e);return n===null?{state:"error",message:"Current chapter is not a clean integer."}:(await Qe(e.site,e.siteSeriesId,e.chapterId??String(n)),F(e,t.mapping))}const w=new Map([["mangadex",{meta:_(K),sourceCode:K,sourceType:"bundled"}]]),m=new Map,S=new Map,b=new Set;let I=null,x=null;function T(){const e=chrome.runtime;return"userScripts"in chrome&&"onUserScriptMessage"in e}function it(e){return`
(() => {
  const meta = ${JSON.stringify(e)};
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
`}function st(e){return`${it(e.meta)}
${e.sourceCode}`}async function ot(){const e=await p(),t=await ae(),n=[...w.values()].map(a=>({id:a.meta.id,meta:a.meta,enabled:e.enabledBuiltinAdapterIds.includes(a.meta.id),sourceType:"bundled"})),r=t.map(a=>({id:a.id,meta:a.meta,enabled:a.enabled,sourceType:"imported"}));return[...n,...r].sort((a,i)=>a.meta.name.localeCompare(i.meta.name))}async function ct(){const e=await p(),n=(await ae()).filter(a=>a.enabled).map(a=>({meta:a.meta,sourceCode:a.sourceCode,sourceType:"imported"}));return[...e.enabledBuiltinAdapterIds.map(a=>w.get(a)).filter(a=>!!a),...n]}async function dt(e){if(!T())return;await chrome.userScripts.configureWorld({messaging:!0});const t=await chrome.userScripts.getScripts();t.length&&await chrome.userScripts.unregister({ids:t.map(n=>n.id)}),e.length&&await chrome.userScripts.register(e.map(n=>({id:n.meta.id,matches:n.meta.matches,js:[{code:st(n)}],runAt:"document_idle",world:"USER_SCRIPT"})))}async function lt(){const e=await ct();await dt(e)}async function u(e=!1){if(T())return I&&!e||(I=(async()=>{try{await lt(),x=null}catch(t){throw x=t instanceof Error?t.message:String(t),t}finally{I=null}})()),I}async function j(e){return chrome.permissions.contains({origins:e.matches})}function se(e,t,n){typeof e=="number"&&m.set(e,{adapterId:t,context:n})}function ut(e){const t=e.replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*");return new RegExp(`^${t}$`)}async function oe(e,t){if(!e)return!1;const n=w.get(t),r=n?void 0:await q(t),a=n?.meta??r?.meta;return a?a.matches.some(i=>ut(i).test(e)):!1}function V(e){const t=e;return t.documentUrl??t.url??t.tab?.pendingUrl??t.tab?.url}function ce(e){return e?e.match(/\/chapter\/([^/?#]+)/i)?.[1]??null:null}function y(e,t){const n=ce(e),r=ce(t);return n&&r?n===r:!!(e&&t&&e===t)}function de(e,t){const n=S.get(e)??[];n.push(t),S.set(e,n.slice(-10))}async function G(e,t){if(typeof e=="number"){if(!b.has(e)){de(e,t);return}try{await chrome.tabs.sendMessage(e,t)}catch{b.delete(e),de(e,t)}}}function k(e){typeof e=="number"&&(m.delete(e),S.delete(e),b.delete(e))}async function pt(e,t){const n=String(e.adapterId??"");if(await oe(V(t),n)){if(e.eventType==="show_status"){await G(t.tab?.id,{type:"UI_TOAST",adapterId:n,payload:e.payload});return}if(e.eventType==="chapter_detected"){const r=e.payload;se(t.tab?.id,n,r);const a=await ie(r),i=typeof t.tab?.id=="number"?m.get(t.tab.id):void 0;i&&(i.resolution=await h(r)),await G(t.tab?.id,{type:"UI_DETECTION",adapterId:n,context:r,ui:a});return}if(e.eventType==="chapter_read"){const r=e.payload;se(t.tab?.id,n,r.context);const a=await nt(r.context);await G(t.tab?.id,{type:"UI_READ",adapterId:n,context:r.context,ui:a})}}}async function mt(e,t){const n=String(e.adapterId??"");if(!await oe(V(t),n))return{ok:!1,error:"Adapter sender not allowed for this tab."};if(e.method==="get_settings")return{ok:!0,result:{syncMode:(await p()).syncMode}};if(e.method==="get_known_mapping"){const r=await h({site:String(e.params?.site??""),siteSeriesId:String(e.params?.siteSeriesId??""),siteSeriesTitle:String(e.params?.siteSeriesTitle??""),chapterUrl:t.tab?.url??""});return{ok:!0,result:r.state==="mapped"&&r.mapping?{anilistMediaId:r.mapping.anilistMediaId,anilistTitle:r.mapping.anilistTitle}:null}}return{ok:!1,error:"Unknown RPC method."}}chrome.runtime.onInstalled.addListener(()=>{u(!0)}),chrome.runtime.onStartup.addListener(()=>{u(!0)}),chrome.permissions.onAdded?.addListener(()=>{u(!0)}),chrome.permissions.onRemoved?.addListener(()=>{u(!0)}),chrome.tabs.onRemoved.addListener(e=>{k(e)}),chrome.tabs.onUpdated.addListener((e,t,n)=>{const r=t.url??n.url,a=m.get(e);!a||!r||y(a.context.chapterUrl,r)||k(e)}),chrome.webNavigation.onHistoryStateUpdated.addListener(e=>{const t=m.get(e.tabId);t&&(y(t.context.chapterUrl,e.url)||k(e.tabId))}),chrome.webNavigation.onCommitted.addListener(e=>{const t=m.get(e.tabId);t&&(y(t.context.chapterUrl,e.url)||k(e.tabId))}),chrome.runtime.onUserScriptMessage?.addListener((e,t,n)=>((async()=>{try{if(e?.type==="USER_SCRIPT_EVENT"){await pt(e,t),n({ok:!0});return}if(e?.type==="USER_SCRIPT_RPC"){n(await mt(e,t));return}n({ok:!1,error:"Unsupported user script message."})}catch(r){n({ok:!1,error:r instanceof Error?r.message:String(r)})}})(),!0)),chrome.runtime.onMessage.addListener((e,t,n)=>((async()=>{try{switch(e.type){case"GET_STATUS":{await u();const r=await p();let a=[];T()&&(a=(await chrome.userScripts.getScripts()).map(s=>s.id)),n({ok:!0,settings:r,userScriptsAvailable:T(),registeredScriptIds:a,lastRegistrationError:x});break}case"SAVE_AUTH_TOKEN":{const r=await we(String(e.token??"").trim());if(!r){n({ok:!1,error:"Invalid AniList token."});break}const a=await M({authToken:String(e.token).trim(),viewer:r});n({ok:!0,viewer:r,settings:a});break}case"LOGOUT":{const r=await Ce();n({ok:!0,settings:r});break}case"UPDATE_SETTINGS":{const r=await M(e.patch??{});n({ok:!0,settings:r});break}case"LIST_ADAPTERS":{await u(),n({ok:!0,adapters:await ot(),userScriptsAvailable:T(),lastRegistrationError:x});break}case"IMPORT_ADAPTER":{const r=String(e.sourceCode??"");pe(r);const a=_(r);if(w.has(a.id)){n({ok:!1,error:`Adapter id "${a.id}" is reserved by a bundled adapter.`});break}if(await q(a.id)){n({ok:!1,error:`An imported adapter with id "${a.id}" already exists. Remove it first.`});break}const s=!!e.enabled;if(s&&!await j(a)){n({ok:!1,error:"Required site permission is missing."});break}const o=Date.now();await re({id:a.id,meta:a,sourceCode:r,enabled:s,importedAt:o,updatedAt:o}),s&&await u(!0),n({ok:!0,adapter:{meta:a,enabled:s}});break}case"TOGGLE_ADAPTER":{const r=String(e.adapterId),a=!!e.enabled,i=w.get(r);if(i){let c=(await p()).enabledBuiltinAdapterIds.filter(l=>l!==r);if(a){if(!await j(i.meta)){n({ok:!1,error:"Required site permission is missing."});break}c=[...c,r]}await M({enabledBuiltinAdapterIds:c}),await u(!0),n({ok:!0});break}const s=await q(r);if(!s){n({ok:!1,error:"Adapter not found."});break}if(a&&!await j(s.meta)){n({ok:!1,error:"Required site permission is missing."});break}await re({...s,enabled:a,updatedAt:Date.now()}),await u(!0),n({ok:!0});break}case"REMOVE_ADAPTER":{await Ze(String(e.adapterId)),await u(!0),n({ok:!0});break}case"GET_MAPPINGS":{n({ok:!0,mappings:await Ge()});break}case"DELETE_MAPPING":{await Ke(String(e.key)),n({ok:!0});break}case"GET_SYNC_LOG":{n({ok:!0,entries:await Je(Number(e.limit)||50)});break}case"CONTENT_READY":{if(await u(),!t.tab?.id){n({ok:!0});break}b.add(t.tab.id);const r=V(t),a=m.get(t.tab.id);a&&!y(a.context.chapterUrl,r)&&(k(t.tab.id),b.add(t.tab.id));let s=(S.get(t.tab.id)??[]).filter(o=>"context"in o?y(o.context?.chapterUrl,r):!0);if(!s.length&&a&&y(a.context.chapterUrl,r)){const o=await ie(a.context);s=[{type:"UI_DETECTION",adapterId:a.adapterId,context:a.context,ui:o}]}if(!s.length){n({ok:!0,messages:[]});break}S.delete(t.tab.id),n({ok:!0,messages:s});break}case"CHOOSE_MATCH":{const r=e.context,a=e.candidate,i=await tt(r,a);typeof t.tab?.id=="number"&&m.set(t.tab.id,{adapterId:String(e.adapterId),context:r,resolution:{state:"mapped",mapping:i}}),n({ok:!0,ui:{state:"mapped",title:i.anilistTitle,mediaId:i.anilistMediaId,confirmed:!0}});break}case"CONFIRM_SYNC":{const r=await rt(e.context);n({ok:!0,ui:r});break}case"GET_ADAPTER_SETTINGS":{const r=await p();n({ok:!0,result:{syncMode:r.syncMode}});break}case"GET_KNOWN_MAPPING":{const r=await h({site:String(e.site),siteSeriesId:String(e.siteSeriesId),siteSeriesTitle:String(e.siteSeriesTitle),chapterUrl:""});n({ok:!0,result:r.state==="mapped"&&r.mapping?{anilistMediaId:r.mapping.anilistMediaId,anilistTitle:r.mapping.anilistTitle}:null});break}case"DEBUG_SYNC_ACTIVE_TAB":{const[r]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!r?.id){n({ok:!1,error:"No active tab."});break}const a=m.get(r.id);if(!a){n({ok:!1,error:"No detected chapter on the active tab yet."});break}const i=await at(a.context);n({ok:!0,ui:i});break}default:n({ok:!1,error:"Unknown message type."})}}catch(r){n({ok:!1,error:r instanceof Error?r.message:String(r)})}})(),!0))})();
