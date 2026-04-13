(function(){"use strict";if(!window.__extmgBridgeActive){let v=function(){return d||(d=document.createElement("div"),d.style.cssText=["position:fixed","right:16px","bottom:16px","z-index:2147483647","max-width:360px","padding:12px 14px","border-radius:10px","background:#111827","color:#fff","font:13px/1.4 system-ui,sans-serif","box-shadow:0 12px 32px rgba(0,0,0,.35)","display:none"].join(";"),document.documentElement.appendChild(d),d)},o=function(e,t="info",i=2600){const r=v(),p=t==="success"?"#22c55e":t==="error"?"#ef4444":"#60a5fa";r.style.display="block",r.style.borderLeft=`4px solid ${p}`,r.textContent=e,window.setTimeout(()=>{d===r&&(r.style.display="none")},i)},a=function(){u?.remove(),u=null},l=function(e){a();const t=document.createElement("div");return t.innerHTML=`
      <div data-extmg-backdrop style="position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.45)"></div>
      <div data-extmg-card style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483646;width:min(92vw,420px);background:#111827;color:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);font:14px/1.45 system-ui,sans-serif;overflow:hidden">
        ${e}
      </div>
    `,u=t,t.addEventListener("click",i=>{i.target.dataset.extmgBackdrop!==void 0&&a()}),document.documentElement.appendChild(t),t},f=function(e,t){return`
      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">
        <div style="font-size:16px;font-weight:700">${s(e)}</div>
        ${t?`<div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:13px">${s(t)}</div>`:""}
      </div>
    `},c=function(e,t=""){return`<button ${t} style="appearance:none;border:none;border-radius:10px;padding:10px 12px;background:#374151;color:#fff;cursor:pointer;font:600 13px system-ui,sans-serif">${s(e)}</button>`},k=function(e){if(!e.formatLabel)return"";const t=e.format==="NOVEL"?"rgba(249,115,22,.18)":e.format==="MANGA"?"rgba(34,197,94,.18)":"rgba(96,165,250,.18)",i=e.format==="NOVEL"?"#fdba74":e.format==="MANGA"?"#86efac":"#93c5fd";return`<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:${t};color:${i};font-size:11px;font-weight:700">${s(e.formatLabel)}</span>`},y=function(e){n.pendingCandidates=e;const t=l(`
      ${f("Choose AniList manga",n.context?.siteSeriesTitle)}
      <div style="padding:16px 18px;display:grid;gap:10px">
        ${e.map((i,r)=>`
              <button data-choice="${r}" style="text-align:left;appearance:none;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#1f2937;color:#fff;padding:12px;cursor:pointer">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <div style="font-weight:700">${s(i.title)}</div>
                  ${k(i)}
                </div>
                <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">Match score ${(i.score*100).toFixed(0)}%${i.chapters?` · ${i.chapters} chapters`:""}</div>
              </button>
            `).join("")}
      </div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${c("Dismiss",'data-dismiss="1"')}</div>
    `);t.querySelectorAll("[data-choice]").forEach(i=>{i.addEventListener("click",async()=>{const r=Number(i.dataset.choice),p=n.pendingCandidates?.[r];if(!p||!n.context||!n.adapterId)return;const x=await chrome.runtime.sendMessage({type:"CHOOSE_MATCH",adapterId:n.adapterId,context:n.context,candidate:p});if(!x?.ok){o(x?.error||"Could not save mapping.","error");return}a(),o(`Mapped to ${x.ui.title}`,"success"),n.pendingSync&&(n.pendingSync=!1,await h())})}),t.querySelector('[data-dismiss="1"]')?.addEventListener("click",a)},w=function(e,t){const i=l(`
      ${f("Sync this chapter?",e)}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Chapter ${t} is ready to sync to AniList.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end;gap:10px">
        ${c("Skip",'data-skip="1"')}
        ${c("Sync now",'data-confirm="1"')}
      </div>
    `);i.querySelector('[data-skip="1"]')?.addEventListener("click",()=>{n.pendingSync=!1,a(),o("Sync skipped.","info")}),i.querySelector('[data-confirm="1"]')?.addEventListener("click",()=>{h()})},g=function(){l(`
      ${f("AniList login required")}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Open the extension options page, log into AniList with the pin flow, then return to this tab.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${c("Close",'data-close="1"')}</div>
    `).querySelector('[data-close="1"]')?.addEventListener("click",a)},b=function(e){switch(e?.state){case"auth_required":g();break;case"mapped":a(),o(`Matched AniList: ${e.title}`,"success");break;case"needs_choice":y(e.candidates||[]);break;case"unresolved":o("No AniList match found yet.","error",4e3);break;case"invalid":o(e.message,"error",4e3);break}},m=function(e){switch(e?.state){case"auth_required":g();break;case"needs_choice":n.pendingSync=!0,y(e.candidates||[]);break;case"manual":o("Manual mode enabled. Use the options page debug button to sync.","info",4500);break;case"confirm_sync":w(e.title,e.chapterNumber);break;case"synced":o(`Synced chapter on AniList: ${e.title}`,"success",3200);break;case"skipped":o(e.reason,"info",4e3);break;case"error":o(e.message,"error",4500);break}},s=function(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML},$=function(e){if(!(!e||typeof e!="object")){if(e.type==="UI_CLEAR"){n.adapterId=void 0,n.context=void 0,n.pendingCandidates=void 0,n.pendingSync=!1,a();return}if(e.type==="UI_TOAST"){const t=e.payload;o(t.message,t.kind??"info");return}if(e.type==="UI_DETECTION"){n.adapterId=e.adapterId,n.context=e.context,b(e.ui);return}e.type==="UI_READ"&&(n.adapterId=e.adapterId,n.context=e.context,m(e.ui))}};window.__extmgBridgeActive=!0;const n={};let d=null,u=null;async function h(){if(!n.context||!n.adapterId)return;const e=await chrome.runtime.sendMessage({type:"CONFIRM_SYNC",adapterId:n.adapterId,context:n.context});if(!e?.ok){o(e?.error||"Sync failed.","error");return}a(),m(e.ui)}chrome.runtime.onMessage.addListener(e=>{$(e)}),chrome.runtime.sendMessage({type:"CONTENT_READY"}).then(e=>{if(e?.ok&&e.message){const t=e.message;t.type==="UI_DETECTION"&&(n.adapterId=t.adapterId,n.context=t.context,b(t.ui))}}).catch(()=>{})}})();
