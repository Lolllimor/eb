import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express, { Request, Response, NextFunction } from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });
import cors from "cors";

import auth from "./routes/auth.js";
import bookClubHero from "./routes/bookClubHero.js";
import buildAReader from "./routes/buildAReader.js";
import testimonials from "./routes/testimonials.js";
import bootcamps from "./routes/bootcamps.js";
import settings from "./routes/settings.js";
import insights from "./routes/insights.js";
import emails from "./routes/emails.js";
import stats from "./routes/stats.js";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3001;

// CORS – allow frontend (adjust origin in production)
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:3000", "http://127.0.0.1:3000"];
app.use(
  cors({
    origin: allowedOrigins,
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());

// Health check
app.get("/", (_req: Request, res: Response) => {
  res.json({ ok: true, message: "Emprinte API" });
});

// API routes (contract uses /api prefix)
app.use("/api/auth", auth);
app.use("/api/emails", emails);
app.use("/api/settings", settings);
app.use("/api/stats", stats);
app.use("/api/book-club-hero", bookClubHero);
app.use("/api/build-a-reader", buildAReader);
app.use("/api/insights", insights);
app.use("/api/blog", insights);
app.use("/api/testimonials", testimonials);
app.use("/api/bootcamps", bootcamps);

// 404
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

// Error handler (do not expose internal error text in production)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: "Internal server error",
    message: isProduction ? "Something went wrong." : err.message || "Something went wrong.",
  });
});

app.listen(PORT, () => {
  console.log(`Emprinte API running at http://localhost:${PORT}`);
});
