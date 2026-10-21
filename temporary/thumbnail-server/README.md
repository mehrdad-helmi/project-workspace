# Temporary thumbnail server

From the workspace:

```powershell
bun run temporary/thumbnail-server/server.ts
```

Serves five fixed SVG placeholders at `http://127.0.0.1:7300/thumbnails/<key>.svg`. Thumbnail routes support GET and HEAD only; no thumbnail uploads or generated images. Authentication and production storage integration remain deferred. Position records retain their randomly assigned placeholder key so thumbnails stay stable. This is a local development convenience and is replaced by storage-backed thumbnails later.

## Material Analysis printouts

`POST /printouts` accepts a structured `MaterialAnalysis` JSON document from the frontend temporary engine. It returns the generated PDF bytes (`201`, `application/pdf`) and a `Location: /printouts/<uuid>.pdf` header. `GET` and `HEAD` on that location retrieve the saved file. Each request creates an independent file under the Git-ignored `printouts/` directory. Completed PDFs publish atomically; no database report history is created.

The renderer owns presentation only: all submitted strings are escaped, submitted HTML is rejected, assets are embedded, and the document cannot load remote resources. It uses the existing frontend Inter font and Planicam logo, with the app's blue/slate palette. PDF headers show Tehran time. Loopback binding and local-origin writes make this a development convenience, not production tenant storage.

Microsoft Edge is used headlessly by default on Windows. Set `PRINTOUT_BROWSER_PATH` to an existing Chromium/Edge executable to override it. No package installation is required. One PDF renders at a time; overlapping requests return `503` and can be retried. A render times out after 30 seconds. Temporary render directories are cleaned after completion; saved PDFs remain available after server restarts.
