import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { C, F, R, S } from "../theme";
import { Button, Muted } from "./kit";
import { pickImages, takePhoto, type PickedFile } from "../lib/files";

/** Photo field: preview + Camera / Gallery buttons. */
export function PhotoPick({
  label,
  value,
  current,
  onChange,
  hint = "JPG or PNG, up to 10 MB.",
  busy,
  wide,
}: {
  label: string;
  value: PickedFile | null;
  current?: { uri: string; headers?: Record<string, string> } | null;
  onChange: (f: PickedFile | null) => void;
  hint?: string;
  busy?: boolean;
  wide?: boolean;
}) {
  const src = value ? { uri: value.uri } : current ?? null;
  return (
    <View style={{ marginBottom: S.lg }}>
      <Text style={st.label}>{label}</Text>
      <View style={st.row}>
        <View style={[st.preview, wide && { width: 120, height: 64 }]}>
          {src ? (
            <Image source={src} style={StyleSheet.absoluteFill} contentFit={wide ? "contain" : "cover"} transition={120} />
          ) : (
            <Ionicons name={wide ? "create-outline" : "person-outline"} size={30} color={C.faint} />
          )}
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button small variant="soft" icon="camera-outline" title="Camera" disabled={busy} style={{ flex: 1 }} onPress={async () => {
              const f = await takePhoto();
              if (f) onChange(f);
            }} />
            <Button small variant="soft" icon="images-outline" title="Gallery" disabled={busy} style={{ flex: 1 }} onPress={async () => {
              const [f] = await pickImages(false);
              if (f) onChange(f);
            }} />
          </View>
          {value ? <Button small variant="ghost" icon="close-circle-outline" title="Remove selected" onPress={() => onChange(null)} /> : <Muted>{hint}</Muted>}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontFamily: F.bodySemi, fontSize: 13, color: C.text, marginBottom: 6 },
  row: { flexDirection: "row", gap: S.md, alignItems: "center" },
  preview: { width: 84, height: 100, borderRadius: R.md, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
