// Native map — resolved on iOS/Android instead of MeetupMap.tsx
import { View, StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { MapMember } from "./MeetupMap";

export type { MapMember };

export default function MeetupMap({ members }: { members: MapMember[] }) {
  if (members.length === 0) return null;

  const region = {
    latitude: members.reduce((s, m) => s + m.lat, 0) / members.length,
    longitude: members.reduce((s, m) => s + m.lng, 0) / members.length,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.mapWrap}>
      <MapView style={styles.map} initialRegion={region}>
        {members.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.name}
            description={m.statusLabel}
            pinColor={m.isMe ? "#F77F00" : "#0892A5"}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: 16, overflow: "hidden", marginBottom: 12 },
  map: { width: "100%", height: 260 },
});
