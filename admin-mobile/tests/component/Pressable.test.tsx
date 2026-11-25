import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Pressable } from "../../src/ui/Pressable";

describe("ui/Pressable", () => {
  it("renders children and fires onPress", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Pressable onPress={onPress}><Text>Tap me</Text></Pressable>
    );
    fireEvent.press(getByText("Tap me"));
    expect(onPress).toHaveBeenCalled();
  });
});
