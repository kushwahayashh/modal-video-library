import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerTerminalRoutes(app, deps) {
  const { DATA_DIR, touchActivity, terminalState } = deps;

  app.get("/ws/terminal", { websocket: true }, (socket) => {
    const shell = process.env.SHELL || "/bin/bash";
    const cwd = fs.existsSync(DATA_DIR) ? DATA_DIR : process.cwd();
    const decoder = new TextDecoder();

    let proc = null;
    let isAlive = true;
    let cleaned = false;
    terminalState.connectionCount++;
    touchActivity();

    const send = (type, data = {}) => {
      if (isAlive && socket.readyState === 1) {
        try {
          socket.send(JSON.stringify({ type, ...data }));
        } catch {
          // Ignore send errors
        }
      }
    };

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      isAlive = false;
      terminalState.connectionCount = Math.max(0, terminalState.connectionCount - 1);
      touchActivity();
      if (proc) {
        try {
          proc.kill();
          proc.terminal?.close();
        } catch {
          // Already dead
        }
        proc = null;
      }
    };

    try {
      proc = Bun.spawn([shell], {
        cwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          LANG: process.env.LANG || "en_US.UTF-8",
        },
        terminal: {
          cols: 80,
          rows: 24,
          data(_terminal, data) {
            send("output", { data: typeof data === "string" ? data : decoder.decode(data) });
          },
        },
      });
    } catch (e) {
      send("error", { message: `Failed to spawn shell: ${e.message}` });
      socket.close();
      return;
    }

    proc.exited.then((exitCode) => {
      send("exit", { code: exitCode });
      socket.close();
    });

    socket.on("message", (raw) => {
      if (!proc || !proc.terminal) return;

      try {
        const text = typeof raw === "string" ? raw : decoder.decode(raw);
        const msg = JSON.parse(text);

        switch (msg.type) {
          case "input":
            touchActivity();
            if (typeof msg.data === "string") proc.terminal.write(msg.data);
            break;
          case "resize": {
            touchActivity();
            const cols = Math.max(1, Math.min(500, parseInt(msg.cols, 10) || 80));
            const rows = Math.max(1, Math.min(200, parseInt(msg.rows, 10) || 24));
            try {
              proc.terminal.resize(cols, rows);
            } catch {
              // Ignore resize errors
            }
            break;
          }
          case "ping":
            touchActivity();
            send("pong");
            break;
        }
      } catch {
        // Ignore parse errors
      }
    });

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });

  app.get("/terminal", async (_request, reply) => {
    const terminalHtml = path.join(__dirname, "../terminal.html");
    const content = await fsp.readFile(terminalHtml, "utf-8");
    return reply.type("text/html").send(content);
  });
}
