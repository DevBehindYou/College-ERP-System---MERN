import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { query } from "../db/mysql.js";

const router = Router();
router.use(auth);

router.get("/attendance/section/:id", async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await query(
    `SELECT class_date AS date,
            AVG(attended) AS attendance_rate
     FROM attendance
     WHERE section_id = ? AND class_date BETWEEN ? AND ?
     GROUP BY class_date
     ORDER BY class_date`, [req.params.id, from, to]
  );
  res.json(rows);
});

export default router;
