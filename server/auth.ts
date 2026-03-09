import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./db";

const JWT_SECRET = process.env.SESSION_SECRET || "vin-wine-cellar-secret-key";

export interface AuthRequest extends Request {
  userId?: number;
  user?: { id: number; email: string; display_name: string | null };
}

function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(decoded.userId) as any;
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  req.userId = user.id;
  req.user = user;
  next();
}

export function registerAuthRoutes(app: any) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"
    ).run(email, hash, display_name || null);

    const token = generateToken(result.lastInsertRowid as number);
    const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(result.lastInsertRowid) as any;

    res.status(201).json({ user, token });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = db.prepare("SELECT id, email, password_hash, display_name FROM users WHERE email = ?").get(email) as any;
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user.id);
    res.json({
      user: { id: user.id, email: user.email, display_name: user.display_name },
      token,
    });
  });

  app.post("/api/auth/google", async (req: Request, res: Response) => {
    const { id_token, email, name, google_id } = req.body;

    if (!email || !google_id) {
      return res.status(400).json({ message: "Google sign-in data is required" });
    }

    let user = db.prepare("SELECT id, email, display_name FROM users WHERE google_id = ?").get(google_id) as any;

    if (!user) {
      user = db.prepare("SELECT id, email, display_name, google_id FROM users WHERE email = ?").get(email) as any;
      if (user) {
        db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(google_id, user.id);
      }
    }

    if (!user) {
      const dummyHash = bcrypt.hashSync(Math.random().toString(36), 10);
      const result = db.prepare(
        "INSERT INTO users (email, password_hash, display_name, google_id) VALUES (?, ?, ?, ?)"
      ).run(email, dummyHash, name || null, google_id);
      user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(result.lastInsertRowid) as any;
    }

    const token = generateToken(user.id);
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name }, token });
  });

  app.get("/api/auth/me", (req: AuthRequest, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(decoded.userId) as any;
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    res.json({ user });
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.json({ message: "Logged out" });
  });

  app.delete("/api/auth/account", requireAuth, (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const deleteAccount = db.transaction(() => {
      db.prepare("DELETE FROM consumption_log WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM bottles WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM wines WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    });

    try {
      deleteAccount();
      res.json({ message: "Account and all data deleted" });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete account" });
    }
  });
}
