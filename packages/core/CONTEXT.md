# Core

The Core context defines Chessticize practice rules independently of the user interface and persistence adapters.

## Language

**Review Context**:
The unique reviewable combination of one puzzle, practice mode, and rating key.
_Avoid_: Puzzle, Review item

**Review Schedule**:
The current future-review commitment for a Review Context, including its due day and repetition state. Its absence does not prevent a later qualifying attempt from creating a new Review Schedule.
_Avoid_: Review block, Permanent Review enrollment

**Review Schedule Removal**:
A dated cancellation of the one Review Schedule belonging to an exact Review Context that preserves attempts and completed Review history. Removal does not itself create an attempt or Review result; other Review Contexts for the same puzzle remain scheduled, and older synchronized schedule state cannot restore the canceled schedule, although a genuinely later Review Schedule may replace it.
_Avoid_: Puzzle deletion, Review ban, Never review

**Manual Review Enrollment**:
An explicit user decision to create a Review Schedule for one Review Context without requiring a mistake, an Unclear marker, or a replayable attempt. Its first review is due on the next local calendar day; when enrollment is initiated from an Unclear Attempt, it clears that attempt's marker and no other marker.
_Avoid_: Fake mistake, Automatic Review enrollment

**Unclear Attempt**:
A specific completed attempt that the user marked as not understood. It remains distinct from other attempts for the same Review Context, is cleared only explicitly or by Manual Review Enrollment initiated from that attempt, and is not restored by later Review Schedule Removal.
_Avoid_: Unclear puzzle, Review candidate
