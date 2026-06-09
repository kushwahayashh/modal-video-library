import {
  AUTH_COOKIE,
  buildAuthCookie,
  checkPassword,
  clearAuthCookie,
  createToken,
  parseCookies,
  verifyToken,
} from "../lib/auth.js";

function isSecure(request: any): boolean {
  const proto = request.headers["x-forwarded-proto"] || request.protocol;
  return typeof proto === "string" && proto.split(",")[0].trim() === "https";
}

export function registerAuthRoutes(app) {
  app.post("/api/auth/login", async (request, reply) => {
    const { password } = (request.body as any) || {};
    if (!checkPassword(password)) {
      return reply.status(401).send({ error: "Invalid password" });
    }
    reply.header("Set-Cookie", buildAuthCookie(createToken(), isSecure(request)));
    return { success: true };
  });

  app.get("/api/auth/check", async (request) => {
    const cookies = parseCookies(request.headers.cookie);
    return { authenticated: verifyToken(cookies[AUTH_COOKIE]) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    reply.header("Set-Cookie", clearAuthCookie(isSecure(request)));
    return { success: true };
  });
}
