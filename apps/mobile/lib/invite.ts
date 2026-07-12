import * as Linking from "expo-linking";
import { Share } from "react-native";

// Builds a deep link like planit://join/plan/<code> (or the dev/web equivalent
// while running in Expo Go). Opening it launches PlanIt straight into joining.
export function inviteLink(kind: "plan" | "group", code: string): string {
  return Linking.createURL(`join/${kind}/${code}`);
}

// Opens the native share sheet with a friendly invite message + link.
export async function shareInvite(
  kind: "plan" | "group",
  name: string,
  code: string
): Promise<void> {
  const link = inviteLink(kind, code);
  const what = kind === "plan" ? "plan" : "group";
  await Share.share({
    message:
      `Join my ${what} "${name}" on PlanIt! 🎉\n\n` +
      `Tap to join: ${link}\n\n` +
      `Don't have PlanIt yet? Ask me for the app first, then open the link.\n` +
      `(Or enter this code in the app: ${code})`,
  });
}
