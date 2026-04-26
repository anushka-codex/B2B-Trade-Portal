import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { storage } from "../lib/storage";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  publicUser,
  attachUser,
  type AuthRequest,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/register", async (req, res) => {
  const { email, password, name, role, company } = req.body ?? {};

  if (!email || !password || !name || !role) {
    res
      .status(400)
      .json({ error: "email, password, name and role are required" });
    return;
  }
  if (role !== "seller" && role !== "buyer") {
    res.status(400).json({ error: "role must be 'seller' or 'buyer'" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "password must be at least 6 characters" });
    return;
  }

  const existing = await storage.findUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const user = {
    id: `u_${crypto.randomBytes(8).toString("hex")}`,
    email: String(email).trim(),
    password: hashPassword(password),
    name: String(name).trim(),
    role: role as "seller" | "buyer",
    company: company ? String(company).trim() : undefined,
    createdAt: Date.now(),
  };
  await storage.addUser(user);

  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  const user = await storage.findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

router.post("/logout", (req, res) => {
  const token = getSessionToken(req);
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", attachUser, (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ user: publicUser(req.user) });
});

export default router;
