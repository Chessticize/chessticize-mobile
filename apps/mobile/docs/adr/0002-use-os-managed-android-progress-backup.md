# Use OS-managed Android progress backup

The Android Local-First Release will use Android Auto Backup and device-to-device transfer for the user progress database rather than introduce an app account or synchronization service. Cloud backup must require available encryption capabilities, puzzle packs and ephemeral data are excluded, and Android cross-platform transfer is not enabled; this preserves reinstall and device-migration recovery while keeping continuous cross-platform synchronization outside the release scope.
