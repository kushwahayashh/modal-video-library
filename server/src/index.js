import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Enable CORS for development
await app.register(cors, { origin: true });

// Serve static client build in production
const clientBuildPath = path.join(__dirname, "../../client/dist");
try {
  await app.register(fastifyStatic, {
    root: clientBuildPath,
    prefix: "/",
  });
} catch (e) {
  // Client not built yet, that's fine for dev
}

// Health check
app.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Example API route
app.get("/api/info", async () => {
  return {
    name: "Video Library",
    version: "1.0.0",
    tools: ["ffmpeg", "yt-dlp", "aria2c", "mediainfo"],
  };
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log("Server running at http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
