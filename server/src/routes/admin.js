import { Router } from "express";
import { auth, allow } from "../middleware/auth.js";
import { query } from "../db/mysql.js";
import { Notice } from "../models/notice.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";

const router = Router();

// All admin routes require ADMIN
router.use(auth, allow("ADMIN"));

// Simple ping for debugging
router.get("/ping", (_req, res) => res.json({ ok: true }));


// LIST
router.get("/courses", async (_req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, code, title FROM courses ORDER BY code"
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE
router.post("/courses", async (req, res, next) => {
  try {
    const code  = String(req.body.code || "").trim().toUpperCase();
    const title = String(req.body.title || "").trim();
    if (!code || !title) return res.status(400).json({ error: "code and title required" });

    await query("INSERT INTO courses (code, title) VALUES (?, ?)", [code, title]);
    res.json({ ok: true });
  } catch (e) { next(e); }  // <- Let the global error handler reply with JSON
});

/* ----------------- USERS ----------------- */
router.get("/users", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name FROM users ORDER BY id DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// CREATE user
router.post("/users", async (req, res, next) => {
  try {
    const full_name = (req.body.full_name || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const role = (req.body.role || "").toUpperCase();
    const password = String(req.body.password || "");

    if (!full_name) return res.status(400).json({ error: "full_name is required" });
    if (!email) return res.status(400).json({ error: "email is required" });
    if (!["ADMIN", "TEACHER", "STUDENT"].includes(role))
      return res.status(400).json({ error: "role must be ADMIN/TEACHER/STUDENT" });
    if (password.length < 6)
      return res.status(400).json({ error: "password must be at least 6 chars" });

    // find role_id
    const { rows: r } = await query(`SELECT id FROM roles WHERE name=? LIMIT 1`, [role]);
    if (!r.length) return res.status(400).json({ error: "role not found in DB" });
    const role_id = r[0].id;

    const hash = await bcrypt.hash(password, 10);

    await query(
      `INSERT INTO users (full_name, email, password_hash, role_id)
       VALUES (?,?,?,?)`,
      [full_name, email, hash, role_id]
    );

    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Email already exists" });
    }
    next(e);
  }
});

router.get("/sections/:id/roster", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const { rows } = await query(`
      SELECT u.id AS student_id, u.full_name, u.email
      FROM enrollments e
      JOIN users u ON u.id = e.student_id
      WHERE e.section_id = ?
      ORDER BY u.full_name
    `, [sectionId]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Enroll a student into a section
// POST /api/admin/sections/:id/enroll { studentId }
router.post("/sections/:id/enroll", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const studentId = Number(req.body.studentId);
    if (!sectionId || !studentId) return res.status(400).json({ error: "sectionId and studentId required" });

    await query(
      `INSERT INTO enrollments(section_id, student_id)
       VALUES (?, ?) ON DUPLICATE KEY UPDATE section_id = section_id`,
      [sectionId, studentId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Unenroll a student from a section
// DELETE /api/admin/sections/:id/enroll/:studentId
router.delete("/sections/:id/enroll/:studentId", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    await query(`DELETE FROM enrollments WHERE section_id=? AND student_id=?`, [sectionId, studentId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Optional: list all STUDENT users for dropdown
router.get("/students", async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.full_name, u.email
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name='STUDENT'
      ORDER BY u.full_name
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// DELETE user
// DELETE /api/admin/users/:id
router.delete("/users/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

    // optionally prevent deleting yourself
    if (req.user?.id === id) return res.status(400).json({ error: "You cannot delete your own account" });

    // Try to delete; may fail due to FK (teacher assigned to sections, etc.)
    await query(`DELETE FROM users WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    // if FK constraint fails (RESTRICT), surface a nicer message
    if (e?.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({ error: "User is referenced (e.g., teacher in sections) and cannot be deleted." });
    }
    next(e);
  }
});

/* -------------- COURSES & SECTIONS -------------- */
// Courses
router.get("/courses", async (_req,res,next) => {
  try {
    const { rows } = await query(`SELECT id, code, title FROM courses ORDER BY code`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Teachers
router.get("/teachers", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.full_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'TEACHER'
       ORDER BY u.full_name`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// list sections for dropdown and tables
router.get("/sections", async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.term,
             c.code AS course_code, c.title AS course_title,
             u.full_name AS teacher_name
      FROM sections s
      JOIN courses c ON c.id = s.course_id
      JOIN users   u ON u.id = s.teacher_id
      ORDER BY s.id DESC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// create section
router.post("/sections", asyncHandler(async (req, res) => {
  const { courseId, teacherId, term } = req.body;
  const cId = Number(courseId);
  const tId = Number(teacherId);
  const t = (term || "").trim();

  if (!Number.isInteger(cId) || cId <= 0) {
    return res.status(400).json({ error: "courseId must be a positive integer" });
  }
  if (!Number.isInteger(tId) || tId <= 0) {
    return res.status(400).json({ error: "teacherId must be a positive integer" });
  }
  if (!t) return res.status(400).json({ error: "term is required" });

  await query(`INSERT INTO sections(course_id, teacher_id, term) VALUES (?,?,?)`, [cId, tId, t]);
  res.json({ ok: true });
}));

// delete section (cascades handle dependents)
router.delete("/sections/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid section id" });
    }
    await query(`DELETE FROM sections WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ----------------- ROSTER ----------------- */
router.get("/sections/:id/roster", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const { rows } = await query(
      `SELECT u.id AS student_id, u.full_name
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
       WHERE e.section_id = ?
       ORDER BY u.full_name`,
      [sectionId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/* ----------------- EXAMS ----------------- */
router.get("/sections/:id/exams", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const { rows } = await query(
      `SELECT id, name, max_marks, exam_date
       FROM exams
       WHERE section_id = ?
       ORDER BY exam_date, id`,
      [sectionId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post("/sections/:id/exams", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const name = (req.body.name || "").trim();
    const max  = Number(req.body.max_marks ?? 100);
    const date = (req.body.exam_date ? new Date(req.body.exam_date) : new Date())
                  .toISOString().slice(0, 10); // yyyy-mm-dd

    if (!Number.isInteger(sectionId) || sectionId <= 0) {
      return res.status(400).json({ error: "Invalid section id" });
    }
    if (!name) return res.status(400).json({ error: "Exam name is required" });

    // ensure section exists (clear 404 instead of FK error)
    const { rows: exists } = await query(
      `SELECT id FROM sections WHERE id=? LIMIT 1`, [sectionId]
    );
    if (!exists.length) return res.status(404).json({ error: "Section not found" });

    const { rows } = await query(
      `INSERT INTO exams (section_id, name, max_marks, exam_date) VALUES (?,?,?,?)`,
      [sectionId, name, Number.isFinite(max) ? max : 100, date]
    );
    res.json({ ok: true, id: rows?.insertId });
  } catch (e) { next(e); }
});

router.delete("/exams/:examId", async (req, res, next) => {
  try {
    const examId = Number(req.params.examId);
    await query(`DELETE FROM exams WHERE id = ?`, [examId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ----------------- RESULTS (UPSERT) ----------------- */
router.post("/sections/:id/results", async (req, res, next) => {
  try {
    const { entries } = req.body || {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries[] required" });
    }
    for (const row of entries) {
      const sid = Number(row.studentId);
      for (const [examIdStr, val] of Object.entries(row.scores || {})) {
        const examId = Number(examIdStr);
        const marks  = (val === "" || val == null) ? null : Number(val);
        if (!Number.isFinite(examId) || !Number.isFinite(sid)) continue;
        await query(
          `INSERT INTO results (exam_id, student_id, marks_obtained)
           VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained)`,
          [examId, sid, marks]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ----------------- NOTICES (Mongo) ----------------- */
router.post("/notices", async (req, res, next) => {
  try {
    const title = (req.body.title || "").trim();
    const body  = (req.body.body  || "").trim();
    const audience = (req.body.audience || "ALL").toUpperCase();
    if (!title || !body) return res.status(400).json({ error: "Title and body are required" });
    const doc = await Notice.create({
      title,
      body,
      audience: ["ALL", "STUDENT", "TEACHER"].includes(audience) ? audience : "ALL",
      createdBy: req.user?.id,
    });
    res.json(doc);
  } catch (e) { next(e); }
});

router.get("/notices", async (_req, res, next) => {
  try {
    const list = await Notice.find({}).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) { next(e); }
});

router.delete("/notices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notice.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Notice not found" });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Invalid notice id" });
  }
});

/* ----------------- FEES ----------------- */
router.get("/fees", async (req, res, next) => {
  try {
    const status = req.query.status || "DUE";
    const { rows } = await query(
      `SELECT id, student_id, term, amount, status, due_date
       FROM fees
       WHERE status = ?
       ORDER BY due_date DESC`,
      [status]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post("/fees/:id/mark-paid", async (req, res, next) => {
  try {
    await query(`UPDATE fees SET status='PAID' WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Create fee for a single student
router.post("/fees", async (req, res, next) => {
  try {
    const studentId = Number(req.body.studentId);
    const term = (req.body.term || "").trim();
    const amount = Number(req.body.amount);
    const due = req.body.due_date ? new Date(req.body.due_date).toISOString().slice(0,10) : null;

    if (!Number.isInteger(studentId) || studentId <= 0)
      return res.status(400).json({ error: "Valid studentId required" });
    if (!term) return res.status(400).json({ error: "term required" });
    if (!Number.isFinite(amount) || amount <= 0)
      return res.status(400).json({ error: "amount must be > 0" });

    await query(
      `INSERT INTO fees (student_id, term, amount, status, due_date)
       VALUES (?, ?, ?, 'DUE', ?)`,
      [studentId, term, amount, due]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Bulk declare fees for all students in a section
router.post("/fees/bulk", async (req, res, next) => {
  try {
    const sectionId = Number(req.body.sectionId);
    const term = (req.body.term || "").trim();
    const amount = Number(req.body.amount);
    const due = req.body.due_date ? new Date(req.body.due_date).toISOString().slice(0,10) : null;

    if (!Number.isInteger(sectionId) || sectionId <= 0)
      return res.status(400).json({ error: "Valid sectionId required" });
    if (!term) return res.status(400).json({ error: "term required" });
    if (!Number.isFinite(amount) || amount <= 0)
      return res.status(400).json({ error: "amount must be > 0" });

    const { rows: students } = await query(
      `SELECT student_id FROM enrollments WHERE section_id = ?`,
      [sectionId]
    );
    if (!students.length) return res.json({ ok: true, inserted: 0 });

    const values = students.map(() => "(?, ?, ?, 'DUE', ?)").join(",");
    const params = students.flatMap(s => [s.student_id, term, amount, due]);
    await query(`INSERT INTO fees (student_id, term, amount, status, due_date) VALUES ${values}`, params);

    res.json({ ok: true, inserted: students.length });
  } catch (e) { next(e); }
});


export default router;
