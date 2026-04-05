import { requireAdmin } from "../middleware/requireAdmin.js";
import { createIpRateLimiter } from "../middleware/rateLimit.js";
import { Router, Request, Response } from "express";
import db from "../db.js";
import { z } from "zod";

const router = Router();

const newsletterSignupLimit = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 40,
  keyPrefix: "newsletter-signup",
});

const subscriberSchema = z.object({
  email: z.string().min(1, "Email is required").email("Please enter a valid email address"),
  fullName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

interface SubscriberRow {
  id: number;
  full_name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
}

function formatSubscriber(r: SubscriberRow) {
  return {
    id: String(r.id),
    fullName: r.full_name ?? "",
    email: r.email,
    phone: r.phone ?? "",
    createdAt: r.created_at,
  };
}

router.get("/", requireAdmin, (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT id, full_name, email, phone, created_at FROM emails ORDER BY datetime(created_at) DESC`
    )
    .all() as SubscriberRow[];
  return res.json(rows.map(formatSubscriber));
});

router.post("/", newsletterSignupLimit, (req: Request, res: Response) => {
  const parsed = subscriberSchema.safeParse(req.body);
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    parsed.error.errors.forEach((e) => {
      const path = e.path.join(".");
      if (!details[path]) details[path] = [];
      details[path].push(e.message);
    });
    return res.status(400).json({
      error: "Invalid input",
      details,
    });
  }

  const { email, fullName, phone } = parsed.data;
  const fullNameDb = fullName && fullName.length > 0 ? fullName : null;
  const phoneDb = phone && phone.length > 0 ? phone : null;

  try {
    const insert = db.prepare(
      "INSERT INTO emails (email, full_name, phone) VALUES (?, ?, ?)"
    );
    const result = insert.run(email, fullNameDb, phoneDb);
    const row = db
      .prepare(
        "SELECT id, full_name, email, phone, created_at FROM emails WHERE id = ?"
      )
      .get(result.lastInsertRowid) as SubscriberRow;
    return res.status(201).json({
      ok: true,
      data: formatSubscriber(row),
    });
  } catch (err) {
    const sqliteErr = err as { code?: string; message?: string };
    if (sqliteErr.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "Already subscribed",
        message: "This email is already on the list.",
      });
    }
    console.error("Newsletter signup error:", err);
    return res.status(500).json({
      error: "Failed to subscribe",
      message: sqliteErr.message || "Something went wrong.",
    });
  }
});

export default router;
