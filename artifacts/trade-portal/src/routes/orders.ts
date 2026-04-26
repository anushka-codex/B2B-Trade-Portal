import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { storage } from "../lib/storage";
import { attachUser, requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/orders",
  attachUser,
  requireAuth(),
  async (req: AuthRequest, res) => {
    const user = req.user!;
    const all = await storage.getOrders();
    const orders =
      user.role === "seller"
        ? all.filter((o) => o.sellerId === user.id)
        : all.filter((o) => o.buyerId === user.id);
    orders.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ orders });
  },
);

router.post(
  "/orders",
  attachUser,
  requireAuth("buyer"),
  async (req: AuthRequest, res) => {
    const { productId, quantity, shippingAddress, notes } = req.body ?? {};
    if (!productId || !quantity || !shippingAddress) {
      res
        .status(400)
        .json({ error: "productId, quantity and shippingAddress are required" });
      return;
    }
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty < 1) {
      res.status(400).json({ error: "Quantity must be a positive integer" });
      return;
    }
    const product = await storage.findProductById(String(productId));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (qty < product.minOrderQty) {
      res
        .status(400)
        .json({ error: `Minimum order quantity is ${product.minOrderQty}` });
      return;
    }
    if (qty > product.stock) {
      res.status(400).json({
        error: `Only ${product.stock} units available in stock`,
      });
      return;
    }

    const buyer = req.user!;
    const order = {
      id: `o_${crypto.randomBytes(8).toString("hex")}`,
      productId: product.id,
      productName: product.name,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      buyerId: buyer.id,
      buyerName: buyer.name,
      buyerCompany: buyer.company,
      quantity: qty,
      unitPrice: product.price,
      total: qty * product.price,
      status: "pending" as const,
      shippingAddress: String(shippingAddress).trim(),
      notes: notes ? String(notes).trim() : undefined,
      createdAt: Date.now(),
    };
    await storage.addOrder(order);
    await storage.updateProductStock(product.id, -qty);
    res.status(201).json({ order });
  },
);

router.patch(
  "/orders/:id",
  attachUser,
  requireAuth("seller"),
  async (req: AuthRequest, res) => {
    const { status } = req.body ?? {};
    const validStatuses = ["pending", "accepted", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const order = (await storage.getOrders()).find(
      (o) => o.id === req.params.id,
    );
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.sellerId !== req.user!.id) {
      res.status(403).json({ error: "Not your order" });
      return;
    }
    const updated = await storage.updateOrderStatus(req.params.id, status);
    res.json({ order: updated });
  },
);

export default router;
