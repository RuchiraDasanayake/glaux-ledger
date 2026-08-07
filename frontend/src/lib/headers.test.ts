import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const headers = readFileSync(`${process.cwd()}/public/_headers`, "utf8");

describe("Cloudflare security headers", () => {
  it("ships CSP and framing protections for every path", () => {
    expect(headers).toMatch(/Content-Security-Policy:/);
    expect(headers).toMatch(/X-Frame-Options:\s*DENY/);
    expect(headers).toMatch(/X-Content-Type-Options:\s*nosniff/);
    expect(headers).toMatch(/Referrer-Policy:/);
    expect(headers).toMatch(/Permissions-Policy:/);
  });

  it("allows HTTPS API hosts and the Google font origins in use", () => {
    expect(headers).toMatch(/connect-src[^;]*https:/);
    expect(headers).toMatch(/fonts\.googleapis\.com/);
    expect(headers).toMatch(/fonts\.gstatic\.com/);
  });
});
