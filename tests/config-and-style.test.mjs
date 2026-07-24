import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps light Personal Wiki previews readable inside the dark share panel", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.deep-disclosure-preview \.personal-wiki__sections section > p:not\(\.step-label\)\s*\{[^}]*color:\s*#181a1e;/s,
  );
});

test("resets Mutual Connect text to dark ink inside the dark receiver section", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.deep-receiver-section \.mutual-connect\s*\{[^}]*color:\s*var\(--ink\);/s,
  );
});

test("applies local D1 migrations before development using the same persisted state", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const wranglerConfig = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.equal(packageJson.scripts.predev, "npm run db:migrate:local");
  assert.match(
    packageJson.scripts["db:migrate:local"],
    /wrangler d1 migrations apply site-creator-d1 --local/,
  );
  assert.match(
    packageJson.scripts["db:migrate:local"],
    /--persist-to \.wrangler\/state/,
  );
  assert.equal(wranglerConfig.d1_databases[0].binding, "DB");
  assert.equal(wranglerConfig.d1_databases[0].migrations_dir, "drizzle");
  assert.match(
    viteConfig,
    /persistState:\s*\{\s*path:\s*["']\.wrangler\/state["']\s*\}/s,
  );
  assert.match(viteConfig, /configPath:\s*["']\.\/wrangler\.jsonc["']/);
  assert.doesNotMatch(viteConfig, /compatibility_flags/);
});
