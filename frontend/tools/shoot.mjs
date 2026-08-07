/**
 * Screenshot the app at phone width, for eyeballing the theme.
 *
 * Self-contained: registers its own throwaway shop against the local API and
 * seeds a few entries, so no existing account or credential is involved. Borrows
 * Playwright from the sibling useglaux checkout rather than adding a browser
 * automation dependency to this project for a visual spot-check.
 *
 *   CHROME_PATH=... node tools/shoot.mjs
 */
import { chromium } from "file:///C:/Projects/useglaux/node_modules/playwright-core/index.mjs";
import { mkdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:8000";
// Vite walks forward a port when 5173 is taken, which it is whenever the sibling
// useglaux dev server is up. Override rather than assume.
const APP = process.env.APP_URL ?? "http://localhost:5173";
const OUT = new URL("../.shots/", import.meta.url).pathname.replace(/^\//, "");

const email = `shot-${randomUUID().slice(0, 8)}@example.com`;
const password = randomBytes(24).toString("base64url");

async function api(path, body, token) {
  const response = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    // A fresh shop per run is what makes the screenshots deterministic, and register is
    // rate limited to ten an hour per address. A long afternoon of layout work reaches
    // that, and a stack trace at the top of the tenth run does not explain why.
    if (response.status === 429 && path === "/auth/register")
      throw new Error(
        "register is rate limited (10/hour per address) and this tool takes one per run.\n" +
          "  Restart the API to clear the in-process counters, or wait out the hour.",
      );
    throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  }
  return response.json();
}

console.log("seeding a throwaway shop");
const { access_token: token } = await api("/auth/register", {
  business_name: "Nimal Stationers",
  email,
  password,
});
const categories = await api("/categories", null, token);
const pick = (name) => categories.find((c) => c.name === name).id;

const daysAgo = (days) =>
  new Date(Date.now() - days * 86_400_000).toISOString();
const dateIn = (days) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// A month of background trading, so the dashboard's trend chart has a shape instead
// of nine days of entries and three weeks of flat nothing. Deterministic rather than
// random: two runs of this script have to be comparable screenshot for screenshot.
console.log("seeding a month of trading");
for (let back = 30; back >= 1; back--) {
  const when = new Date(Date.now() - back * 86_400_000);
  if (when.getDay() === 0) continue; // Closed on Sundays, and the chart should show it.

  const busy = when.getDay() === 5 || when.getDay() === 6; // Weekend rush.
  const swing = ((back * 37) % 11) * 120;
  for (const entry of [
    { name: "Printing", amount: String(900 + swing + (busy ? 1400 : 0)) },
    { name: "Stationery Sale", amount: String(600 + ((back * 53) % 9) * 210) },
    ...(back % 3 === 0
      ? [
          {
            name: "Stock & Supplies",
            amount: String(1800 + ((back * 29) % 7) * 340),
          },
        ]
      : []),
    ...(back % 5 === 0 ? [{ name: "Transport", amount: "450" }] : []),
  ]) {
    await api(
      "/transactions",
      {
        category_id: pick(entry.name),
        amount: entry.amount,
        occurred_at: when.toISOString(),
      },
      token,
    );
  }
}

// A day's trading plus the costs a shop actually carries, including two bills left
// open so the outstanding strip and the unpaid badges have something to show.
for (const entry of [
  { name: "Printing", amount: "450", note: "20 pages colour" },
  { name: "Scanning", amount: "150", note: "ID scan" },
  { name: "Stationery Sale", amount: "2400", note: "exercise books" },
  { name: "Printing", amount: "900", note: "poster A3" },
  { name: "Transport", amount: "350", note: "three-wheeler delivery" },
  {
    name: "Stock & Supplies",
    amount: "18000",
    note: "A4 paper, 20 reams",
    counterparty: "City Paper Supplies",
    payment_method: "credit",
    settled: false,
    due_date: dateIn(12),
  },
  {
    name: "Utilities",
    amount: "6450",
    note: "Electricity, August",
    counterparty: "CEB",
    payment_method: "credit",
    settled: false,
    due_date: dateIn(-3),
    occurred_at: daysAgo(9),
  },
  {
    name: "Rent",
    amount: "35000",
    note: "Shop rent",
    counterparty: "M. Perera",
    occurred_at: daysAgo(2),
  },
  {
    name: "Printing",
    amount: "1250",
    note: "thesis binding",
    occurred_at: daysAgo(1),
  },
]) {
  const { name, ...rest } = entry;
  await api("/transactions", { category_id: pick(name), ...rest }, token);
}

// Standing costs. One falls on the 1st so it is owed on any run after the first of the
// month, one on the 28th so there is usually a not-yet-due row in Settings too.
console.log("seeding recurring bills");
for (const bill of [
  {
    name: "Shop rent",
    category: "Rent",
    amount: "35000",
    day_of_month: 1,
    counterparty: "M. Perera",
    payment_method: "cash",
  },
  {
    name: "Electricity",
    category: "Utilities",
    amount: "6450",
    day_of_month: 28,
    counterparty: "CEB",
    payment_method: "bank",
  },
]) {
  const { category, ...rest } = bill;
  await api("/recurring", { category_id: pick(category), ...rest }, token);
}

// One phone, one tablet, one laptop, one large monitor. The last is 2560 rather than 1920
// deliberately: it is the width at which a layout that merely tolerates a big screen stops
// being able to hide it, and nothing at 1440 gives any warning. Two versions of the
// content cap looked correct at 1440 and wrong on a real desk before this viewport existed.
const VIEWPORTS = [
  { tag: "mobile", width: 390, height: 844, touch: true },
  { tag: "tablet", width: 834, height: 1112, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
  { tag: "wide", width: 2560, height: 1400, touch: false },
];
const only = process.argv[2];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
});

for (const { tag, width, height, touch } of VIEWPORTS) {
  if (only && only !== tag) continue;
  console.log(`\n${tag} ${width}x${height}`);

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: touch ? 2 : 1,
    isMobile: touch,
    hasTouch: touch,
  });

  const shoot = async (name) => {
    // Web fonts load late; a screenshot taken before they land shows the fallback.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${tag}-${name}.png` });
    console.log(`  ${tag}-${name}.png`);
  };

  // The root is now the public landing page; the form moved to /login.
  await page.goto(APP, { waitUntil: "networkidle" });
  await shoot("00-landing");
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await shoot("01-login");
  // The longer of the two forms, and the only one that can be got permanently wrong.
  await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
  await shoot("02-register");

  // Hand the session straight to the app rather than driving the login form, which
  // keeps this script indifferent to the form's markup.
  await page.evaluate(
    (value) => localStorage.setItem("glaux.token", value),
    token,
  );
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shoot("03-quick-entry");

  // Routed directly rather than by clicking, because Settings is deliberately not a
  // tab: it lives in the sidebar footer on desktop and the header on a phone.
  for (const [path, name] of [
    ["/dashboard", "04-dashboard"],
    ["/history", "05-history"],
    ["/export", "06-export"],
    ["/settings", "07-settings"],
  ]) {
    await page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shoot(name);
  }

  // The confirmation panel is a bottom sheet on touch and a centred dialog above sm.
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const manual = page.getByRole("button", { name: /type it/i }).first();
  if (await manual.count()) {
    await manual.click();
    await page.waitForTimeout(600);
    await shoot("08-draft-in");
    // The other direction, shot from the same scroll position: the sheet must be the
    // same height on both, or the save button moves while a thumb is heading for it.
    const out = page.getByRole("radio", { name: /money out/i }).first();
    if (await out.count()) {
      await out.click();
      await page.waitForTimeout(500);
      await shoot("09-draft-out");
    }
    // Opened, because the expense fields are the point of this release.
    const more = page.getByRole("button", { name: /more details/i }).first();
    if (await more.count()) {
      await more.click();
      await page.waitForTimeout(500);
      await shoot("10-draft-more");
    }
  }

  await page.close();
}

/**
 * The screenshots show what a surface looks like; these check what it does.
 *
 * Every assertion here is the same rule stated four ways: nothing the shopkeeper is
 * about to tap may move because of something they just tapped. A picture cannot catch a
 * regression in that (the jump happens between frames), so it is measured instead.
 */
async function checkStability(tag, width, height, touch) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: touch,
    hasTouch: touch,
  });
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.evaluate((v) => localStorage.setItem("glaux.token", v), token);

  const results = [];
  const check = (label, ok, detail = "") => {
    results.push({ label, ok, detail });
    console.log(
      `  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` ${detail}` : ""}`,
    );
  };

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: /type it/i })
    .first()
    .click();
  await page.waitForTimeout(500);

  // 1. The amount takes focus on open, so the keypad is already up. Checked before
  //    anything else is clicked, since clicking takes the focus being measured.
  const focused = await page.evaluate(
    () => document.activeElement?.id || document.activeElement?.tagName,
  );
  check(
    "entry sheet focuses the amount",
    focused === "draft-amount",
    `got ${focused}`,
  );

  // 2. The sheet must be the same height whichever direction is selected.
  const dialog = page.getByRole("dialog");
  const inHeight = (await dialog.boundingBox()).height;
  await page.getByRole("radio", { name: /money out/i }).click();
  await page.waitForTimeout(400);
  const outHeight = (await dialog.boundingBox()).height;
  check(
    "entry sheet keeps its height across directions",
    inHeight === outHeight,
    `${inHeight} vs ${outHeight}`,
  );
  await page.keyboard.press("Escape");

  // 3. Switching period must not blank the dashboard. Measured immediately after the
  //    click, before the new period has come back: the outgoing rows have to still be
  //    there, or the page has collapsed and will jump twice on the way back.
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const before = await page.locator("li").count();
  await page.getByRole("tab", { name: "Week" }).click();
  const during = await page.locator("li").count();
  check(
    "dashboard holds its rows while the period loads",
    before > 0 && during > 0,
    `${before} then ${during}`,
  );

  // 4. Same for history, and the toolbar must not gain a row when Clear becomes live.
  await page.goto(`${APP}/history`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // The structured filters are folded away at phone width, so open them before measuring
  // anything. What is under test is whether the toolbar grows once a filter is live, and
  // that only means something with the toolbar already at its full height.
  const filtersToggle = page.getByRole("button", { name: /^filters/i });
  if (await filtersToggle.isVisible()) {
    await filtersToggle.click();
    await page.waitForTimeout(400);
  }
  const countLine = page.getByText(/^\d+ entr(y|ies)$/);
  const listTop = (await countLine.boundingBox()).y;
  const rowsBefore = await page.locator("li").count();
  await page.getByRole("button", { name: /unpaid only/i }).click();
  const rowsDuring = await page.locator("li").count();
  check(
    "history holds its rows while the filter loads",
    rowsBefore > 0 && rowsDuring > 0,
    `${rowsBefore} then ${rowsDuring}`,
  );
  await page.waitForTimeout(900);
  const listTopFiltered = (await countLine.boundingBox()).y;
  check(
    "history toolbar keeps its height when filtered",
    listTop === listTopFiltered,
    `${listTop} vs ${listTopFiltered}`,
  );

  await page.close();
  return results;
}

console.log("\nlayout stability");
const failures = [];
for (const { tag, width, height, touch } of VIEWPORTS) {
  if (only && only !== tag) continue;
  // Same breakpoints as desktop for the surfaces these checks touch.
  if (tag === "tablet" || tag === "wide") continue;
  console.log(`\n ${tag}`);
  for (const result of await checkStability(tag, width, height, touch)) {
    if (!result.ok) failures.push(`${tag}: ${result.label}`);
  }
}

await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} stability check(s) failed`);
  for (const name of failures) console.log(`  - ${name}`);
  process.exitCode = 1;
} else {
  console.log("\ndone");
}
