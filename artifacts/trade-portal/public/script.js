// Shared client utilities for the B2B Trade Portal
(function () {
  const api = {
    async req(method, path, body) {
      const opts = {
        method,
        credentials: "same-origin",
        headers: {},
      };
      if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      const res = await fetch("/api" + path, opts);
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        // ignore non-JSON responses
      }
      if (!res.ok) {
        const err = new Error((data && data.error) || res.statusText);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    me() {
      return this.req("GET", "/me");
    },
    register(payload) {
      return this.req("POST", "/register", payload);
    },
    login(payload) {
      return this.req("POST", "/login", payload);
    },
    logout() {
      return this.req("POST", "/logout");
    },
    products(query) {
      const qs = query
        ? "?" +
          Object.entries(query)
            .filter(([, v]) => v !== "" && v != null)
            .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
            .join("&")
        : "";
      return this.req("GET", "/products" + qs);
    },
    categories() {
      return this.req("GET", "/products/categories");
    },
    addProduct(payload) {
      return this.req("POST", "/products", payload);
    },
    orders() {
      return this.req("GET", "/orders");
    },
    placeOrder(payload) {
      return this.req("POST", "/orders", payload);
    },
    updateOrder(id, status) {
      return this.req("PATCH", "/orders/" + encodeURIComponent(id), { status });
    },
    users() {
      return this.req("GET", "/users");
    },
    getThreads() {
      return this.req("GET", "/messages");
    },
    getThread(otherId) {
      return this.req("GET", "/messages/" + encodeURIComponent(otherId));
    },
    sendMessage(payload) {
      return this.req("POST", "/messages", payload);
    },
  };

  function dashPathFor(role) {
    if (role === "admin") return "/admin-dashboard";
    if (role === "seller") return "/seller-dashboard";
    return "/buyer-dashboard";
  }

  function fmtMoney(n) {
    return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0 });
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  function initials(name) {
    return (name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join("");
  }
  function showAlert(el, msg, type) {
    if (!el) return;
    el.className = "alert " + (type || "error");
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v !== undefined && v !== null) {
          node.setAttribute(k, v);
        }
      }
    }
    if (children) {
      const arr = Array.isArray(children) ? children : [children];
      for (const c of arr) {
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  const USER_KEY = "tp.user";
  function cacheUser(user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
  }
  function readCachedUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function clearCachedUser() {
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }

  async function requireRole(role) {
    try {
      const { user } = await api.me();
      cacheUser(user);
      if (role && user.role !== role) {
        window.location.href = dashPathFor(user.role);
        return null;
      }
      return user;
    } catch (e) {
      clearCachedUser();
      window.location.href = "/login";
      return null;
    }
  }

  function logoutAndGo() {
    clearCachedUser();
    api.logout().finally(() => {
      window.location.href = "/";
    });
  }

  function bucketByDay(orders, days) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const labels = [];
    const counts = [];
    const totals = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push(
        d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      );
      counts.push(0);
      totals.push(0);
    }
    for (const o of orders) {
      const od = new Date(o.createdAt);
      od.setHours(0, 0, 0, 0);
      const diff = Math.floor((today - od) / (24 * 3600 * 1000));
      const idx = days - 1 - diff;
      if (idx >= 0 && idx < days) {
        counts[idx]++;
        if (o.status !== "cancelled") totals[idx] += o.total;
      }
    }
    return { labels, counts, totals };
  }

  function statusBreakdown(orders) {
    const buckets = {
      pending: 0,
      accepted: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const o of orders) {
      if (buckets[o.status] != null) buckets[o.status]++;
    }
    return buckets;
  }

  window.TP = {
    api,
    fmtMoney,
    fmtDate,
    initials,
    showAlert,
    el,
    requireRole,
    logoutAndGo,
    cacheUser,
    readCachedUser,
    clearCachedUser,
    bucketByDay,
    statusBreakdown,
    dashPathFor,
  };
})();
