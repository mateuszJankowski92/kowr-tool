import type { WeatherDay, WeatherSource } from "@kowr/contracts";

export type ProvidedWeatherSeries = {
  days: WeatherDay[];
  source: WeatherSource;
};

export class WeatherConditionsProviderError extends Error {
  readonly code:
    | "INVALID_RESPONSE"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "REQUEST_FAILED"
    | "TIMEOUT";

  constructor(code: WeatherConditionsProviderError["code"], cause?: unknown) {
    super("The weather provider request could not be completed.", { cause });
    this.name = "WeatherConditionsProviderError";
    this.code = code;
  }
}

export interface WeatherConditionsProvider {
  readonly id?: string;
  getDaily(
    longitude: number,
    latitude: number,
    startDate: string,
    endDate: string,
    signal?: AbortSignal,
  ): Promise<ProvidedWeatherSeries>;
}

export function createWeatherRequestGate(maxConcurrency: number) {
  let active = 0;
  let blockedUntil = 0;
  const waiting: (() => void)[] = [];

  function wake() {
    if (active < maxConcurrency && waiting.length > 0) {
      active += 1;
      waiting.shift()?.();
    }
  }

  return {
    async run<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
      if (signal.aborted) throw signal.reason;
      if (performance.now() < blockedUntil)
        throw new WeatherConditionsProviderError("RATE_LIMITED");
      if (active >= maxConcurrency) {
        await new Promise<void>((resolve, reject) => {
          const resume = () => {
            signal.removeEventListener("abort", abort);
            resolve();
          };
          const abort = () => {
            const index = waiting.indexOf(resume);
            if (index !== -1) waiting.splice(index, 1);
            reject(signal.reason);
          };
          waiting.push(resume);
          signal.addEventListener("abort", abort, { once: true });
        });
      } else active += 1;
      try {
        if (signal.aborted) throw signal.reason;
        if (performance.now() < blockedUntil)
          throw new WeatherConditionsProviderError("RATE_LIMITED");
        return await operation();
      } finally {
        active -= 1;
        wake();
      }
    },
    blockFor(delayMs: number) {
      blockedUntil = Math.max(blockedUntil, performance.now() + delayMs);
    },
  };
}
