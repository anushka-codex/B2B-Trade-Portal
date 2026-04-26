import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { storage } from "../lib/storage";
import { attachUser, requireAuth, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/products", async (req, res) => {
  const { search, category, sellerId, mine } = req.query;
  let products = await storage.getProducts();
  const users = await storage.getUsers();
  const sellerById = new Map(users.map((u) => [u.id, u]));

  if (typeof category === "string" && category) {
    products = products.filter(
      (p) => p.category.toLowerCase() === category.toLowerCase(),
    );
  }
  if (typeof search === "string" && search) {
    const q = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.sellerName.toLowerCase().includes(q),
    );
  }
  if (typeof sellerId === "string" && sellerId) {
    products = products.filter((p) => p.sellerId === sellerId);
  }

  if (mine === "true") {
    await new Promise<void>((resolve) =>
      attachUser(req as AuthRequest, res, () => resolve()),
    );
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    products = products.filter((p) => p.sellerId === user.id);
  }

  products.sort((a, b) => b.createdAt - a.createdAt);
  const enriched = products.map((p) => {
    const seller = sellerById.get(p.sellerId);
    return {
      ...p,
      sellerEmail: seller?.email ?? null,
      sellerCompany: seller?.company ?? null,
    };
  });
  res.json({ products: enriched });
});

router.get("/products/categories", async (_req, res) => {
  const products = await storage.getProducts();
  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  const categories = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json({ categories });
});

router.post(
  "/products",
  attachUser,
  requireAuth("seller"),
  async (req: AuthRequest, res) => {
    const { name, description, category, price, minOrderQty, stock, imageUrl } =
      req.body ?? {};

    if (!name || !category || price == null) {
      res
        .status(400)
        .json({ error: "name, category and price are required" });
      return;
    }
    const numPrice = Number(price);
    const numMin = Number(minOrderQty ?? 1);
    const numStock = Number(stock ?? 0);
    if (
      Number.isNaN(numPrice) ||
      numPrice < 0 ||
      Number.isNaN(numMin) ||
      numMin < 1 ||
      Number.isNaN(numStock) ||
      numStock < 0
    ) {
      res.status(400).json({ error: "Invalid numeric values" });
      return;
    }

    const product = {
      id: `p_${crypto.randomBytes(8).toString("hex")}`,
      sellerId: req.user!.id,
      sellerName: req.user!.company || req.user!.name,
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      category: String(category).trim(),
      price: numPrice,
      minOrderQty: numMin,
      stock: numStock,
      imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
      createdAt: Date.now(),
    };
    await storage.addProduct(product);
    res.status(201).json({ product });
  },
);

export default router;
