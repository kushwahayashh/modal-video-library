import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Plugin to suppress harmless WebSocket proxy errors in dev console
function suppressWsProxyErrors() {
  return {
    name: "suppress-ws-proxy-errors",
    configureServer(server) {
      // Suppress error logging for ws proxy errors
      const originalWarn = server.config.logger.warn;
      server.config.logger.warn = (msg, opts) => {
        if (typeof msg === "string" && (msg.includes("ws proxy") || msg.includes("ECONNRESET"))) {
          return;
        }
        originalWarn.call(server.config.logger, msg, opts);
      };
      
      const originalError = server.config.logger.error;
      server.config.logger.error = (msg, opts) => {
        if (typeof msg === "string" && (msg.includes("ws proxy") || msg.includes("ECONNRESET") || msg.includes("EPIPE"))) {
          return;
        }
        originalError.call(server.config.logger, msg, opts);
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), suppressWsProxyErrors()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
        changeOrigin: true,
        configure: (proxy, options) => {
          // Suppress all proxy errors (ECONNRESET, EPIPE, etc.)
          proxy.on("error", (err, req, res) => {
            // Intentionally empty - these are expected during normal operation
          });
          
          // Catch uncaught exceptions from WebSocket proxy
          const originalOn = proxy.on.bind(proxy);
          const suppressErrors = () => {
            // Suppress on the underlying socket
            if (proxy._socket) {
              proxy._socket.removeAllListeners("error");
              proxy._socket.on("error", () => {});
            }
          };
          
          proxy.on("proxyReqWs", (proxyReq, req, socket) => {
            socket.removeAllListeners("error");
            socket.on("error", () => {});
            
            // Also handle the proxy socket when it connects
            proxyReq.on("socket", (sock) => {
              sock.removeAllListeners("error");
              sock.on("error", () => {});
            });
          });
          
          proxy.on("open", (proxySocket) => {
            proxySocket.removeAllListeners("error");
            proxySocket.on("error", () => {});
            
            proxySocket.on("close", () => {
              // Clean up to prevent dangling listeners
            });
          });
          
          proxy.on("close", (res, socket, head) => {
            // Connection closed normally
          });
        },
      },
      "/terminal": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
