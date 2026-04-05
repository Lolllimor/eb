import { mkdirSync, existsSync } from "fs";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, "..", "data", "emprinte.db");
const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const db: InstanceType<typeof Database> = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    navigation_links TEXT,
    footer_navigation TEXT,
    social_media_links TEXT,
    contact_info TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS book_club_hero (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    badge TEXT,
    title TEXT,
    description TEXT,
    button_text TEXT
  );

  CREATE TABLE IF NOT EXISTS build_a_reader (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    books_collected INTEGER NOT NULL DEFAULT 0,
    total_books INTEGER NOT NULL DEFAULT 0,
    price_per_book INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS insight_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    title TEXT NOT NULL,
    description TEXT,
    image TEXT,
    href TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    rating INTEGER DEFAULT 5,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bootcamps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cohort TEXT,
    participants TEXT,
    background_color TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin')),
    display_name TEXT,
    phone TEXT,
    profile_image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by_admin_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invited_by_admin_id) REFERENCES admins(id)
  );

  CREATE TABLE IF NOT EXISTS admin_password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add columns when upgrading an existing DB created before full_name / phone existed
const emailColumns = db.prepare("PRAGMA table_info(emails)").all() as { name: string }[];
const emailColumnNames = new Set(emailColumns.map((c) => c.name));
if (!emailColumnNames.has("full_name")) {
  db.exec("ALTER TABLE emails ADD COLUMN full_name TEXT");
}
if (!emailColumnNames.has("phone")) {
  db.exec("ALTER TABLE emails ADD COLUMN phone TEXT");
}

const adminColumns = db.prepare("PRAGMA table_info(admins)").all() as { name: string }[];
const adminColumnNames = new Set(adminColumns.map((c) => c.name));
if (!adminColumnNames.has("display_name")) {
  db.exec("ALTER TABLE admins ADD COLUMN display_name TEXT");
}
if (!adminColumnNames.has("phone")) {
  db.exec("ALTER TABLE admins ADD COLUMN phone TEXT");
}
if (!adminColumnNames.has("profile_image_url")) {
  db.exec("ALTER TABLE admins ADD COLUMN profile_image_url TEXT");
}

export default db;
