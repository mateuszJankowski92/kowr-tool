import { type ApiErrorResponse, ApiErrorResponseSchema } from "@kowr/contracts";
import type { z } from "zod";

type RequestJsonOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

type ApiClientErrorOptions = {
  code: string;
  message: string;
  status: number | null;
  details?: unknown;
  cause?: unknown;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details?: unknown;

  constructor(options: ApiClientErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApiClientError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError({
      code: "INVALID_RESPONSE",
      message: "The server returned an invalid response.",
      status: response.status,
    });
  }
}

function toApiClientError(status: number, payload: unknown): ApiClientError {
  const parsed = ApiErrorResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return new ApiClientError({
      code: "REQUEST_FAILED",
      message: "The request could not be completed.",
      status,
    });
  }

  const error: ApiErrorResponse["error"] = parsed.data.error;
  return new ApiClientError({
    code: error.code,
    message: error.message,
    status,
    details: error.details,
  });
}

export async function requestJson<Output>(
  path: string,
  schema: z.ZodType<Output>,
  options: RequestJsonOptions = {},
): Promise<Output> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "The server could not be reached.",
      status: null,
      cause,
    });
  }

  const payload = await readJson(response);

  if (!response.ok) {
    throw toApiClientError(response.status, payload);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError({
      code: "INVALID_RESPONSE",
      message: "The server returned an invalid response.",
      status: response.status,
      cause: parsed.error,
    });
  }

  return parsed.data;
}
