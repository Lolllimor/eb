import { Router, Request, Response } from "express";
import db from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

interface BuildAReaderRow {
  books_collected: number;
  total_books: number;
  price_per_book: number;
}

function formatRow(row: BuildAReaderRow) {
  return {
    booksCollected: row.books_collected,
    totalBooks: row.total_books,
    pricePerBook: row.price_per_book,
  };
}

router.get("/", (_req: Request, res: Response) => {
  const row = db
    .prepare("SELECT books_collected, total_books, price_per_book FROM build_a_reader WHERE id = 1")
    .get() as BuildAReaderRow | undefined;
  if (!row) {
    return res.status(404).json({ error: "Build a reader not found" });
  }
  res.json(formatRow(row));
});

router.put("/", requireAdmin, (req: Request, res: Response) => {
  const { booksCollected, totalBooks, pricePerBook } = req.body;
  const existing = db.prepare("SELECT id FROM build_a_reader WHERE id = 1").get();
  if (!existing) return res.status(404).json({ error: "Build a reader not found" });
  const stmt = db.prepare(
    "UPDATE build_a_reader SET books_collected = ?, total_books = ?, price_per_book = ? WHERE id = 1"
  );
  stmt.run(
    Math.max(0, Number(booksCollected) || 0),
    Math.max(0, Number(totalBooks) || 0),
    Math.max(0, Number(pricePerBook) || 0)
  );
  const row = db
    .prepare("SELECT books_collected, total_books, price_per_book FROM build_a_reader WHERE id = 1")
    .get() as BuildAReaderRow;
  res.json(formatRow(row));
});

export default router;
