import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db/mysql.js";

const router = express.Router();


// update
router.put("/courses/:id", async (req, res, next) => {
  try {
    const id    = Number(req.params.id);
    const code  = String(req.body.code || "").trim().toUpperCase();
    const title = String(req.body.title || "").trim();
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "invalid id" });
    if (!code || !title) return res.status(400).json({ error: "code and title required" });

    await query(`UPDATE courses SET code=?, title=? WHERE id=?`, [code, title, id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// delete (will fail if there are sections referencing it unless FK is ON DELETE CASCADE)
router.delete("/courses/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "invalid id" });
    await query(`DELETE FROM courses WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email = "", password = "" } = req.body;

    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.email = ?`,
      [email.trim()]
    );
    if (!rows.length) return res.status(401).json({ error: "Invalid email or password" });

    const user = rows[0];

    // Dev passwords for seeded test users (when password_hash is NULL)
    const DEV = {
      "admin@erp.test": "admin123",
      "teacher@erp.test": "teacher123",
      "student@erp.test": "student123",
    };

    let ok = false;
    if (user.password_hash) {
      ok = await bcrypt.compare(password, user.password_hash);
    } else if (DEV[email] && password === DEV[email]) {
      ok = true;
    }

    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    // Optional: issue JWT cookie (works with your fetch credentials: "include")
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "devsecret",
      { expiresIn: "7d" }
    );
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true in prod over HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Return the shape your client expects
    res.json({
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role, // "ADMIN" | "TEACHER" | "STUDENT"
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", async (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export default router;
