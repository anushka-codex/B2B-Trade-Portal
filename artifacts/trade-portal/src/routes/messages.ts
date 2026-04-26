import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { storage, threadIdFor, type Message } from "../lib/storage";
import { attachUser, requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

// Send a new message
router.post(
  "/messages",
  attachUser,
  requireAuth(),
  async (req: AuthRequest, res) => {
    const { toUserId, body, productId, productName } = req.body ?? {};
    if (!toUserId || !body || typeof body !== "string" || !body.trim()) {
      res
        .status(400)
        .json({ error: "toUserId and a non-empty body are required" });
      return;
    }
    const sender = req.user!;
    if (sender.role === "admin") {
      res.status(403).json({ error: "Admins cannot send messages" });
      return;
    }
    if (toUserId === sender.id) {
      res.status(400).json({ error: "You cannot message yourself" });
      return;
    }
    const recipient = await storage.findUserById(String(toUserId));
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }

    const message: Message = {
      id: `m_${crypto.randomBytes(8).toString("hex")}`,
      threadId: threadIdFor(sender.id, recipient.id),
      fromId: sender.id,
      fromName: sender.name,
      fromRole: sender.role,
      toId: recipient.id,
      toName: recipient.name,
      productId: productId ? String(productId) : undefined,
      productName: productName ? String(productName).trim() : undefined,
      body: body.trim().slice(0, 2000),
      createdAt: Date.now(),
    };
    await storage.addMessage(message);
    res.status(201).json({ message });
  },
);

// Inbox: list of conversations involving the current user
router.get(
  "/messages",
  attachUser,
  requireAuth(),
  async (req: AuthRequest, res) => {
    const me = req.user!;
    const all = await storage.getMessages();
    const mine = all.filter((m) => m.fromId === me.id || m.toId === me.id);

    type ThreadSummary = {
      threadId: string;
      otherId: string;
      otherName: string;
      otherCompany?: string;
      lastMessage: Message;
      unread: number;
      total: number;
    };
    const byThread = new Map<string, ThreadSummary>();
    for (const m of mine) {
      const otherId = m.fromId === me.id ? m.toId : m.fromId;
      const otherName = m.fromId === me.id ? m.toName : m.fromName;
      let t = byThread.get(m.threadId);
      if (!t) {
        t = {
          threadId: m.threadId,
          otherId,
          otherName,
          lastMessage: m,
          unread: 0,
          total: 0,
        };
        byThread.set(m.threadId, t);
      }
      t.total++;
      if (m.toId === me.id && !m.readAt) t.unread++;
      if (m.createdAt > t.lastMessage.createdAt) t.lastMessage = m;
    }
    // Enrich with other user's company
    const threads = Array.from(byThread.values());
    if (threads.length) {
      const userMap = new Map<string, string | undefined>();
      for (const t of threads) {
        if (!userMap.has(t.otherId)) {
          const u = await storage.findUserById(t.otherId);
          userMap.set(t.otherId, u?.company);
        }
        t.otherCompany = userMap.get(t.otherId);
      }
    }
    threads.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
    const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
    res.json({ threads, totalUnread });
  },
);

// Full thread between current user and :otherId. Marks the thread as read for me.
router.get(
  "/messages/:otherId",
  attachUser,
  requireAuth(),
  async (req: AuthRequest, res) => {
    const me = req.user!;
    const otherId = String(req.params.otherId);
    if (otherId === me.id) {
      res.status(400).json({ error: "Cannot fetch a thread with yourself" });
      return;
    }
    const other = await storage.findUserById(otherId);
    if (!other) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const threadId = threadIdFor(me.id, otherId);
    await storage.markThreadReadFor(threadId, me.id);

    const all = await storage.getMessages();
    const messages = all
      .filter((m) => m.threadId === threadId)
      .sort((a, b) => a.createdAt - b.createdAt);

    res.json({
      messages,
      other: {
        id: other.id,
        name: other.name,
        role: other.role,
        company: other.company,
        email: other.email,
      },
    });
  },
);

export default router;
