const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* ------------------- In-Memory Database ------------------- */
let users = [];
let products = [];
let orders = [];

/* ------------------- AUTH ROUTES ------------------- */

// Register
app.post("/register", (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: "All fields required" });
  }

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.json({ success: false, message: "User already exists" });
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
    role: role || "buyer"
  };

  users.push(newUser);

  res.json({
    success: true,
    user: newUser
  });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.json({ success: false, message: "Invalid credentials" });
  }

  res.json({
    success: true,
    user
  });
});

/* ------------------- PRODUCT ROUTES ------------------- */

// Add product (seller)
app.post("/products", (req, res) => {
  const { name, price, quantity, sellerId } = req.body;

  if (!name || !price || !quantity) {
    return res.json({ success: false, message: "Missing fields" });
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

// Get all products
app.get("/products", (req, res) => {
  res.json({ success: true, products });
});

/* ------------------- ORDER ROUTES ------------------- */

// Place order (buyer)
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

// Get all orders
app.get("/orders", (req, res) => {
  res.json({ success: true, orders });
});

/* ------------------- DEFAULT ROUTE ------------------- */

app.get("/", (req, res) => {
  res.send("B2B Trade Portal Backend Running 🚀");
});

/* ------------------- START SERVER ------------------- */

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
