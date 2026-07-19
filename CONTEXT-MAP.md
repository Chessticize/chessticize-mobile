# Context Map

## Contexts

- [Mobile](./apps/mobile/CONTEXT.md) — delivers the Chessticize practice experience on supported mobile platforms.
- [Core](./packages/core/CONTEXT.md) — owns practice rules, Review scheduling, and other product-domain behavior shared by app surfaces.

## Relationships

- **Mobile → Core**: Mobile presents and collects user interaction for practice rules owned by the domain core.
- **Mobile → Storage**: Mobile uses the storage context for local progress, puzzle access, and progress synchronization.
