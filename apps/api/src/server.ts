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
import { socketHandler } from "./lib/socket";

dotenv.config();

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.WEB_URL || "http://localhost:3000", credentials: true }));
app.use(morgan("dev"));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/users", userRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Socket.io
socketHandler(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 PlanIt API running on http://localhost:${PORT}`);
});
