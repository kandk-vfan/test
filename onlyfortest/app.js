let data = [];
let currentRangeType = null;

const STORAGE_KEY = "tableTheme";
const MONETIZED_DATE = new Date("2026-02-23");

let YOMI_MAP = {};
function getYomi(str, artist){
  if(!str) return "";

  const s = normalize(str);
  const a = normalize(artist || "");

  const key = `${s}||${a}`;

  return YOMI_MAP[key] || YOMI_MAP[s] || s;
}

let bookmarkedIds = new Set();

window.onBookmarksChanged = function(ids){
  bookmarkedIds = ids;
  renderAll();
};

function showToast(message){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 1800);
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let myPlaylists = [];

window.onPlaylistsChanged = function(playlists){
  myPlaylists = playlists;
  renderPlaylistSidebar();
};

function closePlaylistMenu(){
  document.getElementById("activePlaylistMenu")?.remove();
}

async function openPlaylistMenu(btn, title, artist, videoId, time, note){
  closePlaylistMenu();

  const uid = window.vsongAuth.auth.currentUser.uid;
  const playlistIds = myPlaylists.map(p => p.id);
  const containing = await window.vsongPlaylists.getPlaylistsContainingSong(uid, playlistIds, title, artist, videoId, time);

  const menu = document.createElement("div");
  menu.className = "playlist-menu";
  menu.id = "activePlaylistMenu";

  menu.innerHTML = `
    <div class="playlist-menu-title">保存先...</div>
    ${myPlaylists.map(p => `
      <button class="playlist-menu-item" data-id="${p.id}">
        <span>${escapeHtml(p.name)}</span>
        <span class="playlist-menu-check">${containing[p.id] ? "✅" : "☐"}</span>
      </button>
    `).join("")}
    <button class="playlist-menu-item playlist-menu-new" data-id="__new__">＋ 新しいリスト</button>
  `;

  document.body.appendChild(menu);

  const rect = btn.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;

  menu.querySelectorAll(".playlist-menu-item").forEach(item => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = item.dataset.id;

      if(id === "__new__"){
        closePlaylistMenu();
        const name = prompt("新しいリスト名を入力してください");
        if(!name) return;
        const newId = await window.vsongPlaylists.createPlaylist(uid, name);
        await window.vsongPlaylists.addSongToPlaylist(uid, newId, title, artist, videoId, time, note);
        showToast(`「${name}」に追加しました`);
        return;
      }

      const name = item.querySelector("span").textContent;

      if(containing[id]){
        await window.vsongPlaylists.removeSongFromPlaylist(uid, id, title, artist, videoId, time);
        showToast(`「${name}」から外しました`);
      }else{
        await window.vsongPlaylists.addSongToPlaylist(uid, id, title, artist, videoId, time, note);
        showToast(`「${name}」に追加しました`);
      }

      closePlaylistMenu();
    });
  });

  setTimeout(() => {
    document.addEventListener("click", closePlaylistMenu, { once: true });
  }, 0);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".playlist-add-btn");
  if(!btn) return;
  e.stopPropagation();
  openPlaylistMenu(btn, btn.dataset.title, btn.dataset.artist, btn.dataset.videoId, btn.dataset.time, btn.dataset.note);
});

function toggleBookmark(videoId, videoTitle){
  if(!currentUsername){
    return;
  }

  const isBookmarked = bookmarkedIds.has(videoId);
  const uid = window.vsongAuth.auth.currentUser.uid;

  window.vsongBookmarks.toggleBookmark(uid, videoId, !isBookmarked)
    .then(() => {
      showToast(isBookmarked ? "ブックマークを解除しました" : "ブックマークに追加しました");
    })
    .catch(() => {
      showToast("エラーが発生しました");
    });
}

function matchText(text, keyword, exact, caseSensitive){
  text = normalizeSearch(text);
  keyword = normalizeSearch(keyword);

  if(!caseSensitive){
    text = text.toLowerCase();
    keyword = keyword.toLowerCase();
  }

  if(exact){
    return text === keyword;
  }else{
    return text.includes(keyword);
  }
}

function parseKeyword(input){
  const raw = normalize(input);

  if(raw.includes("&&") || raw.includes("＆＆")){
    return {
      mode: "AND",
      keywords: raw
        .split(/&&|＆＆/)
        .map(k => normalize(k))
        .filter(k => k)
    };
  }

  return {
    mode: "SINGLE",
    keywords: [raw]
  };
}

function toLocalDateString(dateStr){
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function getFilteredData(){
  const isMonetizedOnly = document.querySelector(".monetizedToggle")?.checked;

  let result = data;

  if(isMonetizedOnly){
    result = result.filter(d => toLocalDateString(d.date) >= toLocalDateString(MONETIZED_DATE));
  }

  const startEl = document.querySelector(".startDate");
  const endEl = document.querySelector(".endDate");

  const start = startEl?.value;
  const end = endEl?.value;

  if(start){
    result = result.filter(d => toLocalDateString(d.date) >= start);
  }

  if(end){
    result = result.filter(d => toLocalDateString(d.date) <= end);
  }

  return result;
}

function syncDateInputs(start, end){
  document.querySelectorAll(".startDate").forEach(el=>{
    el.value = start;
  });

  document.querySelectorAll(".endDate").forEach(el=>{
    el.value = end;
  });
}

function normalize(str){
  return str.replace(/^[\s　]+|[\s　]+$/g, "");
}

function normalizeSearch(str){
  return normalize(str).normalize("NFKC");
}

function setDateRange(type){
  if(currentRangeType === type){
    currentRangeType = null;
    syncDateInputs("", "");
    highlightButton(null);
    renderAll();
    return;
  }

  currentRangeType = type;

  const now = new Date();

  let start = "";
  let end = "";

  if(type === "thisMonth"){
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date();
  }

  if(type === "lastMonth"){
    start = new Date(now.getFullYear(), now.getMonth()-1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  }

  if(type === "thisYear"){
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date();
  }

  if(type === "lastYear"){
    start = new Date(now.getFullYear()-1, 0, 1);
    end = new Date(now.getFullYear()-1, 11, 31);
  }

  if(type === "all"){
    if(data.length === 0){
      start = "";
      end = "";
    }else{
      const dates = data.map(d => new Date(d.date));
      start = new Date(Math.min(...dates));
      end = new Date(Math.max(...dates));
    }
  }

  const s = formatInputDate(start);
  const e = formatInputDate(end);

  syncDateInputs(s, e);
  highlightButton(type);
  renderAll();
}

function formatInputDate(d){
  if(!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function highlightButton(type){
  document.querySelectorAll(".quick-buttons button").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.type === type);
  });
}

function debounce(fn, delay=300){
  let timer;
  return (...args)=>{
    clearTimeout(timer);
    timer = setTimeout(()=>fn(...args), delay);
  };
}

Promise.all([
  fetch("data.json").then(r=>r.json()),
  fetch("../common/yomi.json")
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({})),
  fetch("status.json")
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
]).then(([dataJson, yomiJson, statusJson])=>{
  YOMI_MAP = yomiJson || {};

  data = dataJson.map(d => ({
    ...d,
    title: normalize(d.title),
    artist: normalize(d.artist)
  }));

  document.querySelectorAll(".statusCheckedAt").forEach(el=>{
    el.textContent = formatDateTime(statusJson?.checkedAt);
  });

  document.querySelectorAll(".startDate").forEach(el=>el.value="");
  document.querySelectorAll(".endDate").forEach(el=>el.value="");

  renderAll();
});

function key(d){
  return d.title + "||" + d.artist;
}

function toWatchUrl(videoId, time){
  const sec = time.split(":").reduce((a,b)=>a*60+Number(b));
  return `https://www.youtube.com/watch?v=${videoId}&t=${sec}s`;
}

function statusLabel(status){
  if(status === "unlisted") return "限定公開のため視聴不可";
  if(status === "gone") return "非公開または削除のため視聴不可";
  if(status === "members") return "メンバー限定";
  return "";
}

function renderPlayButton(item){
  const status = item.status || "public";

  if(status === "public"){
    return `<button class="play-btn" onclick="play('${item.videoId}','${item.time}')">▶</button>`;
  }

  if(status === "members"){
    return `<a class="play-btn" href="${toWatchUrl(item.videoId, item.time)}" target="_blank" title="${statusLabel(status)}">▶</a>`;
  }

  return `<button class="play-btn" disabled title="${statusLabel(status)}">▶</button>`;
}

function renderPlaylistAddButton(item){
  if(!currentUsername) return "";
  if(!item.status || item.status !== "public") return "";

  return `<button class="playlist-add-btn" data-title="${escapeHtml(item.title)}" data-artist="${escapeHtml(item.artist)}" data-video-id="${item.videoId}" data-time="${item.time}" data-note="${escapeHtml(item.note || "")}" title="ブックマーク(曲)に追加">＋</button>`;
}

function formatDateTime(iso){
  if(!iso) return "";
  const d = new Date(iso);

  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);

  const get = type => parts.find(p => p.type === type)?.value;

  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function renderAll(){
  renderSummary();
  renderSongs();
  renderStreams();
  renderBookmarks();
  renderArtists();
}

function renderSummary(){
  const isStreams = !document.getElementById("streams").classList.contains("hidden");

  let src;

  if(isStreams){
    let base = getFilteredData();

    const unplayableOnly = document.getElementById("filterStreamsUnplayable")?.checked;
    if(unplayableOnly){
      base = base.filter(d => (d.status || "public") === "public");
    }

    const hikigatariOnly = document.getElementById("filterStreamsHikigatari")?.checked;

    if(hikigatariOnly){
      src = base.filter(d =>
        normalize(d.videoTitle).includes("弾き語り") ||
        normalize(d.videoTitle).includes("ギター")
      );
    }else{
      src = base;
    }

  }else{
    let base = getFilteredData();

    const unplayableOnly = document.getElementById("filterUnplayable")?.checked;
    if(unplayableOnly){
      base = base.filter(d => (d.status || "public") === "public");
    }

    const hikigatariOnly = document.getElementById("filterHikigatari")?.checked;
    if(hikigatariOnly){
      src = base.filter(d =>
        (d.note || "").replace(/^[\s　]+|[\s　]+$/g, "") === "弾き語り"
      );
    }else{
      src = base;
    }
  }

  const songSet=new Set();
  const artistSet=new Set();

  src.forEach(d=>{
    songSet.add(key(d));
    artistSet.add(d.artist);
  });

  const html = `
  <div class="summary-row"><span class="label">曲数 (ユニーク)</span><span class="value">${songSet.size}</span></div>
  <div class="summary-row"><span class="label">歌唱回数</span><span class="value">${src.length}</span></div>
  <div class="summary-row"><span class="label">アーティスト数</span><span class="value">${artistSet.size}</span></div>
  `;

  const isArtists = !document.getElementById("artists").classList.contains("hidden");

  if(isStreams){
    document.getElementById("streamsSummary").innerHTML = html;
  }else if(isArtists){
    document.getElementById("artistsSummary").innerHTML = html;
  }else{
    document.getElementById("songsSummary").innerHTML = html;
  }
}

function renderSongs(){
  let src = getFilteredData();

  const unplayableOnly = document.getElementById("filterUnplayable")?.checked;
  if(unplayableOnly){
    src = src.filter(d => (d.status || "public") === "public");
  }

  const map={};

  src.forEach(d=>{
    const k=key(d);
    if(!map[k]) map[k]={
      title:d.title,artist:d.artist,notes:new Set(),count:0,
      latest:d,latestPlayable:null,
      latestOngen:null,latestOngenPlayable:null,
      latestHikigatari:null,latestHikigatariPlayable:null
    };
    const note = (d.note || "").replace(/^[\s　]+|[\s　]+$/g, "");
    const isPlayable = (d.status || "public") === "public";
    map[k].notes.add(note);
    map[k].count++;
    if(new Date(d.date)>new Date(map[k].latest.date)){
      map[k].latest=d;
    }
    if(isPlayable && (!map[k].latestPlayable || new Date(d.date)>new Date(map[k].latestPlayable.date))){
      map[k].latestPlayable=d;
    }
    if(note === "弾き語り"){
      if(!map[k].latestHikigatari || new Date(d.date)>new Date(map[k].latestHikigatari.date)){
        map[k].latestHikigatari=d;
      }
      if(isPlayable && (!map[k].latestHikigatariPlayable || new Date(d.date)>new Date(map[k].latestHikigatariPlayable.date))){
        map[k].latestHikigatariPlayable=d;
      }
    }else{
      if(!map[k].latestOngen || new Date(d.date)>new Date(map[k].latestOngen.date)){
        map[k].latestOngen=d;
      }
      if(isPlayable && (!map[k].latestOngenPlayable || new Date(d.date)>new Date(map[k].latestOngenPlayable.date))){
        map[k].latestOngenPlayable=d;
      }
    }
  });

  let arr=Object.values(map);

  arr.forEach(s=>{
    s.latest = s.latestPlayable || s.latest;
    s.latestOngen = s.latestOngenPlayable || s.latestOngen;
    s.latestHikigatari = s.latestHikigatariPlayable || s.latestHikigatari;
  });

  arr.forEach(s=>{
    const notes = s.notes;
    const noteList = [...notes];
    const muteNote = noteList.find(n => n.includes("ミュート"));
    const labels = [];
  
    if(notes.has("")) labels.push("音源");
    if(notes.has("弾き語り")) labels.push("弾き語り");
    if(muteNote) labels.push(muteNote);
  
    if(labels.length === 1 && labels[0] === "音源"){
      s.displayNote = "";
    } else {
      s.displayNote = labels.join("・");
    }
  
    s.hasHikigatari = notes.has("弾き語り");
  });

  const hikigatariOnly = document.getElementById("filterHikigatari").checked;
  if(hikigatariOnly){
    arr = arr.filter(s => s.hasHikigatari);
  }

  let keyword = document.getElementById("searchSongs").value;
  const {mode, keywords} = parseKeyword(keyword);
  
  const exact = document.getElementById("exactMatchSongs").checked;
  const caseSensitive = document.getElementById("caseSensitiveSongs").checked;
  
  if(keywords[0]){
    arr = arr.filter(s => {
  
      if(mode === "AND"){
        return keywords.every(k =>
          matchText(s.title, k, exact, caseSensitive) ||
          matchText(s.artist, k, exact, caseSensitive)
        );
      }
  
      return matchText(s.title, keywords[0], exact, caseSensitive) ||
             matchText(s.artist, keywords[0], exact, caseSensitive);
    });
  }

  if(arr.length===0){
    document.getElementById("songsBody").innerHTML=`<tr><td colspan="4">該当する結果がありません</td></tr>`;
    return;
  }

  const type=document.getElementById("sortSongsType").value;
  const order=document.getElementById("sortSongsOrder").value;

  arr.sort((a,b)=>{
    let res=0;
  
    if(type==="artist"){
      res = getYomi(a.artist).localeCompare(getYomi(b.artist),"ja");
  
      if(res===0){
        return getYomi(a.title, a.artist).localeCompare(getYomi(b.title, b.artist),"ja");
      }
    }
  
    else if(type==="count"){
      res = a.count - b.count;
  
      if(res===0){
        return getYomi(a.title, a.artist).localeCompare(getYomi(b.title, b.artist),"ja");
      }
    }

    else if(type==="date"){
      res = new Date(a.latest.date) - new Date(b.latest.date);
    
      if(res===0){
        return getYomi(a.title, a.artist).localeCompare(getYomi(b.title, b.artist),"ja");
      }
    }
  
    else{
      res = getYomi(a.title, a.artist).localeCompare(getYomi(b.title, b.artist),"ja");
    }
  
    return order==="desc"?-res:res;
  });

  const tbody=document.getElementById("songsBody");

  let html="";
  arr.forEach(s=>{
    html+=`
<tr>
<td>${s.title}</td>
<td>${s.artist}</td>
<td>${s.count}</td>
<td>
  <div class="song-play-area">
    ${s.displayNote.includes("・") ? `
    <div class="play-group">
      ${renderPlayButton(s.latestOngen)}
      <div class="song-date">${formatDate(s.latestOngen.date)}<br>(音源)${s.latestOngen.status && s.latestOngen.status !== "public" ? `<br>${statusLabel(s.latestOngen.status)}` : ""}</div>
      ${renderPlaylistAddButton(s.latestOngen)}
    </div>
    <div class="play-group">
      ${renderPlayButton(s.latestHikigatari)}
      <div class="song-date">${formatDate(s.latestHikigatari.date)}<br>(弾き語り)${s.latestHikigatari.status && s.latestHikigatari.status !== "public" ? `<br>${statusLabel(s.latestHikigatari.status)}` : ""}</div>
      ${renderPlaylistAddButton(s.latestHikigatari)}
    </div>
    ` : `
    ${renderPlayButton(s.latest)}
    <div class="song-date">${formatDate(s.latest.date)}${s.latest.status && s.latest.status !== "public" ? `<br>${statusLabel(s.latest.status)}` : ""}</div>
    ${renderPlaylistAddButton(s.latest)}
    `}
  </div>
</td>
<td>${s.displayNote}</td>
</tr>`;
  });

  tbody.innerHTML=html;
}

function renderArtists(){
  const src = getFilteredData();

  const map={};

  src.forEach(d=>{
    if(!map[d.artist]) map[d.artist]=new Set();
    map[d.artist].add(d.title);
  });

  let artists=Object.keys(map);

  let keyword = document.getElementById("searchArtists").value;
  const {mode, keywords} = parseKeyword(keyword);
  
  const exact = document.getElementById("exactMatchArtists").checked;
  const caseSensitive = document.getElementById("caseSensitiveArtists").checked;
  
  if(keywords[0]){
    artists = artists.filter(a => {
  
      if(mode === "AND"){
        return keywords.every(k =>
          matchText(a, k, exact, caseSensitive) ||
          Array.from(map[a]).some(t => matchText(t, k, exact, caseSensitive))
        );
      }
  
      return matchText(a, keywords[0], exact, caseSensitive) ||
             Array.from(map[a]).some(t => matchText(t, keywords[0], exact, caseSensitive));
    });
  }

  if(artists.length===0){
    document.getElementById("artistsBody").innerHTML=`<tr><td colspan="2">該当する結果がありません</td></tr>`;
    return;
  }

  const type=document.getElementById("sortArtistsType").value;
  const order=document.getElementById("sortArtistsOrder").value;

  artists.sort((a,b)=>{
    let res=0;

    if(type==="count"){
      res = map[a].size - map[b].size;
    }else{
      res = getYomi(a).localeCompare(getYomi(b),"ja");
    }

    return order==="desc"?-res:res;
  });

  const tbody=document.getElementById("artistsBody");

  let html="";
  artists.forEach(a=>{
    const count = map[a].size;

    html+=`
<tr class="artist-header">
<td colspan="2">${a} (${count}曲)</td>
</tr>`;

    const songs = Array.from(map[a]).sort((t1,t2)=>
      getYomi(t1, a).localeCompare(getYomi(t2, a),"ja")
    );

    songs.forEach(t=>{
      html+=`
<tr class="artist-song-row">
<td></td>
<td>${t}</td>
</tr>`;
    });
  });

  tbody.innerHTML=html;
}

function renderStreamList(config){
  let src = config.getSrc();

  const map={};

  src.forEach(d=>{
    if(!map[d.videoId]){
      map[d.videoId]={
        title:d.videoTitle,
        latestDate:new Date(d.date),
        streamNote:d.streamNote || "",
        songs:[]
      };
    }
    map[d.videoId].songs.push(d);
  
    const dDate = new Date(d.date);
    if(dDate > map[d.videoId].latestDate){
      map[d.videoId].latestDate = dDate;
    }
  });

  let arr=Object.entries(map);

  const hikigatariOnly = document.getElementById(config.hikigatariCheckboxId)?.checked;
  if(hikigatariOnly){
    arr = arr.filter(([vid, v]) =>
      normalize(v.title).includes("弾き語り") ||
      normalize(v.title).includes("ギター")
    );
  }

  const order=document.getElementById(config.sortSelectId).value;

  arr.sort((a,b)=>{
    const aDate=a[1].latestDate;
    const bDate=b[1].latestDate;
    return order==="desc"?bDate-aDate:aDate-bDate;
  });

  let keyword = document.getElementById(config.searchInputId).value;
  const {mode, keywords} = parseKeyword(keyword);
  
  const exact = document.getElementById(config.exactId).checked;
  const caseSensitive = document.getElementById(config.caseId).checked;
  const container=document.getElementById(config.containerId);
  container.innerHTML="";

  let hitCount=0;

  arr.forEach(([vid,v])=>{
    const unique=[];
    const seen=new Set();

    v.songs.forEach(s=>{
      const k=`${s.time}||${s.title}||${s.artist}`;
      if(!seen.has(k)){
        seen.add(k);
        unique.push(s);
      }
    });

    const filtered = unique;

    // 備考で表示したいワード (部分一致で検索される)
    const streamNoteKeywords = [
      "ミュート"
    ];
    
    const notes = unique
      .filter(s => {
        const note = (s.note || "").trim();
        return note && streamNoteKeywords.some(keyword => note.includes(keyword));
      })
      .map(s => ({
        title: s.title,
        note: s.note.trim()
      }));

    const videoStatus = unique[0]?.status || "public";
    
    function isMatch(s){
      if(!keywords[0]) return false;
    
      if(mode === "AND"){
        return keywords.every(k =>
          matchText(s.title, k, exact, caseSensitive) ||
          matchText(s.artist, k, exact, caseSensitive)
        );
      }
    
      return matchText(s.title, keywords[0], exact, caseSensitive) ||
             matchText(s.artist, keywords[0], exact, caseSensitive);
    }
    
    if(keyword && !unique.some(isMatch)) return;

    hitCount++;

    const card=document.createElement("div");
    card.className="card";

    const bookmarked = bookmarkedIds.has(vid);

    card.innerHTML=`
<div class="stream-title-row">
<a href="https://youtube.com/watch?v=${vid}" target="_blank">${v.title}</a>
${currentUsername ? `
<button class="bookmark-btn ${bookmarked ? "bookmarked" : ""}" onclick="toggleBookmark('${vid}')" title="${bookmarked ? "ブックマーク済み(クリックで解除)" : "ブックマークに追加"}">
${bookmarked ? "★" : "☆"}ブックマーク${bookmarked ? "済み" : ""}
</button>
` : ""}
</div>

<div class="stream-date">${formatDate(v.latestDate)}</div>

${v.streamNote || notes.length || videoStatus !== "public" ? `
<div class="stream-notes">
  <b>備考</b>
  ${videoStatus !== "public" ? `<div>🔒 ${statusLabel(videoStatus)}</div>` : ""}
  ${v.streamNote ? `<div>${v.streamNote}</div>` : ""}
  ${notes.length ? `
  <ul>
  ${notes.map(n => `
  <li>${n.title}：${n.note}</li>
  `).join("")}
  </ul>
  ` : ""}
</div>
` : ""}

<div class="grid">
${filtered.map((s,i)=>`
<div class="song-card ${isMatch(s) ? "highlight" : ""}">
<div class="song-card-head">
<span class="num">${String(i+1).padStart(2,"0")}</span>
${renderPlayButton({videoId: vid, time: s.time, status: s.status})}
</div>
<div class="song-card-title">${s.title}</div>
<div class="song-card-artist">${s.artist}</div>
${renderPlaylistAddButton({ title: s.title, artist: s.artist, videoId: vid, time: s.time, note: s.note, status: s.status })}
</div>`).join("")}
</div>`;

    container.appendChild(card);
  });

  document.getElementById(config.countId).innerText = `${config.countLabel}：${hitCount}件`;
  
  if(hitCount===0){
    container.innerHTML = `<p>${src.length===0 ? config.emptyMessage : "該当する結果がありません"}</p>`;
  }
}

function renderStreams(){
  renderStreamList({
    getSrc: () => {
      let src = getFilteredData();
      const unplayableOnly = document.getElementById("filterStreamsUnplayable")?.checked;
      if(unplayableOnly){
        src = src.filter(d => (d.status || "public") === "public");
      }
      return src;
    },
    hikigatariCheckboxId: "filterStreamsHikigatari",
    searchInputId: "searchStreams",
    exactId: "exactMatchStreams",
    caseId: "caseSensitiveStreams",
    sortSelectId: "sortStreamsOrder",
    containerId: "streamsContainer",
    countId: "streamsCount",
    countLabel: "配信数",
    emptyMessage: "該当する結果がありません"
  });
}

function renderBookmarks(){
  renderStreamList({
    getSrc: () => {
      let src = data.filter(d => bookmarkedIds.has(d.videoId));
      const unplayableOnly = document.getElementById("filterBookmarksUnplayable")?.checked;
      if(unplayableOnly){
        src = src.filter(d => (d.status || "public") === "public");
      }
      return src;
    },
    hikigatariCheckboxId: "filterBookmarksHikigatari",
    searchInputId: "searchBookmarks",
    exactId: "exactMatchBookmarks",
    caseId: "caseSensitiveBookmarks",
    sortSelectId: "sortBookmarksOrder",
    containerId: "bookmarksContainer",
    countId: "bookmarksCount",
    countLabel: "ブックマーク数",
    emptyMessage: "まだブックマークがありません。配信一覧から☆ブックマークを押して追加できます"
  });
}

function showTab(id,btn){
  document.querySelectorAll(".section").forEach(el=>el.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  document.querySelectorAll(".tab-button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderSummary();
}

function play(videoId,time){
  const sec=time.split(":").reduce((a,b)=>a*60+Number(b));
  document.getElementById("player").innerHTML=
`<iframe src="https://www.youtube.com/embed/${videoId}?start=${sec}&autoplay=1" allow="autoplay" allowfullscreen></iframe>`;
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal(){
  document.getElementById("player").innerHTML="";
  document.getElementById("modal").classList.add("hidden");
}

function formatDate(d){
  const date=new Date(d);
  return `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,"0")}/${String(date.getDate()).padStart(2,"0")}`;
}

let currentUsername = null;
let lastRenderedAuthState = "__unset__";

function renderAuthArea(user){
  if(user === lastRenderedAuthState){
    return;
  }
  lastRenderedAuthState = user;
  currentUsername = user;

  const el = document.getElementById("authArea");

  if(user){
    el.innerHTML = `
      <button id="authTrigger" class="auth-trigger">👤 ${user}</button>
      <div id="authPanel" class="auth-panel hidden">
        <button id="authClose" class="auth-close">×</button>
        <button id="openSettingsBtn">設定</button>
        <button class="auth-switch" onclick="openPrivacyModal()">プライバシーポリシー</button>
        <button id="logoutBtn">ログアウト</button>
      </div>
    `;
    document.getElementById("logoutBtn").addEventListener("click", () => {
      window.vsongAuth.logOut();
    });

    document.getElementById("openSettingsBtn").addEventListener("click", () => {
      document.getElementById("authPanel").classList.add("hidden");
      openSettingsModal();
    });

    document.getElementById("authTrigger").addEventListener("click", () => {
      document.getElementById("authPanel").classList.toggle("hidden");
    });

    document.getElementById("authClose").addEventListener("click", () => {
      document.getElementById("authPanel").classList.add("hidden");
    });
  }else{
    renderAuthPanelBody(el, "login");
  }
}

function renderAuthPanelBody(el, mode){
  const isSignup = mode === "signup";

  el.innerHTML = `
    <button id="authTrigger" class="auth-trigger">ログイン</button>
    <div id="authPanel" class="auth-panel hidden">
      <button id="authClose" class="auth-close">×</button>
      <div class="auth-panel-title">${isSignup ? "新規登録" : "ログイン"}</div>
      <input id="authUsername" placeholder="ユーザー名">
      <div class="auth-password-row">
        <input id="authPassword" type="password" placeholder="パスワード">
        <button id="authTogglePw" type="button" class="auth-toggle-pw">👁</button>
      </div>
      ${isSignup ? `<span class="auth-note">パスワードは6文字以上で設定してください</span>` : ""}
      ${isSignup ? `
      <input id="authEmail" type="email" placeholder="メールアドレス(任意)">
      <span class="auth-note">パスワードを忘れた際の再発行に使えます。後から登録はできません</span>
      ` : ""}
      <button id="authSubmit">${isSignup ? "登録する" : "ログイン"}</button>
      <button id="authSwitch" class="auth-switch">${isSignup ? "ログインはこちら" : "はじめての方はこちら(新規登録)"}</button>
      ${!isSignup ? `<button id="authForgotPw" class="auth-switch">パスワードを忘れた方はこちら</button>` : ""}
      <button class="auth-switch" onclick="openPrivacyModal()">プライバシーポリシー</button>
      <span id="authError" class="auth-error"></span>
    </div>
  `;

  document.getElementById("authTogglePw").addEventListener("click", () => {
    const pwInput = document.getElementById("authPassword");
    pwInput.type = pwInput.type === "password" ? "text" : "password";
  });

  document.getElementById("authTrigger").addEventListener("click", () => {
    document.getElementById("authHint")?.remove();
    document.getElementById("authPanel").classList.toggle("hidden");
  });

  document.getElementById("authClose").addEventListener("click", () => {
    document.getElementById("authPanel").classList.add("hidden");
  });

  document.getElementById("authSwitch").addEventListener("click", () => {
    renderAuthPanelBody(el, isSignup ? "login" : "signup");
    document.getElementById("authPanel").classList.remove("hidden");
  });

  document.getElementById("authForgotPw")?.addEventListener("click", async () => {
    const username = document.getElementById("authUsername").value.trim();
    const errorEl = document.getElementById("authError");

    if(!username){
      errorEl.textContent = "ユーザー名を入力してから押してください";
      return;
    }

    try{
      await window.vsongAccount.sendPasswordReset(username);
      errorEl.textContent = "";
      errorEl.style.color = "#4ade80";
      errorEl.textContent = "登録済みのメールアドレスに再設定用のメールを送りました";
    }catch(e){
      errorEl.style.color = "";
      errorEl.textContent = e.message || "エラーが発生しました";
    }
  });

  document.getElementById("authSubmit").addEventListener("click", async () => {
    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value;
    const errorEl = document.getElementById("authError");

    if(!username || !password){
      errorEl.textContent = "ユーザー名とパスワードを両方入力してください";
      return;
    }

    try{
      if(isSignup){
        const email = document.getElementById("authEmail").value.trim();
        await window.vsongAuth.signUp(username, password, email || null);
      }else{
        await window.vsongAuth.logIn(username, password);
      }
      renderAuthArea(username);
    }catch(e){
      errorEl.textContent = e.message || "エラーが発生しました";
    }
  });
}

function showProtectedTab(id, btn){
  if(!currentUsername){
    const panel = document.getElementById("authPanel");
    panel.classList.remove("hidden");

    let hint = document.getElementById("authHint");
    if(!hint){
      hint = document.createElement("div");
      hint.id = "authHint";
      hint.className = "auth-hint";
      panel.prepend(hint);
    }
    hint.textContent = "ログインするとブックマーク・プレイリストが使えます";
    return;
  }
  showTab(id, btn);
}

function handleLogout(){
  const protectedIds = ["bookmarks", "playlists"];
  const current = protectedIds.find(id => !document.getElementById(id).classList.contains("hidden"));

  if(!current){
    return;
  }

  const songsBtn = document.querySelector('.tab-button[onclick*="\'songs\'"]');
  showTab("songs", songsBtn);
}

window.vsongAuthReady = window.vsongAuth
  ? Promise.resolve()
  : new Promise(resolve => {
      window.addEventListener("vsong-auth-ready", resolve, { once: true });
    });

document.getElementById("searchSongs").addEventListener("input", debounce(renderSongs));
document.getElementById("searchStreams").addEventListener("input", debounce(renderStreams));
document.getElementById("searchArtists").addEventListener("input", debounce(renderArtists));

document.getElementById("sortSongsOrder").addEventListener("change", renderSongs);
document.getElementById("sortStreamsOrder").addEventListener("change", renderStreams);
document.getElementById("sortArtistsOrder").addEventListener("change", renderArtists);

document.getElementById("sortArtistsType").addEventListener("change", ()=>{
  const type = document.getElementById("sortArtistsType").value;

  if(type === "count"){
    document.getElementById("sortArtistsOrder").value = "desc";
  }else{
    document.getElementById("sortArtistsOrder").value = "asc";
  }

  renderArtists();
});

document.getElementById("sortSongsType").addEventListener("change", ()=>{
  const type = document.getElementById("sortSongsType").value;

  if(type === "count" || type === "date"){
    document.getElementById("sortSongsOrder").value = "desc";
  }else{
    document.getElementById("sortSongsOrder").value = "asc";
  }

  renderSongs();
});

document.querySelector(".monetizedToggle").addEventListener("change", renderAll);
document.querySelectorAll(".monetizedToggle").forEach(el=>{
  el.addEventListener("change", ()=>{
    const checked = el.checked;

    document.querySelectorAll(".monetizedToggle").forEach(t=>{
      t.checked = checked;
    });

    renderAll();
  });
});

document.querySelectorAll(".quick-buttons button[data-type]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    setDateRange(btn.dataset.type);
  });
});

document.querySelectorAll(".startDate").forEach(el=>{
  el.addEventListener("change", ()=>{
    syncDateInputs(el.value, document.querySelector(".endDate")?.value || "");
    highlightButton(null);
    renderAll();
  });
});

document.querySelectorAll(".endDate").forEach(el=>{
  el.addEventListener("change", ()=>{
    syncDateInputs(document.querySelector(".startDate")?.value || "", el.value);
    highlightButton(null);
    renderAll();
  });
});

document.querySelectorAll(".quick-buttons button:not([data-type])").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentRangeType = null;
    syncDateInputs("", "");
    highlightButton(null);
    renderAll();
  });
});

document.getElementById("clearSongs").addEventListener("click", ()=>{
  document.getElementById("searchSongs").value = "";
  document.getElementById("exactMatchSongs").checked = false;
  document.getElementById("caseSensitiveSongs").checked = false;
  renderSongs();
});

document.getElementById("clearStreams").addEventListener("click", ()=>{
  document.getElementById("searchStreams").value = "";
  document.getElementById("exactMatchStreams").checked = false;
  document.getElementById("caseSensitiveStreams").checked = false;
  renderStreams();
});

document.getElementById("clearArtists").addEventListener("click", ()=>{
  document.getElementById("searchArtists").value = "";
  document.getElementById("exactMatchArtists").checked = false;
  document.getElementById("caseSensitiveArtists").checked = false;
  renderArtists();
});

document.getElementById("exactMatchSongs").addEventListener("change", renderSongs);
document.getElementById("caseSensitiveSongs").addEventListener("change", renderSongs);

document.getElementById("exactMatchStreams").addEventListener("change", renderStreams);
document.getElementById("caseSensitiveStreams").addEventListener("change", renderStreams);

document.getElementById("exactMatchArtists").addEventListener("change", renderArtists);
document.getElementById("caseSensitiveArtists").addEventListener("change", renderArtists);

document.getElementById("filterStreamsHikigatari").addEventListener("change", renderAll);
document.getElementById("filterHikigatari").addEventListener("change", renderAll);

document.getElementById("filterStreamsUnplayable")?.addEventListener("change", renderAll);
document.getElementById("filterUnplayable")?.addEventListener("change", renderAll);

document.getElementById("searchBookmarks").addEventListener("input", debounce(renderBookmarks));
document.getElementById("sortBookmarksOrder").addEventListener("change", renderBookmarks);
document.getElementById("exactMatchBookmarks").addEventListener("change", renderBookmarks);
document.getElementById("caseSensitiveBookmarks").addEventListener("change", renderBookmarks);
document.getElementById("filterBookmarksHikigatari").addEventListener("change", renderBookmarks);
document.getElementById("filterBookmarksUnplayable").addEventListener("change", renderBookmarks);

document.getElementById("clearBookmarks").addEventListener("click", ()=>{
  document.getElementById("searchBookmarks").value = "";
  document.getElementById("exactMatchBookmarks").checked = false;
  document.getElementById("caseSensitiveBookmarks").checked = false;
  renderBookmarks();
});

let selectedPlaylistId = null;
let unsubPlaylistSongs = null;

function renderPlaylistSidebar(){
  const el = document.getElementById("playlistSidebarList");

  el.innerHTML = myPlaylists.map(p => `
    <div class="playlist-sidebar-item ${p.id === selectedPlaylistId ? "active" : ""}" data-id="${p.id}">
      <span class="playlist-sidebar-name" data-id="${p.id}">${escapeHtml(p.name)}</span>
      <div class="playlist-sidebar-actions">
        <button class="playlist-rename-btn" data-id="${p.id}" title="名前を変更">✎</button>
        <button class="playlist-delete-btn" data-id="${p.id}" title="削除">🗑</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".playlist-sidebar-name").forEach(nameEl => {
    nameEl.addEventListener("click", () => selectPlaylist(nameEl.dataset.id));
  });

  el.querySelectorAll(".playlist-rename-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const playlist = myPlaylists.find(p => p.id === btn.dataset.id);
      const newName = prompt("新しい名前を入力してください", playlist.name);
      if(!newName || newName === playlist.name) return;

      const uid = window.vsongAuth.auth.currentUser.uid;
      await window.vsongPlaylists.renamePlaylist(uid, btn.dataset.id, newName);
    });
  });

  el.querySelectorAll(".playlist-delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const playlist = myPlaylists.find(p => p.id === btn.dataset.id);
      if(!confirm(`「${playlist.name}」を削除しますか？中の曲もすべて削除されます。`)) return;

      const uid = window.vsongAuth.auth.currentUser.uid;
      await window.vsongPlaylists.deletePlaylist(uid, btn.dataset.id);

      if(selectedPlaylistId === btn.dataset.id){
        selectedPlaylistId = null;
        renderPlaylistMain();
      }
    });
  });
}

function selectPlaylist(id){
  selectedPlaylistId = id;
  renderPlaylistSidebar();
  renderPlaylistMain();
}

function renderPlaylistMain(){
  const el = document.getElementById("playlistMain");

  unsubPlaylistSongs?.();
  unsubPlaylistSongs = null;

  if(!selectedPlaylistId){
    el.innerHTML = `<p class="playlist-empty-hint">左からリストを選んでください</p>`;
    return;
  }

  const uid = window.vsongAuth.auth.currentUser.uid;

  unsubPlaylistSongs = window.vsongPlaylists.watchPlaylistSongs(uid, selectedPlaylistId, allSongs => {
    const songs = allSongs.filter(s => {
      const live = data.find(d => d.videoId === s.videoId && d.time === s.time);
      return (live?.status || "public") === "public";
    });

    if(songs.length === 0){
      el.innerHTML = `<p class="playlist-empty-hint">${allSongs.length === 0 ? "まだ曲がありません。曲一覧・配信一覧の＋ボタンから追加できます" : "視聴可能な曲がありません(非公開になった曲は自動的に非表示になっています)"}</p>`;
      return;
    }

    el.innerHTML = songs.map((s, i) => {
      const live = data.find(d => d.videoId === s.videoId && d.time === s.time);
      const status = live?.status || "public";
      const videoDate = live?.date;

      return `
      <div class="playlist-song-row" draggable="true" data-key="${s.key}">
        <span class="playlist-drag-handle" title="ドラッグして並べ替え">⠿</span>
        <div class="playlist-song-reorder">
          <button class="playlist-move-up" data-key="${s.key}" ${i === 0 ? "disabled" : ""}>▲</button>
          <button class="playlist-move-down" data-key="${s.key}" ${i === songs.length - 1 ? "disabled" : ""}>▼</button>
        </div>
        <span class="num">${renderPlayButton({videoId: s.videoId, time: s.time, status})}</span>
        <div class="playlist-song-info">
          <div class="playlist-song-title">${escapeHtml(s.title)}${s.note === "弾き語り" ? "（弾き語り）" : ""}</div>
          <div class="playlist-song-artist">${escapeHtml(s.artist)}</div>
        </div>
        <div class="playlist-song-date">${videoDate ? formatDate(videoDate) : ""}</div>
        <button class="playlist-song-remove" data-title="${escapeHtml(s.title)}" data-artist="${escapeHtml(s.artist)}" data-video-id="${s.videoId}" data-time="${s.time}">削除</button>
      </div>
    `;
    }).join("");

    const keys = songs.map(s => s.key);

    async function applyReorder(newKeys){
      await window.vsongPlaylists.reorderPlaylistSongs(uid, selectedPlaylistId, newKeys);
    }

    el.querySelectorAll(".playlist-move-up").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = keys.indexOf(btn.dataset.key);
        if(i <= 0) return;
        const newKeys = [...keys];
        [newKeys[i - 1], newKeys[i]] = [newKeys[i], newKeys[i - 1]];
        applyReorder(newKeys);
      });
    });

    el.querySelectorAll(".playlist-move-down").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = keys.indexOf(btn.dataset.key);
        if(i === -1 || i >= keys.length - 1) return;
        const newKeys = [...keys];
        [newKeys[i + 1], newKeys[i]] = [newKeys[i], newKeys[i + 1]];
        applyReorder(newKeys);
      });
    });

    el.querySelectorAll(".playlist-song-remove").forEach(btn => {
      btn.addEventListener("click", async () => {
        await window.vsongPlaylists.removeSongFromPlaylist(
          uid, selectedPlaylistId, btn.dataset.title, btn.dataset.artist, btn.dataset.videoId, btn.dataset.time
        );
      });
    });

    let dragSrcKey = null;

    el.querySelectorAll(".playlist-song-row").forEach(row => {
      row.addEventListener("dragstart", () => {
        dragSrcKey = row.dataset.key;
        setTimeout(() => row.classList.add("dragging"), 0);
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        el.querySelectorAll(".playlist-song-row").forEach(r => r.classList.remove("drag-over-top", "drag-over-bottom"));
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        if(row.dataset.key === dragSrcKey) return;

        const rect = row.getBoundingClientRect();
        const isTopHalf = (e.clientY - rect.top) < rect.height / 2;

        el.querySelectorAll(".playlist-song-row").forEach(r => r.classList.remove("drag-over-top", "drag-over-bottom"));
        row.classList.add(isTopHalf ? "drag-over-top" : "drag-over-bottom");
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const targetKey = row.dataset.key;
        row.classList.remove("drag-over-top", "drag-over-bottom");
        if(dragSrcKey === targetKey) return;

        const rect = row.getBoundingClientRect();
        const isTopHalf = (e.clientY - rect.top) < rect.height / 2;

        const newKeys = keys.filter(k => k !== dragSrcKey);
        let targetIndex = newKeys.indexOf(targetKey);
        if(!isTopHalf) targetIndex += 1;
        newKeys.splice(targetIndex, 0, dragSrcKey);
        applyReorder(newKeys);
      });
    });
  });
}

document.getElementById("newPlaylistBtn").addEventListener("click", async () => {
  const name = prompt("新しいリスト名を入力してください");
  if(!name) return;

  const uid = window.vsongAuth.auth.currentUser.uid;
  const newId = await window.vsongPlaylists.createPlaylist(uid, name);
  selectPlaylist(newId);
});

function openSettingsModal(){
  document.getElementById("settingsDeleteMsg").textContent = "";

  const hasRecoveryEmail = !window.vsongAuth.auth.currentUser.email.endsWith("@vsong-list.internal");
  document.getElementById("settingsEmailStatus").textContent = hasRecoveryEmail
    ? `登録済み: ${window.vsongAuth.auth.currentUser.email}`
    : "未登録";

  document.getElementById("settingsModal").classList.remove("hidden");
}

function closeSettingsModal(){
  document.getElementById("settingsModal").classList.add("hidden");
}

document.getElementById("settingsDeleteBtn").addEventListener("click", async () => {
  const msg = document.getElementById("settingsDeleteMsg");

  if(!confirm("本当にアカウントを削除しますか？ブックマーク・リストなど全てのデータが完全に削除され、元に戻せません。")){
    return;
  }

  try{
    await window.vsongAccount.deleteAccount();
    closeSettingsModal();
  }catch(e){
    msg.textContent = e.message || "エラーが発生しました";
  }
});

function openPrivacyModal(){
  document.getElementById("privacyModal").classList.remove("hidden");
}

function closePrivacyModal(){
  document.getElementById("privacyModal").classList.add("hidden");
}
