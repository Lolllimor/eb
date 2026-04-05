# Emprinte API – Frontend Integration Guide

This document describes how to consume the Emprinte backend API from your frontend and where data is stored.

---

## Base URL & CORS

- **Base URL**: `http://localhost:3001` (default). Use `NEXT_PUBLIC_API_URL` or your env for production.
- **API prefix**: All endpoints use `/api`.
- **CORS**: The server allows `http://localhost:3000` and `http://127.0.0.1:3000` by default. Configure `CORS_ORIGINS` (comma-separated) for other origins.
- **Content-Type**: Use `Content-Type: application/json` for POST and PUT requests.

---

## Admin authentication (JWT)

1. **`POST /api/auth/login`** with `{ "email", "password" }` returns `{ "token", "admin" }`.
2. For protected routes, send **`Authorization: Bearer <token>`** (JWT from login).
3. **`JWT_SECRET`** must be set on the server. If it is missing, login and protected routes respond with **`503`**.

**Responses:**

- `401` – missing Bearer token, wrong password, or invalid/expired JWT  
- `503` – server has no `JWT_SECRET` configured  

**Unauthenticated (public):** Content `GET` endpoints, **`POST /api/emails`** (newsletter), **`GET /api/auth/invite-preview`**, **`POST /api/auth/accept-invite`**, and **password reset**: **`POST /api/auth/forgot-password`**, **`POST /api/auth/verify-reset-otp`**, **`POST /api/auth/reset-password`**.

**Password reset (no SMTP yet):** `forgot-password` returns the **same** successful JSON whether or not the email is an admin (no account enumeration). For real admins, a **6-digit** OTP is stored (**15-minute** expiry, **5** failed verify/reset attempts per code). OTPs are **not** logged unless you set **`LOG_RESET_OTP=1`** (development only). Then **`verify-reset-otp`** with `{ email, otp }`, then **`reset-password`** with `{ email, otp, password }` (min 8 characters).

**Rate limits (HTTP 429):** Login, password reset steps, invite preview, accept-invite, and **`POST /api/emails`** are limited per IP (and password reset also per email). Tune by editing `src/middleware/rateLimit.ts` / route middleware if needed.

**Bootstrap:** Run `npm run seed` with **both** `INITIAL_SUPER_ADMIN_EMAIL` and `INITIAL_SUPER_ADMIN_PASSWORD` in `.env` (required; there are no default credentials) to create the first `super_admin` if that email is not already registered.

### Auth endpoints (summary)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | — | Returns JWT |
| GET | `/api/auth/me` | JWT | Current admin + profile (`displayName`, `phone`, `profileImageUrl`) |
| GET | `/api/auth/profile` | JWT | Same as `/me` |
| PUT | `/api/auth/profile` | JWT | Body: optional `displayName`, `phone`, `profileImageUrl` (HTTPS URL, e.g. Cloudinary). Do not send `email` (strict schema → **400**). Use `profileImageUrl: ""` to clear photo. |
| GET | `/api/auth/invites` | JWT | List invites: `status`, `email`, `invitedAt`, `expiresAt`, `acceptedAt`, `invitedByEmail` |
| POST | `/api/auth/invites` | JWT | Create invite; `inviteUrl` in response (also logged) |
| GET | `/api/auth/invite-preview?token=` | — | Valid invite → `{ "email" }`; else 404/410 |
| POST | `/api/auth/accept-invite` | — | Body `{ "token", "password" }` (min 8 chars) → new `admin` |
| POST | `/api/auth/forgot-password` | — | `{ "email" }` → **`200`** `{ ok, message }` for valid email shape (OTP issued only when admin exists and under limits; **`429`** only for per-IP caps) |
| POST | `/api/auth/verify-reset-otp` | — | `{ "email", "otp" }` (**6** digits) → step 2 ok |
| POST | `/api/auth/reset-password` | — | `{ "email", "otp", "password" }` → updates password |

---

## Where Data Is Stored

All data is stored in a **SQLite database** on the server:

| Storage          | Path                      | Description                          |
|------------------|---------------------------|--------------------------------------|
| SQLite database  | `./data/emprinte.db`      | Default path (relative to project)   |
| Custom path      | `DB_PATH` env variable    | Override via environment             |

The database file is created on first run. Run `npm run seed` to populate initial data.

### Database Tables

| Table            | Purpose                                      |
|------------------|----------------------------------------------|
| `emails`         | Newsletter signups                           |
| `admins`         | Admin users (password hash, `super_admin` / `admin`) |
| `admin_invites`  | Pending invites (hashed token, expiry)      |
| `admin_password_resets` | OTP for password recovery (hashed, expiry, attempts) |
| `settings`       | Site config: nav, footer, social, contact    |
| `stats`          | Stats (members, reviews, stories)            |
| `book_club_hero` | Hero section copy for book club              |
| `build_a_reader` | Initiative progress: books, goal, price      |
| `insight_articles` | Blog posts / insights                     |
| `testimonials`   | Testimonial quotes                           |
| `bootcamps`      | Bootcamp cards                               |

---

## Endpoints Reference

### Newsletter – Emails

#### GET `/api/emails`

List all newsletter subscribers (newest first). **Requires admin JWT** (see [Admin authentication (JWT)](#admin-authentication-jwt)).

**Response (200):**
```json
[
  {
    "id": "2",
    "fullName": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": "+2348012345678",
    "createdAt": "2026-03-29 12:00:00"
  }
]
```

`fullName` and `phone` are strings; they are empty when not provided at signup.

#### POST `/api/emails`

Subscribe to the newsletter.

**Request body:**
```json
{
  "email": "user@example.com",
  "fullName": "Optional Full Name",
  "phone": "Optional phone"
}
```

`fullName` and `phone` are optional.

**Success (201):**
```json
{
  "ok": true,
  "data": {
    "id": "1",
    "fullName": "",
    "email": "user@example.com",
    "phone": "",
    "createdAt": "2026-03-29 12:00:00"
  }
}
```

**Errors:**
- `400` – Invalid email, validation details in `details`
- `409` – Already subscribed

**Example (fetch):**
```js
const res = await fetch(`${API_URL}/api/emails`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com' }),
});
const data = await res.json();
```

---

### Settings (Navigation, Contact, Social)

#### GET `/api/settings`

**Response (200):**
```json
{
  "navigationLinks": [
    { "label": "About Us", "href": "#about" }
  ],
  "footerNavigation": [
    { "label": "Home", "href": "/" }
  ],
  "socialMediaLinks": [
    { "platform": "instagram", "href": "https://instagram.com/emprinte" }
  ],
  "contactInfo": {
    "email": "hello@emprintereaders.com",
    "phone": [
      { "label": "Adepeju", "number": "081029348475" }
    ]
  },
  "stats": [
    { "id": "1", "value": "50+", "label": "Active Members" },
    { "id": "2", "value": "156+", "label": "Book Reviews" }
  ]
}
```

#### PUT `/api/settings`

**Auth:** Bearer JWT (admin).

**Request body:** Same shape as GET for nav/contact fields. Omitted arrays default to `[]`, `contactInfo` to `{}`.

- **`stats`** (optional array) — If present, each item must include **`id`** (matches existing stat row), **`value`** (required), and optional **`label`** (omit to keep the current label). Same rules as [PUT `/api/stats/:id`](#put-apistatsid). Updates are applied before the settings row is saved; if any id is missing from the DB, the whole request returns **`404`**.

**Response (200):** Updated settings, same shape as GET (including **`stats`**).

---

### Stats

#### GET `/api/stats`

Public. Each item includes a stable **`id`** so an admin can update it.

**Response (200):**
```json
[
  { "id": "1", "value": "50+", "label": "Active Members" },
  { "id": "2", "value": "156+", "label": "Book Reviews" }
]
```

#### PUT `/api/stats/:id`

**Auth:** Bearer JWT (admin).

**Body (JSON):**
- **`value`** (string, required) — displayed number/text (e.g. `50+`, `2.1k`).
- **`label`** (string, optional) — if omitted, the existing label is kept.

**Response (200):** `{ "id", "value", "label" }` for the updated row.

**Errors:** `400` (validation), `401` / `503` (auth), `404` (unknown id).

---

### Book Club Hero

#### GET `/api/book-club-hero`

**Response (200):**
```json
{
  "badge": "Book Club",
  "title": "Reading That Changes the World.",
  "description": "Join a community...",
  "buttonText": "Join Now"
}
```

---

### Build a Reader (Initiative)

#### GET `/api/build-a-reader`

**Response (200):**
```json
{
  "booksCollected": 119,
  "totalBooks": 500,
  "pricePerBook": 2500
}
```

#### PUT `/api/build-a-reader`

**Request body:**
```json
{
  "booksCollected": 119,
  "totalBooks": 500,
  "pricePerBook": 2500
}
```

Numbers are coerced; invalid values become `0`.

---

### Insights (Blog Posts)

#### GET `/api/insights`

**Response (200):**
```json
[
  {
    "id": "1",
    "date": "Friday, April 8, 2026",
    "title": "Emprinte Insider: Our First Year",
    "description": "A look back at our first year...",
    "image": "https://placehold.co/600x400/015B51/white?text=Emprinte",
    "href": "/insights/1"
  }
]
```

Sorted by `created_at` descending.

#### GET `/api/insights/:id`

**Response (200):** Single insight, same shape as one item above.

**Errors:** `400` (invalid ID), `404` (not found)

#### POST `/api/insights`

**Request body:**
```json
{
  "title": "Required",
  "date": "Friday, April 8, 2026",
  "description": "Optional",
  "image": "https://example.com/image.jpg",
  "href": "/insights/2"
}
```

- `title` required; others optional.
- `date`, `description`, `image`, `href` can be null/omitted.

**Response (201):** Created insight.

#### PUT `/api/insights/:id`

**Request body:** Same fields as POST. Only provided fields are updated.

**Response (200):** Updated insight.

#### DELETE `/api/insights/:id`

**Response (204):** Empty body on success.

---

### Testimonials

#### GET `/api/testimonials`

**Response (200):**
```json
[
  {
    "id": "1",
    "text": "Emprinte changed how I read...",
    "name": "Chinwe O.",
    "title": "Active Member",
    "rating": 5
  }
]
```

---

### Bootcamps

#### GET `/api/bootcamps`

**Response (200):**
```json
[
  {
    "title": "Virtual Bootcamp I",
    "cohort": "Cohort I",
    "participants": "20+",
    "backgroundColor": "bg-pink-200"
  }
]
```

---

## Error Format

Failed requests typically return:

```json
{
  "error": "Short message",
  "message": "Longer description (optional)",
  "details": { "field": ["validation error"] }
}
```

- `400` – Bad request / validation
- `401` – Missing or invalid admin JWT (protected routes)
- `404` – Resource not found
- `409` – Conflict (e.g. duplicate email)
- `500` – Server error
- `503` – Auth disabled (`JWT_SECRET` not set on server)

---

## Next.js Example

**Environment:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Your admin UI should call **`POST /api/auth/login`** from the browser (or a server action), store the JWT (e.g. `sessionStorage` or httpOnly cookie set by your own Route Handler), then send **`Authorization: Bearer <JWT>`** on mutations.

**Fetch helpers (sketch):**
```ts
const API = process.env.NEXT_PUBLIC_API_URL || '';

function adminHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function getSettings() {
  const res = await fetch(`${API}/api/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function submitNewsletter(email: string) {
  const res = await fetch(`${API}/api/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Subscribe failed');
  return data;
}

export async function putSettings(accessToken: string, body: unknown) {
  const res = await fetch(`${API}/api/settings`, {
    method: 'PUT',
    headers: adminHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}
```

---

## Quick Reference

| Method | Endpoint                  | Purpose                    |
|--------|---------------------------|----------------------------|
| POST   | `/api/auth/login`         | Admin login → JWT          |
| GET    | `/api/auth/me`            | Current admin + profile (auth) |
| GET    | `/api/auth/profile`       | Profile (auth)               |
| PUT    | `/api/auth/profile`       | Update profile (auth)         |
| GET    | `/api/auth/invites`       | List admin invites (auth)  |
| POST   | `/api/auth/invites`       | Create admin invite (auth) |
| GET    | `/api/auth/invite-preview` | Check invite token (public) |
| POST   | `/api/auth/accept-invite` | Set password, become admin |
| POST   | `/api/auth/forgot-password` | Start reset (optional `LOG_RESET_OTP=1` in dev) |
| POST   | `/api/auth/verify-reset-otp` | Check OTP (6 digits) |
| POST   | `/api/auth/reset-password` | Apply new password |
| GET    | `/api/emails`             | List subscribers (auth)    |
| POST   | `/api/emails`             | Newsletter signup (public)   |
| GET    | `/api/settings`           | Site config                  |
| PUT    | `/api/settings`           | Update site config (auth)    |
| GET    | `/api/stats`              | Stats list                   |
| GET    | `/api/book-club-hero`     | Hero copy                    |
| GET    | `/api/build-a-reader`     | Initiative progress          |
| PUT    | `/api/build-a-reader`     | Update initiative (auth)     |
| GET    | `/api/insights`           | All blog posts               |
| GET    | `/api/insights/:id`       | Single post                  |
| POST   | `/api/insights`           | Create post (auth)           |
| PATCH  | `/api/insights/:id`       | Partial update (auth)        |
| PUT    | `/api/insights/:id`       | Update post (auth)           |
| DELETE | `/api/insights/:id`       | Delete post (auth)           |
| GET    | `/api/testimonials`       | Testimonials                 |
| POST   | `/api/testimonials`       | Create testimonial (auth)    |
| PUT    | `/api/testimonials/:id`   | Update testimonial (auth)    |
| DELETE | `/api/testimonials/:id`   | Delete testimonial (auth)    |
| GET    | `/api/bootcamps`          | Bootcamp cards               |
