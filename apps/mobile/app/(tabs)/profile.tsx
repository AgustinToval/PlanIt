import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../hooks/useAuthStore";

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();

  const comingWithBuild = (feature: string) =>
    Alert.alert(feature, "Coming with the native app build (App Store / Play Store version) 🚀");

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
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        {user?.username && <Text style={styles.username}>@{user.username}</Text>}
        {user?.bio && <Text style={styles.bio}>{user.bio}</Text>}
        {user?.location && <Text style={styles.location}>📍 {user.location}</Text>}
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/friends")}>
          <Text style={styles.menuIcon}>🤝</Text>
          <Text style={styles.menuText}>Friends</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/edit-profile")}>
          <Text style={styles.menuIcon}>✏️</Text>
          <Text style={styles.menuText}>Edit Profile</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/notifications")}>
          <Text style={styles.menuIcon}>🔔</Text>
          <Text style={styles.menuText}>Notifications</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/templates")}>
          <Text style={styles.menuIcon}>📑</Text>
          <Text style={styles.menuText}>Plan templates</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => comingWithBuild("Connect Spotify")}>
          <Text style={styles.menuIcon}>🎵</Text>
          <Text style={styles.menuText}>Connect Spotify</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => comingWithBuild("Connect Google Calendar")}>
          <Text style={styles.menuIcon}>📅</Text>
          <Text style={styles.menuText}>Connect Google Calendar</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  avatarSection: { alignItems: "center", paddingVertical: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#6366f1", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  bio: { color: "#cbd5e1", fontSize: 14, marginTop: 8, textAlign: "center", paddingHorizontal: 32 },
  location: { color: "#64748b", fontSize: 13, marginTop: 4 },
  avatarText: { color: "#ffffff", fontSize: 36, fontWeight: "800" },
  name: { color: "#ffffff", fontSize: 22, fontWeight: "700" },
  email: { color: "#94a3b8", fontSize: 15, marginTop: 4 },
  username: { color: "#6366f1", fontSize: 15, marginTop: 4 },
  section: { margin: 16, backgroundColor: "#1e293b", borderRadius: 16, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#0f172a" },
  menuIcon: { fontSize: 20, marginRight: 12 },
  menuText: { flex: 1, color: "#ffffff", fontSize: 16 },
  menuArrow: { color: "#475569", fontSize: 20 },
  signOut: { margin: 16, backgroundColor: "#1e293b", borderRadius: 16, padding: 16, alignItems: "center" },
  signOutText: { color: "#ef4444", fontSize: 16, fontWeight: "700" },
});
