import { Router, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import db from "../db.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createIpRateLimiter, allowEmailAction } from "../middleware/rateLimit.js";
import { signAdminToken } from "../lib/jwtSign.js";
import {
  generateInviteRawToken,
  generatePasswordResetOtp,
  hashInviteToken,
  hashPasswordResetOtp,
} from "../lib/authTokens.js";

const router = Router();

const FORGOT_PASSWORD_OK_MESSAGE =
  "If that email is registered as an admin, a verification code was issued. Check your inbox or contact support.";

const loginRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: "auth-login",
});
const forgotPasswordIpLimit = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyPrefix: "auth-forgot",
});
const verifyOtpRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyPrefix: "auth-verify-otp",
});
const resetPasswordRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyPrefix: "auth-reset-pw",
});
const acceptInviteRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyPrefix: "auth-accept-invite",
});
const invitePreviewRateLimit = createIpRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: "auth-invite-preview",
});

const MAX_OTP_ATTEMPTS = 5;

const loginSchema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1),
});

const inviteCreateSchema = z.object({
  email: z.string().min(1).email(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const forgotPasswordSchema = z.object({
  email: z.string().min(1).email(),
});

const otpBodySchema = z.object({
  email: z.string().min(1).email(),
  otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

const resetPasswordSchema = z.object({
  email: z.string().min(1).email(),
  otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Cloudinary (or any CDN) HTTPS URL, or "" to clear the image */
const profilePatchSchema = z
  .object({
    displayName: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    profileImageUrl: z.union([z.literal(""), z.string().url()]).optional(),
  })
  .strict();

interface AdminRow {
  id: number;
  email: string;
  password_hash: string;
  role: "super_admin" | "admin";
  display_name?: string | null;
  phone?: string | null;
  profile_image_url?: string | null;
}

interface AdminProfileRow {
  id: number;
  email: string;
  role: "super_admin" | "admin";
  display_name: string | null;
  phone: string | null;
  profile_image_url: string | null;
}

function publicProfileFromRow(r: AdminProfileRow) {
  return {
    id: String(r.id),
    email: r.email,
    role: r.role,
    displayName: r.display_name ?? "",
    phone: r.phone ?? "",
    profileImageUrl: r.profile_image_url ?? "",
  };
}

function loadAdminProfile(adminId: number): AdminProfileRow | undefined {
  return db
    .prepare(
      `SELECT id, email, role, display_name, phone, profile_image_url
       FROM admins WHERE id = ?`
    )
    .get(adminId) as AdminProfileRow | undefined;
}

interface InviteRow {
  id: number;
  email: string;
  expires_at: string;
  accepted_at: string | null;
}

interface PasswordResetRow {
  id: number;
  email: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
}

function inviteLink(rawToken: string): string {
  const base =
    process.env.INVITE_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  return `${base}/admin/accept-invite?token=${encodeURIComponent(rawToken)}`;
}

function loadPasswordResetRow(emailNorm: string): PasswordResetRow | undefined {
  return db
    .prepare(
      `SELECT id, email, otp_hash, expires_at, attempts FROM admin_password_resets WHERE lower(email) = lower(?)`
    )
    .get(emailNorm) as PasswordResetRow | undefined;
}

function otpMatchesStored(row: PasswordResetRow, emailNorm: string, otp: string): boolean {
  const h = hashPasswordResetOtp(emailNorm, otp);
  try {
    return timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(row.otp_hash, "hex"));
  } catch {
    return false;
  }
}

router.post("/login", loginRateLimit, (req: Request, res: Response) => {
  if (!process.env.JWT_SECRET?.trim()) {
    return res.status(503).json({
      error: "Service unavailable",
      message:
        "Login does not require a client token. The server must have JWT_SECRET set in .env (used only to sign JWTs after login).",
    });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const admin = db
    .prepare(
      `SELECT id, email, password_hash, role, display_name, phone, profile_image_url
       FROM admins WHERE lower(email) = lower(?)`
    )
    .get(email.trim()) as AdminRow | undefined;

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid email or password.",
    });
  }

  const token = signAdminToken({
    sub: String(admin.id),
    email: admin.email,
    role: admin.role,
  });

  const profile = publicProfileFromRow({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    display_name: admin.display_name ?? null,
    phone: admin.phone ?? null,
    profile_image_url: admin.profile_image_url ?? null,
  });

  return res.json({
    token,
    admin: profile,
  });
});

router.get("/me", requireAdmin, (req: Request, res: Response) => {
  const row = loadAdminProfile(req.admin!.id);
  if (!row) {
    return res.status(404).json({ error: "Not found", message: "Admin not found." });
  }
  return res.json(publicProfileFromRow(row));
});

/** Full profile (same shape as /me); email is read-only on PUT */
router.get("/profile", requireAdmin, (req: Request, res: Response) => {
  const row = loadAdminProfile(req.admin!.id);
  if (!row) {
    return res.status(404).json({ error: "Not found", message: "Admin not found." });
  }
  return res.json(publicProfileFromRow(row));
});

/** Update name, phone, profile image URL (Cloudinary URL from client upload). Email cannot be changed. */
router.put("/profile", requireAdmin, (req: Request, res: Response) => {
  const parsed = profilePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input",
      details: parsed.error.flatten(),
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    const row = loadAdminProfile(req.admin!.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(publicProfileFromRow(row));
  }

  const id = req.admin!.id;
  const current = loadAdminProfile(id);
  if (!current) {
    return res.status(404).json({ error: "Not found", message: "Admin not found." });
  }

  let displayName = current.display_name;
  let phone = current.phone;
  let profileImageUrl = current.profile_image_url;

  if (parsed.data.displayName !== undefined) {
    const t = parsed.data.displayName.trim();
    displayName = t.length > 0 ? t : null;
  }
  if (parsed.data.phone !== undefined) {
    const t = parsed.data.phone.trim();
    phone = t.length > 0 ? t : null;
  }
  if (parsed.data.profileImageUrl !== undefined) {
    profileImageUrl = parsed.data.profileImageUrl === "" ? null : parsed.data.profileImageUrl;
  }

  db.prepare(
    "UPDATE admins SET display_name = ?, phone = ?, profile_image_url = ? WHERE id = ?"
  ).run(displayName, phone, profileImageUrl, id);

  const row = loadAdminProfile(id)!;
  return res.json(publicProfileFromRow(row));
});

type InviteStatus = "pending" | "expired" | "accepted";

function inviteStatus(row: { accepted_at: string | null; expires_at: string }): InviteStatus {
  if (row.accepted_at) return "accepted";
  const exp = new Date(row.expires_at).getTime();
  if (Number.isNaN(exp) || Date.now() > exp) return "expired";
  return "pending";
}

/** List admin invites (newest first): status, email, dates */
router.get("/invites", requireAdmin, (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT i.id, i.email, i.created_at, i.expires_at, i.accepted_at, a.email AS invited_by_email
       FROM admin_invites i
       INNER JOIN admins a ON a.id = i.invited_by_admin_id
       ORDER BY datetime(i.created_at) DESC`
    )
    .all() as {
    id: number;
    email: string;
    created_at: string;
    expires_at: string;
    accepted_at: string | null;
    invited_by_email: string;
  }[];

  return res.json(
    rows.map((r) => ({
      id: String(r.id),
      email: r.email,
      status: inviteStatus({ accepted_at: r.accepted_at, expires_at: r.expires_at }),
      invitedAt: r.created_at,
      expiresAt: r.expires_at,
      acceptedAt: r.accepted_at,
      invitedByEmail: r.invited_by_email,
    }))
  );
});

/** Create invite; invitee completes signup via POST /accept-invite */
router.post("/invites", requireAdmin, (req: Request, res: Response) => {
  const parsed = inviteCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const inviter = req.admin!;

  const existingAdmin = db.prepare("SELECT id FROM admins WHERE lower(email) = lower(?)").get(email);
  if (existingAdmin) {
    return res.status(409).json({
      error: "Conflict",
      message: "An admin with this email already exists.",
    });
  }

  db.prepare("DELETE FROM admin_invites WHERE lower(email) = lower(?) AND accepted_at IS NULL").run(email);

  const rawToken = generateInviteRawToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = db
    .prepare("SELECT datetime('now', '+7 days') as d")
    .get() as { d: string };

  db.prepare(
    `INSERT INTO admin_invites (email, token_hash, invited_by_admin_id, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(email, tokenHash, inviter.id, expiresAt.d);

  const link = inviteLink(rawToken);
  if (process.env.LOG_INVITE_LINKS === "1") {
    console.info(`[invite] ${email} — ${link}`);
  } else {
    console.info(`[invite] created for ${email} (full URL only in JSON response; set LOG_INVITE_LINKS=1 to log links)`);
  }

  return res.status(201).json({
    ok: true,
    message: "Invite created. Share the link with the invitee (check server logs if email is not configured).",
    inviteUrl: link,
    email,
  });
});

/** Public: validate token and return email for the accept-invite UI */
router.get("/invite-preview", invitePreviewRateLimit, (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  const tokenHash = hashInviteToken(token);
  const invite = db
    .prepare(
      `SELECT id, email, expires_at, accepted_at FROM admin_invites WHERE token_hash = ?`
    )
    .get(tokenHash) as InviteRow | undefined;

  if (!invite || invite.accepted_at) {
    return res.status(404).json({ error: "Not found", message: "Invalid or used invite." });
  }

  const exp = new Date(invite.expires_at).getTime();
  if (Number.isNaN(exp) || Date.now() > exp) {
    return res.status(410).json({ error: "Gone", message: "This invite has expired." });
  }

  return res.json({ email: invite.email });
});

/**
 * Step 1: request OTP. Same JSON is returned whether the email exists (no enumeration).
 * Optional dev-only: set LOG_RESET_OTP=1 to print the code (never use in production).
 */
router.post("/forgot-password", forgotPasswordIpLimit, (req: Request, res: Response) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      error: "Service unavailable",
      message: "Auth is not configured. Set JWT_SECRET on the server.",
    });
  }

  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const admin = db.prepare("SELECT id FROM admins WHERE lower(email) = lower(?)").get(emailNorm);

  if (!admin) {
    return res.json({ ok: true, message: FORGOT_PASSWORD_OK_MESSAGE });
  }

  if (!allowEmailAction(emailNorm, 60 * 60 * 1000, 6)) {
    console.warn(`[password-reset] Per-email hourly limit reached for ${emailNorm}`);
    return res.json({ ok: true, message: FORGOT_PASSWORD_OK_MESSAGE });
  }

  const otp = generatePasswordResetOtp();
  const otpHash = hashPasswordResetOtp(emailNorm, otp);
  db.prepare("DELETE FROM admin_password_resets WHERE lower(email) = lower(?)").run(emailNorm);
  const expiresAt = db
    .prepare("SELECT datetime('now', '+15 minutes') as d")
    .get() as { d: string };

  db.prepare(
    `INSERT INTO admin_password_resets (email, otp_hash, expires_at, attempts) VALUES (?, ?, ?, 0)`
  ).run(emailNorm, otpHash, expiresAt.d);

  if (process.env.LOG_RESET_OTP === "1") {
    console.info(`[password-reset] OTP for ${emailNorm}: ${otp}`);
  }

  return res.json({ ok: true, message: FORGOT_PASSWORD_OK_MESSAGE });
});

/** Step 2: confirm OTP before showing new-password form. */
router.post("/verify-reset-otp", verifyOtpRateLimit, (req: Request, res: Response) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      error: "Service unavailable",
      message: "Auth is not configured. Set JWT_SECRET on the server.",
    });
  }

  const parsed = otpBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const otp = parsed.data.otp;
  const row = loadPasswordResetRow(emailNorm);

  if (!row) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired code.",
    });
  }

  const exp = new Date(row.expires_at).getTime();
  if (Number.isNaN(exp) || Date.now() > exp) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired code.",
    });
  }

  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Too many attempts. Request a new code.",
    });
  }

  if (!otpMatchesStored(row, emailNorm, otp)) {
    db.prepare("UPDATE admin_password_resets SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired code.",
    });
  }

  return res.json({ ok: true, message: "Code verified. You may set a new password." });
});

/** Step 3: set new password (OTP checked again). */
router.post("/reset-password", resetPasswordRateLimit, (req: Request, res: Response) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      error: "Service unavailable",
      message: "Auth is not configured. Set JWT_SECRET on the server.",
    });
  }

  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const otp = parsed.data.otp;
  const password = parsed.data.password;
  const row = loadPasswordResetRow(emailNorm);

  if (!row) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired code.",
    });
  }

  const exp = new Date(row.expires_at).getTime();
  if (Number.isNaN(exp) || Date.now() > exp) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired code.",
    });
  }

  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Too many attempts. Request a new code.",
    });
  }

  if (!otpMatchesStored(row, emailNorm, otp)) {
    db.prepare("UPDATE admin_password_resets SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired code.",
    });
  }

  const admin = db
    .prepare("SELECT id FROM admins WHERE lower(email) = lower(?)")
    .get(emailNorm) as { id: number } | undefined;
  if (!admin) {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid email" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    db.transaction(() => {
      db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(passwordHash, admin.id);
      db.prepare("DELETE FROM admin_password_resets WHERE id = ?").run(row.id);
    })();
    return res.json({ ok: true, message: "Password updated. You can sign in." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update password" });
  }
});

router.post("/accept-invite", acceptInviteRateLimit, (req: Request, res: Response) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const { token, password } = parsed.data;
  const tokenHash = hashInviteToken(token.trim());

  const invite = db
    .prepare(
      `SELECT id, email, expires_at, accepted_at FROM admin_invites WHERE token_hash = ?`
    )
    .get(tokenHash) as InviteRow | undefined;

  if (!invite || invite.accepted_at) {
    return res.status(404).json({ error: "Not found", message: "Invalid or used invite." });
  }

  const exp = new Date(invite.expires_at).getTime();
  if (Number.isNaN(exp) || Date.now() > exp) {
    return res.status(410).json({ error: "Gone", message: "This invite has expired." });
  }

  const email = invite.email.toLowerCase();
  const existingAdmin = db.prepare("SELECT id FROM admins WHERE lower(email) = lower(?)").get(email);
  if (existingAdmin) {
    return res.status(409).json({ error: "Conflict", message: "An admin with this email already exists." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const tx = db.transaction(() => {
      const result = db
        .prepare("INSERT INTO admins (email, password_hash, role) VALUES (?, ?, 'admin')")
        .run(email, passwordHash);
      db.prepare("UPDATE admin_invites SET accepted_at = datetime('now') WHERE id = ?").run(invite.id);
      return result.lastInsertRowid;
    });
    const newId = tx();
    return res.status(201).json({
      ok: true,
      message: "Account created. You can sign in.",
      admin: { id: String(newId), email, role: "admin" },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create account" });
  }
});

export default router;
