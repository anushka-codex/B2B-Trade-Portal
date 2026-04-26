// Admin Dashboard — users management & overview
(async function () {
  const cached = TP.readCachedUser();
  if (cached && cached.role === "admin") {
    document.getElementById("user-name").textContent = cached.name;
    document.getElementById("user-role").textContent =
      cached.company || "admin";
    document.getElementById("hi-name").textContent =
      cached.name.split(" ")[0];
    document.getElementById("avatar").textContent = TP.initials(cached.name);
    document.getElementById("tb-avatar").textContent = TP.initials(cached.name);
  }

  const user = await TP.requireRole("admin");
  if (!user) return;

  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-role").textContent =
    user.company ? user.company : "admin";
  document.getElementById("hi-name").textContent = user.name.split(" ")[0];
  document.getElementById("avatar").textContent = TP.initials(user.name);
  document.getElementById("tb-avatar").textContent = TP.initials(user.name);
  document.getElementById("tb-name").textContent =
    "Hi, " + user.name.split(" ")[0];
  document
    .getElementById("logout-btn")
    .addEventListener("click", TP.logoutAndGo);

  // ----- Tab navigation -----
  const pages = {
    overview: document.getElementById("page-overview"),
    products: document.getElementById("page-products"),
    orders: document.getElementById("page-orders"),
    users: document.getElementById("page-users"),
  };
  const navBtns = document.querySelectorAll("#nav button");

  function show(tab) {
    for (const [key, el] of Object.entries(pages)) {
      el.hidden = key !== tab;
    }
    navBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab),
    );
    if (tab === "overview") loadOverview();
    if (tab === "products") loadProducts();
    if (tab === "users") renderUsers();
  }
  navBtns.forEach((b) =>
    b.addEventListener("click", () => show(b.dataset.tab)),
  );
  document.querySelectorAll("[data-jump]").forEach((b) =>
    b.addEventListener("click", () => show(b.dataset.jump)),
  );

  // ----- Data caches -----
  let allUsers = [];
  let allProducts = [];

  async function fetchUsers() {
    if (allUsers.length) return allUsers;
    const data = await TP.api.users();
    allUsers = data.users || [];
    return allUsers;
  }

  async function fetchProducts() {
    if (allProducts.length) return allProducts;
    const data = await TP.api.products();
    allProducts = data.products || [];
    return allProducts;
  }

  // ----- Overview tab -----
  function statCard(label, value, sub, accent) {
    return TP.el(
      "div",
      { class: "stat-card stat-" + (accent || "primary") },
      [
        TP.el("div", { class: "stat-icon", html: iconFor(accent) }),
        TP.el("div", { class: "stat-body" }, [
          TP.el("div", { class: "stat-label" }, label),
          TP.el("div", { class: "stat-value" }, String(value)),
          sub ? TP.el("div", { class: "stat-sub" }, sub) : null,
        ]),
      ],
    );
  }

  function iconFor(kind) {
    const icons = {
      primary:
        '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
      success:
        '<svg viewBox="0 0 24 24"><path d="M3 12 9 18 21 6"/></svg>',
      warn:
        '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>',
      info:
        '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/></svg>',
    };
    return icons[kind] || icons.primary;
  }

  async function loadOverview() {
    const [users, products] = await Promise.all([
      fetchUsers(),
      fetchProducts(),
    ]);
    let orderTotal = 0;
    try {
      // /orders requires auth and filters by role; admin will see [].
      // Use it just to confirm the endpoint works; for total, leave dash.
      await TP.api.orders();
    } catch {
      /* ignore */
    }

    const sellers = users.filter((u) => u.role === "seller").length;
    const buyers = users.filter((u) => u.role === "buyer").length;

    const stats = document.getElementById("admin-stats");
    stats.innerHTML = "";
    stats.appendChild(
      statCard("Total users", users.length, "All registered accounts", "primary"),
    );
    stats.appendChild(
      statCard("Sellers", sellers, "Active product owners", "success"),
    );
    stats.appendChild(
      statCard("Buyers", buyers, "Bulk purchase accounts", "info"),
    );
    stats.appendChild(
      statCard("Products", products.length, "Listed for bulk orders", "warn"),
    );

    document.getElementById("orders-total").textContent = String(orderTotal || "—");

    const recent = users.slice(0, 6);
    const recentEl = document.getElementById("recent-users");
    recentEl.innerHTML = "";
    if (!recent.length) {
      recentEl.innerHTML = '<p class="muted">No users yet.</p>';
    } else {
      const list = TP.el("div", { class: "recent-users-list" });
      for (const u of recent) {
        list.appendChild(
          TP.el("div", { class: "recent-user" }, [
            TP.el("div", { class: "avatar avatar-sm" }, TP.initials(u.name)),
            TP.el("div", { class: "ru-info" }, [
              TP.el("div", { class: "ru-name" }, u.name),
              TP.el(
                "div",
                { class: "ru-meta" },
                (u.company || "Independent") + " · " + u.email,
              ),
            ]),
            TP.el(
              "span",
              { class: "role-badge role-" + u.role },
              u.role.toUpperCase(),
            ),
          ]),
        );
      }
      recentEl.appendChild(list);
    }
  }

  // ----- Products tab -----
  async function loadProducts() {
    const products = await fetchProducts();
    const wrap = document.getElementById("admin-products");
    wrap.innerHTML = "";
    if (!products.length) {
      wrap.innerHTML = '<p class="muted">No products listed yet.</p>';
      return;
    }
    for (const p of products) {
      const card = TP.el("div", { class: "product-card" }, [
        TP.el(
          "div",
          { class: "product-img" },
          p.imageUrl
            ? TP.el("img", { src: p.imageUrl, alt: p.name, loading: "lazy" })
            : TP.el("div", { class: "product-img-placeholder" }, "📦"),
        ),
        TP.el("div", { class: "product-body" }, [
          TP.el("div", { class: "product-cat" }, p.category),
          TP.el("h3", { class: "product-name" }, p.name),
          TP.el("div", { class: "product-seller" }, "by " + p.sellerName),
          TP.el("div", { class: "product-price" }, TP.fmtMoney(p.price)),
          TP.el(
            "div",
            { class: "product-meta" },
            "MOQ " + p.minOrderQty + " · Stock " + p.stock,
          ),
        ]),
      ]);
      wrap.appendChild(card);
    }
  }

  // ----- Users tab -----
  const searchInput = document.getElementById("users-search");
  const filterSelect = document.getElementById("users-filter");
  let usersLoaded = false;

  searchInput.addEventListener("input", renderUsers);
  filterSelect.addEventListener("change", renderUsers);

  async function renderUsers() {
    const tbody = document.getElementById("users-tbody");
    if (!usersLoaded) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="users-empty">Loading users…</td></tr>';
      try {
        await fetchUsers();
        usersLoaded = true;
      } catch (err) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="users-empty">Could not load users: ' +
          (err.message || "error") +
          "</td></tr>";
        return;
      }
    }

    const q = searchInput.value.trim().toLowerCase();
    const role = filterSelect.value;
    let list = allUsers.slice();
    if (role !== "all") list = list.filter((u) => u.role === role);
    if (q) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.company || "").toLowerCase().includes(q) ||
          (u.description || "").toLowerCase().includes(q),
      );
    }

    const sellers = allUsers.filter((u) => u.role === "seller").length;
    const buyers = allUsers.filter((u) => u.role === "buyer").length;
    document.getElementById("ucount-total").textContent = allUsers.length;
    document.getElementById("ucount-seller").textContent = sellers;
    document.getElementById("ucount-buyer").textContent = buyers;
    document.getElementById("users-shown").textContent =
      list.length + " of " + allUsers.length + " users";

    tbody.innerHTML = "";
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="users-empty">No users match your search.</td></tr>';
      return;
    }
    for (const u of list) {
      const tr = TP.el("tr", null, [
        TP.el("td", null, [
          TP.el("div", { class: "user-cell" }, [
            TP.el("div", { class: "avatar avatar-sm" }, TP.initials(u.name)),
            TP.el("div", { class: "user-cell-text" }, [
              TP.el("div", { class: "user-cell-name" }, u.name),
              TP.el("div", { class: "user-cell-id" }, "#" + u.id.slice(2, 10)),
            ]),
          ]),
        ]),
        TP.el("td", { class: "mono" }, u.email),
        TP.el(
          "td",
          null,
          TP.el(
            "span",
            { class: "role-badge role-" + u.role },
            u.role.toUpperCase(),
          ),
        ),
        TP.el("td", null, u.company || "—"),
        TP.el("td", { class: "user-desc" }, u.description || "—"),
      ]);
      tbody.appendChild(tr);
    }
  }

  // Top search routes to users tab and filters there
  document.getElementById("tb-search").addEventListener("input", (e) => {
    show("users");
    searchInput.value = e.target.value;
    renderUsers();
  });

  // Initial load
  show("overview");
})();
