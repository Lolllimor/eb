import { Router, Request, Response } from "express";
import db from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

interface TestimonialRow {
  id: number;
  text: string;
  name: string;
  title: string | null;
  rating: number | null;
}

function formatTestimonial(r: TestimonialRow) {
  return {
    id: String(r.id),
    text: r.text,
    name: r.name,
    title: r.title,
    rating: r.rating ?? 5,
  };
}
router.post("/", requireAdmin, (req: Request, res: Response) => {
  const { text, name, title, rating } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required" });
  }
  if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: "Rating must be between 1 and 5" });
  }
  const result = db.prepare("INSERT INTO testimonials (text, name, title, rating) VALUES (?, ?, ?, ?)").run(text, name, title, rating);
  const row = db.prepare("SELECT id, text, name, title, rating FROM testimonials WHERE id = ?").get(result.lastInsertRowid) as TestimonialRow;
  res.status(201).json(formatTestimonial(row));
});

router.get("/", (_req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT id, text, name, title, rating FROM testimonials ORDER BY sort_order")
    .all() as TestimonialRow[];
  res.json(
    rows.map((r) => ({
      id: String(r.id),
      text: r.text,
      name: r.name,
      title: r.title,
      rating: r.rating ?? 5,
    }))
  );
});

router.delete("/:id", requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const result = db.prepare("DELETE FROM testimonials WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Testimonial not found" });
  res.status(204).send();
});

router.put("/:id", requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const { text, name, title, rating } = req.body;
  const existing = db.prepare("SELECT id FROM testimonials WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Testimonial not found" });
  const result = db.prepare("UPDATE testimonials SET text = ?, name = ?, title = ?, rating = ? WHERE id = ?").run(text, name, title, rating, id);
  if (result.changes === 0) return res.status(404).json({ error: "Testimonial not found" });
  res.json({ id, text, name, title, rating });
});
export default router;
