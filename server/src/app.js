// ---- top-level crash guards ----
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));
process.on("uncaughtException", (e) => console.error("uncaughtException", e));

import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { connectMongoOptional } from "./db/mongo.js";

// routers
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import teacherRoutes from "./routes/teacher.js";
import studentRoutes from "./routes/student.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();

// ---- core middleware (run ONCE) ----
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// ---- routes (mount ONCE) ----
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/analytics", analyticsRoutes);

// health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- global error handler (ONE instance, last) ----
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const port = process.env.PORT || 4000;

async function start() {
  await connectMongoOptional(process.env.MONGO_URL);
  app.listen(port, () => console.log(`API on :${port}`));
}

start();
