// server/src/routes/student.js
import { Router } from "express";
import { auth, allow } from "../middleware/auth.js";
import { query } from "../db/mysql.js";
import { Assignment } from "../models/assignment.model.js";
import { Submission } from "../models/submission.model.js";
import { Notice } from "../models/notice.model.js";

const router = Router();
router.use(auth, allow("STUDENT"));

/**
 * GET /api/student/assignments
 * Return assignments for sections the student is enrolled in,
 * plus submission status for this student.
 */

// POST /api/student/fees/:id/pay
// Body: { method?: string, txnRef?: string }
router.post("/fees/:id/pay", async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const feeId = Number(req.params.id);
    const method = (req.body.method || "ONLINE").slice(0, 32);
    const txnRef = (req.body.txnRef || "").slice(0, 64);

    if (!Number.isInteger(feeId) || feeId <= 0) {
      return res.status(400).json({ error: "Invalid fee id" });
    }

    // Make sure this fee belongs to the student and is DUE
    const { rows } = await query(
      `SELECT id, amount, status FROM fees WHERE id=? AND student_id=? LIMIT 1`,
      [feeId, studentId]
    );
    if (!rows.length) return res.status(404).json({ error: "Fee not found" });

    const fee = rows[0];
    if (fee.status !== "DUE") {
      return res.status(409).json({ error: "Fee is not DUE" });
    }

    // Create payment + mark PAID
    await query(
      `INSERT INTO payments (fee_id, student_id, amount, method, txn_ref)
       VALUES (?,?,?,?,?)`,
      [feeId, studentId, fee.amount, method, txnRef || null]
    );
    await query(`UPDATE fees SET status='PAID' WHERE id=?`, [feeId]);

    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** FEES: all fees for the logged-in student */
router.get("/fees", async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { rows } = await query(
      `SELECT id, term, amount, status, due_date
         FROM fees
        WHERE student_id = ?
        ORDER BY due_date DESC, id DESC`,
      [studentId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

/** NOTICES: visible to students (ALL or STUDENT) */
router.get("/notices", async (_req, res, next) => {
  try {
    const list = await Notice.find({ audience: { $in: ["ALL", "STUDENT"] } })
      .sort({ createdAt: -1 })
      .lean();
    res.json(list);
  } catch (e) { next(e); }
});


router.get("/assignments", async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // find the sections this student is enrolled in
    const { rows: secRows } = await query(
      `SELECT DISTINCT section_id FROM enrollments WHERE student_id = ?`,
      [studentId]
    );
    const sectionIds = secRows.map((r) => r.section_id);
    if (sectionIds.length === 0) return res.json([]);

    // assignments for those sections
    const assignments = await Assignment.find({ sectionId: { $in: sectionIds } })
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    // submissions for this student (only those assignments)
    const subs = await Submission.find({
      assignmentId: { $in: assignments.map((a) => a._id) },
      studentId,
    }).lean();

    const subMap = new Map(
      subs.map((s) => [String(s.assignmentId), s])
    );

    const result = assignments.map((a) => {
      const s = subMap.get(String(a._id));
      return {
        _id: String(a._id),
        sectionId: a.sectionId,
        title: a.title,
        description: a.description || "",
        dueDate: a.dueDate,
        teacherId: a.teacherId,
        submitted: !!s,
        submittedAt: s?.submittedAt || null,
        url: s?.url || "",
      };
    });

    res.json(result);
  } catch (e) { next(e); }
});

/**
 * POST /api/student/assignments/:id/submit
 * Body: { url }
 * Upsert a submission for this student if they are enrolled in the section.
 */
router.post("/assignments/:id/submit", async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const assignmentId = req.params.id;
    const url = (req.body.url || "").trim();

    if (!url) return res.status(400).json({ error: "Submission URL is required." });

    const a = await Assignment.findById(assignmentId).lean();
    if (!a) return res.status(404).json({ error: "Assignment not found." });

    // make sure student belongs to this section
    const { rows } = await query(
      `SELECT 1 FROM enrollments WHERE section_id=? AND student_id=? LIMIT 1`,
      [a.sectionId, studentId]
    );
    if (!rows.length) return res.status(403).json({ error: "Not enrolled for this assignment." });

    await Submission.updateOne(
      { assignmentId: a._id, studentId },
      { $set: { status: "SUBMITTED", url, submittedAt: new Date() } },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
