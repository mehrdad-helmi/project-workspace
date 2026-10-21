# Temporary thumbnail server

From the workspace:

```powershell
bun run temporary/thumbnail-server/server.ts
```

Temporary local thumbnail generation and serving on `127.0.0.1:7300`:

- `POST /thumbnails/<positionId>` accepts `{ exterior, interior }`. Each drawing contains positive `width`, `height` and the existing engine's numeric `paths`; no engineering calculations run here.
- Generates `dark_theme_exterior.svg`, `dark_theme_interior.svg`, `light_theme_exterior.svg` and `light_theme_interior.svg` under `generated/<positionId>/<revision>/`. One atomic `current.json` replacement publishes the complete set; writes serialize per position and old image sets are removed after publication.
- `GET`/`HEAD /thumbnails/<positionId>/<variant>.svg` serves the current image without caching. `?fallback=<placeholderKey>` uses the original placeholder until first generation. Original `/thumbnails/<key>.svg` URLs still work.

The editor generates on opening and after valid canonical design changes. Rapid changes coalesce for 350 ms, then requests run sequentially; superseded results cannot mark the current design ready. Save status is independent. Failures appear only beside save status and the next edit or reopening attempts generation again. Theme/view/selection/camera changes do not generate images. Hub previews select the active theme and the preview dialog selects the requested side.

Generated files are ignored by Git. No authentication, backend schema changes, production storage or cross-tab version arbitration: this is disposable local development infrastructure. Set `THUMBNAIL_PORT` to override the port for isolated manual verification; the frontend uses 7300. Restart an already-running server after changing its source.


## Material Analysis printouts

`POST /printouts` accepts a structured `MaterialAnalysis` JSON document from the frontend temporary engine. It returns the generated PDF bytes (`201`, `application/pdf`) and a `Location: /printouts/<uuid>.pdf` header. `GET` and `HEAD` on that location retrieve the saved file. Each request creates an independent file under the Git-ignored `printouts/` directory. Completed PDFs publish atomically; no database report history is created.

The PDF displays purchased profile bars and glass sheets separately from required lengths/areas, cut-piece counts and pane sizes. The client computes whole stock units with `ceil(required length / bar length)` and `ceil(required area / sheet area)`, grouping by article across selected positions; the server does not perform cutting/nesting optimization.

The renderer owns presentation only: all submitted strings are escaped, submitted HTML is rejected, assets are embedded, and the document cannot load remote resources. It uses the existing frontend Inter font and Planicam logo, with the app's blue/slate palette. PDF headers show Tehran time. Loopback binding and local-origin writes make this a development convenience, not production tenant storage.

Microsoft Edge is used headlessly by default on Windows. Set `PRINTOUT_BROWSER_PATH` to an existing Chromium/Edge executable to override it. No package installation is required. One PDF renders at a time; overlapping requests return `503` and can be retried. A render times out after 30 seconds. Temporary render directories are cleaned after completion; saved PDFs remain available after server restarts.
