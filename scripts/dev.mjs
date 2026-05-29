#!/usr/bin/env node
// Local development runner.
// - Starts the server with DATA_DIR pointing at a local folder (default: ./data)
// - Starts the Vite dev server for hot reload
// - Streams both processes' logs and shuts them down cleanly on Ctrl+C.
//
// Usage:
//   bun run dev                         # uses ./data
//   bun run dev --data-dir /abs/path    # override location
//   DATA_DIR=/abs/path bun run dev      # env override

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// --- args ---------------------------------------------------------------
const args = process.argv.slice(2);
let dataDirArg = process.env.DATA_DIR || null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--data-dir" && args[i + 1]) {
    dataDirArg = args[i + 1];
    i++;
  } else if (a.startsWith("--data-dir=")) {
    dataDirArg = a.slice("--data-dir=".length);
  }
}

const DATA_DIR = path.resolve(REPO_ROOT, dataDirArg || "./data");

// --- ensure data dir layout --------------------------------------------
for (const sub of ["", "videos", "sprites", "thumbnails", ".home"]) {
  mkdirSync(path.join(DATA_DIR, sub), { recursive: true });
}

// --- pretty logging -----------------------------------------------------
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
};

function prefixed(stream, label, color) {
  const tag = `${color}${COLORS.bold}[${label}]${COLORS.reset} `;
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      process.stdout.write(`${tag}${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buf.length > 0) process.stdout.write(`${tag}${buf}\n`);
  });
}

console.log(
  `${COLORS.bold}LUNA${COLORS.reset} dev — ${COLORS.dim}data:${COLORS.reset} ${COLORS.green}${DATA_DIR}${COLORS.reset}`
);

// --- spawn server + client ---------------------------------------------
const server = spawn("bun", ["--watch", "src/index.ts"], {
  cwd: path.join(REPO_ROOT, "server"),
  env: {
    ...process.env,
    DATA_DIR,
    PORT: process.env.PORT || "3000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const client = spawn("bun", ["run", "dev"], {
  cwd: path.join(REPO_ROOT, "client"),
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

prefixed(server.stdout, "server", COLORS.cyan);
prefixed(server.stderr, "server", COLORS.cyan);
prefixed(client.stdout, "client", COLORS.magenta);
prefixed(client.stderr, "client", COLORS.magenta);

// --- shutdown -----------------------------------------------------------
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of [server, client]) {
    if (p && p.exitCode === null) {
      try {
        p.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(code), 250).unref();
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => shutdown(0));
}

server.on("exit", (code, signal) => {
  process.stdout.write(`${COLORS.cyan}[server]${COLORS.reset} exited (${signal || code})\n`);
  shutdown(code ?? 0);
});
client.on("exit", (code, signal) => {
  process.stdout.write(`${COLORS.magenta}[client]${COLORS.reset} exited (${signal || code})\n`);
  shutdown(code ?? 0);
});
