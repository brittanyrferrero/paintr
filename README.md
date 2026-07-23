# Room Painter

A shareable web app: upload a photo of a room, trace its surfaces once, and let
anyone with the link try their own color schemes. No login required. Built with
Next.js + Supabase, deploys to Vercel.

## How it works

- **You** create a project by uploading a photo. You get two links:
  - an **edit link** (contains a secret `?key=`) — only you use this to define regions
  - a **share link** — send to friends; they can only paint, not edit regions
- **Regions** (walls, ceiling, columns, plus keep-on-top "cutouts" for lamps) are
  traced once and saved to the project, so everyone paints on the same shapes.
- **Anyone** picks colors per region. They can save their scheme privately, or tick
  "add to the shared gallery" so others see it.
- Colors are multiplied over the photo so lighting and texture show through; front
  regions and cutouts clip out from the layers behind them for correct occlusion.

## 1. Create the Supabase project

1. Go to supabase.com, create a new project, wait for it to provision.
2. Open **SQL Editor > New query**, paste the contents of `supabase/schema.sql`,
   and run it. This creates the `projects` and `schemes` tables, the public
   `rooms` storage bucket, and the access policies.
3. Open **Settings > API** and copy three values:
   - Project URL
   - `anon` `public` key
   - `service_role` key (secret)

## 2. Run locally (optional)

```bash
cp .env.example .env.local   # then fill in the three values
npm install
npm run dev                  # http://localhost:3000
```

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel, **Add New > Project**, import the repo (framework auto-detects as Next.js).
3. Add the three environment variables under **Settings > Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`  ← secret, server-only, do NOT prefix with `NEXT_PUBLIC_`
4. Deploy. Visit the deployment URL, upload a photo, and you're live.

## Security model

- All writes (create project, save regions, save scheme) go through server API
  routes that use the `service_role` key. That key never reaches the browser.
- Region editing is authorized by matching the project's `edit_key`, which only
  exists in your private edit link.
- The `anon` key can read public project fields (never the `edit_key`) and gallery
  schemes; row-level security enforces this as a backstop.
- Photos live in a public storage bucket (they're meant to be shared via link).

## Notes / possible next steps

- Photos are stored full-size; add server-side resizing on upload if you expect
  large images or want faster loads.
- The gallery is capped at 200 entries per project in the API; paginate if needed.
- Region editing is single-creator by design. If you later want multiple editors,
  add auth (Supabase Auth) and replace the `edit_key` check with user ownership.
