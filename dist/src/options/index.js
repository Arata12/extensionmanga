import{v,p as y}from"../../metadata-parser.js";const E=39084,w=`https://anilist.co/api/v2/oauth/authorize?client_id=${E}&response_type=token`,h=document.getElementById("authStatus"),L=document.getElementById("runtimeStatus"),p=document.getElementById("tokenInput"),c=document.getElementById("syncModeSelect"),r=document.getElementById("adapterList"),d=document.getElementById("mappingList"),f=document.getElementById("syncLogList"),o=document.getElementById("adapterSourceInput"),g=document.getElementById("adapterFileInput"),I=document.getElementById("debugOutput");function n(t){const e=document.createElement("div");return e.textContent=t,e.innerHTML}async function i(){const[t,e,s,a]=await Promise.all([chrome.runtime.sendMessage({type:"GET_STATUS"}),chrome.runtime.sendMessage({type:"LIST_ADAPTERS"}),chrome.runtime.sendMessage({type:"GET_MAPPINGS"}),chrome.runtime.sendMessage({type:"GET_SYNC_LOG",limit:20})]);h.textContent=t.settings.viewer?`Connected as ${t.settings.viewer.name}`:"Not connected to AniList yet.",L.textContent=t.userScriptsAvailable?`userScripts runtime is available.${t.registeredScriptIds?.length?` Registered: ${t.registeredScriptIds.join(", ")}`:" No scripts registered yet."}${t.lastRegistrationError?` Last error: ${t.lastRegistrationError}`:""}`:"userScripts runtime is unavailable. Enable Developer Mode / Allow User Scripts for this extension.",c.value=t.settings.syncMode,T(e.adapters??[]),S(s.mappings??[]),A(a.entries??[])}function T(t){r.innerHTML=t.map(e=>`
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:700">${n(e.meta.name)}</div>
              <div class="muted mono">${n(e.meta.id)} · ${n(e.sourceType)}</div>
              <div class="muted mono">${n(e.meta.matches.join(", "))}</div>
            </div>
            <div class="row">
              <button class="secondary" data-toggle="${n(e.id)}">${e.enabled?"Disable":"Enable"}</button>
              ${e.sourceType==="imported"?`<button class="danger" data-remove="${n(e.id)}">Remove</button>`:""}
            </div>
          </div>
        </div>
      `).join(""),r.querySelectorAll("[data-toggle]").forEach(e=>{e.addEventListener("click",async()=>{const s=e.dataset.toggle,a=e.textContent!=="Disable",l=t.find(m=>m.id===s);if(!l)return;if(a&&!await chrome.permissions.request({origins:l.meta.matches})){window.alert("No se concedió permiso para ese sitio.");return}const u=await chrome.runtime.sendMessage({type:"TOGGLE_ADAPTER",adapterId:s,enabled:a});if(!u?.ok){window.alert(u?.error||"Could not toggle adapter.");return}await i()})}),r.querySelectorAll("[data-remove]").forEach(e=>{e.addEventListener("click",async()=>{const s=e.dataset.remove;if(!s)return;const a=await chrome.runtime.sendMessage({type:"REMOVE_ADAPTER",adapterId:s});if(!a?.ok){window.alert(a?.error||"Could not remove adapter.");return}await i()})})}function S(t){if(!t.length){d.innerHTML='<div class="muted">No remembered mappings yet.</div>';return}d.innerHTML=t.sort((e,s)=>s.updatedAt-e.updatedAt).map(e=>`
        <div class="card">
          <div style="font-weight:700">${n(e.siteTitle)}</div>
          <div class="muted mono">${n(e.site)} → ${n(e.anilistTitle)}</div>
          <div class="row" style="justify-content:space-between;margin-top:8px">
            <span class="chip">${e.confirmedByUser?"confirmed":"auto learned"}</span>
            <button class="danger" data-delete-mapping="${n(e.key)}">Delete</button>
          </div>
        </div>
      `).join(""),d.querySelectorAll("[data-delete-mapping]").forEach(e=>{e.addEventListener("click",async()=>{const s=e.dataset.deleteMapping,a=await chrome.runtime.sendMessage({type:"DELETE_MAPPING",key:s});if(!a?.ok){window.alert(a?.error||"Could not delete mapping.");return}await i()})})}function A(t){f.innerHTML=t.length?t.map(e=>`
            <div class="card">
              <div style="font-weight:700">${n(e.site)} · chapter ${e.chapterNumber}</div>
              <div class="muted mono">${n(e.result)}${e.reason?` · ${n(e.reason)}`:""}</div>
              <div class="muted mono">${new Date(e.syncedAt).toLocaleString()}</div>
            </div>
          `).join(""):'<div class="muted">No sync history yet.</div>'}document.getElementById("openLoginBtn")?.addEventListener("click",()=>{window.open(w,"_blank","noopener,noreferrer")});document.getElementById("validateTokenBtn")?.addEventListener("click",async()=>{const t=await chrome.runtime.sendMessage({type:"SAVE_AUTH_TOKEN",token:p.value});if(!t?.ok){window.alert(t?.error||"Token validation failed.");return}p.value="",await i()});document.getElementById("logoutBtn")?.addEventListener("click",async()=>{await chrome.runtime.sendMessage({type:"LOGOUT"}),await i()});c.addEventListener("change",async()=>{await chrome.runtime.sendMessage({type:"UPDATE_SETTINGS",patch:{syncMode:c.value}})});document.getElementById("importAdapterBtn")?.addEventListener("click",async()=>{try{v(o.value);const e=y(o.value);if(!await chrome.permissions.request({origins:e.matches})){window.alert("No se concedió permiso para los sitios del adapter.");return}}catch(e){window.alert(e instanceof Error?e.message:String(e));return}const t=await chrome.runtime.sendMessage({type:"IMPORT_ADAPTER",sourceCode:o.value,enabled:!0});if(!t?.ok){window.alert(t?.error||"Could not import adapter.");return}o.value="",await i()});g.addEventListener("change",async()=>{const t=g.files?.[0];t&&(o.value=await t.text())});document.getElementById("debugSyncBtn")?.addEventListener("click",async()=>{const t=await chrome.runtime.sendMessage({type:"DEBUG_SYNC_ACTIVE_TAB"});I.textContent=JSON.stringify(t,null,2)});document.getElementById("refreshBtn")?.addEventListener("click",()=>{i()});i();
