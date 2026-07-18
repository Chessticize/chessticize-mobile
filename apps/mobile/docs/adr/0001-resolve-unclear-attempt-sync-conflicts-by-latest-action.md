# Resolve Unclear Attempt sync conflicts by latest action

An Unclear Attempt can be marked or cleared on multiple devices before progress synchronization. Persist the time of each clarity-state change and keep the latest action during merge; if timestamps are equal, clearing wins so an explicitly undone marker does not resurface.
