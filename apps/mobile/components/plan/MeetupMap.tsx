// Web fallback — react-native-maps is native-only.
// The real map lives in MeetupMap.native.tsx.
import { View, Text, StyleSheet } from "react-native";
import { colors, font, radius } from "../../lib/theme";

export type MapMember = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isMe: boolean;
  statusLabel: string;
};

export default function MeetupMap({ members }: { members: MapMember[] }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Live map is available in the phone app
        {members.length > 0 ? ` — ${members.length} sharing location` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24,
    alignItems: "center", marginBottom: 12, borderWidth: 1, borderColor: colors.line,
  },
  text: { color: colors.muted, fontSize: 13.5, fontFamily: font.bodyMedium, textAlign: "center" },
});
