import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import {
  errorMessage,
  fieldErrors,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  RATE_LIMITED_MESSAGE,
} from "./error-message";

function apiError(args: {
  status: number;
  code: string;
  message?: string;
  fields?: { field: string; message: string }[];
}): ApiError {
  return new ApiError({
    status: args.status,
    code: args.code,
    message: args.message ?? "",
    fields: args.fields,
  });
}

describe("errorMessage", () => {
  it("maps a wrapped network failure to friendly, actionable copy", () => {
    // The fetch/XHR clients wrap transport failures as an ApiError (status 0).
    const err = apiError({ status: 0, code: "network_error", message: "could not reach the server" });
    expect(errorMessage(err, "Could not save.")).toBe(NETWORK_ERROR_MESSAGE);
  });

  it("maps a 429 to a rate-limit message regardless of the terse backend text", () => {
    const err = apiError({ status: 429, code: "rate_limited", message: "rate limit exceeded" });
    expect(errorMessage(err)).toBe(RATE_LIMITED_MESSAGE);
  });

  it("never echoes a 5xx body — uses the caller's contextual default instead", () => {
    // Even a non-scrubbed 5xx body (a mock artifact; prod scrubs it) must not
    // leak to the user; the domain fallback is friendlier and more useful.
    expect(errorMessage(apiError({ status: 500, code: "internal", message: "boom" }), "Could not save.")).toBe(
      "Could not save.",
    );
    expect(
      errorMessage(apiError({ status: 503, code: "service_unavailable", message: "an unexpected error occurred" }), "Could not save."),
    ).toBe("Could not save.");
  });

  it("prefers the backend's human envelope message for 4xx (accurate per-code copy)", () => {
    // 403 permission variants carry good, specific text — show it verbatim.
    expect(errorMessage(apiError({ status: 403, code: "forbidden", message: "you do not own this channel" }))).toBe(
      "you do not own this channel",
    );
    // 409 conflict / 413 / 415 all have friendly envelope messages.
    expect(errorMessage(apiError({ status: 413, code: "request_entity_too_large", message: "attachment exceeds the 25 MiB limit" }))).toBe(
      "attachment exceeds the 25 MiB limit",
    );
  });

  it("lets caller overrides win over the built-in mapping (by code, then status)", () => {
    const conflict = apiError({ status: 409, code: "conflict", message: "username or email already taken" });
    expect(errorMessage(conflict, "Could not sign up.", { conflict: "That username or email is already taken." })).toBe(
      "That username or email is already taken.",
    );
    // Same via status key.
    expect(errorMessage(conflict, "Could not sign up.", { "409": "Taken." })).toBe("Taken.");
    // An override even wins for a 429.
    expect(errorMessage(apiError({ status: 429, code: "rate_limited" }), "x", { "429": "Slow down there." })).toBe(
      "Slow down there.",
    );
  });

  it("falls back to the domain default when the envelope message is a placeholder", () => {
    // Unparseable body → client.ts default text: show the domain fallback, not it.
    const err = apiError({ status: 400, code: "http_error", message: "request failed with status 400" });
    expect(errorMessage(err, "Could not save the channel.")).toBe("Could not save the channel.");
  });

  it("falls back to the domain default for a non-ApiError throw", () => {
    expect(errorMessage(new Error("boom"), "Could not post your comment.")).toBe(
      "Could not post your comment.",
    );
    expect(errorMessage("weird", "Could not post your comment.")).toBe("Could not post your comment.");
  });

  it("uses the generic default when no fallback is provided", () => {
    expect(errorMessage(new Error("boom"))).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe("fieldErrors", () => {
  it("maps a 422's field list to a { field: message } record", () => {
    const err = apiError({
      status: 422,
      code: "unprocessable_entity",
      message: "validation failed",
      fields: [
        { field: "email", message: "must be a valid email" },
        { field: "password", message: "too short" },
      ],
    });
    expect(fieldErrors(err)).toEqual({
      email: "must be a valid email",
      password: "too short",
    });
  });

  it("returns null when the error carries no field-level detail", () => {
    expect(fieldErrors(apiError({ status: 409, code: "conflict", message: "taken" }))).toBeNull();
    expect(fieldErrors(new Error("boom"))).toBeNull();
  });
});
