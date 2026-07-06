import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Group</Text>
      <Text style={styles.subtitle}>Group detail screen — Phase 2</Text>
      <Text style={styles.id}>ID: {id}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: 60 },
  back: { marginBottom: 16 },
  backText: { color: "#6366f1", fontSize: 17 },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  subtitle: { color: "#64748b", fontSize: 16, marginTop: 8 },
  id: { color: "#475569", fontSize: 13, marginTop: 4 },
});
