import { Router, type IRouter } from "express";
import { storage } from "../lib/storage";
import { attachUser, requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/users",
  attachUser,
  requireAuth("admin"),
  async (_req: AuthRequest, res) => {
    const users = await storage.getUsers();
    const safe = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      company: u.company ?? "",
      description: u.description ?? "",
      createdAt: u.createdAt,
    }));
    safe.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ users: safe, total: safe.length });
  },
);

export default router;
