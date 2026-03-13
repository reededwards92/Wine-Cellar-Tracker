import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
const JWT_SECRET = process.env.SESSION_SECRET;

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

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const result = await pool.query("SELECT id, email, display_name FROM users WHERE id = $1", [decoded.userId]);
  if (result.rows.length === 0) {
    return res.status(401).json({ message: "User not found" });
  }

  const user = result.rows[0];
  req.userId = user.id;
  req.user = user;
  next();
}

export function registerAuthRoutes(app: any) {
  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name",
      [email, hash, display_name || null]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({ user, token });
  });

  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await pool.query("SELECT id, email, password_hash, display_name FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];
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

  app.post("/api/auth/google", authLimiter, async (req: Request, res: Response) => {
    const { id_token, email, name, google_id } = req.body;

    if (!email || !google_id) {
      return res.status(400).json({ message: "Google sign-in data is required" });
    }

    let result = await pool.query("SELECT id, email, display_name FROM users WHERE google_id = $1", [google_id]);
    let user = result.rows[0];

    if (!user) {
      result = await pool.query("SELECT id, email, display_name, google_id FROM users WHERE email = $1", [email]);
      user = result.rows[0];
      if (user) {
        await pool.query("UPDATE users SET google_id = $1 WHERE id = $2", [google_id, user.id]);
      }
    }

    if (!user) {
      const dummyHash = bcrypt.hashSync(Math.random().toString(36), 10);
      result = await pool.query(
        "INSERT INTO users (email, password_hash, display_name, google_id) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name",
        [email, dummyHash, name || null, google_id]
      );
      user = result.rows[0];
    }

    const token = generateToken(user.id);
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name }, token });
  });

  app.get("/api/auth/me", async (req: AuthRequest, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const result = await pool.query("SELECT id, email, display_name FROM users WHERE id = $1", [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }

    res.json({ user: result.rows[0] });
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    res.json({ message: "Logged out" });
  });

  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [String(email).toLowerCase().trim()]);
    if (userResult.rows.length === 0) {
      return res.json({ message: "If that email exists, we sent a reset code" });
    }

    const userId = userResult.rows[0].id;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [userId, tokenHash, expiresAt]
    );

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "noreply@vin-tracker.replit.app",
            to: email,
            subject: "Vin — Password Reset Code",
            html: `<p>Your password reset code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#722F37">${code}</p><p>This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>`,
          }),
        });
      } catch (e) {
        console.error("[auth] Failed to send reset email:", e);
      }
    } else {
      console.log(`[auth] DEV — password reset code for ${email}: ${code}`);
    }

    res.json({ message: "If that email exists, we sent a reset code" });
  });

  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password) {
      return res.status(400).json({ message: "Email, code, and new password are required" });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [String(email).toLowerCase().trim()]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const userId = userResult.rows[0].id;
    const tokenHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");

    const tokenResult = await pool.query(
      "SELECT id FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW() AND used = FALSE",
      [userId, tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const hash = bcrypt.hashSync(String(new_password), 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
    await pool.query("UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", [tokenResult.rows[0].id]);

    res.json({ message: "Password reset successfully" });
  });

  app.patch("/api/auth/profile", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { display_name } = req.body;
    if (display_name === undefined || display_name === null) {
      return res.status(400).json({ message: "Display name is required" });
    }

    const trimmed = String(display_name).trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ message: "Display name cannot be empty" });
    }

    const result = await pool.query(
      "UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name",
      [trimmed, userId]
    );
    res.json({ user: result.rows[0] });
  });

  app.post("/api/auth/change-password", authLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const result = await pool.query("SELECT password_hash, google_id FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const user = result.rows[0];
    const valid = bcrypt.compareSync(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
    res.json({ message: "Password updated" });
  });

  app.delete("/api/auth/account", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM consumption_log WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM bottles WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM wines WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM storage_locations WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      await client.query("COMMIT");
      res.json({ message: "Account and all data deleted" });
    } catch (err: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ message: "Failed to delete account" });
    } finally {
      client.release();
    }
  });
}
