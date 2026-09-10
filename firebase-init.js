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
  onSnapshot
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

onAuthStateChanged(auth, async (user) => {
  if(!user){
    window.renderAuthArea?.(null);
    window.handleLogout?.();
    stopBookmarkWatch();
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  if(!snap.exists()){
    return;
  }
  window.renderAuthArea?.(snap.data().username);
  startBookmarkWatch(user.uid);
});
