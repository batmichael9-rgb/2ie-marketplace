#!/usr/bin/env node
/**
 * Tests de non-régression sécurité.
 *
 * Prérequis : `npm run build` (le script démarre `next start` sur un port local).
 *
 * Vérifie :
 *   1. le seed refuse de s'exécuter en production sans ALLOW_PROD_SEED=true ;
 *   2. /api/cron/auto-payout refuse un appel sans CRON_SECRET (401) ;
 *   3. un webhook Money Fusion non signé est rejeté (401), un faux paiement
 *      signé n'est jamais crédité, et sans MONEYFUSION_WEBHOOK_SECRET la
 *      production refuse les webhooks (503) ;
 *   4. aucun secret serveur (SUPABASE_SERVICE_ROLE_KEY) n'est présent dans le
 *      bundle client .next/static.
 *
 * Usage : npm run test:security
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PORT = Number(process.env.SECURITY_CHECK_PORT ?? 3127);
const BASE = `http://127.0.0.1:${PORT}`;
const CRON_SECRET = "security-check-cron-secret";
const WEBHOOK_SECRET = "security-check-webhook-secret";

const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Lit .env sans dépendance (les valeurs peuvent être entre guillemets). */
function readDotEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

// --- 1. Bundle client : aucun secret serveur --------------------------------
function checkClientBundle() {
  const staticDir = join(ROOT, ".next", "static");
  if (!existsSync(staticDir)) {
    check("bundle client analysable", false, "lancez `npm run build` d'abord");
    return;
  }

  const jsFiles = walk(staticDir).filter((file) => file.endsWith(".js"));
  const env = { ...readDotEnv(), ...process.env };
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  check(
    "le nom SUPABASE_SERVICE_ROLE_KEY n'apparaît pas dans le bundle client",
    !jsFiles.some((file) => readFileSync(file, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY")),
    `${jsFiles.length} fichiers JS analysés`,
  );

  if (serviceKey && serviceKey.length >= 8) {
    const leaked = jsFiles.some((file) => readFileSync(file, "utf8").includes(serviceKey));
    check("la valeur de SUPABASE_SERVICE_ROLE_KEY n'apparaît pas dans le bundle client", !leaked);
  } else {
    console.log("• SUPABASE_SERVICE_ROLE_KEY absent du .env : contrôle de valeur ignoré.");
  }
}

// --- 2. Seed bloqué en production -------------------------------------------
function checkSeedGuard() {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "prisma/seed.ts"],
    {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "production", ALLOW_PROD_SEED: "" },
      encoding: "utf8",
      timeout: 60_000,
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  check(
    "le seed refuse de s'exécuter en production sans ALLOW_PROD_SEED=true",
    result.status !== 0 && /Refus de seed/.test(output),
    `code ${result.status}`,
  );
}

// --- 3. Secret webhook obligatoire en production ----------------------------
function checkWebhookSecretPolicy() {
  const moduleUrl = pathToFileURL(
    join(ROOT, "src", "lib", "payments", "webhook-auth.ts"),
  ).href;

  const code = `
import { verifyWebhookSecret } from ${JSON.stringify(moduleUrl)};
const request = (headers) => ({ headers: new Headers(headers) });
const cases = [
  ["production_sans_secret", "production", "", {}],
  ["production_mauvais_secret", "production", "s3cret", { "x-webhook-secret": "nope" }],
  ["production_bearer_valide", "production", "s3cret", { authorization: "Bearer s3cret" }],
  ["developpement_sans_secret", "development", "", {}],
];
const results = cases.map(([label, nodeEnv, secret, headers]) => {
  process.env.NODE_ENV = nodeEnv;
  process.env.MONEYFUSION_WEBHOOK_SECRET = secret;
  return [label, verifyWebhookSecret(request(headers))];
});
console.log(JSON.stringify(results));
`;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
  );

  if (result.status !== 0) {
    check(
      "politique de secret des webhooks évaluable",
      false,
      `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().slice(-300),
    );
    return;
  }

  let results = [];
  try {
    results = JSON.parse(result.stdout.trim().split(/\r?\n/).pop() ?? "[]");
  } catch {
    results = [];
  }
  const byLabel = new Map(results);

  const noSecret = byLabel.get("production_sans_secret");
  check(
    "webhook sans MONEYFUSION_WEBHOOK_SECRET en production → 503",
    noSecret?.ok === false && noSecret.status === 503,
    JSON.stringify(noSecret),
  );

  const wrongSecret = byLabel.get("production_mauvais_secret");
  check(
    "webhook avec un mauvais secret en production → 401",
    wrongSecret?.ok === false && wrongSecret.status === 401,
    JSON.stringify(wrongSecret),
  );

  const bearer = byLabel.get("production_bearer_valide");
  check(
    "webhook avec le bon secret (Bearer) accepté",
    bearer?.ok === true,
    JSON.stringify(bearer),
  );
}

// --- 4. Routes HTTP ---------------------------------------------------------
async function waitForServer(server, logs) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`le serveur s'est arrêté (code ${server.exitCode}) :\n${logs()}`);
    }
    try {
      await fetch(`${BASE}/`, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`le serveur n'a pas démarré à temps :\n${logs()}`);
}

async function checkHttp() {
  const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    check("serveur Next démarrable", false, "next introuvable dans node_modules");
    return;
  }

  let logs = "";
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      CRON_SECRET,
      MONEYFUSION_WEBHOOK_SECRET: WEBHOOK_SECRET,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => (logs += chunk));
  server.stderr.on("data", (chunk) => (logs += chunk));

  try {
    await waitForServer(server, () => logs);

    const cronAnonymous = await fetch(`${BASE}/api/cron/auto-payout`, {
      headers: { authorization: "" },
    });
    check(
      "cron sans CRON_SECRET → 401",
      cronAnonymous.status === 401,
      `HTTP ${cronAnonymous.status}`,
    );

    const cronWrong = await fetch(`${BASE}/api/cron/auto-payout`, {
      headers: { authorization: "Bearer mauvais-secret" },
    });
    check(
      "cron avec un mauvais CRON_SECRET → 401",
      cronWrong.status === 401,
      `HTTP ${cronWrong.status}`,
    );

    const fakePayment = {
      event: "payin.session.completed",
      tokenPay: "jeton-inexistant",
      statut: "paid",
      montant: 1,
    };

    const unsigned = await fetch(`${BASE}/api/payments/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fakePayment),
    });
    check(
      "webhook Payin non signé → 401",
      unsigned.status === 401,
      `HTTP ${unsigned.status}`,
    );

    const unsignedPayout = await fetch(`${BASE}/api/payouts/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "payout.session.completed", tokenPay: "jeton-inexistant" }),
    });
    check(
      "webhook Payout non signé → 401",
      unsignedPayout.status === 401,
      `HTTP ${unsignedPayout.status}`,
    );

    const signed = await fetch(`${BASE}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
      },
      body: JSON.stringify(fakePayment),
    });
    let body = null;
    try {
      body = await signed.json();
    } catch {
      body = null;
    }
    check(
      "webhook falsifié signé → jamais crédité",
      !(signed.status === 200 && body?.outcome === "PAID") &&
        (signed.status >= 400 || body?.ignored !== undefined),
      `HTTP ${signed.status} ${JSON.stringify(body)}`,
    );
  } finally {
    server.kill();
  }
}

checkClientBundle();
checkSeedGuard();
checkWebhookSecretPolicy();

try {
  await checkHttp();
} catch (error) {
  check("tests HTTP exécutés", false, error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} test(s) de sécurité en échec.`);
  process.exit(1);
}

console.log("\nTous les tests de sécurité passent.");
