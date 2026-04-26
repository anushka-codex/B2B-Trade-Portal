import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, "..", "data");

export type User = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: "seller" | "buyer" | "admin";
  company?: string;
  description?: string;
  createdAt: number;
};

export type Product = {
  id: string;
  sellerId: string;
  sellerName: string;
  name: string;
  description: string;
  category: string;
  price: number;
  minOrderQty: number;
  stock: number;
  imageUrl?: string;
  createdAt: number;
};

export type Message = {
  id: string;
  threadId: string;
  fromId: string;
  fromName: string;
  fromRole: "buyer" | "seller" | "admin";
  toId: string;
  toName: string;
  productId?: string;
  productName?: string;
  body: string;
  createdAt: number;
  readAt?: number;
};

export type Order = {
  id: string;
  productId: string;
  productName: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  buyerCompany?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: "pending" | "accepted" | "shipped" | "delivered" | "cancelled";
  shippingAddress: string;
  notes?: string;
  createdAt: number;
};

const fileLocks = new Map<string, Promise<void>>();

async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => {
    release = res;
  });
  fileLocks.set(file, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (fileLocks.get(file) === prev.then(() => next)) {
      fileLocks.delete(file);
    }
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(dataDir, file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  const fullPath = path.join(dataDir, file);
  const tmpPath = `${fullPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, fullPath);
}

export const storage = {
  async getUsers(): Promise<User[]> {
    return readJson<User[]>("users.json", []);
  },
  async addUser(user: User): Promise<void> {
    await withLock("users.json", async () => {
      const users = await readJson<User[]>("users.json", []);
      users.push(user);
      await writeJson("users.json", users);
    });
  },
  async findUserByEmail(email: string): Promise<User | undefined> {
    const users = await readJson<User[]>("users.json", []);
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  },
  async findUserById(id: string): Promise<User | undefined> {
    const users = await readJson<User[]>("users.json", []);
    return users.find((u) => u.id === id);
  },

  async getProducts(): Promise<Product[]> {
    return readJson<Product[]>("products.json", []);
  },
  async addProduct(product: Product): Promise<void> {
    await withLock("products.json", async () => {
      const products = await readJson<Product[]>("products.json", []);
      products.push(product);
      await writeJson("products.json", products);
    });
  },
  async updateProductStock(id: string, delta: number): Promise<void> {
    await withLock("products.json", async () => {
      const products = await readJson<Product[]>("products.json", []);
      const p = products.find((x) => x.id === id);
      if (p) {
        p.stock = Math.max(0, p.stock + delta);
        await writeJson("products.json", products);
      }
    });
  },
  async findProductById(id: string): Promise<Product | undefined> {
    const products = await readJson<Product[]>("products.json", []);
    return products.find((p) => p.id === id);
  },

  async getOrders(): Promise<Order[]> {
    return readJson<Order[]>("orders.json", []);
  },
  async addOrder(order: Order): Promise<void> {
    await withLock("orders.json", async () => {
      const orders = await readJson<Order[]>("orders.json", []);
      orders.push(order);
      await writeJson("orders.json", orders);
    });
  },
  async updateOrderStatus(
    id: string,
    status: Order["status"],
  ): Promise<Order | undefined> {
    return withLock("orders.json", async () => {
      const orders = await readJson<Order[]>("orders.json", []);
      const o = orders.find((x) => x.id === id);
      if (!o) return undefined;
      o.status = status;
      await writeJson("orders.json", orders);
      return o;
    });
  },

  async getMessages(): Promise<Message[]> {
    return readJson<Message[]>("messages.json", []);
  },
  async addMessage(message: Message): Promise<void> {
    await withLock("messages.json", async () => {
      const messages = await readJson<Message[]>("messages.json", []);
      messages.push(message);
      await writeJson("messages.json", messages);
    });
  },
  async markThreadReadFor(threadId: string, recipientId: string): Promise<number> {
    return withLock("messages.json", async () => {
      const messages = await readJson<Message[]>("messages.json", []);
      const now = Date.now();
      let updated = 0;
      for (const m of messages) {
        if (m.threadId === threadId && m.toId === recipientId && !m.readAt) {
          m.readAt = now;
          updated++;
        }
      }
      if (updated > 0) await writeJson("messages.json", messages);
      return updated;
    });
  },
};

export function threadIdFor(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}
