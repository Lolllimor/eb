import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

interface BootcampRow {
  title: string;
  cohort: string | null;
  participants: string | null;
  background_color: string | null;
}

router.get("/", (_req: Request, res: Response) => {
  const rows = db
    .prepare("SELECT title, cohort, participants, background_color FROM bootcamps ORDER BY sort_order")
    .all() as BootcampRow[];
  res.json(
    rows.map((r) => ({
      title: r.title,
      cohort: r.cohort,
      participants: r.participants,
      backgroundColor: r.background_color,
    }))
  );
});

export default router;
