# Vibersey

Design a custom sports jersey by chatting with AI, then have Printful print and ship it. One player or a whole team.

**Stack:** Next.js (App Router) on Vercel · Supabase (auth, Postgres, storage) · OpenRouter (design chat + image models) · Printful (catalog + fulfillment) · Stripe Checkout.

## How it works

1. **Pick a jersey.** Only the Printful all-over-print jerseys listed in `src/lib/catalog.ts` (`PRODUCTS`) are offered: baseball, basketball (premium, recycled, youth), football (American, boxy), soccer (recycled, youth) and hockey.
2. **Chat with the AI designer.** The chat model (`OPENROUTER_CHAT_MODEL`, default `anthropic/claude-opus-5.5`) turns the conversation into a structured `DesignSpec`, following each sport's conventions (`STANDARDS` in `catalog.ts`) and the kit-design knowledge in `src/lib/jersey-knowledge.ts` (how pro jerseys are built, plus proven recipes). The jersey body is a list of **vector graphics** (`spec.graphics`, `src/lib/graphics.ts`): body panels split by a shaped edge (chevron, diagonal, star point, wave, lightning, or a custom traced line) with outlined trim, stripe sets at the hem, chest or sleeves, shoulders (a yoke), a sash and side panels, drawn over an all-over base pattern (`spec.pattern`: solid, stripes, gradient through several colors, vector tie-dye or camo) with a printed collar band (`spec.collar`). Colors are role names (`primary`, `secondary`...) so kits and brand changes recolor them. An inspiration image is read by the model (`inspiration_read`) and rebuilt with these parts in the customer's colors; it is never pasted or sent to the image model. The image model (`OPENROUTER_IMAGE_MODEL`) only draws **text-free** logos, and painted textures (flames, marble...) when the customer asks for one by name. Older designs' on/off trim (`spec.trim`) renders through the same graphics code (`legacyGraphics`).
   **Edit on the jersey.** In the builder, click any part (logo, team name, number, name, patches, panels, stripes) to select it, drag to move it, pull a corner handle to resize, and drag the diamond on a chevron to change its point. A small toolbar shows the selected part's options (text, font, colors, trim, delete); "+ Add" puts new parts on the jersey. Hit areas come from the same layout code as the print files (`selectables` in `render.ts`), and drags become spec changes in `src/lib/canvas-edit.ts`.
   **Brand board.** The chat opens by building a brand board (`spec.brand`: name, five color roles plus extras, fonts, style note, main and alternate logos). Once it exists, every AI turn is held to it (`keepOnBrand` in `src/lib/designer.ts`): colors the AI introduces snap to the brand palette (plus white and black), fonts follow the brand fonts, and the brand logos stay on. The AI changes the brand only through its separate `brand` field when the customer asks. Pasted links are read for their preview image, title and theme color. Boards can be saved (`/api/brands`, table `brand_boards`, migration `0003`) and applied to other jerseys.
   **Logos & patches.** A builder separate from the chat (`src/components/LogoBuilder.tsx`, `/api/brand/logo`) uploads, generates or edits (current logo sent as the image reference) the main and alternate logos, and places the alternate logo and captain C/A patches using each sport's conventions (`PATCH_SPOTS`, `DEFAULT_PATCH_POSITION`, `PATCH_GUIDANCE` in `catalog.ts`).
3. **Names and numbers are drawn by code**, never by the image model, using the bundled fonts in `public/fonts`. `src/lib/render.ts` renders every print panel as SVG; the browser preview and the server-side print files (rendered to PNG with resvg) use the same function. That's what guarantees a team template is the exact same design and fonts for every player, with only the name and number changing.
4. **Free limit.** Anonymous visitors get 5 AI design/edit turns (`ANON_FREE_GENERATIONS`), tracked by a cookie in `anon_sessions`. After that they create a free account (passwordless email link). Their drafts move to the new account automatically.
5. **Pricing** is Printful's variant cost + $20 (`MARKUP_CENTS`), plus flat shipping (`SHIPPING_FLAT_CENTS`).
6. **Teams.** "Team template" snapshots the design into a locked copy. Managers add players by hand or CSV (`name, number, size, quantity, email`), order the whole roster in one checkout, or share a link (`/t/<slug>`) where each player enters their name, number and size and pays for their own. Teams can mix adult and youth sizes when the jersey has a youth version.
7. **Fulfillment.** Stripe's `checkout.session.completed` webhook marks the order paid, then (after responding to Stripe) renders each player's print files, uploads them to Supabase storage and creates the Printful order. With `PRINTFUL_AUTO_CONFIRM=false` orders arrive in Printful as drafts for you to confirm.

## Setup

1. **Supabase:** create a project, run the files in `supabase/migrations/` in order (`0001_init.sql`, `0002_team_kits.sql`, `0003_brand_boards.sql`) in the SQL editor. Under Authentication > URL configuration, add `https://<your-domain>/auth/callback` as a redirect URL.
2. **Env vars:** copy `.env.example` to `.env.local` (and into Vercel project settings) and fill it in.
3. **Catalog sync:** after deploying, pull products, sizes, costs and print-file sizes from Printful:
   ```sh
   curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" https://<your-domain>/api/admin/sync-catalog
   # or open https://<your-domain>/api/admin/sync-catalog?secret=<ADMIN_SECRET> in a browser
   ```
   The response lists each product and flags any whose placements didn't match. Re-run whenever Printful prices change.
4. **Stripe webhook:** add an endpoint for `https://<your-domain>/api/stripe/webhook` with the `checkout.session.completed` event and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. **Printful webhook (optional):** point it at `https://<your-domain>/api/printful/webhook?secret=<ADMIN_SECRET>` to track shipped/fulfilled status.
6. **Retry a failed order:** `curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" "https://<your-domain>/api/admin/fulfill?order=<order id>"`.

## Development

```sh
npm install
npm run dev
npx tsx scripts/render-sample.ts   # renders sample print panels to ./tmp-render
npx tsx scripts/render-graphics-sample.ts   # a two-tone star-cut hockey jersey, every panel
npx tsx --conditions=react-server scripts/prompt-check.ts hockey   # prints the AI designer's prompt and tool
npx tsx --conditions=react-server scripts/seam-check.ts   # no seam warnings on any starting design; panels meet at the side seams
npx tsx --conditions=react-server scripts/render-pattern-sample.ts out   # tie-dye, camo, gradient and collar renders
```

## Known limits (v1)

- Layout positions are tuned by eye. After the catalog sync, compare a rendered print file against Printful's template for each product and adjust `STANDARDS[...].layout` if needed.
- The preview is a flat silhouette, not a Printful photo mockup.
- Shipping is a flat rate rather than a live Printful quote.
- Very large team orders render print files inside one serverless invocation (up to 300s). A background queue would be the next step past roughly 40 players per order.

## Seams

Every print panel is cut along its piece outline (`garments.ts`) and loses about half an inch into each seam. `crossSeams` lists the seams that run across a body piece (the boxy football's chest seam, the shoulder-piece seam on hockey and American football), and names and numbers step off them automatically. `seams.ts` checks every name, number, team name and logo against the cut edges; the builder shows a warning when one is at risk, and draws the seams and a center line while something is being dragged.
