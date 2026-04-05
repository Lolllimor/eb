import { Router, Request, Response } from "express";
import db from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

interface InsightRow {
  id: number;
  date: string | null;
  title: string;
  description: string | null;
  image: string | null;
  href: string | null;
}

function formatInsight(r: InsightRow) {
  return {
    id: String(r.id),
    date: r.date,
    title: r.title,
    description: r.description,
    image: r.image,
    href: r.href ?? undefined,
  };
}

router.get("/", (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      "SELECT id, date, title, description, image, href FROM insight_articles ORDER BY created_at DESC"
    )
    .all() as InsightRow[];
  res.json(rows.map(formatInsight));
});

router.get("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const row = db
    .prepare(
      "SELECT id, date, title, description, image, href FROM insight_articles WHERE id = ?"
    )
    .get(id) as InsightRow | undefined;
  if (!row) return res.status(404).json({ error: "Insight not found" });
  res.json(formatInsight(row));
});

router.post("/", requireAdmin, (req: Request, res: Response) => {
  const { date, title, description, image, href } = req.body;
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }
  const stmt = db.prepare(
    "INSERT INTO insight_articles (date, title, description, image, href) VALUES (?, ?, ?, ?, ?)"
  );
  const result = stmt.run(
    date ?? null,
    title.trim(),
    description ?? null,
    image ?? null,
    href ?? null
  );
  const row = db
    .prepare("SELECT id, date, title, description, image, href FROM insight_articles WHERE id = ?")
    .get(result.lastInsertRowid) as InsightRow;
  res.status(201).json(formatInsight(row));
});
/** Partial update: only keys present in the JSON body are applied */
router.patch("/:id", requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const existing = db
    .prepare("SELECT id, date, title, description, image, href FROM insight_articles WHERE id = ?")
    .get(id) as InsightRow | undefined;
  if (!existing) return res.status(404).json({ error: "Insight not found" });

  const b = req.body as Record<string, unknown>;
  const date = "date" in b ? (b.date == null ? null : String(b.date)) : existing.date;
  let title = existing.title;
  if ("title" in b) {
    if (typeof b.title !== "string" || !b.title.trim()) {
      return res.status(400).json({ error: "Title must be a non-empty string when provided" });
    }
    title = b.title.trim();
  }
  const description =
    "description" in b ? (b.description == null ? null : String(b.description)) : existing.description;
  const image = "image" in b ? (b.image == null ? null : String(b.image)) : existing.image;
  const href = "href" in b ? (b.href == null ? null : String(b.href)) : existing.href;

  db.prepare(
    "UPDATE insight_articles SET date = ?, title = ?, description = ?, image = ?, href = ? WHERE id = ?"
  ).run(date, title, description, image, href, id);
  const row = db
    .prepare("SELECT id, date, title, description, image, href FROM insight_articles WHERE id = ?")
    .get(id) as InsightRow;
  res.json(formatInsight(row));
});

router.put("/:id", requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const { date, title, description, image, href } = req.body;
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  const existing = db.prepare("SELECT id FROM insight_articles WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Insight not found" });
  const stmt = db.prepare(
    "UPDATE insight_articles SET date = ?, title = ?, description = ?, image = ?, href = ? WHERE id = ?"
  );
  stmt.run(
    date ?? null,
    title.trim(),
    description ?? null,
    image ?? null,
    href ?? null,
    id
  );
  const row = db
    .prepare("SELECT id, date, title, description, image, href FROM insight_articles WHERE id = ?")
    .get(id) as InsightRow;
  res.json(formatInsight(row));
});

router.delete("/:id", requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const result = db.prepare("DELETE FROM insight_articles WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Insight not found" });
  res.status(204).send();
});

export default router;
