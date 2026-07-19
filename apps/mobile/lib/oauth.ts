// Google OAuth client IDs. These are PUBLIC identifiers (safe in the repo) —
// the web client SECRET is never here, it stays in the backend for Calendar.
// - webClientId: used in Expo Go (browser-based flow)
// - iosClientId: used in the native TestFlight / App Store build
export const GOOGLE = {
  webClientId: "127198789957-1548a00mvteadtpb3mrvspcjg758hjhb.apps.googleusercontent.com",
  iosClientId: "127198789957-u2d5c5j8phkmsp5fiee5cviob7t2pq9b.apps.googleusercontent.com",
} as const;
