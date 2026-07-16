// Web fallback — react-native-maps is native-only.
// The real map lives in MeetupMap.native.tsx.
import { View, Text, StyleSheet } from "react-native";
import { font, radius, Palette, themedStyles } from "../../lib/theme";
import { useTheme, useT } from "../../hooks/useSettings";

export type MapMember = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isMe: boolean;
  statusLabel: string;
};

export default function MeetupMap({ members }: { members: MapMember[] }) {
  const c = useTheme();
  const styles = getStyles(c);
  const t = useT();
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        {t("mm.web")}
        {members.length > 0 ? ` — ${members.length} ${t("mu.sharingN")}` : ""}
      </Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  box: {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: 24,
    alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: c.line,
  },
  text: { color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, textAlign: "center" },
}));
