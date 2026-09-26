import { describe, expect, it } from "vitest";
import { apiErrorMessage, clipText, isReadablePage, normalizeAppUrl } from "../../chrome-extension/lib.js";

describe("extension app url", () => {
  it("keeps only the origin and adds https when missing", () => {
    expect(normalizeAppUrl("lifeflow.example.com/dashboard")).toBe("https://lifeflow.example.com");
    expect(normalizeAppUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("rejects empty, non-http, and credentialed urls", () => {
    expect(() => normalizeAppUrl("  ")).toThrow(/app url/i);
    expect(() => normalizeAppUrl("ftp://files.example.com")).toThrow(/http/i);
    expect(() => normalizeAppUrl("https://user:pass@example.com")).toThrow(/password/i);
  });
});

describe("extension page capture", () => {
  it("only treats http(s) pages as readable", () => {
    expect(isReadablePage("https://example.com/post")).toBe(true);
    expect(isReadablePage("chrome://extensions")).toBe(false);
    expect(isReadablePage("")).toBe(false);
  });

  it("collapses whitespace and caps length", () => {
    expect(clipText("  hello \n world  ", 8)).toBe("hello wo");
  });
});

describe("extension api errors", () => {
  it("prefers the server error string", () => {
    expect(apiErrorMessage(401, { error: "Invalid or missing API key" })).toBe("Invalid or missing API key");
    expect(apiErrorMessage(401, {})).toMatch(/API key/);
    expect(apiErrorMessage(429, {})).toMatch(/Rate limit/);
  });
});
