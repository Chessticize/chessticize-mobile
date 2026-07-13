# Domain Docs

How engineering skills should discover and extend this repo's domain
documentation when exploring the codebase.

## Before exploring, look for these

- **`CONTEXT-MAP.md`** at the repo root — it points to one `CONTEXT.md` per relevant context.
- **`docs/adr/`** — read ADRs covering system-wide decisions.
- **Context-scoped ADRs** — check `apps/<context>/docs/adr/` and `packages/<context>/docs/adr/` for decisions affecting the context being explored.

These are lazy artifacts. If any of them don't exist, **proceed silently**.
Don't flag their absence or suggest creating them just to fill the layout. Use
established repository terms without inventing a replacement glossary. The
`/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates the relevant artifact when a term or
decision is actually resolved.

## Placement for lazily created docs

When domain documentation is created, place it in this multi-context layout:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
├── apps/
│   ├── mobile/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                  ← mobile-specific decisions
│   └── cli/
│       ├── CONTEXT.md
│       └── docs/adr/                  ← CLI-specific decisions
└── packages/
    ├── core/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← domain-core decisions
    └── storage/
        ├── CONTEXT.md
        └── docs/adr/                  ← storage-specific decisions
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal,
a hypothesis, or a test name), use the term as defined in the relevant
`CONTEXT.md` when that glossary exists. Don't drift to synonyms the glossary
explicitly avoids.

If no glossary exists, preserve names already used by the repository's current
code and authoritative docs. If the concept still has no stable name, that's a
signal — either you're inventing language the project doesn't use (reconsider)
or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts `<ADR path and title>` — but worth reopening because…_
