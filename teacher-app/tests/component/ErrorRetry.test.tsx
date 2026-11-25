import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ErrorRetry } from "../../src/components/ErrorRetry";

describe("ErrorRetry", () => {
  it("shows the message and default retry label", () => {
    const { getByText } = render(<ErrorRetry message="Network failed" onRetry={() => {}} />);
    getByText("Network failed");
    getByText("Retry");
  });
  it("fires onRetry when pressed; honours a custom label", () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorRetry message="Oops" onRetry={onRetry} retryLabel="Try again" />);
    fireEvent.press(getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
