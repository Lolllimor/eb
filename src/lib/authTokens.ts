import { createHash, randomBytes, randomInt } from "crypto";

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** URL-safe token shown once to the user and sent in the invite link. */
export function generateInviteRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 6-digit string, leading zeros preserved (1M possibilities). */
export function generatePasswordResetOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Deterministic hash for storing OTP (pepper = JWT_SECRET). */
export function hashPasswordResetOtp(emailNorm: string, otpDigits: string): string {
  const pepper = process.env.JWT_SECRET ?? "";
  return createHash("sha256")
    .update(`${pepper}:pwreset:${emailNorm}:${otpDigits}`, "utf8")
    .digest("hex");
}
