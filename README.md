# Emprinte Backend

Backend API for Emprinte Readers Hub. Node.js + Express + SQLite + TypeScript. No Strapi.

## Setup

```bash
npm install
# Add INITIAL_SUPER_ADMIN_EMAIL and INITIAL_SUPER_ADMIN_PASSWORD to .env, then:
npm run seed
```

## Run

```bash
npm run dev    # development (with --watch)
npm start      # production
```

Server runs at `http://localhost:3001` by default.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login → JWT |
| GET | `/api/auth/me` | Current admin + profile fields (Bearer JWT) |
| GET | `/api/auth/profile` | Same profile payload as `/me` |
| PUT | `/api/auth/profile` | Update `displayName`, `phone`, `profileImageUrl` (HTTPS URL after Cloudinary upload). **Email cannot be changed**; sending `email` in the body returns **400**. |
| GET | `/api/auth/invites` | List invites: status, email, dates (Bearer JWT) |
| POST | `/api/auth/invites` | Send admin invite (Bearer JWT) |
| GET | `/api/auth/invite-preview` | Validate invite token (`?token=`) |
| POST | `/api/auth/accept-invite` | Complete invite (`token` + `password`) |
| POST | `/api/auth/forgot-password` | Request reset OTP (`email`; same response for unknown admins; optional `LOG_RESET_OTP=1` in dev) |
| POST | `/api/auth/verify-reset-otp` | Confirm OTP (`email` + 6-digit `otp`) |
| POST | `/api/auth/reset-password` | New password (`email` + `otp` + `password`) |
| POST | `/api/emails` | Newsletter signup |
| GET | `/api/settings` | Navigation, contact, social |
| PUT | `/api/settings` | Update site settings (Bearer JWT) |
| GET | `/api/stats` | Stats (each item has `id`, `value`, `label`) |
| PUT | `/api/stats/:id` | Update stat `value` and optional `label` (Bearer JWT) |
| GET | `/api/book-club-hero` | Book club hero copy |
| GET | `/api/build-a-reader` | Build a Reader progress |
| PUT | `/api/build-a-reader` | Update Build a Reader (Bearer JWT) |
| GET | `/api/insights` | Blog / insight articles (list) |
| GET | `/api/blog` | Same as `/api/insights` |
| POST | `/api/insights` | Create post (Bearer JWT) |
| POST | `/api/blog` | Same as `POST /api/insights` |
| GET | `/api/insights/:id` | Single post |
| GET | `/api/blog/:id` | Same |
| PATCH | `/api/insights/:id` | Partial edit (Bearer JWT) |
| PATCH | `/api/blog/:id` | Same |
| PUT | `/api/insights/:id` | Replace post; **title** required (Bearer JWT) |
| PUT | `/api/blog/:id` | Same |
| DELETE | `/api/insights/:id` | Delete post (Bearer JWT) |
| DELETE | `/api/blog/:id` | Same |
| GET | `/api/testimonials` | Testimonials |
| POST | `/api/testimonials` | Create testimonial (Bearer JWT) |
| PUT | `/api/testimonials/:id` | Update testimonial (Bearer JWT) |
| DELETE | `/api/testimonials/:id` | Delete testimonial (Bearer JWT) |
| GET | `/api/bootcamps` | Bootcamp cards |

## Environment

- `PORT` – server port (default 3001)
- `JWT_SECRET` – **required** for admin auth; sign-in and all protected routes fail without it
- `JWT_EXPIRES_SEC` – JWT lifetime in seconds (default 604800 = 7 days)
- `INVITE_BASE_URL` – frontend origin used in `inviteUrl` from `POST /api/auth/invites` (default `http://localhost:3000`)
- `INITIAL_SUPER_ADMIN_EMAIL` / `INITIAL_SUPER_ADMIN_PASSWORD` – **both required** for `npm run seed` to create the first `super_admin` (no built-in defaults)
- `LOG_INVITE_LINKS` / `LOG_RESET_OTP` – set to `1` only in development if you need invite URLs or reset OTPs in server logs
- `DB_PATH` – SQLite file path (default `./data/emprinte.db`)
- `CORS_ORIGINS` – comma-separated allowed origins

`POST /api/auth/login` takes only **email and password** — do **not** send a Bearer token on that request. After a successful login, use `Authorization: Bearer <JWT>` on protected routes. `POST /api/emails` (newsletter) stays public; `GET /api/emails` requires a JWT.

If login returns **503**, set **`JWT_SECRET`** in the project `.env` (server-only signing key — not sent by the browser) and restart the API.

## Frontend Integration

Set `NEXT_PUBLIC_API_URL=http://localhost:3001` in your Next.js app to call this API directly. Or proxy via Next.js API routes.

See **[API.md](./API.md)** for a full frontend integration guide: endpoint contracts, request/response shapes, error handling, and where data is stored (SQLite at `./data/emprinte.db`).
