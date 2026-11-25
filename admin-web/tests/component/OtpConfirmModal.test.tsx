import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OtpConfirmModal } from "../../src/components/OtpConfirmModal";

/**
 * Regression test for the bug fixed this cycle: the modal must render on top of the
 * page (portaled to document.body with a fixed, high z-index overlay), not trapped
 * inside the header's z-30 notification dropdown.
 */
describe("OtpConfirmModal", () => {
  const baseProps = {
    title: "Delete notifications",
    description: "Remove 2 selected notification(s).",
    onClose: vi.fn(),
    onRequestOtp: vi.fn(async () => ({ message: "sent" })),
    onConfirm: vi.fn(async () => {}),
  };

  it("renders through a portal on document.body with a fixed full-screen overlay", () => {
    const { container } = render(<OtpConfirmModal {...baseProps} />);
    // Portaled: nothing is rendered into the component's own container node.
    expect(container.childElementCount).toBe(0);
    const overlay = document.body.querySelector(".fixed.inset-0");
    expect(overlay).toBeTruthy();
    expect(overlay?.className).toMatch(/z-\[60\]/);
    expect(screen.getByText("Delete notifications")).toBeInTheDocument();
  });

  it("requests an OTP, then confirms with the typed code", async () => {
    render(<OtpConfirmModal {...baseProps} confirmLabel="Delete selected" />);
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));
    await waitFor(() => expect(baseProps.onRequestOtp).toHaveBeenCalled());
    const input = await screen.findByPlaceholderText("6-digit code");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(baseProps.onConfirm).toHaveBeenCalledWith("123456"));
  });

  it("closes on Cancel", () => {
    const onClose = vi.fn();
    render(<OtpConfirmModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
