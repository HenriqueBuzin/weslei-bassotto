import { afterEach, describe, expect, it, vi } from "vitest";
import { isExpired, readRoles } from "./jwt";

function token(payload) {
  const encode = (value) => btoa(JSON.stringify(value)).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
  return `${encode({ alg: "none" })}.${encode(payload)}.`;
}

describe("jwt helpers", () => {
  afterEach(() => vi.useRealTimers());

  it("reads roles and accepts a valid token", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const value = token({ exp: 1767229200, roles: ["admin"] });
    expect(isExpired(value)).toBe(false);
    expect(readRoles(value)).toEqual(["admin"]);
  });

  it("rejects malformed, missing and expired tokens", () => {
    expect(isExpired()).toBe(true);
    expect(isExpired("invalid")).toBe(true);
    expect(readRoles("invalid")).toEqual([]);
    expect(isExpired(token({ exp: 1 }))).toBe(true);
  });
});
