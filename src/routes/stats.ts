import { Router, Request, Response } from "express";
import { z } from "zod";
import db from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

interface StatRow {
  id: number;
  value: string;
  label: string;
  sort_order: number;
}

const updateStatSchema = z
  .object({
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

router.get("/", (_req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT id, value, label FROM stats ORDER BY sort_order")
    .all() as Pick<StatRow, "id" | "value" | "label">[];
  res.json(rows.map(formatStat));
});

/** Update one stat row (value required; label optional). */
router.put("/:id", requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  const parsed = updateStatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
  }

  const existing = db
    .prepare("SELECT id, value, label FROM stats WHERE id = ?")
    .get(id) as Pick<StatRow, "id" | "value" | "label"> | undefined;
  if (!existing) {
    return res.status(404).json({ error: "Not found", message: "Stat not found." });
  }

  const value = parsed.data.value.trim();
  const label = parsed.data.label !== undefined ? parsed.data.label.trim() : existing.label;

  db.prepare("UPDATE stats SET value = ?, label = ? WHERE id = ?").run(value, label, id);

  const row = db
    .prepare("SELECT id, value, label FROM stats WHERE id = ?")
    .get(id) as Pick<StatRow, "id" | "value" | "label">;
  res.json(formatStat(row));
});

export default router;
