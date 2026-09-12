import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9427cqwosVxQEtRHRRyMIVqj-P2_sEK0",
  authDomain: "vsong-list.firebaseapp.com",
  projectId: "vsong-list",
  storageBucket: "vsong-list.firebasestorage.app",
  messagingSenderId: "103140348372",
  appId: "1:103140348372:web:40150fb2890954da96c641"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DUMMY_DOMAIN = "vsong-list.internal";

function usernameToEmail(username){
  return `${username}@${DUMMY_DOMAIN}`;
}

// ユーザー名の重複チェック + 新規登録
async function signUp(username, password){
  const usernameRef = doc(db, "usernames", username);
  const existing = await getDoc(usernameRef);

  if(existing.exists()){
    throw new Error("このユーザー名は既に使われています");
  }

  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);

  await setDoc(usernameRef, { uid: cred.user.uid });
  await setDoc(doc(db, "users", cred.user.uid), { username, createdAt: new Date().toISOString() });

  return cred.user;
}

async function logIn(username, password){
  const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  return cred.user;
}

function logOut(){
  return signOut(auth);
}

// 他のファイル(app.js)からも使えるように、windowにぶら下げる
window.vsongAuth = { signUp, logIn, logOut, onAuthStateChanged, auth, db };

let unsubBookmarks = null;

function startBookmarkWatch(uid){
  unsubBookmarks = onSnapshot(collection(db, "users", uid, "bookmarks"), snap => {
    const ids = new Set();
    snap.forEach(d => ids.add(d.id));
    window.onBookmarksChanged?.(ids);
  });
}

function stopBookmarkWatch(){
  unsubBookmarks?.();
  unsubBookmarks = null;
  window.onBookmarksChanged?.(new Set());
}

function toggleBookmark(uid, videoId, shouldAdd){
  const ref = doc(db, "users", uid, "bookmarks", videoId);
  return shouldAdd
    ? setDoc(ref, { addedAt: new Date().toISOString() })
    : deleteDoc(ref);
}

window.vsongBookmarks = { toggleBookmark };

function songKey(title, artist, videoId, time){
  const raw = `${title}||${artist}||${videoId}||${time}`;
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let unsubPlaylists = null;

function startPlaylistWatch(uid){
  unsubPlaylists = onSnapshot(collection(db, "users", uid, "playlists"), snap => {
    const playlists = [];
    snap.forEach(d => playlists.push({ id: d.id, name: d.data().name }));
    window.onPlaylistsChanged?.(playlists);
  });
}

function stopPlaylistWatch(){
  unsubPlaylists?.();
  unsubPlaylists = null;
  window.onPlaylistsChanged?.([]);
}

async function createPlaylist(uid, name){
  const ref = await addDoc(collection(db, "users", uid, "playlists"), {
    name,
    createdAt: new Date().toISOString()
  });
  return ref.id;
}

async function addSongToPlaylist(uid, playlistId, title, artist, videoId, time, note){
  const key = songKey(title, artist, videoId, time);
  const ref = doc(db, "users", uid, "playlists", playlistId, "songs", key);

  const existing = await getDoc(ref);
  if(existing.exists()){
    return false;
  }

  await setDoc(ref, { title, artist, videoId, time, note: note || "", addedAt: new Date().toISOString() });
  return true;
}

async function removeSongFromPlaylist(uid, playlistId, title, artist, videoId, time){
  const key = songKey(title, artist, videoId, time);
  await deleteDoc(doc(db, "users", uid, "playlists", playlistId, "songs", key));
}

async function getPlaylistsContainingSong(uid, playlistIds, title, artist, videoId, time){
  const key = songKey(title, artist, videoId, time);
  const results = await Promise.all(
    playlistIds.map(async (id) => {
      const snap = await getDoc(doc(db, "users", uid, "playlists", id, "songs", key));
      return [id, snap.exists()];
    })
  );
  return Object.fromEntries(results);
}

async function renamePlaylist(uid, playlistId, name){
  await setDoc(doc(db, "users", uid, "playlists", playlistId), { name }, { merge: true });
}

async function deletePlaylist(uid, playlistId){
  const songsSnap = await getDocs(collection(db, "users", uid, "playlists", playlistId, "songs"));
  await Promise.all(songsSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, "users", uid, "playlists", playlistId));
}

function watchPlaylistSongs(uid, playlistId, callback){
  return onSnapshot(collection(db, "users", uid, "playlists", playlistId, "songs"), snap => {
    const songs = [];
    snap.forEach(d => songs.push(d.data()));
    callback(songs);
  });
}

window.vsongPlaylists = {
  createPlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  getPlaylistsContainingSong,
  renamePlaylist,
  deletePlaylist,
  watchPlaylistSongs
};

onAuthStateChanged(auth, async (user) => {
  if(!user){
    window.renderAuthArea?.(null);
    window.handleLogout?.();
    stopBookmarkWatch();
    stopPlaylistWatch();
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  if(!snap.exists()){
    return;
  }
  window.renderAuthArea?.(snap.data().username);
  startBookmarkWatch(user.uid);
  startPlaylistWatch(user.uid);
});
