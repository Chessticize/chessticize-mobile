# Tracker Label Vocabulary

This file is the authoritative mapping from engineering-skill roles to required
GitHub label strings. It describes required tracker configuration, not a cached
snapshot of live labels.

## Live tracker preflight

Before a workflow creates or labels an issue, inspect the live label registry:

```sh
gh label list --limit 100 --json name --jq '.[].name'
```

Every label required by that workflow must appear exactly. If one is missing,
stop and report the tracker setup blocker. Do not silently substitute a stock
GitHub label. Provisioning repository labels changes external tracker state and
must be handled as an explicit repository setup action.

## Triage roles

| Skill role        | Required tracker label | Meaning                                  |
| ----------------- | ---------------------- | ---------------------------------------- |
| `needs-triage`    | `needs-triage`         | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`           | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent`      | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`      | Requires human implementation            |
| `wontfix`         | `wontfix`              | Will not be actioned                     |

When a skill mentions a triage role, use the corresponding required tracker
label from this table.

## Wayfinder roles

| Wayfinder role | Required tracker label |
| -------------- | ---------------------- |
| Map            | `wayfinder:map`        |
| Research       | `wayfinder:research`   |
| Prototype      | `wayfinder:prototype`  |
| Grilling       | `wayfinder:grilling`   |
| Task           | `wayfinder:task`       |
