import { Router } from "express";
import { auth, allow } from "../middleware/auth.js";
import { query } from "../db/mysql.js";
import { Assignment } from "../models/assignment.model.js";
import { Submission } from "../models/submission.model.js";
import { Notice } from "../models/notice.model.js";

const router = Router();

// TEACHER-ONLY
router.use(auth, allow("TEACHER"));

/* ------------------------------------------------------------------ */
/* Sections taught by this teacher + roster                           */
/* ------------------------------------------------------------------ */

router.get("/sections", async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { rows } = await query(
      `SELECT s.id, s.term, c.code AS course_code, c.title AS course_title
         FROM sections s
         JOIN courses c ON c.id = s.course_id
        WHERE s.teacher_id = ?
        ORDER BY s.id DESC`,
      [teacherId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get("/sections/:id/roster", async (req, res, next) => {
  try {
    const sectionId = Number(req.params.id);
    const { rows } = await query(
      `SELECT u.id AS student_id, u.full_name, u.email
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
        WHERE e.section_id = ?
        ORDER BY u.full_name`,
      [sectionId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Attendance                                                         */
/* ------------------------------------------------------------------ */

// Get existing marks for a day
router.get("/attendance", async (req, res, next) => {
  try {
    const sectionId = Number(req.query.sectionId);
    const date = (req.query.date || "").slice(0, 10);
    const { rows } = await query(
      `SELECT student_id, present
         FROM attendance
        WHERE section_id = ? AND att_date = ?`,
      [sectionId, date]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Bulk upsert
router.post("/attendance", async (req, res, next) => {
  try {
    const sectionId = Number(req.body.sectionId);
    const date = (req.body.date || "").slice(0, 10);
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    if (!sectionId || !date) {
      return res.status(400).json({ error: "sectionId and date are required" });
    }

    for (const row of entries) {
      const sid = Number(row.studentId);
      const present = row.present ? 1 : 0;
      await query(
        `INSERT INTO attendance (section_id, student_id, att_date, present)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE present = VALUES(present)`,
        [sectionId, sid, date, present]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Quick mark by studentId (no section selector)
router.post("/attendance/mark", async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const studentId = Number(req.body.studentId);
    const date = (req.body.date || "").slice(0, 10);
    const present = req.body.present ? 1 : 0;

    if (!Number.isInteger(studentId) || studentId <= 0)
      return res.status(400).json({ error: "Valid studentId required" });
    if (!date)
      return res.status(400).json({ error: "date is required (yyyy-mm-dd)" });

    // find the teacher's section that the student is in
    const { rows } = await query(
      `SELECT s.id AS section_id
         FROM enrollments e
         JOIN sections s ON s.id = e.section_id
        WHERE e.student_id = ? AND s.teacher_id = ?
        ORDER BY s.id DESC`,
      [studentId, teacherId]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Student is not in any of your sections." });
    }
    if (rows.length > 1) {
      return res.status(409).json({
        error:
          "Student is in multiple sections you teach. Please specify section.",
        sections: rows.map((r) => r.section_id),
      });
    }

    const sectionId = rows[0].section_id;
    await query(
      `INSERT INTO attendance (section_id, student_id, att_date, present)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE present = VALUES(present)`,
      [sectionId, studentId, date, present]
    );

    res.json({ ok: true, sectionId });
  } catch (e) {
    next(e);
  }
});

/* ------------------------------------------------------------------ */
/* Assignments                                                        */
/* ------------------------------------------------------------------ */

// Create assignment (verifies teacher owns the section)
// NOTE: sets teacherId (required by the listing endpoint)
router.post("/assignments", async (req, res, next) => {
  try {
    const { sectionId, title, description, dueDate } = req.body;
    if (!sectionId || !title || !dueDate)
      return res
        .status(400)
        .json({ error: "sectionId, title, dueDate required" });

    const { rows } = await query(
      `SELECT id FROM sections WHERE id=? AND teacher_id=?`,
      [sectionId, req.user.id]
    );
    if (!rows.length)
      return res.status(403).json({ error: "You don't own this section" });

    const doc = await Assignment.create({
      sectionId: Number(sectionId),
      teacherId: req.user.id, // <-- IMPORTANT
      title: String(title).trim(),
      description: String(description || "").trim(),
      dueDate: new Date(dueDate),
    });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Recent assignments (backward compatible for legacy docs with createdBy)
router.get("/assignments", async (req, res, next) => {
  try {
    const baseOr = [{ teacherId: req.user.id }, { createdBy: req.user.id }];
    const filter = { $or: baseOr };
    if (req.query.sectionId) filter.sectionId = Number(req.query.sectionId);

    const list = await Assignment.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json(list);
  } catch (e) {
    next(e);
  }
});

// Roster + submitted flag for an assignment
router.get("/assignments/:id/summary", async (req, res, next) => {
  try {
    const a = await Assignment.findById(req.params.id).lean();
    if (!a) return res.status(404).json({ error: "Assignment not found" });
    if (a.teacherId !== req.user.id && a.createdBy !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });

    const { rows: roster } = await query(
      `SELECT u.id AS student_id, u.full_name, u.email
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
        WHERE e.section_id = ?
        ORDER BY u.full_name`,
      [a.sectionId]
    );

    const subs = await Submission.find({ assignmentId: a._id }).lean();
    const submittedSet = new Set(
      subs.filter((s) => s.status === "SUBMITTED").map((s) => s.studentId)
    );

    const rows = roster.map((r) => ({
      student_id: r.student_id,
      full_name: r.full_name,
      email: r.email,
      submitted: submittedSet.has(r.student_id),
    }));

    res.json({ assignment: a, rows });
  } catch (e) {
    next(e);
  }
});

// Mark/unmark submission (teacher override)
router.post("/assignments/:id/mark", async (req, res, next) => {
  try {
    const a = await Assignment.findById(req.params.id);
    if (!a) return res.status(404).json({ error: "Assignment not found" });
    if (a.teacherId !== req.user.id && a.createdBy !== req.user.id)
      return res.status(403).json({ error: "Forbidden" });

    const studentId = Number(req.body.studentId);
    const submitted = !!req.body.submitted;
    const url = (req.body.url || "").trim();
    if (!studentId) return res.status(400).json({ error: "studentId required" });

    if (submitted) {
      await Submission.updateOne(
        { assignmentId: a._id, studentId },
        { $set: { status: "SUBMITTED", url, submittedAt: new Date() } },
        { upsert: true }
      );
    } else {
      await Submission.deleteOne({ assignmentId: a._id, studentId });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/teacher/assignments/:id
router.delete("/assignments/:id", async (req, res, next) => {
  try {
    const a = await Assignment.findById(req.params.id);
    if (!a) return res.status(404).json({ error: "Assignment not found" });
    if (a.teacherId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    await a.deleteOne(); // removes assignment
    await Submission.deleteMany({ assignmentId: a._id }); // optional: cleanup submissions
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/teacher/notices
router.get("/notices", async (_req, res, next) => {
  try {
    // Teachers see ALL + TEACHER + STUDENT
    const list = await Notice.find({ audience: { $in: ["ALL", "TEACHER", "STUDENT"] } })
      .sort({ createdAt: -1 })
      .lean();
    res.json(list);
  } catch (e) { next(e); }
});

export default router;
