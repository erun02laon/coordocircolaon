/* =========================================================
   CIRCO+  —  app.js
   Application 100% autonome (aucun serveur, aucune base de données)
   ========================================================= */

(function(){
"use strict";

/* ---------------------------------------------------------
   0. UTILITAIRES
--------------------------------------------------------- */
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

function normalize(str){
  if(!str) return "";
  return str.toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function initials(name){
  if(!name) return "?";
  const parts = name.replace(/[^\p{L}\s-]/gu,"").split(/\s+/).filter(Boolean);
  if(parts.length === 0) return "?";
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function telHref(v){ return v ? `tel:${v.toString().replace(/[^\d+]/g,"")}` : null; }
function mailHref(v){ return v ? `mailto:${v.toString().trim()}` : null; }
function mapsHref(addr){ return addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null; }

function escapeHtml(s){
  if(s === null || s === undefined) return "";
  return s.toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function toast(msg, icon="✅"){
  const t = $("#toast");
  t.innerHTML = `<span>${icon}</span><span>${escapeHtml(msg)}</span>`;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.remove("show"), 2400);
}

function copyText(text, label){
  if(!text) return;
  navigator.clipboard?.writeText(text).then(()=>toast(`${label} copié : ${text}`, "📋"))
    .catch(()=>toast("Impossible de copier", "⚠️"));
}

/* ---------------------------------------------------------
   1. ÉTAT / STOCKAGE LOCAL
--------------------------------------------------------- */
const LS_KEYS = {
  data: "circoplus_data_override_v2",
  favs: "circoplus_favorites",
  recents: "circoplus_recents",
  theme: "circoplus_theme",
  customFavs: "circoplus_custom_items"
};

/* ---------------------------------------------------------
   1 bis. PROTECTION DES PARAMÈTRES
   Le mot de passe n'est pas stocké en clair dans le code.
   --------------------------------------------------------- */
const SETTINGS_PASSWORD_HASH = "b8e098e88edfda48ecb57e6955702e8a00bc919cd4db60c44fc25f0dd1f45140";

async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function requestSettingsAccess(){
  const password = window.prompt("🔐 Accès aux paramètres\\n\\nVeuillez saisir le mot de passe :");
  if(password === null) return false;
  const hash = await sha256(password);
  if(hash === SETTINGS_PASSWORD_HASH){
    sessionStorage.setItem("circoplus_settings_auth", "1");
    return true;
  }
  toast("Mot de passe incorrect", "🔒");
  return false;
}

function hasSettingsAccess(){
  return sessionStorage.getItem("circoplus_settings_auth") === "1";
}

function loadData(){
  try{
    const raw = localStorage.getItem(LS_KEYS.data);
    if(raw) return JSON.parse(raw);
  }catch(e){ console.warn("Données locales invalides, retour aux données par défaut."); }
  return DEFAULT_DATA;
}
function saveDataOverride(data){
  localStorage.setItem(LS_KEYS.data, JSON.stringify(data));
}
function resetDataOverride(){
  localStorage.removeItem(LS_KEYS.data);
}

function loadJSON(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch(e){ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

const state = {
  data: loadData(),
  favorites: loadJSON(LS_KEYS.favs, []),      // [{type, id}]
  recents: loadJSON(LS_KEYS.recents, []),     // [{type, id, ts}]
  view: "dashboard",
  ecolesFilter: { q:"", secteur:"", sort:"az" },
  mairiesFilter: { q:"" },
  circoFilter: { q:"" },
  globalQuery: ""
};

function isFav(type, id){ return state.favorites.some(f=>f.type===type && f.id===id); }
function toggleFav(type, id){
  const idx = state.favorites.findIndex(f=>f.type===type && f.id===id);
  if(idx>=0){ state.favorites.splice(idx,1); toast("Retiré des favoris", "☆"); }
  else{ state.favorites.push({type,id}); toast("Ajouté aux favoris", "⭐"); }
  saveJSON(LS_KEYS.favs, state.favorites);
  renderCurrentView();
}
function pushRecent(type, id){
  state.recents = state.recents.filter(r => !(r.type===type && r.id===id));
  state.recents.unshift({type, id, ts:Date.now()});
  state.recents = state.recents.slice(0,8);
  saveJSON(LS_KEYS.recents, state.recents);
}

/* ---------------------------------------------------------
   2. RAPPROCHEMENT ÉCOLE <-> COMMUNE / MAIRIE
--------------------------------------------------------- */
function findMairieForEcole(ecole){
  if(!ecole.commune) return null;
  return state.data.mairies.find(m => m.commune === ecole.commune) || null;
}

/* ---------------------------------------------------------
   3. RECHERCHE
--------------------------------------------------------- */
function searchEcoles(q, secteur){
  const nq = normalize(q);
  return state.data.ecoles.filter(e=>{
    if(secteur && e.secteurCollege !== secteur) return false;
    if(!nq) return true;
    const hay = normalize([e.nom, e.directeur, e.commune, e.secteurCollege, e.email].join(" "));
    return hay.includes(nq);
  });
}
function searchMairies(q){
  const nq = normalize(q);
  if(!nq) return state.data.mairies;
  return state.data.mairies.filter(m=>{
    const hay = normalize([m.commune, m.maire, m.presidentSyndicat, m.communauteCommunes, m.presidentCC].join(" "));
    return hay.includes(nq);
  });
}
function searchCirco(q){
  const nq = normalize(q);
  if(!nq) return state.data.circo;
  return state.data.circo.filter(p=>{
    const hay = normalize([p.nom, p.fonction, p.email].join(" "));
    return hay.includes(nq);
  });
}

function globalSearch(q){
  const nq = normalize(q);
  if(!nq) return null;
  const ecoles = state.data.ecoles.filter(e=>normalize([e.nom,e.directeur,e.commune].join(" ")).includes(nq)).slice(0,6);
  const mairies = state.data.mairies.filter(m=>normalize([m.commune,m.maire].join(" ")).includes(nq)).slice(0,6);
  const circo = state.data.circo.filter(p=>normalize([p.nom,p.fonction].join(" ")).includes(nq)).slice(0,6);
  return {ecoles, mairies, circo};
}

/* ---------------------------------------------------------
   4. RENDU — SHELL / NAVIGATION
--------------------------------------------------------- */
const NAV_ITEMS = [
  {id:"dashboard", label:"Tableau de bord", icon:"📊"},
  {id:"ecoles",    label:"Écoles",           icon:"🏫"},
  {id:"circo",     label:"Équipe circo.",     icon:"👥"},
  {id:"mairies",   label:"Mairies",           icon:"🏛"},
  {id:"favoris",   label:"Favoris",           icon:"⭐"},
  {id:"parametres",label:"Paramètres",        icon:"⚙️"},
];

function renderNav(){
  const nav = $("#nav");
  nav.innerHTML = NAV_ITEMS.map(item=>{
    let badge = "";
    if(item.id==="ecoles") badge = state.data.ecoles.length;
    if(item.id==="circo") badge = state.data.circo.length;
    if(item.id==="mairies") badge = state.data.mairies.length;
    if(item.id==="favoris") badge = state.favorites.length || "";
    return `<button class="nav-item ${state.view===item.id?'active':''}" data-view="${item.id}">
      <span class="ic">${item.icon}</span><span>${item.label}</span>
      ${badge!==""?`<span class="nav-badge">${badge}</span>`:""}
    </button>`;
  }).join("");
  $$(".nav-item", nav).forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const targetView = btn.dataset.view;
      if(targetView === "parametres" && !hasSettingsAccess()){
        const ok = await requestSettingsAccess();
        if(!ok) return;
      }
      state.view = targetView;
      closeSidebarMobile();
      renderAll();
    });
  });
}

function setView(view){ state.view = view; renderAll(); }
window.setView = setView; // used by inline quick-access clicks

function renderQuickAccess(){
  const bar = $("#quick-access");
  if(!bar) return;
  $$(".quick-item", bar).forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.view === state.view);
    btn.onclick = async ()=>{
      const targetView = btn.dataset.view;
      if(targetView === "parametres" && !hasSettingsAccess()){
        const ok = await requestSettingsAccess();
        if(!ok) return;
      }
      state.view = targetView;
      renderAll();
    };
  });
}

function renderAll(){
  renderNav();
  renderQuickAccess();
  renderCurrentView();
  window.scrollTo({top:0, behavior:"smooth"});
}
function renderCurrentView(){
  const map = {
    dashboard: renderDashboard,
    ecoles: renderEcoles,
    circo: renderCirco,
    mairies: renderMairies,
    favoris: renderFavoris,
    parametres: renderParametres
  };
  (map[state.view] || renderDashboard)();
}

/* ---------------------------------------------------------
   5. VUE — TABLEAU DE BORD
--------------------------------------------------------- */
function renderDashboard(){
  const communes = new Set(state.data.ecoles.map(e=>e.commune).filter(Boolean));
  const content = $("#content");
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Tableau de bord</h2>
        <p>Vue d'ensemble de la circonscription</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-ic">🏫</div><div class="stat-num">${state.data.ecoles.length}</div><div class="stat-label">Écoles</div></div>
      <div class="stat-card"><div class="stat-ic">🏘</div><div class="stat-num">${communes.size}</div><div class="stat-label">Communes</div></div>
      <div class="stat-card"><div class="stat-ic">🏛</div><div class="stat-num">${state.data.mairies.length}</div><div class="stat-label">Mairies</div></div>
      <div class="stat-card"><div class="stat-ic">👥</div><div class="stat-num">${state.data.circo.length}</div><div class="stat-label">Personnels de circonscription</div></div>
    </div>

    <div class="dash-grid">
      <div class="panel">
        <h3>🕘 Derniers éléments consultés</h3>
        <div id="recent-list"></div>
      </div>
      <div class="panel">
        <h3>⚡ Accès rapide</h3>
        <div style="display:flex; flex-direction:column; gap:8px">
          <button class="btn" data-quick="ecoles" style="justify-content:flex-start">🏫 Voir toutes les écoles</button>
          <button class="btn" data-quick="mairies" style="justify-content:flex-start">🏛 Voir toutes les mairies</button>
          <button class="btn" data-quick="circo" style="justify-content:flex-start">👥 Équipe de circonscription</button>
          <button class="btn" data-quick="favoris" style="justify-content:flex-start">⭐ Mes favoris (${state.favorites.length})</button>
        </div>
      </div>
    </div>
  `;
  $$('[data-quick]').forEach(b=>b.addEventListener("click", ()=>setView(b.dataset.quick)));

  const recentBox = $("#recent-list");
  if(state.recents.length === 0){
    recentBox.innerHTML = `<p class="empty-note">Aucune consultation récente. Cliquez sur une école, une mairie ou un membre de l'équipe pour la retrouver ici.</p>`;
  }else{
    recentBox.innerHTML = state.recents.map(r=>{
      const item = findItem(r.type, r.id);
      if(!item) return "";
      const {title, sub, icon} = describeItem(r.type, item);
      return `<div class="recent-item" data-open="${r.type}:${r.id}">
        <div class="recent-ic">${icon}</div>
        <div><b>${escapeHtml(title)}</b><small>${escapeHtml(sub)}</small></div>
      </div>`;
    }).join("") || `<p class="empty-note">Aucune consultation récente.</p>`;
    $$('[data-open]', recentBox).forEach(el=>{
      el.addEventListener("click", ()=>{
        const [type,id] = el.dataset.open.split(":");
        openFiche(type,id);
      });
    });
  }
}

function findItem(type, id){
  if(type==="ecole") return state.data.ecoles.find(e=>e.id===id);
  if(type==="mairie") return state.data.mairies.find(m=>m.id===id);
  if(type==="circo") return state.data.circo.find(p=>p.id===id);
  return null;
}
function describeItem(type, item){
  if(type==="ecole") return {title:item.nom, sub:item.commune||"École", icon:"🏫"};
  if(type==="mairie") return {title:item.commune, sub:item.maire||"Mairie", icon:"🏛"};
  if(type==="circo") return {title:item.nom, sub:item.fonction||"Équipe circo.", icon:"👥"};
  return {title:"", sub:"", icon:"❔"};
}

/* ---------------------------------------------------------
   6. VUE — ÉCOLES
--------------------------------------------------------- */
function renderEcoles(){
  const secteurs = Array.from(new Set(state.data.ecoles.map(e=>e.secteurCollege).filter(Boolean))).sort();
  const content = $("#content");
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>🏫 Écoles</h2>
        <p>${state.data.ecoles.length} écoles de la circonscription</p>
      </div>
      <div class="page-tools">
        <input class="input" id="ecoles-search" placeholder="Rechercher (nom, commune, directeur...)" style="min-width:240px" value="${escapeHtml(state.ecolesFilter.q)}">
        <select class="select" id="ecoles-secteur">
          <option value="">Tous secteurs de collège</option>
          ${secteurs.map(s=>`<option value="${escapeHtml(s)}" ${state.ecolesFilter.secteur===s?"selected":""}>${escapeHtml(s)}</option>`).join("")}
        </select>
        <select class="select" id="ecoles-sort">
          <option value="az" ${state.ecolesFilter.sort==="az"?"selected":""}>Tri A → Z</option>
          <option value="za" ${state.ecolesFilter.sort==="za"?"selected":""}>Tri Z → A</option>
        </select>
        <button class="btn" id="ecoles-export">⬇️ Export Excel</button>
      </div>
    </div>
    <div class="cards-grid" id="ecoles-grid"></div>
  `;
  $("#ecoles-search").addEventListener("input", e=>{ state.ecolesFilter.q = e.target.value; paintEcoles(); });
  $("#ecoles-secteur").addEventListener("change", e=>{ state.ecolesFilter.secteur = e.target.value; paintEcoles(); });
  $("#ecoles-sort").addEventListener("change", e=>{ state.ecolesFilter.sort = e.target.value; paintEcoles(); });
  $("#ecoles-export").addEventListener("click", ()=>exportListToExcel(currentEcolesList(), "ecoles"));

  paintEcoles();
}

function currentEcolesList(){
  let list = searchEcoles(state.ecolesFilter.q, state.ecolesFilter.secteur);
  list = list.slice().sort((a,b)=> a.nom.localeCompare(b.nom,'fr'));
  if(state.ecolesFilter.sort === "za") list.reverse();
  return list;
}

function paintEcoles(){
  const grid = $("#ecoles-grid");
  const list = currentEcolesList();
  if(list.length===0){
    grid.parentElement.querySelector("#ecoles-grid").outerHTML = emptyStateHTML("🔍","Aucune école trouvée","Essayez une autre recherche ou réinitialisez les filtres.");
    return;
  }
  grid.innerHTML = list.map(e=>ecoleCardHTML(e)).join("");
  bindCardEvents(grid);
}

function ecoleCardHTML(e){
  const fav = isFav("ecole", e.id);
  return `
  <article class="card" data-open="ecole:${e.id}">
    <div class="card-top">
      <div class="avatar">${initials(e.nom)}</div>
      <div class="card-title">
        <h4>${escapeHtml(e.nom)}</h4>
        <div class="sub">${escapeHtml(e.directeur || "Direction non renseignée")}</div>
      </div>
      <button class="fav-toggle ${fav?'active':''}" data-fav="ecole:${e.id}" title="Ajouter aux favoris">${fav?'★':'☆'}</button>
    </div>
    <div class="card-body">
      ${e.commune?`<div class="row"><span class="ic">🏘</span><span>${escapeHtml(e.commune)}</span></div>`:""}
      ${e.telephone?`<div class="row"><span class="ic">📞</span><a href="${telHref(e.telephone)}" onclick="event.stopPropagation()">${escapeHtml(e.telephone)}</a></div>`:""}
      ${e.email?`<div class="row"><span class="ic">📧</span><a href="${mailHref(e.email)}" onclick="event.stopPropagation()">${escapeHtml(e.email)}</a></div>`:""}
      ${e.secteurCollege?`<div class="row"><span class="badge">🎓 ${escapeHtml(e.secteurCollege)}</span></div>`:""}
    </div>
    <div class="card-actions">
      ${e.telephone?`<button class="icon-action" data-call="${e.telephone}">📞 Appeler</button>`:""}
      ${e.email?`<button class="icon-action" data-mail="${e.email}">📧 Mail</button>`:""}
      ${e.commune?`<button class="icon-action" data-maps="${e.commune}">📍 Maps</button>`:""}
    </div>
  </article>`;
}

/* ---------------------------------------------------------
   7. VUE — ÉQUIPE DE CIRCONSCRIPTION
--------------------------------------------------------- */
function renderCirco(){
  const content = $("#content");
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>👥 Équipe de circonscription</h2>
        <p>${state.data.circo.length} membres</p>
      </div>
      <div class="page-tools">
        <input class="input" id="circo-search" placeholder="Rechercher un membre, une fonction..." style="min-width:260px" value="${escapeHtml(state.circoFilter.q)}">
      </div>
    </div>
    <div class="cards-grid" id="circo-grid"></div>
  `;
  $("#circo-search").addEventListener("input", e=>{ state.circoFilter.q = e.target.value; paintCirco(); });
  paintCirco();
}
function paintCirco(){
  const grid = $("#circo-grid");
  const list = searchCirco(state.circoFilter.q).slice().sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
  if(list.length===0){
    grid.outerHTML = emptyStateHTML("🔍","Aucun membre trouvé","Essayez une autre recherche.");
    return;
  }
  grid.innerHTML = list.map(p=>circoCardHTML(p)).join("");
  bindCardEvents(grid);
}
function circoCardHTML(p){
  const fav = isFav("circo", p.id);
  return `
  <article class="card" data-open="circo:${p.id}">
    <div class="card-top">
      <div class="avatar">${initials(p.nom)}</div>
      <div class="card-title">
        <h4>${escapeHtml(p.nom)}</h4>
        <div class="sub">${escapeHtml(p.fonction||"")}</div>
      </div>
      <button class="fav-toggle ${fav?'active':''}" data-fav="circo:${p.id}" title="Ajouter aux favoris">${fav?'★':'☆'}</button>
    </div>
    <div class="card-body">
      ${p.telephone?`<div class="row"><span class="ic">☎️</span><a href="${telHref(p.telephone)}" onclick="event.stopPropagation()">${escapeHtml(p.telephone)}</a></div>`:""}
      ${p.portable?`<div class="row"><span class="ic">📱</span><a href="${telHref(p.portable)}" onclick="event.stopPropagation()">${escapeHtml(p.portable)}</a></div>`:""}
      ${p.email?`<div class="row"><span class="ic">📧</span><a href="${mailHref(p.email)}" onclick="event.stopPropagation()">${escapeHtml(p.email)}</a></div>`:""}
    </div>
    <div class="card-actions">
      ${(p.portable||p.telephone)?`<button class="icon-action" data-call="${p.portable||p.telephone}">📞 Appeler</button>`:""}
      ${p.email?`<button class="icon-action" data-mail="${p.email}">📧 Mail</button>`:""}
    </div>
  </article>`;
}

/* ---------------------------------------------------------
   8. VUE — MAIRIES
--------------------------------------------------------- */
function renderMairies(){
  const content = $("#content");
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>🏛 Mairies</h2>
        <p>${state.data.mairies.length} communes</p>
      </div>
      <div class="page-tools">
        <input class="input" id="mairies-search" placeholder="Rechercher une commune, un maire..." style="min-width:260px" value="${escapeHtml(state.mairiesFilter.q)}">
        <button class="btn" id="mairies-export">⬇️ Export Excel</button>
      </div>
    </div>
    <div class="cards-grid" id="mairies-grid"></div>
  `;
  $("#mairies-search").addEventListener("input", e=>{ state.mairiesFilter.q = e.target.value; paintMairies(); });
  $("#mairies-export").addEventListener("click", ()=>exportListToExcel(searchMairies(state.mairiesFilter.q), "mairies"));
  paintMairies();
}
function paintMairies(){
  const grid = $("#mairies-grid");
  const list = searchMairies(state.mairiesFilter.q).slice().sort((a,b)=>a.commune.localeCompare(b.commune,'fr'));
  if(list.length===0){
    grid.outerHTML = emptyStateHTML("🔍","Aucune mairie trouvée","Essayez une autre recherche.");
    return;
  }
  grid.innerHTML = list.map(m=>mairieCardHTML(m)).join("");
  bindCardEvents(grid);
}
function mairieCardHTML(m){
  const fav = isFav("mairie", m.id);
  return `
  <article class="card" data-open="mairie:${m.id}">
    <div class="card-top">
      <div class="avatar">${initials(m.commune)}</div>
      <div class="card-title">
        <h4>${escapeHtml(m.commune)}</h4>
        <div class="sub">${escapeHtml(m.maire||"Maire non renseigné")}</div>
      </div>
      <button class="fav-toggle ${fav?'active':''}" data-fav="mairie:${m.id}" title="Ajouter aux favoris">${fav?'★':'☆'}</button>
    </div>
    <div class="card-body">
      ${m.telephone?`<div class="row"><span class="ic">☎️</span><a href="${telHref(m.telephone)}" onclick="event.stopPropagation()">${escapeHtml(m.telephone)}</a></div>`:""}
      ${m.email?`<div class="row"><span class="ic">📧</span><a href="${mailHref(m.email)}" onclick="event.stopPropagation()">${escapeHtml(m.email)}</a></div>`:""}
      ${m.adresse?`<div class="row"><span class="ic">📍</span><span>${escapeHtml(m.adresse)}</span></div>`:""}
    </div>
    <div class="card-actions">
      ${m.telephone?`<button class="icon-action" data-call="${m.telephone}">📞 Appeler</button>`:""}
      ${m.email?`<button class="icon-action" data-mail="${m.email}">📧 Mail</button>`:""}
      ${m.adresse?`<button class="icon-action" data-maps="${m.adresse}">📍 Maps</button>`:""}
    </div>
  </article>`;
}

/* ---------------------------------------------------------
   9. VUE — FAVORIS
--------------------------------------------------------- */
function renderFavoris(){
  const content = $("#content");
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>⭐ Favoris</h2>
        <p>${state.favorites.length} élément(s) enregistré(s) sur cet appareil</p>
      </div>
    </div>
    <div class="cards-grid" id="favoris-grid"></div>
  `;
  const grid = $("#favoris-grid");
  if(state.favorites.length===0){
    grid.outerHTML = emptyStateHTML("⭐","Aucun favori pour le moment","Cliquez sur l'étoile d'une école, d'une mairie ou d'un membre de l'équipe pour la retrouver ici rapidement.");
    return;
  }
  const html = state.favorites.map(f=>{
    const item = findItem(f.type, f.id);
    if(!item) return "";
    if(f.type==="ecole") return ecoleCardHTML(item);
    if(f.type==="mairie") return mairieCardHTML(item);
    if(f.type==="circo") return circoCardHTML(item);
    return "";
  }).join("");
  grid.innerHTML = html || emptyStateHTML("⭐","Favoris introuvables","Les éléments favoris ont peut-être été supprimés des données.");
  bindCardEvents(grid);
}

/* ---------------------------------------------------------
   10. VUE — PARAMÈTRES
--------------------------------------------------------- */
function renderParametres(){
  const isDark = document.documentElement.getAttribute("data-theme")==="dark";
  const hasOverride = !!localStorage.getItem(LS_KEYS.data);
  const content = $("#content");
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>⚙️ Paramètres 🔒</h2>
        <p>Zone protégée — accès autorisé pour cette session</p>
      </div>
      <button class="btn btn-sm" id="settings-lock">🔒 Verrouiller</button>
    </div>
    <div class="settings-grid">
      <div class="settings-card">
        <h3>🎨 Affichage</h3>
        <div class="toggle-row">
          <span>Mode sombre</span>
          <label class="switch"><input type="checkbox" id="dark-toggle" ${isDark?"checked":""}><span class="slider"></span></label>
        </div>
      </div>

      <div class="settings-card">
        <h3>📥 Mettre à jour les données (fichier Excel)</h3>
        <p>Importez un nouveau fichier <b>APPLI_CIRCO.xlsx</b> (feuilles <i>Circo</i>, <i>Ecoles</i>, <i>Mairies</i>) pour remplacer les données actuelles, sans toucher au code de l'application.</p>
        <label class="file-drop" for="file-input">
          📄 Cliquez pour choisir un fichier .xlsx<br><small>ou glissez-déposez le fichier ici</small>
        </label>
        <input type="file" id="file-input" accept=".xlsx,.xls" style="display:none">
        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap">
          ${hasOverride?`<span class="badge" style="background:var(--success);color:#fff">Données personnalisées actives</span>`:`<span class="badge badge-outline">Données d'origine</span>`}
          ${hasOverride?`<button class="btn btn-sm" id="reset-data">↺ Revenir aux données d'origine</button>`:""}
        </div>
      </div>

      <div class="settings-card">
        <h3>🗑 Réinitialiser</h3>
        <p>Effacer les favoris et l'historique de consultation enregistrés sur cet appareil (les données de la circonscription ne sont pas affectées).</p>
        <button class="btn" id="clear-favs">Effacer favoris & historique</button>
      </div>

      <div class="settings-card">
        <h3>ℹ️ À propos</h3>
        <p>CIRCO+ est une application autonome : toutes les données sont stockées localement dans votre navigateur (LocalStorage). Aucune information n'est envoyée vers un serveur.</p>
        <p style="margin-top:10px">Sécurité : module à venir (feuille "Sécurité" réservée aux prochains développements).</p>
      </div>
    </div>
  `;

  $("#settings-lock").addEventListener("click", ()=>{
    sessionStorage.removeItem("circoplus_settings_auth");
    state.view = "dashboard";
    toast("Paramètres verrouillés", "🔒");
    renderAll();
  });

  $("#dark-toggle").addEventListener("change", e=>{
    setTheme(e.target.checked ? "dark" : "light");
  });
  $("#clear-favs").addEventListener("click", ()=>{
    if(confirm("Effacer les favoris et l'historique ?")){
      state.favorites = []; state.recents = [];
      saveJSON(LS_KEYS.favs, []); saveJSON(LS_KEYS.recents, []);
      toast("Favoris et historique effacés", "🗑");
      renderAll();
    }
  });
  const resetBtn = $("#reset-data");
  if(resetBtn) resetBtn.addEventListener("click", ()=>{
    if(confirm("Revenir aux données d'origine du fichier fourni ?")){
      resetDataOverride();
      state.data = DEFAULT_DATA;
      toast("Données d'origine restaurées", "↺");
      renderAll();
    }
  });
  $("#file-input").addEventListener("change", handleExcelImport);
}

/* ---------------------------------------------------------
   11. IMPORT EXCEL (SheetJS) — mise à jour des données
--------------------------------------------------------- */
function sheetToRecords(ws){
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  if(rows.length===0) return [];
  const headers = rows[0].map(h => h ? h.toString().trim() : "");
  return rows.slice(1)
    .filter(r => r.some(c => c !== null && c !== ""))
    .map(r=>{
      const rec = {};
      headers.forEach((h,i)=>{ if(h) rec[h] = r[i]; });
      return rec;
    });
}
function cleanVal(v){
  if(v===null||v===undefined) return "";
  const s = v.toString().trim();
  return (s==="#VALUE!") ? "" : s;
}
function strtoken(s){
  return normalize(s).toUpperCase();
}

function buildDataFromWorkbook(wb){
  const shCirco = wb.Sheets["Circo"];
  const shEcoles = wb.Sheets["Ecoles"];
  const shMairies = wb.Sheets["Mairies"];
  if(!shEcoles || !shMairies) throw new Error("Le fichier doit contenir au minimum les feuilles 'Ecoles' et 'Mairies'.");

  const circoRaw = shCirco ? sheetToRecords(shCirco) : [];
  const ecolesRaw = sheetToRecords(shEcoles);
  const mairiesRaw = sheetToRecords(shMairies);

  const circo = circoRaw.map((r,i)=>({
    id:`circo-${i+1}`,
    nom: cleanVal(r["Prénom / NOM"] ?? r["Nom"]),
    fonction: cleanVal(r["Fonction"]),
    email: cleanVal(r["Email"] ?? r["Mail"]),
    telephone: cleanVal(r["Téléphone"]),
    portable: cleanVal(r["portable"] ?? r["Portable"]),
    avatar: ""
  }));

  const mairies = mairiesRaw.map((r,i)=>({
    id:`mairie-${i+1}`,
    commune: cleanVal(r["Communes"] ?? r["Commune"]),
    maire: cleanVal(r["Maire"]),
    portable: cleanVal(r["Portable"]),
    adresse: cleanVal(r["Adresse"]),
    telephone: cleanVal(r["Tel mairie"]),
    email: cleanVal(r["mail"] ?? r["Mail"]),
    syndicatScolaire: cleanVal(r["Syndicat scolaire"]),
    presidentSyndicat: cleanVal(r["Président syndicat"]),
    emailSyndicat: cleanVal(r["Mail syndicat"]),
    telSyndicat: cleanVal(r["Tel syndicat"]),
    communauteCommunes: cleanVal(r["Communauté de communes"]),
    presidentCC: cleanVal(r["Président C.C"]),
    telCC: cleanVal(r["Tel CC"]),
    emailCC: cleanVal(r["Mail CC"]),
  }));

  const communeNorms = mairies.filter(m=>strtoken(m.commune)!=="LAON").map(m=>[m.commune, strtoken(m.commune)]);
  function findCommune(nomEcole){
    const en = strtoken(nomEcole);
    let best=null, bestLen=0;
    communeNorms.forEach(([commune,cn])=>{
      if(cn && en.startsWith(cn) && cn.length>bestLen){ best=commune; bestLen=cn.length; }
    });
    if(best) return best;
    if(/-LAON$/i.test(nomEcole.trim())) return "LAON";
    return "";
  }

  const ecoles = ecolesRaw.map((r,i)=>({
    id:`ecole-${i+1}`,
    nom: cleanVal(r["Ecole"] ?? r["École"]),
    directeur: cleanVal(r["Directeur/trice"] ?? r["Directeur"]),
    telephone: cleanVal(r["Téléphone"]),
    portable: cleanVal(r["Portable"]),
    email: cleanVal(r["Mail"] ?? r["Email"]),
    decharges: cleanVal(r["Décharges"]),
    horaires: cleanVal(r["Horaire Ecoles"]) || cleanVal(r["Horaires"]),
    secteurCollege: cleanVal(r["Secteur de collège"]),
    commune: ""
  }));
  ecoles.forEach(e=> e.commune = findCommune(e.nom));

  return {circo, ecoles, mairies};
}

function handleExcelImport(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (evt)=>{
    try{
      const wb = XLSX.read(evt.target.result, {type:"array"});
      const data = buildDataFromWorkbook(wb);
      if(data.ecoles.length===0) throw new Error("Aucune école détectée dans le fichier.");
      saveDataOverride(data);
      state.data = data;
      toast(`Import réussi : ${data.ecoles.length} écoles, ${data.mairies.length} mairies`, "✅");
      renderAll();
    }catch(err){
      console.error(err);
      toast("Erreur d'import : " + err.message, "⚠️");
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ---------------------------------------------------------
   12. EXPORT EXCEL D'UNE LISTE
--------------------------------------------------------- */
function exportListToExcel(list, kind){
  if(!list || list.length===0){ toast("Rien à exporter", "⚠️"); return; }
  let rows;
  if(kind==="ecoles"){
    rows = list.map(e=>({
      "École": e.nom, "Directeur/trice": e.directeur, "Commune": e.commune,
      "Téléphone": e.telephone, "Portable": e.portable, "Mail": e.email,
      "Décharges": e.decharges, "Horaires": e.horaires, "Secteur de collège": e.secteurCollege
    }));
  }else{
    rows = list.map(m=>({
      "Commune": m.commune, "Maire": m.maire, "Adresse": m.adresse,
      "Téléphone mairie": m.telephone, "Mail mairie": m.email,
      "Syndicat scolaire": m.syndicatScolaire, "Président syndicat": m.presidentSyndicat,
      "Communauté de communes": m.communauteCommunes, "Président CC": m.presidentCC
    }));
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, kind==="ecoles"?"Ecoles":"Mairies");
  XLSX.writeFile(wb, `export_${kind}_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast("Export Excel généré", "⬇️");
}

/* ---------------------------------------------------------
   13. FICHE DÉTAILLÉE (modale)
--------------------------------------------------------- */
function bindCardEvents(container){
  $$('[data-open]', container).forEach(card=>{
    card.addEventListener("click", ()=>{
      const [type,id] = card.dataset.open.split(":");
      openFiche(type,id);
    });
  });
  $$('[data-fav]', container).forEach(btn=>{
    btn.addEventListener("click", (ev)=>{
      ev.stopPropagation();
      const [type,id] = btn.dataset.fav.split(":");
      toggleFav(type,id);
    });
  });
  $$('[data-call]', container).forEach(btn=>{
    btn.addEventListener("click", (ev)=>{ ev.stopPropagation(); window.location.href = telHref(btn.dataset.call); });
  });
  $$('[data-mail]', container).forEach(btn=>{
    btn.addEventListener("click", (ev)=>{ ev.stopPropagation(); window.location.href = mailHref(btn.dataset.mail); });
  });
  $$('[data-maps]', container).forEach(btn=>{
    btn.addEventListener("click", (ev)=>{ ev.stopPropagation(); window.open(mapsHref(btn.dataset.maps), "_blank"); });
  });
}

function fieldHTML(label, value, opts={}){
  if(!value) return "";
  let inner = escapeHtml(value);
  if(opts.tel) inner = `<a href="${telHref(value)}">${escapeHtml(value)}</a>`;
  if(opts.mail) inner = `<a href="${mailHref(value)}">${escapeHtml(value)}</a>`;
  return `<div class="fiche-field"><div class="lbl">${label}</div><div>${inner}</div></div>`;
}

function openFiche(type, id){
  const item = findItem(type, id);
  if(!item) return;
  pushRecent(type, id);
  saveJSON(LS_KEYS.recents, state.recents);

  let headTitle, headSub, bodyHTML;

  if(type==="ecole"){
    const mairie = findMairieForEcole(item);
    headTitle = item.nom;
    headSub = [item.commune, item.secteurCollege?`Secteur collège : ${item.secteurCollege}`:null].filter(Boolean).join(" · ");
    bodyHTML = `
      <div class="fiche-section">
        <h5>👤 Direction</h5>
        <div class="fiche-grid">
          ${fieldHTML("Directeur / directrice", item.directeur)}
          ${fieldHTML("Téléphone", item.telephone, {tel:true})}
          ${fieldHTML("Portable", item.portable, {tel:true})}
          ${fieldHTML("Mail", item.email, {mail:true})}
          ${fieldHTML("Décharges", item.decharges)}
          ${fieldHTML("Horaires", item.horaires)}
          ${fieldHTML("Secteur de collège", item.secteurCollege)}
        </div>
      </div>
      ${mairie ? `
      <div class="fiche-section">
        <h5>🏛 Mairie correspondante</h5>
        <div class="fiche-linked">
          <div class="fiche-grid">
            ${fieldHTML("Commune", mairie.commune)}
            ${fieldHTML("Maire", mairie.maire)}
            ${fieldHTML("Téléphone mairie", mairie.telephone, {tel:true})}
            ${fieldHTML("Mail mairie", mairie.email, {mail:true})}
            ${fieldHTML("Adresse", mairie.adresse)}
            ${fieldHTML("Syndicat scolaire", mairie.syndicatScolaire)}
            ${fieldHTML("Président syndicat", mairie.presidentSyndicat)}
            ${fieldHTML("Tél. syndicat", mairie.telSyndicat, {tel:true})}
            ${fieldHTML("Communauté de communes", mairie.communauteCommunes)}
            ${fieldHTML("Président C.C.", mairie.presidentCC)}
            ${fieldHTML("Tél. C.C.", mairie.telCC, {tel:true})}
          </div>
        </div>
      </div>` : `<div class="fiche-section"><p class="empty-note">Aucune mairie correspondante trouvée dans les données.</p></div>`}
    `;
  }else if(type==="mairie"){
    headTitle = item.commune;
    headSub = item.maire ? `Maire : ${item.maire}` : "Mairie";
    bodyHTML = `
      <div class="fiche-section">
        <h5>🏛 Mairie</h5>
        <div class="fiche-grid">
          ${fieldHTML("Maire", item.maire)}
          ${fieldHTML("Adresse", item.adresse)}
          ${fieldHTML("Téléphone", item.telephone, {tel:true})}
          ${fieldHTML("Portable", item.portable, {tel:true})}
          ${fieldHTML("Mail", item.email, {mail:true})}
        </div>
      </div>
      <div class="fiche-section">
        <h5>🏫 Syndicat scolaire</h5>
        <div class="fiche-grid">
          ${fieldHTML("Syndicat scolaire", item.syndicatScolaire)}
          ${fieldHTML("Président", item.presidentSyndicat)}
          ${fieldHTML("Mail", item.emailSyndicat, {mail:true})}
          ${fieldHTML("Téléphone", item.telSyndicat, {tel:true})}
        </div>
      </div>
      <div class="fiche-section">
        <h5>🌐 Communauté de communes</h5>
        <div class="fiche-grid">
          ${fieldHTML("Communauté de communes", item.communauteCommunes)}
          ${fieldHTML("Président", item.presidentCC)}
          ${fieldHTML("Téléphone", item.telCC, {tel:true})}
          ${fieldHTML("Mail", item.emailCC, {mail:true})}
        </div>
      </div>
    `;
  }else if(type==="circo"){
    headTitle = item.nom;
    headSub = item.fonction || "Équipe de circonscription";
    bodyHTML = `
      <div class="fiche-section">
        <h5>👤 Coordonnées</h5>
        <div class="fiche-grid">
          ${fieldHTML("Fonction", item.fonction)}
          ${fieldHTML("Téléphone", item.telephone, {tel:true})}
          ${fieldHTML("Portable", item.portable, {tel:true})}
          ${fieldHTML("Mail", item.email, {mail:true})}
        </div>
      </div>
    `;
  }

  const fav = isFav(type,id);
  const overlay = $("#modal-overlay");
  const addr = type==="ecole" ? item.commune : (type==="mairie" ? item.adresse : null);
  const tel = item.telephone || item.portable;
  const mail = item.email;

  overlay.innerHTML = `
    <div class="modal" id="fiche-modal">
      <div class="modal-head">
        <button class="close-btn" id="modal-close">✕</button>
        <h2>${escapeHtml(headTitle)}</h2>
        <div class="sub">${escapeHtml(headSub)}</div>
      </div>
      <div class="modal-body">
        ${bodyHTML}
        <div class="modal-actions">
          ${tel?`<button class="btn btn-primary" data-call="${tel}">📞 Appeler</button>`:""}
          ${mail?`<button class="btn" data-mail="${mail}">📧 Envoyer un mail</button>`:""}
          ${addr?`<button class="btn" data-maps="${addr}">📍 Google Maps</button>`:""}
          ${mail?`<button class="btn btn-ghost" data-copy-mail="${mail}">📋 Copier le mail</button>`:""}
          ${tel?`<button class="btn btn-ghost" data-copy-tel="${tel}">📋 Copier le n°</button>`:""}
          <button class="btn btn-ghost" data-fav="${type}:${id}">${fav?'★ Retirer des favoris':'☆ Ajouter aux favoris'}</button>
          <button class="btn btn-ghost" id="print-fiche">🖨 Imprimer / PDF</button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("show");
  bindCardEvents(overlay);
  $("#modal-close").addEventListener("click", closeFiche);
  overlay.addEventListener("click", (e)=>{ if(e.target===overlay) closeFiche(); });
  const copyMailBtn = $('[data-copy-mail]', overlay);
  if(copyMailBtn) copyMailBtn.addEventListener("click", ()=>copyText(copyMailBtn.dataset.copyMail, "Mail"));
  const copyTelBtn = $('[data-copy-tel]', overlay);
  if(copyTelBtn) copyTelBtn.addEventListener("click", ()=>copyText(copyTelBtn.dataset.copyTel, "Numéro"));
  const favBtn = $('[data-fav]', overlay.querySelector(".modal-actions"));
  favBtn.addEventListener("click", ()=>{ toggleFav(type,id); openFiche(type,id); });
  $("#print-fiche").addEventListener("click", ()=>{
    overlay.classList.add("printing");
    window.print();
    setTimeout(()=>overlay.classList.remove("printing"), 500);
  });
}
function closeFiche(){
  $("#modal-overlay").classList.remove("show");
}
window.addEventListener("keydown", e=>{ if(e.key==="Escape") closeFiche(); });

function emptyStateHTML(emoji,title,desc){
  return `<div class="empty-state"><div class="emoji">${emoji}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p></div>`;
}

/* ---------------------------------------------------------
   14. RECHERCHE GLOBALE (barre supérieure)
--------------------------------------------------------- */
function renderGlobalResults(q){
  const box = $("#gsearch-results");
  const res = globalSearch(q);
  if(!res){ box.classList.remove("show"); box.innerHTML=""; return; }
  const total = res.ecoles.length + res.mairies.length + res.circo.length;
  if(total===0){
    box.innerHTML = `<div class="gsearch-empty">Aucun résultat pour « ${escapeHtml(q)} »</div>`;
    box.classList.add("show");
    return;
  }
  let html = "";
  if(res.ecoles.length){
    html += `<div class="gsearch-group">Écoles</div>`;
    html += res.ecoles.map(e=>`<div class="gsearch-item" data-open="ecole:${e.id}"><span>🏫</span><div><b>${escapeHtml(e.nom)}</b><small>${escapeHtml(e.directeur||"")}${e.commune?" · "+escapeHtml(e.commune):""}</small></div></div>`).join("");
  }
  if(res.mairies.length){
    html += `<div class="gsearch-group">Mairies</div>`;
    html += res.mairies.map(m=>`<div class="gsearch-item" data-open="mairie:${m.id}"><span>🏛</span><div><b>${escapeHtml(m.commune)}</b><small>${escapeHtml(m.maire||"")}</small></div></div>`).join("");
  }
  if(res.circo.length){
    html += `<div class="gsearch-group">Équipe de circonscription</div>`;
    html += res.circo.map(p=>`<div class="gsearch-item" data-open="circo:${p.id}"><span>👥</span><div><b>${escapeHtml(p.nom)}</b><small>${escapeHtml(p.fonction||"")}</small></div></div>`).join("");
  }
  box.innerHTML = html;
  box.classList.add("show");
  $$('[data-open]', box).forEach(el=>{
    el.addEventListener("click", ()=>{
      const [type,id] = el.dataset.open.split(":");
      $("#global-search").value = "";
      box.classList.remove("show");
      openFiche(type,id);
    });
  });
}

/* ---------------------------------------------------------
   15. THEME
--------------------------------------------------------- */
function setTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(LS_KEYS.theme, t);
  const btn = $("#theme-toggle");
  if(btn) btn.textContent = t==="dark" ? "☀️" : "🌙";
}

/* ---------------------------------------------------------
   16. SIDEBAR MOBILE
--------------------------------------------------------- */
function closeSidebarMobile(){
  $("#sidebar").classList.remove("open");
  $("#sidebar-scrim").classList.remove("show");
}
function toggleSidebarMobile(){
  $("#sidebar").classList.toggle("open");
  $("#sidebar-scrim").classList.toggle("show");
}

/* ---------------------------------------------------------
   17. INITIALISATION
--------------------------------------------------------- */
function init(){
  const savedTheme = localStorage.getItem(LS_KEYS.theme) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark":"light");
  setTheme(savedTheme);

  $("#global-search").addEventListener("input", e=>{
    state.globalQuery = e.target.value;
    renderGlobalResults(e.target.value);
  });
  $("#global-search").addEventListener("focus", e=>{ if(e.target.value) renderGlobalResults(e.target.value); });
  document.addEventListener("click", e=>{
    if(!e.target.closest(".search-wrap") && !e.target.closest(".gsearch-results")){
      $("#gsearch-results").classList.remove("show");
    }
  });
  $("#theme-toggle").addEventListener("click", ()=>{
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur==="dark" ? "light" : "dark");
  });
  $("#menu-toggle").addEventListener("click", toggleSidebarMobile);
  $("#sidebar-scrim").addEventListener("click", closeSidebarMobile);

  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

})();
