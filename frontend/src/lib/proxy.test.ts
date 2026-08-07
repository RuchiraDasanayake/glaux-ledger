import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The dev proxy has to name every API prefix the backend serves.
 *
 * A missing one does not fail loudly: Vite's SPA fallback answers the call with
 * index.html, the JSON parse throws, and React Query reports it as an ordinary error
 * that most screens render as "nothing here yet". That is how /recurring shipped
 * looking like a shop with no bills. Cheap to check, so it is checked.
 */
// process.cwd() is the frontend project root under Vitest; import.meta.url is not a
// file URL in the jsdom environment these tests run in.
const config = readFileSync(`${process.cwd()}/vite.config.ts`, "utf8");
const routes = `${process.cwd()}/../backend/app/api/routes`;

function backendPrefixes(): string[] {
  return readdirSync(routes)
    .filter((file) => file.endsWith(".py"))
    .flatMap((file) => {
      const source = readFileSync(`${routes}/${file}`, "utf8");
      return [...source.matchAll(/APIRouter\(prefix="(\/[a-z-]+)"/g)].map(
        (match) => match[1],
      );
    });
}

function proxiedPrefixes(): string[] {
  const block = config.match(/proxy:[\s\S]*?\n {4}\),/)?.[0] ?? "";
  return [...block.matchAll(/'(\/[a-z-]+)'/g)].map((match) => match[1]);
}

describe("the dev proxy", () => {
  it("covers every router the backend mounts", () => {
    const proxied = proxiedPrefixes();
    expect(proxied.length).toBeGreaterThan(0);
    for (const prefix of backendPrefixes()) {
      expect(proxied, `${prefix} is not proxied in vite.config.ts`).toContain(
        prefix,
      );
    }
  });

  it("finds the backend at all, so the check above cannot pass vacuously", () => {
    expect(backendPrefixes()).toContain("/transactions");
  });
});
