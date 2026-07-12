import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

import authRoutes from "./routes/auth";
import groupRoutes from "./routes/groups";
import planRoutes from "./routes/plans";
import userRoutes from "./routes/users";
import messageRoutes from "./routes/messages";
import expenseRoutes from "./routes/expenses";
import friendRoutes from "./routes/friends";
import checklistRoutes from "./routes/checklist";
import activityRoutes from "./routes/activities";
import voteRoutes from "./routes/votes";
import galleryRoutes from "./routes/gallery";
import playlistRoutes from "./routes/playlist";
import fileRoutes from "./routes/files";
import availabilityRoutes from "./routes/availability";
import aiRoutes from "./routes/ai";
import voiceRoutes from "./routes/voice";
import { socketHandler } from "./lib/socket";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Dev: allow any origin (phone on LAN, Expo web on :8081). Lock down in production.
const corsOrigin = process.env.NODE_ENV === "production"
  ? (process.env.WEB_URL || "http://localhost:3000")
  : true;

export const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(morgan("dev"));
app.use(express.json({ limit: "8mb" })); // room for base64 photo uploads

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/checklist", checklistRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/votes", voteRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/playlist", playlistRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/voice", voiceRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Socket.io
socketHandler(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 PlanIt API running on http://localhost:${PORT}`);
});
