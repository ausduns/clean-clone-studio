# Clean Clone Studio

A local app for converting authorized Framer or Webflow pages into static HTML with Tailwind CSS classes and minimal JavaScript.

## Run

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5188
```

## How It Works

1. Enter a Framer or Webflow URL.
2. The local Node server fetches the page HTML and injects a base URL for assets.
3. The browser renders the source page in a sandboxed iframe.
4. The clone generator samples visible computed layout, typography, colors, borders, backgrounds, and images.
5. The app outputs a static HTML file using Tailwind arbitrary-value classes plus a small JavaScript file.

## Notes

- Use this only for pages you own or have permission to reproduce.
- Output is captured for the selected viewport. Re-capture desktop, tablet, and mobile separately for responsive pages.
- Dynamic interactions from the source platform are not automatically reimplemented; the generated JavaScript is intentionally minimal.
- Remote image URLs are preserved. Download and self-host assets separately when your license permits it.
