// Google OAuth client IDs. These are PUBLIC identifiers (safe in the repo) —
// the web client SECRET is never here, it stays in the backend for Calendar.
// - webClientId: browser-based flow (Expo web)
// - iosClientId: native iOS TestFlight / App Store build  ← current target
// - androidClientId: native Android build. There is no dedicated Android
//   OAuth client yet, so we fall back to the web client id purely to stop
//   expo-auth-session from throwing "androidClientId must be defined" on
//   Android. Google Sign-In won't actually complete on Android until a real
//   Android OAuth client (package com.agustintoval.planit + SHA-1) is created.
const WEB = "127198789957-1548a00mvteadtpb3mrvspcjg758hjhb.apps.googleusercontent.com";

export const GOOGLE = {
  webClientId: WEB,
  iosClientId: "127198789957-u2d5c5j8phkmsp5fiee5cviob7t2pq9b.apps.googleusercontent.com",
  androidClientId: WEB, // TODO: replace with a real Android OAuth client before an Android release
} as const;
