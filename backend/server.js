const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* -------- In-Memory DB -------- */
let users = [];
let products = [];
let orders = [];

/* -------- AUTH -------- */
app.post("/register", (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: "All fields required" });
  }

  const exists = users.find(u => u.email === email);
  if (exists) {
    return res.json({ success: false, message: "User already exists" });
  }

  const user = {
    id: Date.now(),
    name,
    email,
    password,
    role: role || "buyer"
  };

  users.push(user);

  res.json({ success: true, user });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.json({ success: false, message: "Invalid credentials" });
  }

  res.json({ success: true, user });
});

/* -------- PRODUCTS -------- */
app.post("/products", (req, res) => {
  const { name, price, quantity, sellerId } = req.body;

  if (!name || !price || !quantity) {
    return res.json({ success: false });
  }

  const product = {
    id: Date.now(),
    name,
    price,
    quantity,
    sellerId
  };

  products.push(product);

  res.json({ success: true, product });
});

app.get("/products", (req, res) => {
  res.json({ success: true, products });
});

/* -------- ORDERS -------- */
app.post("/orders", (req, res) => {
  const { productId, buyerId, quantity } = req.body;

  const product = products.find(p => p.id == productId);

  if (!product) {
    return res.json({ success: false, message: "Product not found" });
  }

  const order = {
    id: Date.now(),
    productId,
    buyerId,
    quantity,
    status: "Pending"
  };

  orders.push(order);

  res.json({ success: true, order });
});

app.get("/orders", (req, res) => {
  res.json({ success: true, orders });
});

/* -------- SERVE FRONTEND (MOST IMPORTANT) -------- */
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

/* -------- START -------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
