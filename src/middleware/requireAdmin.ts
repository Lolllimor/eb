import { RequestHandler, Request } from "express";
import { verifyAdminToken } from "../lib/jwtSign.js";

function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t.length > 0) return t;
  }
  return null;
}

/**
 * Requires `Authorization: Bearer <JWT>` from POST /api/auth/login.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    console.error("JWT_SECRET is not set; admin-protected routes are disabled.");
    return res.status(503).json({
      error: "Service unavailable",
      message: "Auth is not configured. Set JWT_SECRET on the server.",
    });
  }

  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing Bearer token.",
    });
  }

  try {
    const payload = verifyAdminToken(token);
    const id = Number(payload.sub);
    if (!id || Number.isNaN(id)) {
      return res.status(401).json({ error: "Unauthorized", message: "Invalid token." });
    }
    req.admin = { id, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token.",
    });
  }
};
