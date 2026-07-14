// PlanIt design system — official brand identity.
// Palette: orange #F77F00 · petrol #0B3954 · teal #0892A5 · ice #E8F1F2
// Type: Poppins (titles) + Montserrat (body). Icons: Ionicons (no emojis).

export const colors = {
  // brand
  orange: "#F77F00",
  orangePress: "#DE6F00",
  orangeSoft: "rgba(247, 127, 0, 0.12)",
  petrol: "#0B3954",
  teal: "#0892A5",
  tealSoft: "rgba(8, 146, 165, 0.12)",
  ice: "#E8F1F2",

  // surfaces (light theme)
  bg: "#EEF4F5",
  surface: "#FFFFFF",
  surface2: "#F3F8F9",
  line: "#DCE7EA",

  // text
  ink: "#0B3954",
  muted: "#5E7688",
  faint: "#8FA6B5",
  onOrange: "#FFFFFF",

  // semantic
  danger: "#E05252",
  dangerSoft: "rgba(224, 82, 82, 0.12)",
  success: "#0892A5",

  // scrims (over plan banners)
  scrimTop: "rgba(11, 57, 84, 0.18)",
  scrimBottom: "rgba(7, 32, 48, 0.78)",
} as const;

export const font = {
  // Poppins — titles & UI chrome
  title: "Poppins_700Bold",
  semi: "Poppins_600SemiBold",
  // Montserrat — body text
  body: "Montserrat_400Regular",
  bodyMedium: "Montserrat_500Medium",
  bodySemi: "Montserrat_600SemiBold",
  bodyBold: "Montserrat_700Bold",
} as const;

export const radius = {
  sm: 9,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

// Soft petrol-tinted shadow used on cards / floating buttons.
export const shadow = {
  card: {
    shadowColor: "#0B3954",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  orange: {
    shadowColor: "#F77F00",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 5,
  },
} as const;

// Per-user color for chat names / avatars (stable hash of the user id).
const USER_COLORS = ["#F77F00", "#0892A5", "#7C3AED", "#0B6E4F", "#C2417C", "#2563EB", "#B45309", "#0B3954"];
export function userColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length];
}
