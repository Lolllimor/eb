import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

interface BookClubHeroRow {
  badge: string | null;
  title: string | null;
  description: string | null;
  button_text: string | null;
}

router.get("/", (_req: Request, res: Response) => {
  const row = db
    .prepare("SELECT badge, title, description, button_text FROM book_club_hero WHERE id = 1")
    .get() as BookClubHeroRow | undefined;
  if (!row) {
    return res.status(404).json({ error: "Book club hero not found" });
  }
  res.json({
    badge: row.badge,
    title: row.title,
    description: row.description,
    buttonText: row.button_text,
  });
});

export default router;
