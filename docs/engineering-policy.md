# Engineering decision policy

Optimize for the **simplest robust architecture that satisfies current and known near-term requirements**. This is an agile, time-constrained production project, but quality, simplicity, robustness, scalability, and long-term maintainability take priority over development cost or the fastest path.

Keep the codebase well-structured and production-quality without speculative architecture. Optimize for minimum architectural complexity, not minimum code.

## Decision principles

- Prefer simple, explicit, conventional implementations and framework-native patterns unless there is a concrete reason to depart from them.
- Design for requirements we have. Support foreseeable extension when cheap and natural, but do not build extension mechanisms before they are needed.
- Prefer clear module boundaries over either a flat boilerplate codebase or excessive enterprise layering.
- Avoid premature optimization, generalization, and speculative scalability infrastructure.
- Do not build a generic framework for work that ordinary application code can express clearly.

## When to introduce an abstraction

Use an abstraction when at least one of these is true:

1. Multiple implementations already exist.
2. Multiple consumers require a stable boundary.
3. It isolates a real external dependency or architectural boundary.
4. Duplication is becoming structurally significant.
5. It materially improves testability, maintainability, or domain clarity.

Interfaces, factories, adapters, strategies, repositories, wrappers, base classes, and configuration layers must solve a concrete current architectural problem. Do not introduce them solely for theoretical decoupling or possible future use.

## Boundaries to preserve

Keep boundaries that are expensive to recover later:

- domain and module boundaries;
- tenant isolation and authorization;
- persistence boundaries where appropriate;
- shared UI boundaries;
- API contracts;
- Rust/WASM engine boundaries;
- dependency direction;
- clear ownership of state and business rules.

Be conservative about abstractions inside these boundaries. The [architecture overview](architecture/overview.md) defines their Planicam-specific ownership.

## Planning a feature

- Plan only what is necessary to deliver the feature end-to-end.
- Include unrelated refactors, infrastructure, extensibility, or architectural improvements only when required for the feature or to prevent a significant architectural problem.
- Separate required work from optional improvements.
- Prefer incremental changes that leave the codebase clean; do not turn feature delivery into platform building.
- Make prototype shortcuts and their tradeoffs explicit rather than presenting them as the intended product architecture.

## Choosing between valid implementations

Prefer, in order:

1. Correctness.
2. Architectural consistency.
3. Simplicity.
4. Maintainability.
5. Robustness.
6. Performance where relevant.
7. Extensibility for known requirements.
8. Generality for hypothetical requirements.

Before introducing significant complexity, verify that it solves a concrete requirement or prevents a reasonably likely, expensive future problem. When uncertain, choose the simpler design that preserves the important boundaries.
