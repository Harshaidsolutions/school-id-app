import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { moderateScale } from "../theme/responsive";

/** Circular progress ring — optional dual-tone (green captured arc). */
export function ProgressRing({
  percent,
  size = moderateScale(72),
  stroke = moderateScale(7),
  label,
  strokeColor,
  dualTone = false,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
  strokeColor?: string;
  dualTone?: boolean;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p / 100);
  const activeStroke = strokeColor ?? colors.progressRingOrange;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={dualTone ? colors.progressRingOrange : colors.track}
          strokeWidth={stroke}
          fill="none"
          opacity={dualTone ? 0.35 : 1}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={dualTone ? colors.progressRingGreen : activeStroke}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.pct, { fontSize: size > moderateScale(64) ? typeScale.subtitle : typeScale.xs }]}>
        {label ?? `${p}%`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pct: {
    fontFamily: fonts.bold,
    color: colors.text,
  },
});
