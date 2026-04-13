(function(){"use strict";const G=`// ==MangaSyncAdapter==
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
      ctx.showStatus({ kind: 'info', message: \`Detected: \${context.siteSeriesTitle}\${context.chapterNumber ? \` · Ch \${context.chapterNumber}\` : ''}\` });
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
`,K="// ==MangaSyncAdapter==",oe="// ==/MangaSyncAdapter==";function ce(e){const t=e.match(/^\/\/\s*@([a-zA-Z]+)\s+(.+)$/);return t?{key:t[1],value:t[2].trim()}:null}function x(e){const t=e.indexOf(K),r=e.indexOf(oe);if(t===-1||r===-1||r<=t)throw new Error("Adapter metadata header is missing or malformed.");const n=e.slice(t+K.length,r).split(`
`).map(T=>T.trim()).filter(Boolean),a={};for(const T of n){const v=ce(T);v&&(a[v.key]??=[],a[v.key].push(v.value))}const i=a.id?.[0],s=a.name?.[0],c=a.version?.[0],o=a.site?.[0],l=a.match??[];if(!i||!/^[a-z0-9_-]{3,64}$/i.test(i))throw new Error("Adapter @id is required and must be 3-64 chars (letters, numbers, _ or -).");if(!s)throw new Error("Adapter @name is required.");if(!c)throw new Error("Adapter @version is required.");if(!o)throw new Error("Adapter @site is required.");if(!l.length)throw new Error("Adapter needs at least one @match pattern.");return{id:i,name:s,version:c,site:o,description:a.description?.[0],matches:l}}function de(e){x(e);const t=[/\beval\s*\(/,/\bnew Function\s*\(/,/chrome\.runtime\.sendNativeMessage/];for(const r of t)if(r.test(e))throw new Error("Adapter contains a disallowed runtime pattern.")}const le="https://graphql.anilist.co",C="extmg.settings",ue=`
  query Viewer {
    Viewer {
      id
      name
      avatar {
        large
      }
    }
  }
`,pe=`
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
`,me=`
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
`,fe=`
  mutation SaveMediaListEntry($mediaId: Int!, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
      id
      progress
      status
      updatedAt
    }
  }
`;async function k(e,t,r){const n=await fetch(le,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",...r?{Authorization:`Bearer ${r}`}:{}},body:JSON.stringify({query:e,variables:t})});if(!n.ok)throw new Error(`AniList request failed (${n.status})`);const a=await n.json();if(a.errors?.length)throw new Error(a.errors[0].message);if(!a.data)throw new Error("AniList returned no data");return a.data}async function he(e){try{return(await k(ue,void 0,e)).Viewer}catch{return null}}async function ge(e){return(await k(pe,{search:e,page:1,perPage:10})).Page.media}async function ye(e,t){return(await k(me,{id:e},t)).Media}async function we(e){return(await k(fe,{mediaId:e.mediaId,progress:e.progress,status:e.status},e.token)).SaveMediaListEntry}function Se(e){switch(e){case"MANGA":return"Manga";case"NOVEL":return"Light Novel";case"ONE_SHOT":return"One Shot";default:return e?e.replace(/_/g," "):"Unknown"}}function be(e){switch(e){case"MANGA":return .08;case"ONE_SHOT":return .04;case"NOVEL":return-.18;default:return 0}}function g(e){return e.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}function Ie(e){return[e.title.userPreferred,e.title.romaji,e.title.english,e.title.native,...e.synonyms??[]].filter(t=>!!t)}function Te(e,t){const r=g(e);let n=0;for(const a of Ie(t)){const i=g(a);if(!i)continue;if(i===r)return 1;if(i.includes(r)||r.includes(i)){n=Math.max(n,.9);continue}const s=new Set(r.split(" ")),c=new Set(i.split(" ")),l=[...s].filter(T=>c.has(T)).length/Math.max(s.size,c.size,1);n=Math.max(n,l)}return n}function ke(e,t){return t.map(r=>{const n=Te(e,r);return{mediaId:r.id,title:r.title.userPreferred??r.title.english??r.title.romaji??r.title.native??`AniList #${r.id}`,chapters:r.chapters??null,format:r.format??null,formatLabel:Se(r.format),score:Math.max(0,Math.min(1,n+be(r.format)))}}).sort((r,n)=>n.score-r.score).slice(0,5)}function Ae(e){if(!e.length)return!1;const[t,r]=e;return t.score>=.995?!0:t.score>=.96&&(!r||t.score-r.score>=.25)}const Ee={authToken:null,viewer:null,syncMode:"ask",enabledBuiltinAdapterIds:[]};async function p(){const e=await chrome.storage.local.get(C);return{...Ee,...e[C]}}async function A(e){const t={...await p(),...e};return await chrome.storage.local.set({[C]:t}),t}async function Me(){return A({authToken:null,viewer:null})}const L=(e,t)=>t.some(r=>e instanceof r);let H,W;function ve(){return H||(H=[IDBDatabase,IDBObjectStore,IDBIndex,IDBCursor,IDBTransaction])}function xe(){return W||(W=[IDBCursor.prototype.advance,IDBCursor.prototype.continue,IDBCursor.prototype.continuePrimaryKey])}const _=new WeakMap,D=new WeakMap,E=new WeakMap;function Ce(e){const t=new Promise((r,n)=>{const a=()=>{e.removeEventListener("success",i),e.removeEventListener("error",s)},i=()=>{r(f(e.result)),a()},s=()=>{n(e.error),a()};e.addEventListener("success",i),e.addEventListener("error",s)});return E.set(t,e),t}function Le(e){if(_.has(e))return;const t=new Promise((r,n)=>{const a=()=>{e.removeEventListener("complete",i),e.removeEventListener("error",s),e.removeEventListener("abort",s)},i=()=>{r(),a()},s=()=>{n(e.error||new DOMException("AbortError","AbortError")),a()};e.addEventListener("complete",i),e.addEventListener("error",s),e.addEventListener("abort",s)});_.set(e,t)}let U={get(e,t,r){if(e instanceof IDBTransaction){if(t==="done")return _.get(e);if(t==="store")return r.objectStoreNames[1]?void 0:r.objectStore(r.objectStoreNames[0])}return f(e[t])},set(e,t,r){return e[t]=r,!0},has(e,t){return e instanceof IDBTransaction&&(t==="done"||t==="store")?!0:t in e}};function Y(e){U=e(U)}function _e(e){return xe().includes(e)?function(...t){return e.apply(N(this),t),f(this.request)}:function(...t){return f(e.apply(N(this),t))}}function De(e){return typeof e=="function"?_e(e):(e instanceof IDBTransaction&&Le(e),L(e,ve())?new Proxy(e,U):e)}function f(e){if(e instanceof IDBRequest)return Ce(e);if(D.has(e))return D.get(e);const t=De(e);return t!==e&&(D.set(e,t),E.set(t,e)),t}const N=e=>E.get(e);function Ue(e,t,{blocked:r,upgrade:n,blocking:a,terminated:i}={}){const s=indexedDB.open(e,t),c=f(s);return n&&s.addEventListener("upgradeneeded",o=>{n(f(s.result),o.oldVersion,o.newVersion,f(s.transaction),o)}),r&&s.addEventListener("blocked",o=>r(o.oldVersion,o.newVersion,o)),c.then(o=>{i&&o.addEventListener("close",()=>i()),a&&o.addEventListener("versionchange",l=>a(l.oldVersion,l.newVersion,l))}).catch(()=>{}),c}const Ne=["get","getKey","getAll","getAllKeys","count"],$e=["put","add","delete","clear"],$=new Map;function Q(e,t){if(!(e instanceof IDBDatabase&&!(t in e)&&typeof t=="string"))return;if($.get(t))return $.get(t);const r=t.replace(/FromIndex$/,""),n=t!==r,a=$e.includes(r);if(!(r in(n?IDBIndex:IDBObjectStore).prototype)||!(a||Ne.includes(r)))return;const i=async function(s,...c){const o=this.transaction(s,a?"readwrite":"readonly");let l=o.store;return n&&(l=l.index(c.shift())),(await Promise.all([l[r](...c),a&&o.done]))[0]};return $.set(t,i),i}Y(e=>({...e,get:(t,r,n)=>Q(t,r)||e.get(t,r,n),has:(t,r)=>!!Q(t,r)||e.has(t,r)}));const Pe=["continue","continuePrimaryKey","advance"],J={},P=new WeakMap,Z=new WeakMap,Re={get(e,t){if(!Pe.includes(t))return e[t];let r=J[t];return r||(r=J[t]=function(...n){P.set(this,Z.get(this)[t](...n))}),r}};async function*Be(...e){let t=this;if(t instanceof IDBCursor||(t=await t.openCursor(...e)),!t)return;t=t;const r=new Proxy(t,Re);for(Z.set(r,t),E.set(r,N(t));t;)yield r,t=await(P.get(r)||t.continue()),P.delete(r)}function X(e,t){return t===Symbol.asyncIterator&&L(e,[IDBIndex,IDBObjectStore,IDBCursor])||t==="iterate"&&L(e,[IDBIndex,IDBObjectStore])}Y(e=>({...e,get(t,r,n){return X(t,r)?Be:e.get(t,r,n)},has(t,r){return X(t,r)||e.has(t,r)}}));const Oe="manga-sync-extension",qe=2;let R=null;function d(){return R||(R=Ue(Oe,qe,{upgrade(e){if(!e.objectStoreNames.contains("seriesMappings")){const t=e.createObjectStore("seriesMappings",{keyPath:"key"});t.createIndex("by-site","site"),t.createIndex("by-siteSeriesId","siteSeriesId")}if(e.objectStoreNames.contains("titleAliases")||e.createObjectStore("titleAliases",{keyPath:"key"}).createIndex("by-site","site"),!e.objectStoreNames.contains("syncLog")){const t=e.createObjectStore("syncLog",{keyPath:"key"});t.createIndex("by-siteSeriesId","siteSeriesId"),t.createIndex("by-syncedAt","syncedAt")}e.objectStoreNames.contains("customAdapters")||e.createObjectStore("customAdapters",{keyPath:"id"}).createIndex("by-enabled","enabled")}})),R}async function ee(e){await(await d()).put("seriesMappings",e)}async function ze(e,t){return(await d()).get("seriesMappings",`${e}|${t}`)}async function Fe(){return(await d()).getAll("seriesMappings")}async function je(e){await(await d()).delete("seriesMappings",e)}async function Ve(e){await(await d()).put("titleAliases",e)}async function Ge(e,t){return(await d()).get("titleAliases",`${e}|${t}`)}async function te(e){await(await d()).put("syncLog",e)}async function Ke(e,t,r){return(await d()).get("syncLog",`${e}|${t}|${r}`)}async function He(e,t,r){await(await d()).delete("syncLog",`${e}|${t}|${r}`)}async function We(e=50){return(await(await d()).getAll("syncLog")).sort((n,a)=>a.syncedAt-n.syncedAt).slice(0,e)}async function re(e){await(await d()).put("customAdapters",e)}async function B(e){return(await d()).get("customAdapters",e)}async function ne(){return(await d()).getAll("customAdapters")}async function Ye(e){await(await d()).delete("customAdapters",e)}function Qe(e){const t=e.trim(),r=g(t),n=[t,t.replace(/\s+-\s+.*$/,"").trim(),t.replace(/\([^)]*\)/g,"").trim(),r.replace(/\b(ch|chapter|capitulo|capítulo)\b.*$/i,"").trim()];return[...new Set(n.filter(a=>a&&a.length>=2))]}async function Je(e){const t=Qe(e);for(const r of t){const n=await ge(r),a=ke(r,n);if(a.length)return a}return[]}async function h(e){const t=await ze(e.site,e.siteSeriesId);if(t)return{state:"mapped",mapping:t};const r=await Ge(e.site,g(e.siteSeriesTitle));if(r){const a={key:`${e.site}|${e.siteSeriesId}`,site:e.site,siteSeriesId:e.siteSeriesId,siteTitle:e.siteSeriesTitle,anilistMediaId:r.anilistMediaId,anilistTitle:r.anilistTitle,confirmedByUser:!1,updatedAt:Date.now()};return await ee(a),{state:"mapped",mapping:a}}const n=await Je(e.siteSeriesTitle);return n.length?Ae(n)?{state:"needs_choice",candidates:n}:{state:"needs_choice",candidates:n}:{state:"unresolved"}}async function Ze(e){if(!(await p()).authToken)return{state:"auth_required"};try{const r=await h(e);if(r.state==="mapped"&&r.mapping)return{state:"mapped",title:r.mapping.anilistTitle,mediaId:r.mapping.anilistMediaId,confirmed:r.mapping.confirmedByUser};if(r.state==="needs_choice")return{state:"needs_choice",candidates:r.candidates??[]}}catch(r){return{state:"invalid",message:r instanceof Error?r.message:String(r)}}return{state:"unresolved"}}async function Xe(e,t){const r={key:`${e.site}|${e.siteSeriesId}`,site:e.site,siteSeriesId:e.siteSeriesId,siteTitle:e.siteSeriesTitle,anilistMediaId:t.mediaId,anilistTitle:t.title,confirmedByUser:!0,updatedAt:Date.now()};return await ee(r),await Ve({key:`${e.site}|${g(e.siteSeriesTitle)}`,site:e.site,normalizedTitle:g(e.siteSeriesTitle),anilistMediaId:t.mediaId,anilistTitle:t.title,updatedAt:Date.now()}),r}function O(e){return typeof e.chapterNumber!="number"||!Number.isInteger(e.chapterNumber)||e.chapterNumber<0?null:e.chapterNumber}async function q(e,t){const r=await p();if(!r.authToken)return{state:"auth_required"};const n=O(e);if(n===null)return{state:"skipped",reason:"Only clean integer chapters are synced in v1."};const a=e.chapterId??String(n);if(await Ke(e.site,e.siteSeriesId,a))return{state:"skipped",reason:"This chapter was already synced."};const s=await ye(t.anilistMediaId,r.authToken);if(!s)return{state:"error",message:"AniList entry could not be loaded."};const c=s.mediaListEntry?.progress??0;if(n<=c)return await te({key:`${e.site}|${e.siteSeriesId}|${a}`,site:e.site,siteSeriesId:e.siteSeriesId,chapterKey:a,chapterNumber:n,chapterUrl:e.chapterUrl,anilistMediaId:t.anilistMediaId,syncedAt:Date.now(),result:"skipped",reason:`Chapter ${n} is not ahead of AniList progress ${c}.`}),{state:"skipped",reason:"AniList progress is already ahead or equal."};const o=await we({token:r.authToken,mediaId:t.anilistMediaId,progress:n,status:s.mediaListEntry?void 0:"CURRENT"});return await te({key:`${e.site}|${e.siteSeriesId}|${a}`,site:e.site,siteSeriesId:e.siteSeriesId,chapterKey:a,chapterNumber:n,chapterUrl:e.chapterUrl,anilistMediaId:t.anilistMediaId,syncedAt:Date.now(),result:"synced"}),{state:"synced",title:t.anilistTitle,progress:o.progress}}async function et(e){const t=await p();if(!t.authToken)return{state:"auth_required"};const r=await h(e);if(r.state==="needs_choice")return{state:"needs_choice",candidates:r.candidates??[]};if(r.state!=="mapped"||!r.mapping)return{state:"error",message:"No AniList match available for this manga yet."};const n=O(e);return n===null?{state:"skipped",reason:"Only clean integer chapters are synced in v1."}:t.syncMode==="manual"?{state:"manual"}:t.syncMode==="ask"?{state:"confirm_sync",title:r.mapping.anilistTitle,chapterNumber:n}:q(e,r.mapping)}async function tt(e){const t=await h(e);return t.state!=="mapped"||!t.mapping?{state:"error",message:"No confirmed AniList mapping available."}:q(e,t.mapping)}async function rt(e){const t=await h(e);if(t.state!=="mapped"||!t.mapping)return{state:"error",message:"No AniList mapping available for debug sync."};const r=O(e);return r===null?{state:"error",message:"Current chapter is not a clean integer."}:(await He(e.site,e.siteSeriesId,e.chapterId??String(r)),q(e,t.mapping))}const w=new Map([["mangadex",{meta:x(G),sourceCode:G,sourceType:"bundled"}]]),m=new Map,z=new Map;let S=null,M=null;function b(){const e=chrome.runtime;return"userScripts"in chrome&&"onUserScriptMessage"in e}function nt(e){return`
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
`}function at(e){return`${nt(e.meta)}
${e.sourceCode}`}async function it(){const e=await p(),t=await ne(),r=[...w.values()].map(a=>({id:a.meta.id,meta:a.meta,enabled:e.enabledBuiltinAdapterIds.includes(a.meta.id),sourceType:"bundled"})),n=t.map(a=>({id:a.id,meta:a.meta,enabled:a.enabled,sourceType:"imported"}));return[...r,...n].sort((a,i)=>a.meta.name.localeCompare(i.meta.name))}async function st(){const e=await p(),r=(await ne()).filter(a=>a.enabled).map(a=>({meta:a.meta,sourceCode:a.sourceCode,sourceType:"imported"}));return[...e.enabledBuiltinAdapterIds.map(a=>w.get(a)).filter(a=>!!a),...r]}async function ot(e){if(!b())return;await chrome.userScripts.configureWorld({messaging:!0});const t=await chrome.userScripts.getScripts();t.length&&await chrome.userScripts.unregister({ids:t.map(r=>r.id)}),e.length&&await chrome.userScripts.register(e.map(r=>({id:r.meta.id,matches:r.meta.matches,js:[{code:at(r)}],runAt:"document_idle",world:"USER_SCRIPT"})))}async function ct(){const e=await st();await ot(e)}async function u(e=!1){if(b())return S&&!e||(S=(async()=>{try{await ct(),M=null}catch(t){throw M=t instanceof Error?t.message:String(t),t}finally{S=null}})()),S}async function F(e){return chrome.permissions.contains({origins:e.matches})}function ae(e,t,r){typeof e=="number"&&m.set(e,{adapterId:t,context:r})}function dt(e){const t=e.replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*");return new RegExp(`^${t}$`)}async function ie(e,t){if(!e)return!1;const r=w.get(t),n=r?void 0:await B(t),a=r?.meta??n?.meta;return a?a.matches.some(i=>dt(i).test(e)):!1}function j(e){const t=e;return t.documentUrl??t.url??t.tab?.pendingUrl??t.tab?.url}function se(e){return e?e.match(/\/chapter\/([^/?#]+)/i)?.[1]??null:null}function I(e,t){const r=se(e),n=se(t);return r&&n?r===n:!!(e&&t&&e===t)}async function V(e,t){if(typeof e=="number"){z.set(e,t);try{await chrome.tabs.sendMessage(e,t)}catch{}}}function y(e){typeof e=="number"&&(m.delete(e),z.delete(e))}async function lt(e,t){const r=String(e.adapterId??"");if(await ie(j(t),r)){if(e.eventType==="show_status"){await V(t.tab?.id,{type:"UI_TOAST",adapterId:r,payload:e.payload});return}if(e.eventType==="chapter_detected"){const n=e.payload;ae(t.tab?.id,r,n);const a=await Ze(n),i=typeof t.tab?.id=="number"?m.get(t.tab.id):void 0;i&&(i.resolution=await h(n)),await V(t.tab?.id,{type:"UI_DETECTION",adapterId:r,context:n,ui:a});return}if(e.eventType==="chapter_read"){const n=e.payload;ae(t.tab?.id,r,n.context);const a=await et(n.context);await V(t.tab?.id,{type:"UI_READ",adapterId:r,context:n.context,ui:a})}}}async function ut(e,t){const r=String(e.adapterId??"");if(!await ie(j(t),r))return{ok:!1,error:"Adapter sender not allowed for this tab."};if(e.method==="get_settings")return{ok:!0,result:{syncMode:(await p()).syncMode}};if(e.method==="get_known_mapping"){const n=await h({site:String(e.params?.site??""),siteSeriesId:String(e.params?.siteSeriesId??""),siteSeriesTitle:String(e.params?.siteSeriesTitle??""),chapterUrl:t.tab?.url??""});return{ok:!0,result:n.state==="mapped"&&n.mapping?{anilistMediaId:n.mapping.anilistMediaId,anilistTitle:n.mapping.anilistTitle}:null}}return{ok:!1,error:"Unknown RPC method."}}chrome.runtime.onInstalled.addListener(()=>{u(!0)}),chrome.runtime.onStartup.addListener(()=>{u(!0)}),chrome.permissions.onAdded?.addListener(()=>{u(!0)}),chrome.permissions.onRemoved?.addListener(()=>{u(!0)}),chrome.tabs.onRemoved.addListener(e=>{y(e)}),chrome.tabs.onUpdated.addListener((e,t,r)=>{const n=t.url??r.url,a=m.get(e);!a||!n||I(a.context.chapterUrl,n)||y(e)}),chrome.webNavigation.onHistoryStateUpdated.addListener(e=>{const t=m.get(e.tabId);t&&(I(t.context.chapterUrl,e.url)||y(e.tabId))}),chrome.webNavigation.onCommitted.addListener(e=>{const t=m.get(e.tabId);t&&(I(t.context.chapterUrl,e.url)||y(e.tabId))}),chrome.runtime.onUserScriptMessage?.addListener((e,t,r)=>((async()=>{try{if(e?.type==="USER_SCRIPT_EVENT"){await lt(e,t),r({ok:!0});return}if(e?.type==="USER_SCRIPT_RPC"){r(await ut(e,t));return}r({ok:!1,error:"Unsupported user script message."})}catch(n){r({ok:!1,error:n instanceof Error?n.message:String(n)})}})(),!0)),chrome.runtime.onMessage.addListener((e,t,r)=>((async()=>{try{switch(e.type){case"GET_STATUS":{await u();const n=await p();let a=[];b()&&(a=(await chrome.userScripts.getScripts()).map(s=>s.id)),r({ok:!0,settings:n,userScriptsAvailable:b(),registeredScriptIds:a,lastRegistrationError:M});break}case"SAVE_AUTH_TOKEN":{const n=await he(String(e.token??"").trim());if(!n){r({ok:!1,error:"Invalid AniList token."});break}const a=await A({authToken:String(e.token).trim(),viewer:n});r({ok:!0,viewer:n,settings:a});break}case"LOGOUT":{const n=await Me();r({ok:!0,settings:n});break}case"UPDATE_SETTINGS":{const n=await A(e.patch??{});r({ok:!0,settings:n});break}case"LIST_ADAPTERS":{await u(),r({ok:!0,adapters:await it(),userScriptsAvailable:b(),lastRegistrationError:M});break}case"IMPORT_ADAPTER":{const n=String(e.sourceCode??"");de(n);const a=x(n);if(w.has(a.id)){r({ok:!1,error:`Adapter id "${a.id}" is reserved by a bundled adapter.`});break}if(await B(a.id)){r({ok:!1,error:`An imported adapter with id "${a.id}" already exists. Remove it first.`});break}const s=!!e.enabled;if(s&&!await F(a)){r({ok:!1,error:"Required site permission is missing."});break}const c=Date.now();await re({id:a.id,meta:a,sourceCode:n,enabled:s,importedAt:c,updatedAt:c}),s&&await u(!0),r({ok:!0,adapter:{meta:a,enabled:s}});break}case"TOGGLE_ADAPTER":{const n=String(e.adapterId),a=!!e.enabled,i=w.get(n);if(i){let o=(await p()).enabledBuiltinAdapterIds.filter(l=>l!==n);if(a){if(!await F(i.meta)){r({ok:!1,error:"Required site permission is missing."});break}o=[...o,n]}await A({enabledBuiltinAdapterIds:o}),await u(!0),r({ok:!0});break}const s=await B(n);if(!s){r({ok:!1,error:"Adapter not found."});break}if(a&&!await F(s.meta)){r({ok:!1,error:"Required site permission is missing."});break}await re({...s,enabled:a,updatedAt:Date.now()}),await u(!0),r({ok:!0});break}case"REMOVE_ADAPTER":{await Ye(String(e.adapterId)),await u(!0),r({ok:!0});break}case"GET_MAPPINGS":{r({ok:!0,mappings:await Fe()});break}case"DELETE_MAPPING":{await je(String(e.key)),r({ok:!0});break}case"GET_SYNC_LOG":{r({ok:!0,entries:await We(Number(e.limit)||50)});break}case"CONTENT_READY":{if(await u(),!t.tab?.id){r({ok:!0});break}const n=j(t),a=m.get(t.tab.id);a&&!I(a.context.chapterUrl,n)&&y(t.tab.id);const i=z.get(t.tab.id);if(!i){r({ok:!0});break}if("context"in i&&!I(i.context?.chapterUrl,n)){y(t.tab.id),r({ok:!0});break}r({ok:!0,message:i});break}case"CHOOSE_MATCH":{const n=e.context,a=e.candidate,i=await Xe(n,a);typeof t.tab?.id=="number"&&m.set(t.tab.id,{adapterId:String(e.adapterId),context:n,resolution:{state:"mapped",mapping:i}}),r({ok:!0,ui:{state:"mapped",title:i.anilistTitle,mediaId:i.anilistMediaId,confirmed:!0}});break}case"CONFIRM_SYNC":{const n=await tt(e.context);r({ok:!0,ui:n});break}case"GET_ADAPTER_SETTINGS":{const n=await p();r({ok:!0,result:{syncMode:n.syncMode}});break}case"GET_KNOWN_MAPPING":{const n=await h({site:String(e.site),siteSeriesId:String(e.siteSeriesId),siteSeriesTitle:String(e.siteSeriesTitle),chapterUrl:""});r({ok:!0,result:n.state==="mapped"&&n.mapping?{anilistMediaId:n.mapping.anilistMediaId,anilistTitle:n.mapping.anilistTitle}:null});break}case"DEBUG_SYNC_ACTIVE_TAB":{const[n]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!n?.id){r({ok:!1,error:"No active tab."});break}const a=m.get(n.id);if(!a){r({ok:!1,error:"No detected chapter on the active tab yet."});break}const i=await rt(a.context);r({ok:!0,ui:i});break}default:r({ok:!1,error:"Unknown message type."})}}catch(n){r({ok:!1,error:n instanceof Error?n.message:String(n)})}})(),!0))})();
