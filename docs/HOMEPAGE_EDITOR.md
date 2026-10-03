# Homepage editor

The public homepage (the page visitors see at the website's address) can be changed by the System Administrator without a developer and without a deployment.

**Who:** anyone holding the `site.manage` permission. By default that is the System Administrator only. It can be given to another role on the Roles page.
**Where:** sidebar, **Homepage** (`/site-editor`). Nothing goes live until **Save changes** is pressed, and the page warns about unsaved changes.

## What can be changed

| Section | What you can do |
|---|---|
| Slideshow | Upload pictures and short videos, put them in order, switch a slide off, give each a description and an optional caption, and choose how many seconds a picture is shown (3 to 30). |
| Top of the page | The small line, the heading (with a gold highlighted part), the introduction, two buttons and where they go, and the tick-list. |
| Numbers | Up to four figures (for example "6 Farms"). |
| About us | Heading, paragraphs, tick-list, and the "Where we work" box. Add, remove and reorder places. |
| What we do | Up to six cards. |
| Product | Name, tagline, description, bag sizes, selling points and button text. |
| Sales points | Add a new place with up to four phone numbers (each becomes a tap-to-call link), edit or remove existing ones. |
| Footer | Company name, the line under it, and the sign-in button text. |

**Start again** puts the homepage back to its original text and removes the slideshow. Uploaded files are kept.

Not editable here: the Pectra Rice poster picture, and the descriptions of the system's features and the six handoffs. Those are part of the website's code.

## The slideshow

- Pictures: JPEG, PNG or WebP, up to 4 MB. Large photos are shrunk in the browser first (longest side 2200 px), so a phone photo is fine.
- Videos: MP4 or WebM, up to 15 MB. Use a short clip (10 to 20 seconds), about 1280 by 720, with no sound needed (videos always play muted). A video plays to its end, then the slideshow moves on.
- Up to 12 slides and 60 uploaded files in total. A very large video can be added **by link** instead: use the direct `https://` address of the file (not a YouTube page).
- The sign-in page shows the pictures only (not the videos), so it stays quick.
- A visitor whose device is set to "reduce motion" gets no automatic rotation and no video.
- A slide whose file cannot be loaded is skipped automatically.

## How it works (for developers)

- The content is one JSON document in table `site_content` (row `home`). Uploaded files are in table `site_media` (`bytea`). Both tables are created by `prisma db push` on deploy.
- `backend/src/site/site-content.schema.ts` is the single place that decides what may be saved. Everything is a length-capped string, links may only be a page path, an anchor, `https:`, `tel:` or `mailto:`, and anything unknown is dropped. The page renders it as text, never as HTML.
- Uploads are identified by their actual bytes (never the file name or the type the browser claims). SVG is refused because it can carry script.
- Public routes: `GET /api/site/content` (always revalidated) and `GET /api/site/media/:id` (cached for a year, answers byte-range requests, and sets `Cross-Origin-Resource-Policy: cross-origin` for itself only, because the global security headers would otherwise stop the website from displaying the files).
- Administrator routes (`/api/site/admin/...`) all require `site.manage`, and every change is written to the audit log.
- The homepage starts from built-in text (`frontend/src/lib/site-content.ts`), so it can never come up empty if the API is unreachable.

## Known limits

- Files live in the database, which keeps deployment simple but makes the database and its backups larger. If many or large videos are used, moving to object storage (S3, Cloudflare R2) is the next step.
- The page fetches its content in the visitor's browser, so a first-time visitor may see the original text for a moment before saved text appears.
