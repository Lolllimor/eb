import "express";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: number;
        email: string;
        role: "super_admin" | "admin";
      };
    }
  }
}

export {};
