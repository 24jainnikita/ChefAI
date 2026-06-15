// js/firebase.js — Firebase config, auth, and Firestore helpers

// ══ FIREBASE SDK (via CDN — no npm needed) ════════════════
// These are loaded in index.html before this file

// ══ CONFIG ════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyDPLci3iNQs9672JljZdtrVIffXgfGk_SM",
  authDomain:        "chefai-bd5b8.firebaseapp.com",
  projectId:         "chefai-bd5b8",
  storageBucket:     "chefai-bd5b8.firebasestorage.app",
  messagingSenderId: "285131764225",
  appId:             "1:285131764225:web:ac91d268d72fb812290600"
}

// ══ INIT ══════════════════════════════════════════════════
firebase.initializeApp(firebaseConfig)

const auth = firebase.auth()
const db   = firebase.firestore()

// ══ CURRENT USER (updated by auth listener in app.js) ════
let currentUser = null

// ══ GOOGLE SIGN IN ════════════════════════════════════════
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider()
    await auth.signInWithPopup(provider)
    // auth state listener in app.js handles the rest
  } catch (err) {
    console.error("Sign in failed:", err.message)
    showToast("Sign in failed. Try again.")
  }
}

// ══ SIGN OUT ══════════════════════════════════════════════
async function signOut() {
  try {
    await auth.signOut()
    showToast("Signed out successfully")
  } catch (err) {
    console.error("Sign out failed:", err.message)
  }
}

// ══ SAVE FAVOURITE TO FIRESTORE ═══════════════════════════
async function saveFavToFirestore(recipe) {
  if (!currentUser) return false
  try {
    await db
      .collection("users")
      .doc(currentUser.uid)
      .collection("favourites")
      .doc(String(recipe.id))
      .set({
        ...recipe,
        savedAt: firebase.firestore.FieldValue.serverTimestamp()
      })
    return true
  } catch (err) {
    console.error("Firestore save failed:", err.message)
    return false
  }
}

// ══ REMOVE FAVOURITE FROM FIRESTORE ═══════════════════════
async function removeFavFromFirestore(recipeId) {
  if (!currentUser) return false
  try {
    await db
      .collection("users")
      .doc(currentUser.uid)
      .collection("favourites")
      .doc(String(recipeId))
      .delete()
    return true
  } catch (err) {
    console.error("Firestore delete failed:", err.message)
    return false
  }
}

// ══ LOAD FAVOURITES FROM FIRESTORE ════════════════════════
async function loadFavsFromFirestore() {
  if (!currentUser) return null
  try {
    const snapshot = await db
      .collection("users")
      .doc(currentUser.uid)
      .collection("favourites")
      .orderBy("savedAt", "desc")
      .get()

    return snapshot.docs.map(doc => doc.data())
  } catch (err) {
    console.error("Firestore load failed:", err.message)
    return null
  }
}

// ══ MIGRATE localStorage FAVS TO FIRESTORE ════════════════
// Runs once on first sign-in if user has local favourites
async function migrateLocalFavsToFirestore(localFavs) {
  if (!currentUser || !localFavs.length) return
  try {
    const batch = db.batch()
    localFavs.forEach(recipe => {
      const ref = db
        .collection("users")
        .doc(currentUser.uid)
        .collection("favourites")
        .doc(String(recipe.id))
      batch.set(ref, {
        ...recipe,
        savedAt: firebase.firestore.FieldValue.serverTimestamp()
      })
    })
    await batch.commit()
    console.log("Migrated", localFavs.length, "local favourites to Firestore")
  } catch (err) {
    console.error("Migration failed:", err.message)
  }
}

// ══ CREATE/UPDATE USER PROFILE ════════════════════════════
async function saveUserProfile(user) {
  try {
    await db.collection("users").doc(user.uid).set({
      displayName: user.displayName || "",
      email:       user.email       || "",
      photoURL:    user.photoURL    || "",
      lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
  } catch (err) {
    console.error("Profile save failed:", err.message)
  }
}