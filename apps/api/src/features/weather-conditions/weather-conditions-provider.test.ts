import { describe, expect, it, vi } from "vitest";
import { createWeatherRequestGate } from "./weather-conditions-provider.js";

describe("weather request gate", () => {
  it("limits concurrency and releases queued requests", async () => {
    const gate = createWeatherRequestGate(2);
    const controller = new AbortController();
    const releases: (() => void)[] = [];
    const operation = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
    const requests = Array.from({ length: 3 }, () => gate.run(operation, controller.signal));
    expect(operation).toHaveBeenCalledTimes(2);
    releases[0]?.();
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(3));
    releases[1]?.();
    releases[2]?.();
    await Promise.all(requests);
  });

  it("rejects queued requests during a rate limit", async () => {
    const gate = createWeatherRequestGate(1);
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const first = gate.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      controller.signal,
    );
    const operation = vi.fn();
    const second = gate.run(operation, controller.signal);
    gate.blockFor(60_000);
    release?.();
    await first;
    await expect(second).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(operation).not.toHaveBeenCalled();
  });
});
