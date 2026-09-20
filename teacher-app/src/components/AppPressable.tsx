import { Pressable, type PressableProps } from "react-native";

/** Pressable without Android ripple/glow — subtle opacity press instead. */
export function AppPressable({ style, android_ripple, ...rest }: PressableProps) {
  return (
    <Pressable
      android_ripple={android_ripple ?? null}
      style={(state) => {
        const base =
          typeof style === "function" ? style(state) : style;
        return [base, state.pressed ? { opacity: 0.88 } : null];
      }}
      {...rest}
    />
  );
}
