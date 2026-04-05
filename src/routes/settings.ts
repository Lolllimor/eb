import { Router, Request, Response } from "express";
import { z } from "zod";
import db from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

interface SettingsRow {
  navigation_links: string | null;
  footer_navigation: string | null;
  social_media_links: string | null;
  contact_info: string | null;
}

interface StatRow {
  id: number;
  value: string;
  label: string;
}

const statUpdateItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    value: z.string().min(1, "Value is required").max(80),
    label: z.string().min(1, "Label cannot be empty").max(120).optional(),
  })
  .strict();

function formatStat(r: Pick<StatRow, "id" | "value" | "label">) {
  return {
    id: String(r.id),
    value: r.value,
    label: r.label,
  };
}

function getStats() {
  const rows = db
    .prepare("SELECT id, value, label FROM stats ORDER BY sort_order")
    .all() as Pick<StatRow, "id" | "value" | "label">[];
  return rows.map(formatStat);
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatSettings(row: SettingsRow) {
  return {
    navigationLinks: safeJsonParse(row.navigation_links || "[]", []),
    footerNavigation: safeJsonParse(row.footer_navigation || "[]", []),
    socialMediaLinks: safeJsonParse(row.social_media_links || "[]", []),
    contactInfo: safeJsonParse(row.contact_info || "{}", {}),
  };
}

router.get("/", (_req: Request, res: Response) => {
  const row = db.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow | undefined;
  if (!row) {
    return res.status(404).json({ error: "Settings not found" });
  }
  res.json({ ...formatSettings(row), stats: getStats() });
});

router.put("/", requireAdmin, (req: Request, res: Response) => {
  const { navigationLinks, footerNavigation, socialMediaLinks, contactInfo, stats: statsBody } = req.body;
  const row = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (!row) {
    return res.status(404).json({ error: "Settings not found" });
  }

  if (statsBody !== undefined) {
    const parsed = z.array(statUpdateItemSchema).safeParse(statsBody);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }
    const getStat = db.prepare("SELECT id, value, label FROM stats WHERE id = ?");
    const updates: { id: number; value: string; label: string }[] = [];
    for (const item of parsed.data) {
      const id = Number(item.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid stat id" });
      }
      const existing = getStat.get(id) as Pick<StatRow, "id" | "value" | "label"> | undefined;
      if (!existing) {
        return res.status(404).json({ error: "Not found", message: `Stat not found.` });
      }
      const value = item.value.trim();
      const label = item.label !== undefined ? item.label.trim() : existing.label;
      updates.push({ id, value, label });
    }
    const updateStat = db.prepare("UPDATE stats SET value = ?, label = ? WHERE id = ?");
    const applyStatUpdates = db.transaction(() => {
      for (const u of updates) {
        updateStat.run(u.value, u.label, u.id);
      }
    });
    applyStatUpdates();
  }

  const stmt = db.prepare(
    "UPDATE settings SET navigation_links = ?, footer_navigation = ?, social_media_links = ?, contact_info = ?, updated_at = datetime('now') WHERE id = 1"
  );
  stmt.run(
    JSON.stringify(navigationLinks ?? []),
    JSON.stringify(footerNavigation ?? []),
    JSON.stringify(socialMediaLinks ?? []),
    JSON.stringify(contactInfo ?? {})
  );
  const updated = db.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;
  res.json({ ...formatSettings(updated), stats: getStats() });
});

export default router;
