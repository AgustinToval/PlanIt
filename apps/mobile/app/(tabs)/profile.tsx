import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../hooks/useAuthStore";
import { colors, font, radius, shadow } from "../../lib/theme";

type MenuIcon = keyof typeof Ionicons.glyphMap;

function MenuItem({ icon, label, onPress, danger }: { icon: MenuIcon; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconWrap, danger && { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.teal} />
      </View>
      <Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.faint} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();

  const comingWithBuild = (feature: string) =>
    Alert.alert(feature, "Coming with the native app build (App Store / Play Store version)");

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.avatarSection}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <Text style={styles.name}>{user?.name ?? "Unknown"}</Text>
        {user?.username && <Text style={styles.username}>@{user.username}</Text>}
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        {user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        {user?.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={colors.faint} />
            <Text style={styles.location}>{user.location}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <MenuItem icon="people-outline" label="Friends" onPress={() => router.push("/friends")} />
        <MenuItem icon="pencil-outline" label="Edit Profile" onPress={() => router.push("/edit-profile")} />
        <MenuItem icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} />
        <MenuItem icon="documents-outline" label="Plan templates" onPress={() => router.push("/templates")} />
      </View>

      <Text style={styles.sectionLabel}>Connections</Text>
      <View style={styles.section}>
        <MenuItem icon="musical-notes-outline" label="Connect Spotify" onPress={() => comingWithBuild("Connect Spotify")} />
        <MenuItem icon="calendar-outline" label="Connect Google Calendar" onPress={() => comingWithBuild("Connect Google Calendar")} />
      </View>

      <View style={[styles.section, { marginTop: 4 }]}>
        <MenuItem icon="log-out-outline" label="Sign Out" onPress={signOut} danger />
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 25, fontFamily: font.title, color: colors.ink, letterSpacing: -0.5 },
  avatarSection: { alignItems: "center", paddingVertical: 20 },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.orange,
    alignItems: "center", justifyContent: "center", marginBottom: 12, ...shadow.orange,
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  avatarText: { color: "#fff", fontSize: 34, fontFamily: font.title },
  name: { color: colors.ink, fontSize: 21, fontFamily: font.title, letterSpacing: -0.3 },
  username: { color: colors.teal, fontSize: 14, fontFamily: font.bodySemi, marginTop: 2 },
  email: { color: colors.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 4 },
  bio: {
    color: colors.muted, fontSize: 13.5, fontFamily: font.body, marginTop: 8,
    textAlign: "center", paddingHorizontal: 32, lineHeight: 20,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  location: { color: colors.faint, fontSize: 12.5, fontFamily: font.bodyMedium },
  sectionLabel: {
    fontSize: 11, fontFamily: font.semi, letterSpacing: 1, textTransform: "uppercase",
    color: colors.muted, marginHorizontal: 24, marginBottom: 8, marginTop: 4,
  },
  section: {
    marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.surface,
    borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  menuIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: colors.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  menuText: { flex: 1, color: colors.ink, fontSize: 14.5, fontFamily: font.bodySemi },
});
