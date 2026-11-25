import React from "react";
import renderer from "react-test-renderer";
import { Text, View } from "react-native";

// Structural snapshot — offline, no emulator. Swap in a real screen/component to
// guard its rendered tree against unintended change. First run writes .snap;
// review it, commit it; later runs fail on drift.
it("renders a stable tree", () => {
  const tree = renderer
    .create(<View><Text>My School ID</Text></View>)
    .toJSON();
  expect(tree).toMatchSnapshot();
});
