(function(){"use strict";if(!window.__extmgBridgeActive){let v=function(){return d||(d=document.createElement("div"),d.style.cssText=["position:fixed","right:16px","bottom:16px","z-index:2147483647","max-width:360px","padding:12px 14px","border-radius:10px","background:#111827","color:#fff","font:13px/1.4 system-ui,sans-serif","box-shadow:0 12px 32px rgba(0,0,0,.35)","display:none"].join(";"),document.documentElement.appendChild(d),d)},i=function(e,t="info",r=2600){const o=v(),p=t==="success"?"#22c55e":t==="error"?"#ef4444":"#60a5fa";o.style.display="block",o.style.borderLeft=`4px solid ${p}`,o.textContent=e,window.setTimeout(()=>{d===o&&(o.style.display="none")},r)},a=function(){u?.remove(),u=null},l=function(e){a();const t=document.createElement("div");return t.innerHTML=`
      <div data-extmg-backdrop style="position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.45)"></div>
      <div data-extmg-card style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483646;width:min(92vw,420px);background:#111827;color:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);font:14px/1.45 system-ui,sans-serif;overflow:hidden">
        ${e}
      </div>
    `,u=t,t.addEventListener("click",r=>{r.target.dataset.extmgBackdrop!==void 0&&a()}),document.documentElement.appendChild(t),t},f=function(e,t){return`
      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">
        <div style="font-size:16px;font-weight:700">${s(e)}</div>
        ${t?`<div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:13px">${s(t)}</div>`:""}
      </div>
    `},c=function(e,t=""){return`<button ${t} style="appearance:none;border:none;border-radius:10px;padding:10px 12px;background:#374151;color:#fff;cursor:pointer;font:600 13px system-ui,sans-serif">${s(e)}</button>`},k=function(e){if(!e.formatLabel)return"";const t=e.format==="NOVEL"?"rgba(249,115,22,.18)":e.format==="MANGA"?"rgba(34,197,94,.18)":"rgba(96,165,250,.18)",r=e.format==="NOVEL"?"#fdba74":e.format==="MANGA"?"#86efac":"#93c5fd";return`<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:${t};color:${r};font-size:11px;font-weight:700">${s(e.formatLabel)}</span>`},y=function(e){n.pendingCandidates=e;const t=l(`
      ${f("Choose AniList manga",n.context?.siteSeriesTitle)}
      <div style="padding:16px 18px;display:grid;gap:10px">
        ${e.map((r,o)=>`
              <button data-choice="${o}" style="text-align:left;appearance:none;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#1f2937;color:#fff;padding:12px;cursor:pointer">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <div style="font-weight:700">${s(r.title)}</div>
                  ${k(r)}
                </div>
                <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">Match score ${(r.score*100).toFixed(0)}%${r.chapters?` · ${r.chapters} chapters`:""}</div>
              </button>
            `).join("")}
      </div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${c("Dismiss",'data-dismiss="1"')}</div>
    `);t.querySelectorAll("[data-choice]").forEach(r=>{r.addEventListener("click",async()=>{const o=Number(r.dataset.choice),p=n.pendingCandidates?.[o];if(!p||!n.context||!n.adapterId)return;const x=await chrome.runtime.sendMessage({type:"CHOOSE_MATCH",adapterId:n.adapterId,context:n.context,candidate:p});if(!x?.ok){i(x?.error||"Could not save mapping.","error");return}a(),i(`Mapped to ${x.ui.title}`,"success"),n.pendingSync&&(n.pendingSync=!1,await h())})}),t.querySelector('[data-dismiss="1"]')?.addEventListener("click",a)},w=function(e,t){const r=l(`
      ${f("Sync this chapter?",e)}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Chapter ${t} is ready to sync to AniList.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end;gap:10px">
        ${c("Skip",'data-skip="1"')}
        ${c("Sync now",'data-confirm="1"')}
      </div>
    `);r.querySelector('[data-skip="1"]')?.addEventListener("click",()=>{n.pendingSync=!1,a(),i("Sync skipped.","info")}),r.querySelector('[data-confirm="1"]')?.addEventListener("click",()=>{h()})},g=function(){l(`
      ${f("AniList login required")}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Open the extension options page, log into AniList with the pin flow, then return to this tab.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${c("Close",'data-close="1"')}</div>
    `).querySelector('[data-close="1"]')?.addEventListener("click",a)},$=function(e){switch(e?.state){case"auth_required":g();break;case"mapped":a(),i(`Matched AniList: ${e.title}`,"success");break;case"needs_choice":y(e.candidates||[]);break;case"unresolved":i("No AniList match found yet.","error",4e3);break;case"invalid":i(e.message,"error",4e3);break}},b=function(e){switch(e?.state){case"auth_required":g();break;case"needs_choice":n.pendingSync=!0,y(e.candidates||[]);break;case"manual":i("Manual mode enabled. Use the options page debug button to sync.","info",4500);break;case"confirm_sync":w(e.title,e.chapterNumber);break;case"synced":i(`Synced chapter on AniList: ${e.title}`,"success",3200);break;case"skipped":i(e.reason,"info",4e3);break;case"error":i(e.message,"error",4500);break}},s=function(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML},m=function(e){if(!(!e||typeof e!="object")){if(e.type==="UI_TOAST"){const t=e.payload;i(t.message,t.kind??"info");return}if(e.type==="UI_DETECTION"){n.adapterId=e.adapterId,n.context=e.context,$(e.ui);return}e.type==="UI_READ"&&(n.adapterId=e.adapterId,n.context=e.context,b(e.ui))}};window.__extmgBridgeActive=!0;const n={};let d=null,u=null;async function h(){if(!n.context||!n.adapterId)return;const e=await chrome.runtime.sendMessage({type:"CONFIRM_SYNC",adapterId:n.adapterId,context:n.context});if(!e?.ok){i(e?.error||"Sync failed.","error");return}a(),b(e.ui)}chrome.runtime.onMessage.addListener(e=>{m(e)}),chrome.runtime.sendMessage({type:"CONTENT_READY"}).then(e=>{if(e?.ok&&Array.isArray(e.messages))for(const t of e.messages)m(t)}).catch(()=>{})}})();
