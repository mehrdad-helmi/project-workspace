# Cloud trust and verification

Part of the [technical architecture](overview.md), revision 12 October 2026, V1 baseline. This document separates server authority from client-calculated output and records the deferred verification path and accepted browser WASM exposure.

## Cloud trust model in V1

### What NestJS validates

When saving a Position, NestJS validates:

- authentication;
- organization authorization;
- Position/project ownership;
- transport schema;
- supported `schemaVersion`;
- payload limits;
- expected optimistic-concurrency version;
- basic referential/security invariants that belong to the server.

### What NestJS does not validate in V1

NestJS does not independently rerun Planicore to prove:

- geometry correctness;
- topology correctness;
- calculated areas;
- calculated quantities;
- Planicore-derived warnings;
- client-derived calculation summaries.

These outputs are therefore **not tamper-resistant** in V1.

### Never trust client-calculated security state

The following must never depend on a browser/WASM-calculated value:

- subscription tier;
- account license;
- supplier/database license;
- organization membership;
- user role or permission;
- feature entitlement;
- quota enforcement;
- billing state;
- tenant ownership;
- cross-tenant access.

Those remain server-authoritative regardless of Planicore.

### Why verification is deferred

Server-side Planicore verification would require another runtime/integration path:

- native server build;
- NestJS ↔ Rust IPC;
- lifecycle management;
- trusted calculation-context reconstruction;
- result comparison;
- concurrency control;
- additional deployment and integration tests.

V1 deliberately defers this path to reduce schedule and integration risk.

### Future verification strategy

When the product needs tamper-resistant calculated output, add server verification without changing the calculation implementation.

Initial implementation may use:

```text
NestJS
  ↓ stdin/stdout + Protobuf
planicore-server
  ↓
planicore-engine
```

For production scale, the preferred target is long-lived native Rust worker processes/process pools with Protobuf messages.

N-API remains a deferred optimization, not a prerequisite.

Verification can be introduced first at high-value boundaries such as final quotation/fabrication generation before considering verification of every editor mutation.

## Intellectual property implications of browser WASM

Shipping Planicore as WebAssembly gives the cloud editor low-latency local calculation, but it also means the compiled engine is delivered to the user's machine.

Therefore:

- WASM is not source code, but it can be inspected and reverse-engineered;
- minification/obfuscation can raise effort but cannot make the algorithm secret;
- server verification does **not** solve this IP-exposure issue—it solves trust/tampering;
- truly keeping calculation algorithms secret would require server-only execution.

V1 explicitly accepts this tradeoff in exchange for responsive browser calculation and a single shared Rust implementation.

Mitigations:

- ship only required WASM exports;
- keep debug symbols/source maps out of production artifacts unless required;
- do not embed supplier catalog data in the WASM binary;
- send only licensed/scoped calculation context;
- keep licenses, permissions, secrets, and security logic outside Planicore/WASM.
