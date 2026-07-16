// Shared chat behavior (WhatsApp-style) for plan and group chats:
// - follow new messages only when already at the bottom
// - keep the last messages visible when the keyboard opens
// - floating "jump to latest" arrow when scrolled up
// - "is typing…" indicator over sockets (not persisted)
import { useEffect, useRef, useState } from "react";
import { FlatList, Keyboard, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { getSocket } from "../lib/socket";
import { useSettings } from "./useSettings";

export function useChatUx(
  kind: "plan" | "group",
  roomId: string | undefined,
  me: { id?: string; name?: string | null }
) {
  const listRef = useRef<FlatList>(null);
  const atBottomRef = useRef(true);
  const [showDown, setShowDown] = useState(false);
  const [typers, setTypers] = useState<Record<string, string>>({});
  const typingSentRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = (animated = true) => {
    listRef.current?.scrollToEnd({ animated });
    atBottomRef.current = true;
    setShowDown(false);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const atBottom = distance < 60;
    atBottomRef.current = atBottom;
    setShowDown(!atBottom && contentSize.height > layoutMeasurement.height + 150);
  };

  // New content (message arrived): only follow if the user was at the bottom
  const onContentSizeChange = () => {
    if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: true });
  };

  // Keyboard opened: keep showing the latest messages above it
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (atBottomRef.current) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      }
    });
    return () => sub.remove();
  }, []);

  // Receive typing events from others in the room
  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const onTyping = (d: { userId: string; name: string | null; typing: boolean }) => {
      if (d.userId === me.id) return;
      setTypers((prev) => {
        const next = { ...prev };
        if (d.typing) next[d.userId] = d.name ?? "?";
        else delete next[d.userId];
        return next;
      });
      // Safety net: clear the typer if no stop event ever arrives
      if (timers[d.userId]) clearTimeout(timers[d.userId]!);
      if (d.typing) {
        timers[d.userId] = setTimeout(() => {
          setTypers((prev) => {
            const next = { ...prev };
            delete next[d.userId];
            return next;
          });
        }, 4000);
      }
    };
    socket.on("typing", onTyping);
    return () => {
      socket.off("typing", onTyping);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [roomId, me.id]);

  const stopTyping = () => {
    if (!roomId || !me.id || !typingSentRef.current) return;
    typingSentRef.current = false;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    getSocket().emit("typing", { kind, roomId, userId: me.id, name: me.name ?? null, typing: false });
  };

  // Call from onChangeText — emits start once, auto-stops after a pause
  const notifyTyping = (text: string) => {
    if (!roomId || !me.id) return;
    if (text.length === 0) {
      stopTyping();
      return;
    }
    if (!typingSentRef.current) {
      typingSentRef.current = true;
      getSocket().emit("typing", { kind, roomId, userId: me.id, name: me.name ?? null, typing: true });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2500);
  };

  const lang = useSettings((s) => s.lang);
  const names = Object.values(typers);
  const typingLabel =
    names.length === 0 ? null :
    names.length === 1
      ? `${names[0]} ${lang === "es" ? "está escribiendo…" : "is typing…"}`
      : `${names.length} ${lang === "es" ? "personas están escribiendo…" : "people are typing…"}`;

  return { listRef, onScroll, onContentSizeChange, scrollToBottom, showDown, typingLabel, notifyTyping, stopTyping };
}
