# Product and domain context

Planicam is a from-scratch alternative to Logikal for designing, engineering, and quoting windows, doors, sliding systems, and curtain walls.

It targets two deployment contexts:

- **Cloud web application:** Angular, NestJS, Planicore/WASM, and PostgreSQL.
- **Desktop application:** the same Angular frontend inside Tauri, with native Rust services, Planicore, SQLite, and offline synchronization.

See the [architecture overview](architecture/overview.md) for runtime boundaries and the V1 baseline.

## Domain knowledge

The product handles profiles, glazing, hardware, dimensions, pricing rules, and the technical complexity of window, door, and curtain wall design and quoting.

Specialized business rules must come from Mehrdad. Ask rather than infer them from general software knowledge or a competing product.

## Using Logikal as a reference

- Treat Logikal's relationships, flows, and properties as reference material. Planicam does not need to reproduce them exactly; improve them where a modern user experience benefits.
- Suggest clearer, more intuitive names when Logikal terminology or German-to-English translations are awkward. Preserve industry-standard terms and suggest renaming only when useful, not for every entity.
- When Mehrdad lists properties for an entity, consult Logikal documentation and relevant online references to identify omitted properties. Offer useful additional properties or entities selectively, without expanding the model unnecessarily.
