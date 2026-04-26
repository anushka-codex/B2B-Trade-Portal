// Buyer-Seller chat module: modal popup, polling, inbox renderer.
// Exposes globals on window.TPChat:
//   openChat({ otherUserId, otherName, productId?, productName? })
//   renderInbox(rootEl, currentUser, opts?)
//   refreshUnreadBadge(badgeEl)  -> returns total unread count
//   buildMailto(product, buyerName?) -> mailto URL for a product card
(function () {
  if (window.TPChat) return;

  const POLL_THREAD_MS = 4000;
  const POLL_INBOX_MS = 8000;

  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    return (name || "?")
      .split(" ")
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase();
  }

  function buildMailto(p, buyerName) {
    if (!p || !p.sellerEmail) return null;
    const subj = `Inquiry about ${p.name}`;
    const lines = [
      `Hello ${p.sellerName || "there"},`,
      "",
      `I am interested in your product "${p.name}" listed on the B2B Trade Portal.`,
      `Price: ₹${Number(p.price).toLocaleString("en-IN")}  |  MOQ: ${p.minOrderQty}`,
      "",
      "Could you share more details on availability, lead time, and bulk discounts?",
      "",
      "Thanks,",
      buyerName || "",
    ];
    return (
      "mailto:" +
      encodeURIComponent(p.sellerEmail) +
      "?subject=" +
      encodeURIComponent(subj) +
      "&body=" +
      encodeURIComponent(lines.join("\n"))
    );
  }

  // ---------- Modal popup chat ----------
  let modalState = null; // { rootEl, otherId, otherName, currentUser, timer, lastCount, productCtx, onClose }

  function closeModal() {
    if (!modalState) return;
    if (modalState.timer) clearInterval(modalState.timer);
    if (modalState.rootEl && modalState.rootEl.parentNode) {
      modalState.rootEl.parentNode.removeChild(modalState.rootEl);
    }
    const cb = modalState.onClose;
    modalState = null;
    if (typeof cb === "function") cb();
  }

  async function openChat(opts) {
    const { otherUserId, otherName, productId, productName, onClose } =
      opts || {};
    if (!otherUserId) {
      alert("Missing recipient");
      return;
    }
    let me;
    try {
      me = await TP.api.me();
    } catch (e) {
      window.location.href =
        "/login?next=" + encodeURIComponent(window.location.pathname);
      return;
    }
    if (!me || !me.user) {
      window.location.href =
        "/login?next=" + encodeURIComponent(window.location.pathname);
      return;
    }
    if (me.user.id === otherUserId) {
      alert("You cannot message yourself.");
      return;
    }
    if (modalState) closeModal();

    const root = document.createElement("div");
    root.className = "chat-modal-backdrop";
    root.innerHTML = `
      <div class="chat-modal" role="dialog" aria-label="Chat with ${escapeHtml(
        otherName || "user",
      )}">
        <header class="chat-head">
          <div class="chat-head-avatar">${escapeHtml(
            initials(otherName),
          )}</div>
          <div class="chat-head-meta">
            <div class="chat-head-name">${escapeHtml(otherName || "User")}</div>
            <div class="chat-head-sub" data-role="ctx">${
              productName
                ? "About: " + escapeHtml(productName)
                : "Direct message"
            }</div>
          </div>
          <button type="button" class="chat-close" aria-label="Close">×</button>
        </header>
        <div class="chat-body" data-role="body">
          <div class="chat-empty">Loading conversation…</div>
        </div>
        <form class="chat-compose" data-role="compose" autocomplete="off">
          <textarea name="body" rows="1" placeholder="Type a message…" required></textarea>
          <button type="submit" class="btn btn-sm">Send</button>
        </form>
      </div>
    `;
    document.body.appendChild(root);
    // Close on backdrop click / X button / Escape
    root
      .querySelector(".chat-close")
      .addEventListener("click", () => closeModal());
    root.addEventListener("click", (e) => {
      if (e.target === root) closeModal();
    });
    const escListener = (e) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", escListener);

    modalState = {
      rootEl: root,
      otherId: otherUserId,
      otherName,
      currentUser: me.user,
      productCtx: productId
        ? { productId, productName: productName || "" }
        : null,
      timer: null,
      lastCount: 0,
      onClose: () => {
        document.removeEventListener("keydown", escListener);
        if (typeof onClose === "function") onClose();
      },
    };

    const body = root.querySelector('[data-role="body"]');
    const form = root.querySelector('[data-role="compose"]');
    const textarea = form.querySelector("textarea");

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = textarea.value.trim();
      if (!value) return;
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        const payload = { toUserId: otherUserId, body: value };
        if (modalState && modalState.productCtx) {
          payload.productId = modalState.productCtx.productId;
          payload.productName = modalState.productCtx.productName;
        }
        await TP.api.sendMessage(payload);
        textarea.value = "";
        await refreshThread(true);
      } catch (err) {
        alert(err.message || "Failed to send message");
      } finally {
        submitBtn.disabled = false;
        textarea.focus();
      }
    });

    async function refreshThread(forceScroll) {
      if (!modalState) return;
      try {
        const data = await TP.api.getThread(otherUserId);
        renderThreadMessages(body, data.messages, modalState.currentUser.id, {
          forceScroll: forceScroll || data.messages.length > modalState.lastCount,
        });
        modalState.lastCount = data.messages.length;
      } catch (err) {
        // Show error but keep modal open
        body.innerHTML =
          '<div class="chat-empty">Couldn\'t load messages. Retrying…</div>';
      }
    }

    await refreshThread(true);
    modalState.timer = setInterval(refreshThread, POLL_THREAD_MS);
    setTimeout(() => textarea.focus(), 50);
  }

  function renderThreadMessages(body, messages, meId, opts) {
    if (!messages || !messages.length) {
      body.innerHTML =
        '<div class="chat-empty">No messages yet. Start the conversation 👋</div>';
      return;
    }
    const wasAtBottom =
      body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    body.innerHTML = "";
    let lastDay = "";
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const dayKey = d.toDateString();
      if (dayKey !== lastDay) {
        const sep = document.createElement("div");
        sep.className = "chat-day";
        sep.textContent = d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        });
        body.appendChild(sep);
        lastDay = dayKey;
      }
      const mine = m.fromId === meId;
      const row = document.createElement("div");
      row.className = "chat-row " + (mine ? "mine" : "theirs");
      row.innerHTML = `
        <div class="chat-bubble">
          ${
            m.productName
              ? '<div class="chat-product-tag">📦 ' +
                escapeHtml(m.productName) +
                "</div>"
              : ""
          }
          <div class="chat-text">${escapeHtml(m.body).replace(
            /\n/g,
            "<br>",
          )}</div>
          <div class="chat-time">${fmtTime(m.createdAt)}${
            mine && m.readAt ? " · seen" : ""
          }</div>
        </div>
      `;
      body.appendChild(row);
    }
    if (opts && (opts.forceScroll || wasAtBottom)) {
      body.scrollTop = body.scrollHeight;
    }
  }

  // ---------- Inbox / Messages section ----------
  // Renders a two-column layout: left=thread list, right=active conversation.
  // Returns { stop } to stop polling.
  function renderInbox(root, currentUser, opts) {
    opts = opts || {};
    root.innerHTML = `
      <div class="inbox">
        <aside class="inbox-list" data-role="list">
          <div class="inbox-empty">Loading…</div>
        </aside>
        <section class="inbox-pane" data-role="pane">
          <div class="inbox-placeholder">
            <div class="inbox-placeholder-icon">💬</div>
            <div class="inbox-placeholder-title">Select a conversation</div>
            <div class="inbox-placeholder-sub">Pick a thread on the left to view messages.</div>
          </div>
        </section>
      </div>
    `;
    const listEl = root.querySelector('[data-role="list"]');
    const paneEl = root.querySelector('[data-role="pane"]');

    let activeThread = null; // { otherId, otherName, productCtx? }
    let threadTimer = null;
    let lastCount = 0;

    async function refreshList() {
      try {
        const data = await TP.api.getThreads();
        const threads = data.threads || [];
        if (typeof opts.onUnread === "function") {
          opts.onUnread(data.totalUnread || 0);
        }
        if (!threads.length) {
          listEl.innerHTML =
            '<div class="inbox-empty"><div class="big">No conversations yet</div>When buyers reach out, threads appear here.</div>';
          return;
        }
        listEl.innerHTML = "";
        for (const t of threads) {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "inbox-row" +
            (activeThread && activeThread.otherId === t.otherId
              ? " active"
              : "");
          row.innerHTML = `
            <div class="inbox-avatar">${escapeHtml(initials(t.otherName))}</div>
            <div class="inbox-meta">
              <div class="inbox-name-row">
                <div class="inbox-name">${escapeHtml(t.otherName)}</div>
                <div class="inbox-time">${fmtTime(t.lastMessage.createdAt)}</div>
              </div>
              <div class="inbox-preview-row">
                <div class="inbox-preview">${
                  t.lastMessage.fromId === currentUser.id ? "You: " : ""
                }${escapeHtml(t.lastMessage.body).slice(0, 80)}</div>
                ${
                  t.unread > 0
                    ? '<span class="inbox-unread">' + t.unread + "</span>"
                    : ""
                }
              </div>
              ${
                t.otherCompany
                  ? '<div class="inbox-sub">' +
                    escapeHtml(t.otherCompany) +
                    "</div>"
                  : ""
              }
            </div>
          `;
          row.addEventListener("click", () => {
            activeThread = { otherId: t.otherId, otherName: t.otherName };
            lastCount = 0;
            refreshList();
            openInPane();
          });
          listEl.appendChild(row);
        }
      } catch (err) {
        listEl.innerHTML =
          '<div class="inbox-empty">Failed to load conversations.</div>';
      }
    }

    function openInPane() {
      if (!activeThread) return;
      paneEl.innerHTML = `
        <header class="chat-head inbox-head">
          <div class="chat-head-avatar">${escapeHtml(
            initials(activeThread.otherName),
          )}</div>
          <div class="chat-head-meta">
            <div class="chat-head-name">${escapeHtml(activeThread.otherName)}</div>
            <div class="chat-head-sub">Conversation</div>
          </div>
        </header>
        <div class="chat-body" data-role="body">
          <div class="chat-empty">Loading…</div>
        </div>
        <form class="chat-compose" data-role="compose" autocomplete="off">
          <textarea name="body" rows="1" placeholder="Type a reply…" required></textarea>
          <button type="submit" class="btn btn-sm">Send</button>
        </form>
      `;
      const body = paneEl.querySelector('[data-role="body"]');
      const form = paneEl.querySelector('[data-role="compose"]');
      const textarea = form.querySelector("textarea");

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const value = textarea.value.trim();
        if (!value) return;
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        try {
          await TP.api.sendMessage({
            toUserId: activeThread.otherId,
            body: value,
          });
          textarea.value = "";
          await refreshActive(true);
          refreshList();
        } catch (err) {
          alert(err.message || "Failed to send");
        } finally {
          submitBtn.disabled = false;
          textarea.focus();
        }
      });

      if (threadTimer) clearInterval(threadTimer);
      refreshActive(true);
      threadTimer = setInterval(() => refreshActive(false), POLL_THREAD_MS);
      setTimeout(() => textarea.focus(), 50);

      async function refreshActive(forceScroll) {
        if (!activeThread) return;
        try {
          const data = await TP.api.getThread(activeThread.otherId);
          renderThreadMessages(body, data.messages, currentUser.id, {
            forceScroll: forceScroll || data.messages.length > lastCount,
          });
          lastCount = data.messages.length;
        } catch (err) {
          /* ignore */
        }
      }
    }

    refreshList();
    const listTimer = setInterval(refreshList, POLL_INBOX_MS);

    return {
      stop() {
        clearInterval(listTimer);
        if (threadTimer) clearInterval(threadTimer);
      },
      openWith(otherId, otherName) {
        activeThread = { otherId, otherName };
        lastCount = 0;
        refreshList();
        openInPane();
      },
    };
  }

  // ---------- Unread badge poller ----------
  async function refreshUnreadBadge(badgeEl) {
    try {
      const data = await TP.api.getThreads();
      const n = data.totalUnread || 0;
      if (badgeEl) {
        if (n > 0) {
          badgeEl.textContent = n > 99 ? "99+" : String(n);
          badgeEl.hidden = false;
        } else {
          badgeEl.textContent = "";
          badgeEl.hidden = true;
        }
      }
      return n;
    } catch (err) {
      return 0;
    }
  }

  window.TPChat = {
    openChat,
    renderInbox,
    refreshUnreadBadge,
    buildMailto,
  };
})();
