# Keep Review Schedules authoritative over reminders

A committed Manual Review Enrollment or Review Schedule Removal remains the source of truth when operating-system notification reconciliation fails. Chessticize updates Review workload from the committed schedule state and retries reminder reconciliation later rather than rolling back the user's decision, resurrecting a removed schedule, or discarding an enrollment because an external notification operation failed.
