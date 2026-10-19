# Temporary thumbnail server

From the workspace:

```powershell
bun run temporary/thumbnail-server/server.ts
```

Serves five fixed SVG placeholders at `http://127.0.0.1:7300/thumbnails/<key>.svg`. GET and HEAD only; no uploads, generated images, authentication, or storage integration. Position records retain their randomly assigned placeholder key so thumbnails stay stable. This is a local development convenience and is replaced by storage-backed thumbnails later.

