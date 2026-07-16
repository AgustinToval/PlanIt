// Expo push notifications — fire-and-forget, never blocks the request.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
import { prisma } from "./prisma";

type PushData = Record<string, string>;

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data: PushData = {}
): Promise<void> {
  try {
    if (userIds.length === 0) return;
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, pushToken: { not: null } },
      select: { pushToken: true },
    });
    const messages = users
      .filter((u) => u.pushToken?.startsWith("ExponentPushToken"))
      .map((u) => ({
        to: u.pushToken!,
        title,
        body,
        data,
        sound: "default" as const,
        priority: "high" as const,
      }));
    if (messages.length === 0) return;

    // Expo accepts up to 100 messages per request
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
    }
  } catch (e) {
    console.error("push failed", e);
  }
}
