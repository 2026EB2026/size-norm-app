# Size Norm

Shopify Plus embedded app that normalizes footwear size labels across ~250 brands into a canonical US/EU/UK/JP-mm matrix and renders a conversion table on product detail pages.

Built for [Eleonora Bonucci](https://eleonorabonucci.com).

## Stack

- React Router 7 + `@shopify/shopify-app-react-router`
- TypeScript strict
- Prisma + Neon Postgres (serverless)
- Vercel (hosting)
- Inngest (background jobs, M5+)
- Theme App Extension (PDP rendering, M6+)
- Vitest

## Local development

Prerequisites: Node.js >= 22.12, pnpm 11+, a Neon Postgres database (or any PostgreSQL).

```sh
pnpm install
cp .env.example .env.local
# fill in .env.local with your credentials — see comments inside the file
pnpm prisma migrate dev
pnpm dev
```

The `pnpm dev` command uses Shopify CLI to start a tunnel and serve the app. Press `P` to open the install URL.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Local development server with Shopify CLI tunnel |
| `pnpm build` | Production build (React Router 7) |
| `pnpm start` | Run the production build |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest run (CI mode) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm prisma migrate dev` | Apply schema migrations to dev database |

## Project structure

```
app/                     React Router 7 app
  routes/                File-based routes (auth, app/, webhooks/)
  shopify.server.ts      Shopify app configuration
  db.server.ts           Prisma client singleton
extensions/              Theme App Extension (M6+)
prisma/
  schema.prisma          Postgres schema (Shop + Session for M1)
tests/                   Vitest tests (M2+)
```

## Development workflow

The project follows a strict 7-milestone roadmap. Each milestone ends with a merchant demo and explicit go-ahead before the next starts.

## Deployment

Production hosting on Vercel. Required environment variables:

- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` — from Shopify Partners
- `SHOPIFY_APP_URL` — the Vercel deployment URL
- `SCOPES` — must match `shopify.app.toml`
- `DATABASE_URL` — Neon Postgres pooler endpoint
- `NODE_ENV=production`
