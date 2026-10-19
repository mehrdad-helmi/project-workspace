# Planicore

Part of the [technical architecture](overview.md), revision 12 October 2026, V1 baseline. This document covers the shared engine, its runtime boundaries, and the catalog data supplied to calculations.

## Definition

### Temporary Hub Phase 2 implementation exception

On 18 October 2026, Mehrdad explicitly approved implementing the calculation behavior needed by Hub Phase 2 in temporary TypeScript while Rust integration is pending. Keep that code pure, isolated behind the calculation boundary, and in a clearly named temporary directory. Every temporary calculation source file must start with a comment stating it must migrate to Planicore/Rust. Angular pages and NestJS must not grow parallel calculation implementations. This is a prototype exception; the Rust ownership and runtime architecture below remain the target. Document supported operations and unsupported engineering/catalog calculations explicitly.

During this run, position creation also creates the first physical Element before engineering initialization. First design initialization must reuse existing Elements rather than create another Element 1.

**Planicore** is Planicam's shared deterministic engineering and calculation engine.

It is responsible for reusable offline-capable domain computation such as:

- geometry;
- field topology;
- dimensions;
- mullions and transoms;
- profile geometry and offsets;
- compatibility rules;
- area calculations;
- glazing calculations;
- hardware applicability calculations;
- BOM/material derivation;
- pricing calculations where those rules must work offline;
- technical validation and deterministic warnings.

The precise set grows with product scope. Code belongs in Planicore because it must be shared and offline-capable, not merely because it is computational.

## Workspace structure

Phase 2 starts with:

```text
planicore/
  crates/
    planicore-engine/
    planicore-wasm/
```

Planned later adapters:

```text
planicore/
  crates/
    planicore-engine/
    planicore-wasm/
    planicore-desktop/   # only if a separate desktop adapter proves useful
    planicore-server/    # deferred; server verification
```

A dedicated wrapper should only exist if it owns a real platform boundary. Do not create adapter crates as ceremony.

## `planicore-engine`

`planicore-engine` contains:

- domain input types;
- domain commands;
- deterministic validation;
- topology transformations;
- geometry calculations;
- technical calculations;
- calculation result types;
- typed domain errors.

Rules:

- no I/O;
- no panics across the public contract;
- no database access;
- no platform APIs;
- deterministic output for equivalent normalized input;
- dimensions expressed in millimetres;
- tolerances and rounding centralized here;
- stable IDs preserved for unaffected domain entities where possible.

## `planicore-wasm`

`planicore-wasm` is a thin browser boundary.

Responsibilities:

- initialize WASM;
- deserialize generated contract messages;
- invoke `planicore-engine`;
- serialize results/errors;
- expose a small typed surface to the Angular worker client.

No business rules live here.

## Browser execution

Planicore runs in a **Web Worker**, not Angular's main UI thread.

```text
Angular feature
    ↓
calc/wasm-client
    ↓
Web Worker
    ↓
planicore-wasm
    ↓
planicore-engine
```

This keeps complex calculations from blocking rendering and input processing.

## Semantic commands

UI events are not Planicore commands.

Examples that stay in Angular:

```text
mousemove
hover
selection
zoom
pan
temporary drag state
ribbon interaction
```

Examples that become Planicore operations:

```text
SetDimensions
AddField
DeleteField
AddMullion
AddTransom
SetProfile
ApplyArc
SetInsertion
SetGlazing
SetHardware
```

The engine consumes domain intent, not raw UI event streams.

## Calculation context and catalog data

Planicore never queries PostgreSQL or SQLite directly.

All required catalog/rule data is supplied as explicit input.

For cloud calculations:

```text
NestJS
  ↓
scoped calculation context
  ↓
Angular
  ↓
Planicore WASM
```

The browser should not download the entire catalog merely to edit one Position.

Provide compact, versioned calculation context scoped to the active:

- supplier;
- system;
- subsystem;
- profiles;
- colors;
- glazing configuration;
- hardware/rule packages;
- other dependencies required by that Position.

The API remains responsible for catalog licensing and visibility before data reaches the browser.

Calculation bundles may be cached client-side by version when useful, but the cache must not become the canonical catalog source.
