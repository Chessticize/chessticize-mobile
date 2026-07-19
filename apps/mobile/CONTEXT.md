# Mobile

The Mobile context delivers the Chessticize practice experience on supported mobile platforms while keeping practice rules and persisted progress outside the UI shell.

## Language

**Interaction Lab**:
The browser-based, development-only rendering of the real shared React Native UI used as the living UI documentation baseline and for phone-accessible design review before native wiring and acceptance. It uses React Native Web, deterministic in-memory data, and stable Lab Scenario URLs.
_Avoid_: HTML mockup, simulator replacement, production web app

**Board Placeholder**:
The browser-only replacement for `react-native-chessboard` that preserves board geometry, reports board and input-lock state, implements the screen's minimum ref/callback contract, and exposes clearly marked development controls for reaching surrounding UI states.
_Avoid_: Web chessboard, production board fallback

**Lab Scenario**:
A deterministic Interaction Lab entry for one meaningful page, subflow, transient, detail, or failure state, backed by maintained fakes and public product interfaces.
_Avoid_: Screenshot fixture, mock page

**Scenario Scope**:
The page under design review plus its own subflows, transients, and details. Navigation intents that eventually leave an extracted scope are documented and intercepted at the boundary; whole-screen monolith scenarios remain explicitly free roaming until that seam exists.
_Avoid_: Test isolation, disabled navigation

**New Scenario Marker**:
A temporary branch-only `new` flag on a Lab Scenario under design review. It feeds the Storybook `new` tag and the phone-friendly What's New index, and must be cleared before a pull request becomes ready or reaches `main`.
_Avoid_: Permanent new badge, release note

**Android Local-First Release**:
The first production Android release for 64-bit phones and tablets, providing the complete offline practice experience available on iOS without cross-platform progress synchronization. Foldables and ChromeOS receive basic compatibility rather than dedicated experiences; other Android form factors are excluded.
_Avoid_: Android MVP, Android port

**Android Progress Backup**:
An operating-system-managed copy of local Android progress used for reinstall or device-transfer restoration. It is not continuous synchronization between active devices.
_Avoid_: Android sync, Google Drive sync

**Review Reminder Time**:
The local target time after which the mobile operating system may deliver a review notification. It is not a guarantee of exact-minute delivery.
_Avoid_: Exact reminder time, alarm time

**Unclear Attempt**:
A correct completed sprint attempt the user marks at completion because they do not yet understand why the move worked. It can later be cleared from History.
_Avoid_: Unclear puzzle, mistake, Review item

**Manual Review Enrollment**:
The user's explicit addition of an exact puzzle, mode, and rating-key context from a Review-owned session or a History replay without implying that an attempt was wrong. When an Unclear History attempt initiates enrollment, the same atomic operation clears only that attempt's Unclear marker.
_Avoid_: Manual mistake, forced review

**Review Schedule Control**:
The two-state product affordance shown inside a Review-owned session or a History replay; it displays whether that exact Review Context is scheduled and lets the user manually enroll it or remove its existing Review Schedule. Manual enrollment acts immediately, while removal requires confirmation. Active Practice and Sprint Result do not expose this control.
_Avoid_: Review toggle, Review checkbox

**Review Due Label**:
The localized due-day summary shown by a Review Schedule Control: **Due today** for due or overdue schedules, **Due tomorrow** for the next local calendar day, and **Due {date}** for later schedules.
_Avoid_: Overdue warning, Review interval

**Mobile Stockfish Engine**:
The single bundled Stockfish C++ source tree used by both mobile platforms. Platform-specific iOS and Android bridges adapt that shared engine to the same JavaScript contract without owning separate engine versions.
_Avoid_: iOS Stockfish, Android Stockfish

**Mobile Back Intent**:
A platform-originated request to move one level backward through the app's product state. It dismisses transient UI first, uses guarded exit behavior for active sessions, returns child or secondary destinations toward Practice, and delegates to the operating system only from an idle Practice home.
_Avoid_: Android back button handler, exit app action

**Mobile UI Parity**:
Equivalent product behavior, information architecture, and interaction semantics across iOS and Android through shared React Native screens. Platform system surfaces and presentation details may differ without creating a second product interface.
_Avoid_: Pixel parity, Android redesign

**Zero App Telemetry**:
The release property that Chessticize does not embed analytics, crash-reporting, tracking, or other remote telemetry SDKs and does not upload gameplay or device data. Operating-system or store quality signals remain outside the app's collection behavior.
_Avoid_: Anonymous analytics, opt-out telemetry

**Android Production APK**:
The universal installable APK generated by Google Play from the same signed app bundle promoted to production, then mirrored with a checksum in the matching GitHub Release. It has the same application ID, signing identity, version name, and version code as the Play-distributed build.
_Avoid_: GitHub build, sideload edition
