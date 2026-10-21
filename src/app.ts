// app.ts
import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.route";
import adminRoutes from "./routes/admin.route";
import authRoutes from "./routes/auth.route";
import publicRoutes from "./routes/public.route";

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api", authRoutes);
app.use("/api/v1", userRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);

export default app;
