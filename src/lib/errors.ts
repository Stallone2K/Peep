// Typed application errors used across API routes and worker code.
// Each class carries its own HTTP status + machine-readable `code` so the
// JSON shape returned to clients is consistent regardless of which layer
// threw the error.

export type ErrorJson = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InvalidApiKeyError extends ApiError {
  constructor() {
    super("INVALID_API_KEY", "The API key is missing, malformed, or revoked.", 401);
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super("UNAUTHORIZED", "Authentication required.", 401);
  }
}

export class InsufficientCreditsError extends ApiError {
  constructor() {
    super(
      "INSUFFICIENT_CREDITS",
      "Your credit balance is too low for this operation.",
      402,
    );
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You are not allowed to perform this action.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found.`, 404);
  }
}

export class ValidationError extends ApiError {
  constructor(details?: unknown) {
    super("VALIDATION_ERROR", "The request body is invalid.", 422, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfterSec: number) {
    super("RATE_LIMITED", "Too many requests.", 429, { retryAfterSec });
  }
}

export class InternalError extends ApiError {
  constructor(message = "Something went wrong.") {
    super("INTERNAL_ERROR", message, 500);
  }
}

// Canonical JSON shape for error responses. Also returns any
// response headers the caller should set (currently only Retry-After
// for rate-limit errors).
export function toJsonError(err: unknown): {
  body: ErrorJson;
  status: number;
  headers?: Record<string, string>;
} {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (err instanceof RateLimitError) {
      const details = err.details as { retryAfterSec?: number } | undefined;
      if (details?.retryAfterSec) {
        headers["Retry-After"] = String(details.retryAfterSec);
      }
    }
    return {
      status: err.status,
      body: {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      ...(Object.keys(headers).length ? { headers } : {}),
    };
  }

  // Unknown error — log upstream, return a generic 500.
  return {
    status: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong.",
      },
    },
  };
}
