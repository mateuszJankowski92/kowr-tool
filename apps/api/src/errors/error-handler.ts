import type { ApiErrorResponse } from "@kowr/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AppError } from "./app-error.js";

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const payload: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };

  return reply.status(statusCode).send(payload);
}

function isValidationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Array.isArray(error.validation)
  );
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    return sendError(reply, 404, "ROUTE_NOT_FOUND", "The requested endpoint does not exist.");
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return sendError(reply, error.statusCode, error.code, error.message, error.details);
    }

    if (isValidationError(error)) {
      return sendError(reply, 400, "INVALID_REQUEST", "The request payload is invalid.");
    }

    request.log.error({ err: error }, "Unhandled request error");
    return sendError(reply, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
  });
}
