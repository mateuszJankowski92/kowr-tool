import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetryButton } from "./RetryButton";

afterEach(cleanup);

describe("RetryButton", () => {
  it("announces progress and prevents repeated submissions until the retry completes", () => {
    const onRetry = vi.fn();
    const view = render(<RetryButton isRetrying={false} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(<RetryButton isRetrying onRetry={onRetry} />);
    const pending = screen.getByRole("button", { name: "Pobieranie danych…" }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Pobieranie danych…");
    expect(screen.getByText("Pobieranie danych…").classList.contains("sr-only")).toBe(true);
    expect(screen.getByText("Spróbuj ponownie").classList.contains("invisible")).toBe(true);
    fireEvent.click(pending);
    expect(onRetry).toHaveBeenCalledOnce();

    view.rerender(<RetryButton isRetrying={false} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
