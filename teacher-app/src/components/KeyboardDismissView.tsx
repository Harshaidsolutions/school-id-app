import { Keyboard, TouchableWithoutFeedback, type StyleProp, type ViewStyle, View } from "react-native";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Tap outside inputs to dismiss keyboard — use on form screens. */
export function KeyboardDismissView({ children, style }: Props) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </TouchableWithoutFeedback>
  );
}
