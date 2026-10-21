---
---

**Generate position thumbnails for local previews**

The temporary local server now generates position previews from supplied drawing paths, with exterior and interior images for both light and dark themes.

- Publish all four previews together and serve the latest images without caching.
- Keep placeholder previews available until a position's first generated images are ready.
- Validate drawing inputs and serialize updates for each position.
- Document local generation and serving, allow an alternate server port, and exclude generated images from Git.
