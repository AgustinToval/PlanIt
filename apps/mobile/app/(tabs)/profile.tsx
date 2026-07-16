import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, Switch } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../hooks/useAuthStore";
import { useSettings, useTheme, useT } from "../../hooks/useSettings";
import { font, radius, shadow, Palette } from "../../lib/theme";

type MenuIcon = keyof typeof Ionicons.glyphMap;

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();
  const { theme, setTheme, lang, setLang, biometric, setBiometric } = useSettings();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);

  const comingWithBuild = (feature: string) =>
    Alert.alert(feature, t("profile.comingBuild"));

  const MenuItem = ({ icon, label, onPress, danger }: { icon: MenuIcon; label: string; onPress: () => void; danger?: boolean }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconWrap, danger && { backgroundColor: c.dangerSoft }]}>
        <Ionicons name={icon} size={17} color={danger ? c.danger : c.teal} />
      </View>
      <Text style={[styles.menuText, danger && { color: c.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={c.faint} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("profile.title")}</Text>
      </View>

      <View style={styles.avatarSection}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
        <Text style={styles.name}>{user?.name ?? "?"}</Text>
        {user?.username && (
          <Text style={styles.username}>
            @{user.username}
            {user.tag ? <Text style={styles.usernameTag}>#{user.tag}</Text> : null}
          </Text>
        )}
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        {user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        {user?.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={c.faint} />
            <Text style={styles.location}>{user.location}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <MenuItem icon="people-outline" label={t("profile.friends")} onPress={() => router.push("/friends")} />
        <MenuItem icon="pencil-outline" label={t("profile.edit")} onPress={() => router.push("/edit-profile")} />
        <MenuItem icon="notifications-outline" label={t("profile.notifications")} onPress={() => router.push("/notifications")} />
        <MenuItem icon="documents-outline" label={t("profile.templates")} onPress={() => router.push("/templates")} />
      </View>

      <Text style={styles.sectionLabel}>{t("profile.settings")}</Text>
      <View style={styles.section}>
        {/* Dark mode */}
        <View style={styles.menuItem}>
          <View style={styles.menuIconWrap}>
            <Ionicons name={theme === "dark" ? "moon" : "moon-outline"} size={17} color={c.teal} />
          </View>
          <Text style={styles.menuText}>{t("profile.darkMode")}</Text>
          <Switch
            value={theme === "dark"}
            onValueChange={(v) => setTheme(v ? "dark" : "light")}
            trackColor={{ false: c.line, true: c.teal }}
            thumbColor="#FFFFFF"
          />
        </View>
        {/* Language */}
        <View style={styles.menuItem}>
          <View style={styles.menuIconWrap}>
            <Ionicons name="globe-outline" size={17} color={c.teal} />
          </View>
          <Text style={styles.menuText}>{t("profile.language")}</Text>
          <View style={styles.langRow}>
            {(["en", "es"] as const).map((l) => (
              <TouchableOpacity
                key={l}
                style={[styles.langBtn, lang === l && styles.langBtnActive]}
                onPress={() => setLang(l)}
              >
                <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                  {l === "en" ? "EN" : "ES"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {/* Biometric lock */}
        <View style={styles.menuItem}>
          <View style={styles.menuIconWrap}>
            <Ionicons name="finger-print-outline" size={17} color={c.teal} />
          </View>
          <Text style={styles.menuText}>{t("profile.biometric")}</Text>
          <Switch
            value={biometric}
            onValueChange={setBiometric}
            trackColor={{ false: c.line, true: c.teal }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>{t("profile.connections")}</Text>
      <View style={styles.section}>
        <MenuItem icon="musical-notes-outline" label={t("profile.spotify")} onPress={() => comingWithBuild(t("profile.spotify"))} />
        <MenuItem icon="calendar-outline" label={t("profile.gcal")} onPress={() => comingWithBuild(t("profile.gcal"))} />
      </View>

      <View style={[styles.section, { marginTop: 4 }]}>
        <MenuItem icon="log-out-outline" label={t("profile.signOut")} onPress={signOut} danger />
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 25, fontFamily: font.title, color: c.ink, letterSpacing: -0.5 },
  avatarSection: { alignItems: "center", paddingVertical: 20 },
  avatar: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: c.orange,
    alignItems: "center", justifyContent: "center", marginBottom: 12, ...shadow.orange,
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  avatarText: { color: "#fff", fontSize: 34, fontFamily: font.title },
  name: { color: c.ink, fontSize: 21, fontFamily: font.title, letterSpacing: -0.3 },
  username: { color: c.teal, fontSize: 14, fontFamily: font.bodySemi, marginTop: 2 },
  usernameTag: { color: c.faint, fontFamily: font.bodyMedium },
  email: { color: c.muted, fontSize: 13.5, fontFamily: font.bodyMedium, marginTop: 4 },
  bio: {
    color: c.muted, fontSize: 13.5, fontFamily: font.body, marginTop: 8,
    textAlign: "center", paddingHorizontal: 32, lineHeight: 20,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  location: { color: c.faint, fontSize: 12.5, fontFamily: font.bodyMedium },
  sectionLabel: {
    fontSize: 11, fontFamily: font.semi, letterSpacing: 1, textTransform: "uppercase",
    color: c.muted, marginHorizontal: 24, marginBottom: 8, marginTop: 4,
  },
  section: {
    marginHorizontal: 16, marginBottom: 14, backgroundColor: c.surface,
    borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: c.line, ...shadow.card,
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderBottomWidth: 1, borderBottomColor: c.line,
  },
  menuIconWrap: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: c.tealSoft,
    alignItems: "center", justifyContent: "center",
  },
  menuText: { flex: 1, color: c.ink, fontSize: 14.5, fontFamily: font.bodySemi },
  langRow: { flexDirection: "row", gap: 6 },
  langBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line,
  },
  langBtnActive: { backgroundColor: c.orange, borderColor: c.orange },
  langText: { color: c.muted, fontSize: 12.5, fontFamily: font.semi },
  langTextActive: { color: c.onOrange },
});
