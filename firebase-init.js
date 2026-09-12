import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  verifyBeforeUpdateEmail,
  updatePassword,
  deleteUser,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider
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

  const authEmail = usernameToEmail(username);
  const cred = await createUserWithEmailAndPassword(auth, authEmail, password);

  await setDoc(usernameRef, { uid: cred.user.uid, authEmail });
  await setDoc(doc(db, "users", cred.user.uid), { username, createdAt: new Date().toISOString() });

  return cred.user;
}

async function logIn(username, password){
  const snap = await getDoc(doc(db, "usernames", username));
  if(!snap.exists()){
    throw new Error("ユーザー名またはパスワードが違います");
  }

  const { authEmail } = snap.data();
  const cred = await signInWithEmailAndPassword(auth, authEmail, password);
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

async function changeUsername(newUsername){
  const uid = auth.currentUser.uid;

  const newRef = doc(db, "usernames", newUsername);
  const existing = await getDoc(newRef);
  if(existing.exists()){
    throw new Error("このユーザー名は既に使われています");
  }

  const oldSnap = await getDoc(doc(db, "users", uid));
  const oldUsername = oldSnap.data().username;
  const authEmail = auth.currentUser.email;

  await setDoc(newRef, { uid, authEmail });
  await setDoc(doc(db, "users", uid), { username: newUsername }, { merge: true });
  await deleteDoc(doc(db, "usernames", oldUsername));

  return newUsername;
}

async function setRecoveryEmail(newEmail){
  // 確認メールを送るだけで、実際にログイン用メールアドレスとして
  // 反映されるのは、本人がメール内のリンクをクリックした後
  await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
}

async function changePassword(newPassword){
  await updatePassword(auth.currentUser, newPassword);
}

async function reauth(password){
  const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
  await reauthenticateWithCredential(auth.currentUser, cred);
}

async function sendPasswordReset(username){
  const snap = await getDoc(doc(db, "usernames", username));
  if(!snap.exists()){
    throw new Error("ユーザー名が見つかりません");
  }

  const { authEmail } = snap.data();
  if(!authEmail || authEmail.endsWith(`@${DUMMY_DOMAIN}`)){
    throw new Error("復旧用メールアドレスが登録されていません");
  }

  await sendPasswordResetEmail(auth, authEmail);
}

async function deleteAccount(){
  const uid = auth.currentUser.uid;
  const snap = await getDoc(doc(db, "users", uid));
  const username = snap.data()?.username;

  const bmSnap = await getDocs(collection(db, "users", uid, "bookmarks"));
  await Promise.all(bmSnap.docs.map(d => deleteDoc(d.ref)));

  const plSnap = await getDocs(collection(db, "users", uid, "playlists"));
  await Promise.all(plSnap.docs.map(async (p) => {
    const songsSnap = await getDocs(collection(db, "users", uid, "playlists", p.id, "songs"));
    await Promise.all(songsSnap.docs.map(s => deleteDoc(s.ref)));
    await deleteDoc(p.ref);
  }));

  if(username){
    await deleteDoc(doc(db, "usernames", username));
  }
  await deleteDoc(doc(db, "users", uid));

  await deleteUser(auth.currentUser);
}

window.vsongAccount = {
  changeUsername,
  setRecoveryEmail,
  changePassword,
  reauth,
  sendPasswordReset,
  deleteAccount
};

function songKey(title, artist, videoId, time){
  const raw = `${title}||${artist}||${videoId}||${time}`;
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let unsubPlaylists = null;

function startPlaylistWatch(uid){
  unsubPlaylists = onSnapshot(collection(db, "users", uid, "playlists"), snap => {
    const playlists = [];
    snap.forEach(d => playlists.push({ id: d.id, name: d.data().name, createdAt: d.data().createdAt }));
    playlists.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
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

  const snap = await getDocs(collection(db, "users", uid, "playlists", playlistId, "songs"));
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);

  await setDoc(ref, { title, artist, videoId, time, note: note || "", order: maxOrder + 1, addedAt: new Date().toISOString() });
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
    snap.forEach(d => songs.push({ ...d.data(), key: d.id }));
    songs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    callback(songs);
  });
}

async function reorderPlaylistSongs(uid, playlistId, orderedKeys){
  await Promise.all(orderedKeys.map((key, i) =>
    setDoc(doc(db, "users", uid, "playlists", playlistId, "songs", key), { order: i }, { merge: true })
  ));
}

window.vsongPlaylists = {
  createPlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  getPlaylistsContainingSong,
  renamePlaylist,
  deletePlaylist,
  watchPlaylistSongs,
  reorderPlaylistSongs
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
