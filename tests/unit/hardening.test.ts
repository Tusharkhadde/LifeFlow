import { describe, expect, it } from "vitest";
import { hasScope, hashApiKey } from "@/lib/api-keys";
import { matchesCondition } from "@/lib/automation-engine";
import { parseExpenseFromText } from "@/lib/expense-parser";
import { jobBackoffMinutes } from "@/lib/job-queue";
import { assertSafeOutboundUrl, isPrivateAddress } from "@/lib/url-guard";

describe("url guard", () => {
  it("blocks private and metadata addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("192.168.1.10")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("::1")).toBe(true);
  });

  it("rejects loopback URLs before DNS lookup", async () => {
    await expect(assertSafeOutboundUrl("http://127.0.0.1/latest/meta-data")).rejects.toThrow(/private/i);
    await expect(assertSafeOutboundUrl("http://localhost/admin")).rejects.toThrow(/private/i);
    await expect(assertSafeOutboundUrl("http://user:pass@example.com")).rejects.toThrow(/credentials/i);
  });
});

describe("expense parser", () => {
  it("extracts amount, merchant, and category", () => {
    const parsed = parseExpenseFromText("spent 250 on swiggy lunch");
    expect(parsed).toMatchObject({ amount: 250, category: "food" });
    expect(parsed?.description.toLowerCase()).toContain("swiggy");
  });

  it("returns null when no amount is present", () => {
    expect(parseExpenseFromText("remember to call mom")).toBeNull();
  });
});

describe("api keys", () => {
  it("hashes stably and checks scopes", () => {
    expect(hashApiKey("lf_live_abc")).toBe(hashApiKey("lf_live_abc"));
    expect(hasScope(["*"], "vault:write")).toBe(true);
    expect(hasScope(["tasks:*"], "tasks:write")).toBe(true);
    expect(hasScope(["tasks:read"], "tasks:write")).toBe(false);
    expect(hasScope(["vault:read"], undefined)).toBe(true);
  });
});

describe("automation conditions", () => {
  it("matches allowlisted comparison operators", () => {
    const input = { amount: 1200, title: "Electricity bill" };
    expect(matchesCondition(input, { field: "amount", op: "gte", value: 1000 })).toBe(true);
    expect(matchesCondition(input, { field: "title", op: "contains", value: "bill" })).toBe(true);
    expect(matchesCondition(input, { field: "amount", op: "lt", value: 100 })).toBe(false);
  });
});

describe("job backoff", () => {
  it("grows exponentially and caps at 60 minutes", () => {
    expect(jobBackoffMinutes(1)).toBe(1);
    expect(jobBackoffMinutes(2)).toBe(2);
    expect(jobBackoffMinutes(3)).toBe(4);
    expect(jobBackoffMinutes(8)).toBe(60);
  });
});
