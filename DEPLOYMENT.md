# Deployment / Handoff: getting a permanent server URL

This app currently runs only on a developer laptop via `shopify app dev`, which
generates a **temporary Cloudflare tunnel URL** (e.g. `https://xxx.trycloudflare.com`).
That URL dies when the dev session stops. **We need a permanent, always-on HTTPS URL**
hosted somewhere to replace it.

## What this app is

A Shopify app with a **checkout UI extension** that lets B2B buyers upload a purchase
order (PDF/image) during checkout. The file is stored in **Shopify Files** and linked
to the cart/order via a metafield.

A small **app server** is the secure middleman: the checkout page sends the file to our
server, and the server uses the Shopify Admin API (with a secret key) to push it into
Shopify Files.

- Upload endpoint: `app/routes/api.checkout.upload.tsx` (`/api/checkout/upload`)
- Stack: React Router 7 + Prisma + a Shopify checkout UI extension
- A production `Dockerfile` is included.

```
Buyer picks a PDF  ->  Checkout extension  ->  App server (to be hosted)  ->  Shopify Files
   (in checkout)       (runs on Shopify)        uses secret key              (PDF stored HERE)
                                                     |  ^
                                                     v  | reads login token
                                                 Postgres DB
                                                 stores ONLY the store's
                                                 Shopify session/login token
```

The database does **not** store files — only the Shopify session/login token so the
server can keep calling the Admin API.

## What needs to be done (backend engineer)

1. **Host the server.** Use the included `Dockerfile` on an always-on host
   (Vercel, Render, Fly.io, or Railway).

2. **Add a Postgres database.** It currently uses SQLite (a local file), which gets
   wiped on redeploys in production. Switch Prisma to Postgres:
   - `prisma/schema.prisma` datasource `provider = "postgresql"`, `url = env("DATABASE_URL")`
   - Make the `Session` migration Postgres-compatible (`TIMESTAMP(3)` instead of
     `DATETIME`, add `migration_lock.toml` with `provider = "postgresql"`).
   - Provision a Postgres instance and set `DATABASE_URL`.

3. **Set environment variables** on the host (secrets — never commit them):

   | Variable | Value / source |
   | --- | --- |
   | `SHOPIFY_API_KEY` | Shopify Dev/Partner Dashboard -> the app -> API credentials |
   | `SHOPIFY_API_SECRET` | same as above (keep secret) |
   | `SCOPES` | `write_products,write_orders` |
   | `SHOPIFY_APP_URL` | the new permanent host URL |
   | `DATABASE_URL` | the Postgres connection string |

4. **Point Shopify at the new URL.** In the Shopify Dev/Partner Dashboard for this app,
   set the **Application URL** and the **Allowed redirect URLs** to the new host.
   Also enable **"Allow network access in checkout UI extensions"**.

5. **Deploy the checkout extension:** `shopify app deploy`.

6. **Hand back the final URL** so it can be set as the checkout block's
   **"App API base URL"** (must be the absolute permanent URL, no trailing slash —
   checkout extensions cannot call relative URLs).

## Build gotchas

- `package-lock.json` is currently git-ignored. For a Docker `npm ci` build it must be
  committed, **or** change the Dockerfile build step to `npm install`.
- See `README.md` for full local-run instructions and CORS troubleshooting notes.

## How to verify

Run a B2B / company-location checkout on the test store, upload a PDF, complete the
order, and confirm the file appears in **Shopify admin -> Content -> Files** and is
linked on the order's metafield.
