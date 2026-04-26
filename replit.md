# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### `artifacts/trade-portal` — B2B Trade Portal (Indian, INR ₹)

Node.js/Express + esbuild. JSON file storage in `data/` (`users.json`, `products.json`, `orders.json`, `messages.json`). Vanilla HTML/CSS/JS frontends in `public/`.

Key features:
- Roles: `admin`, `seller`, `buyer`. Admin dashboard at `/admin-dashboard` lists all users.
- Demo accounts (one-click on `/login`): `admin@trade.in / admin123`, `demo.seller@test.in / demo1234`, `demo.buyer@test.in / demo1234`.
- **Buyer-Seller messaging** (`src/routes/messages.ts`):
  - `POST /api/messages` — send `{ toUserId, body, productId?, productName? }`. Auth required.
  - `GET /api/messages` — inbox: list of threads with last message + unread count.
  - `GET /api/messages/:otherId` — full thread between current user and other user; auto-marks as read.
  - Threads keyed by sorted `userIdA__userIdB`.
  - `storage.getMessages / addMessage / markThreadReadFor` + `threadIdFor()` helpers in `src/lib/storage.ts`.
- Frontend chat (`public/chat.js`) exposes `window.TPChat`:
  - `openChat({ otherUserId, otherName, productId?, productName? })` — modal popup with bubbles, polls every 4s.
  - `renderInbox(rootEl, currentUser, { onUnread })` — two-pane inbox + active conversation, polls every 8s.
  - `refreshUnreadBadge(badgeEl)` — updates sidebar badge count.
  - `buildMailto(product, buyerName)` — generates `mailto:` URL with prefilled subject + body.
- Standalone messages page at `/chat` (`public/chat.html`); also embedded as a Messages tab in both buyer and seller dashboards with unread badges in the sidebar.
- Product cards expose `sellerEmail` (joined from users in `GET /api/products`) so the mailto button works on the public marketplace too.
