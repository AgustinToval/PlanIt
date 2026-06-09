import { View, Text, StyleSheet } from "react-native";

export default function CalendarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendar</Text>
      <Text style={styles.subtitle}>Coming in Phase 3 🗓️</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: "#ffffff" },
  subtitle: { color: "#64748b", fontSize: 16, marginTop: 8 },
});
