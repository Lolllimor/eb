import jwt from "jsonwebtoken";

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: "super_admin" | "admin";
}

export function signAdminToken(payload: AdminJwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  const seconds = Number(process.env.JWT_EXPIRES_SEC);
  const expiresIn =
    Number.isFinite(seconds) && seconds > 0 ? seconds : 60 * 60 * 24 * 7;
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  const decoded = jwt.verify(token, secret);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as AdminJwtPayload).sub !== "string" ||
    typeof (decoded as AdminJwtPayload).email !== "string" ||
    ((decoded as AdminJwtPayload).role !== "super_admin" && (decoded as AdminJwtPayload).role !== "admin")
  ) {
    throw new Error("Invalid token payload");
  }
  return decoded as AdminJwtPayload;
}
