# Agent Instructions

All repository documentation must be written in English. User-facing GUI copy must be planned and reviewed in English unless a localization task explicitly adds another locale.

## Testing Philosophy

- Business logic must be thoroughly tested before code is described as complete.
- Prefer real implementations for internal dependencies whenever practical.
- Avoid mocks and ad hoc stubs for internal code.
- Use mocks only at boundaries the project does not control, such as CloudKit, App Store services, network failures, third-party APIs, or explicit latency/failure simulation.
- When tests need isolation or deterministic setup, create maintained fakes behind the same public interface. A fake must be a drop-in implementation and should share behavior tests with the real implementation when possible.
- Before changing test infrastructure, storage behavior, sync behavior, or repository fakes, look for and follow local testing guidelines and shared behavior tests.
- End-to-end tests must start the real app on a simulator/emulator/device and interact through public UI. Do not call stores, repositories, handlers, or test-only helpers directly from E2E tests.

## Required Test Layers

- Narrow unit tests may exercise implementation details and should cover pure business rules such as ELO, sprint end conditions, spaced repetition scheduling, Arrow Duel candidate selection, and puzzle pack filtering.
- Component behavior tests must verify public behavior through rendered UI, accessibility labels, and user-visible text. Avoid implementation-state assertions.
- Storage integration tests must use real SQLite databases or deterministic fixture databases.
- Native engine tests must exercise the real Stockfish bridge for UCI handshake, fixed-position analysis, cancellation, and background handling.
- Sync tests must use a maintained fake sync transport for deterministic local behavior and a real CloudKit staging/manual suite before release.
- GUI automation must cover core user journeys on an iOS simulator before release. Android GUI automation is required before Android release.

## Definition of Done

Before declaring code work complete:

- Identify the public behavior, edge cases, and failure cases introduced or changed.
- Add or update unit tests for detailed business logic paths.
- Add or update component behavior tests when UI behavior changes.
- Add or update integration tests when SQLite, puzzle packs, sync, engine bridges, or migrations change.
- Add or update E2E tests when the change affects navigation, practice flows, reset flows, sync settings, history filters, or cross-component workflows.
- Include regression tests for bugs found during review.
- If a test layer is intentionally not updated, record the reason in the final response or PR notes.
- Run the focused tests that prove the change, or state clearly why they could not be run.

## Mobile GUI Automation Direction

- Use Detox as the primary React Native E2E framework because it is tailored for React Native and supports simulator/emulator automation.
- Use React Native Testing Library for component behavior tests.
- Use Maestro only for lightweight smoke flows, release sanity scripts, or screenshot-style flows where its YAML syntax is useful.
- Do not adopt Appium by default. Keep it as a fallback only if Detox cannot support a required device-lab or black-box automation need.
- Keep E2E fixtures small, deterministic, and shipped through the same public app storage path used by real users.
