import{e as w,f as S,g as v}from"./constants.js";if(!window.__extmgBridgeActive){let b=function(){return s||(s=document.createElement("div"),s.style.cssText=["position:fixed","right:16px","bottom:16px","z-index:2147483647","max-width:360px","padding:12px 14px","border-radius:10px","background:#111827","color:#fff","font:13px/1.4 system-ui,sans-serif","box-shadow:0 12px 32px rgba(0,0,0,.35)","display:none"].join(";"),document.documentElement.appendChild(s),s)},i=function(t,e="info",n=2600){const a=b(),p=e==="success"?"#22c55e":e==="error"?"#ef4444":"#60a5fa";a.style.display="block",a.style.borderLeft=`4px solid ${p}`,a.textContent=t,window.setTimeout(()=>{s===a&&(a.style.display="none")},n)},o=function(){f?.remove(),f=null},l=function(t){o();const e=document.createElement("div");return e.innerHTML=`
      <div data-extmg-backdrop style="position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.45)"></div>
      <div data-extmg-card style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483646;width:min(92vw,420px);background:#111827;color:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);font:14px/1.45 system-ui,sans-serif;overflow:hidden">
        ${t}
      </div>
    `,f=e,e.addEventListener("click",n=>{n.target.dataset.extmgBackdrop!==void 0&&o()}),document.documentElement.appendChild(e),e},u=function(t,e){return`
      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">
        <div style="font-size:16px;font-weight:700">${c(t)}</div>
        ${e?`<div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:13px">${c(e)}</div>`:""}
      </div>
    `},d=function(t,e=""){return`<button ${e} style="appearance:none;border:none;border-radius:10px;padding:10px 12px;background:#374151;color:#fff;cursor:pointer;font:600 13px system-ui,sans-serif">${c(t)}</button>`},y=function(t){r.pendingCandidates=t;const e=l(`
      ${u("Choose AniList manga",r.context?.siteSeriesTitle)}
      <div style="padding:16px 18px;display:grid;gap:10px">
        ${t.map((n,a)=>`
          <button data-choice="${a}" style="text-align:left;appearance:none;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#1f2937;color:#fff;padding:12px;cursor:pointer">
            <div style="font-weight:700">${c(n.title)}</div>
            <div style="margin-top:4px;color:rgba(255,255,255,.72);font-size:12px">Match score ${(n.score*100).toFixed(0)}%${n.chapters?` · ${n.chapters} chapters`:""}</div>
          </button>
        `).join("")}
      </div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${d("Dismiss",'data-dismiss="1"')}</div>
    `);e.querySelectorAll("[data-choice]").forEach(n=>{n.addEventListener("click",async()=>{const a=Number(n.dataset.choice),p=r.pendingCandidates?.[a];if(!p||!r.context||!r.adapterId)return;const x=await chrome.runtime.sendMessage({type:"CHOOSE_MATCH",adapterId:r.adapterId,context:r.context,candidate:p});if(!x?.ok){i(x?.error||"Could not save mapping.","error");return}o(),i(`Mapped to ${x.ui.title}`,"success"),r.pendingSync&&(r.pendingSync=!1,await h())})}),e.querySelector('[data-dismiss="1"]')?.addEventListener("click",o)},E=function(t,e){const n=l(`
      ${u("Sync this chapter?",t)}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Chapter ${e} is ready to sync to AniList.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end;gap:10px">
        ${d("Skip",'data-skip="1"')}
        ${d("Sync now",'data-confirm="1"')}
      </div>
    `);n.querySelector('[data-skip="1"]')?.addEventListener("click",()=>{r.pendingSync=!1,o(),i("Sync skipped.","info")}),n.querySelector('[data-confirm="1"]')?.addEventListener("click",()=>{h()})},g=function(){l(`
      ${u("AniList login required")}
      <div style="padding:16px 18px;color:rgba(255,255,255,.8)">Open the extension options page, log into AniList with the pin flow, then return to this tab.</div>
      <div style="padding:0 18px 18px;display:flex;justify-content:flex-end">${d("Close",'data-close="1"')}</div>
    `).querySelector('[data-close="1"]')?.addEventListener("click",o)},k=function(t){switch(t?.state){case"auth_required":g();break;case"mapped":o(),i(`Matched AniList: ${t.title}`,"success");break;case"needs_choice":y(t.candidates||[]);break;case"unresolved":i("No AniList match found yet.","error",4e3);break;case"invalid":i(t.message,"error",4e3);break}},m=function(t){switch(t?.state){case"auth_required":g();break;case"needs_choice":r.pendingSync=!0,y(t.candidates||[]);break;case"manual":i("Manual mode enabled. Use the options page debug button to sync.","info",4500);break;case"confirm_sync":E(t.title,t.chapterNumber);break;case"synced":i(`Synced chapter on AniList: ${t.title}`,"success",3200);break;case"skipped":i(t.reason,"info",4e3);break;case"error":i(t.message,"error",4500);break}},c=function(t){const e=document.createElement("div");return e.textContent=t,e.innerHTML};window.__extmgBridgeActive=!0;const r={};let s=null,f=null;async function h(){if(!r.context||!r.adapterId)return;const t=await chrome.runtime.sendMessage({type:"CONFIRM_SYNC",adapterId:r.adapterId,context:r.context});if(!t?.ok){i(t?.error||"Sync failed.","error");return}o(),m(t.ui)}document.addEventListener(w,async t=>{const e=t.detail;if(e){if(r.adapterId=e.adapterId,e.type==="show_status"){const n=e.payload;i(n.message,n.kind??"info");return}if(e.type==="chapter_detected"){r.context=e.payload;const n=await chrome.runtime.sendMessage({type:"ADAPTER_DETECTED",adapterId:e.adapterId,context:r.context});if(!n?.ok){i(n?.error||"Detection failed.","error");return}k(n.ui);return}if(e.type==="chapter_read"){const n=e.payload;r.context=n.context;const a=await chrome.runtime.sendMessage({type:"ADAPTER_READ",adapterId:e.adapterId,signal:n});if(!a?.ok){i(a?.error||"Read handling failed.","error");return}m(a.ui)}}}),document.addEventListener(S,async t=>{const e=t.detail;if(e)try{let n;e.method==="get_settings"?n=await chrome.runtime.sendMessage({type:"GET_ADAPTER_SETTINGS"}):n=await chrome.runtime.sendMessage({type:"GET_KNOWN_MAPPING",site:String(e.params.site??""),siteSeriesId:String(e.params.siteSeriesId??""),siteSeriesTitle:String(e.params.siteSeriesTitle??"")}),document.dispatchEvent(new CustomEvent(v,{detail:{requestId:e.requestId,ok:!!n?.ok,result:n?.result,error:n?.error}}))}catch(n){document.dispatchEvent(new CustomEvent(v,{detail:{requestId:e.requestId,ok:!1,error:n instanceof Error?n.message:String(n)}}))}})}
