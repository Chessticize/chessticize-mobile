# Issue #247 Move Sound and Haptic Feedback Research

Status date: 2026-07-23

## Scope

[Issue #247](https://github.com/Chessticize/chessticize-mobile/issues/247)
reports that there is no sound or haptic feedback after a chess move. This
research covers foreground, in-app move feedback. Notification sounds and
notification haptics are a separate system surface with different Focus and Do
Not Disturb rules.

## Recommended product contract

1. Add two independent Settings switches: **Move sounds** and **Move haptics**.
   Both can default to on, but neither is required to use the app. Apple
   explicitly recommends making haptics optional and avoiding overuse, especially
   for frequently repeated events
   ([Apple Human Interface Guidelines: Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)).
2. Trigger feedback only after the domain has accepted and committed a legal
   move, not when a piece is picked up or an attempted move is rejected. Keep
   the visual board update as the authoritative feedback; sound and touch are
   complementary, not required for understanding the result. This follows
   Apple's guidance to keep a clear causal relationship between a haptic and the
   action it reinforces
   ([Apple Human Interface Guidelines: Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)).
3. Use one restrained move sound and one short/light haptic for the first
   version. Capture, check, castling, and game-end variants can be considered
   later, but a family of effects should not be added before the basic feedback
   is evaluated on real devices. Apple and Android both recommend short,
   semantically consistent haptics and warn against overuse or long, buzzy
   effects
   ([Apple](https://developer.apple.com/design/human-interface-guidelines/playing-haptics),
   [Android](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).
4. Do not request permissions or use flags that override device quieting
   policies. An enabled in-app switch means "the app may request this feedback";
   the operating system can still suppress it.

One design decision should remain visible in Storybook: whether an engine or
opponent move should also cause a haptic. The conservative recommendation is
**sound for every committed board move, haptic only for a move directly
committed by the current user**. That keeps the haptic causal and reduces
fatigue. If product review prefers haptics for every move, it should be tested
as a separate scenario on hardware.

## Silent mode, Focus, and Do Not Disturb

### iOS

An incidental chess move sound is nonessential game feedback. Apple's audio
guidance says Silent mode is intended to silence nonessential sounds such as
keyboard clicks, sound effects, game soundtracks, and other audible feedback.
The `ambient` audio-session category is the matching platform behavior: it
responds to the Ring/Silent switch, mixes with other apps' audio, and does not
play in the background
([Apple Human Interface Guidelines: Playing audio](https://developer.apple.com/design/human-interface-guidelines/playing-audio),
[AVAudioSession.Category.ambient](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/ambient)).

Therefore:

- A move sound should **not** play while the iPhone is in Silent mode.
- It should not pause or duck music, a podcast, or another app's audio.
- The app should not use the `playback` category, because Apple documents that
  category for essential audio that continues through the Ring/Silent switch
  ([AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession)).

Silent mode is not the same as "never use haptics." iPhone exposes separate
haptic choices such as Always Play, Play in Silent Mode, Don't Play in Silent
Mode, and Never Play for alert behavior, and Accessibility also has a global
Vibration switch
([Apple Support: Change iPhone sounds and vibrations](https://support.apple.com/en-gb/guide/iphone/iph07c867f28/ios),
[Apple Support: Turn off vibration on iPhone](https://support.apple.com/en-gb/guide/iphone/iphd722c9100/ios)).
The app should request a light, semantic haptic only when **Move haptics** is
enabled and let iOS and the user's device settings decide whether hardware
feedback is produced.

Do Not Disturb is a Focus that silences calls, alerts, and notifications; Apple
does not describe it as a general mute for audio initiated by a foreground app
([Apple Support: Do Not Disturb](https://support.apple.com/en-euro/105112),
[Apple Support: Allow or silence notifications for a Focus](https://support.apple.com/guide/iphone/allow-or-silence-notifications-for-a-focus-iph21d43af5b/ios)).
This means it would be incorrect to promise that iOS Focus always disables
foreground chess sounds or haptics. Access to Focus status is designed for
communication-notification experiences, requires authorization and specific
capabilities, and reports whether the app's notifications are silenced
([Apple: Handling Communication Notifications and Focus Status Updates](https://developer.apple.com/documentation/UserNotifications/handling-communication-notifications-and-focus-status-updates)).
Issue #247 should not request Focus access just to gate board feedback.

### Android

Android classifies audio by why it is playing and what it contains.
`CONTENT_TYPE_SONIFICATION` covers a short sound accompanying an action or game
event, while `USAGE_GAME` identifies game audio. These attributes allow the
system to make routing, focus, volume, and mixing decisions
([Android `AudioAttributes`](https://developer.android.com/reference/android/media/AudioAttributes),
[AOSP audio attributes](https://source.android.com/docs/core/audio/attributes)).
`SoundPool` is the platform facility intended for preloaded, short, low-latency
sound samples
([Android `SoundPool`](https://developer.android.com/reference/android/media/SoundPool)).

Android's ringer mode and media/game volume are not the same control. AOSP maps
`USAGE_GAME` to the legacy music stream, while `RINGER_MODE_SILENT` describes
the ringtone mode
([AOSP audio-attribute compatibility mapping](https://source.android.com/docs/core/audio/attributes),
[Android `AudioManager`](https://developer.android.com/reference/android/media/AudioManager)).
It is therefore unsafe to assume that using the correct game attributes alone
will make every device's move sound follow its ringer switch. To meet the
cross-platform product expectation, the Android adapter should suppress the
move sound when ringer mode is Silent or Vibrate, in addition to honoring the
in-app switch and the system volume.

Android Do Not Disturb is policy-dependent. The "none" interruption filter
mutes all audio streams except calls and mutes vibrations; priority and
alarms-only modes mute only some streams, according to the user's policy
([Android `NotificationManager`](https://developer.android.com/reference/android/app/NotificationManager)).
The app should provide accurate audio attributes, use normal haptic APIs, and
let the system enforce the active policy. It should not request notification
policy access, call `setInterruptionFilter`, or try to bypass DND for a chess
move.

For haptics, Android recommends
`View.performHapticFeedback(HapticFeedbackConstants.CONFIRM)` for a successful
user interaction. It is a short/light semantic effect, has a compatibility
fallback before API 30, requires no `VIBRATE` permission when used through a
View, and honors the user's system touch-feedback setting
([Android: Add haptic feedback to events](https://developer.android.com/develop/ui/views/haptics/haptic-feedback),
[`HapticFeedbackConstantsCompat.CONFIRM`](https://developer.android.com/reference/androidx/core/view/HapticFeedbackConstantsCompat)).
The deprecated `FLAG_IGNORE_GLOBAL_SETTING` must not be used; Android now
reserves ignoring user touch-feedback settings for privileged apps
([Android `HapticFeedbackConstants`](https://developer.android.com/reference/android/view/HapticFeedbackConstants)).

### Behavior matrix

| App/device state | Move sound | Move haptic |
| --- | --- | --- |
| App switch off | No | Unchanged |
| App haptics switch off | Unchanged | No |
| iOS Ring mode, settings on | Yes, mixed with other audio | Request light impact; system may suppress |
| iOS Silent mode | No, through `ambient` session behavior | Request only if app setting is on; system haptic settings decide |
| iOS Focus / Do Not Disturb | No extra app-side rule for foreground feedback | No extra app-side rule; do not request Focus access |
| Android Normal ringer, settings on | Yes, at system game/media volume | Request semantic `CONFIRM`; system may suppress |
| Android Silent or Vibrate ringer | No, by explicit product policy | Request through the system API only; never bypass device policy |
| Android DND | System interruption policy decides | System interruption and touch-feedback policies decide |
| No supported haptic hardware | Unchanged | Silent no-op |

The Settings helper copy should consequently avoid an absolute claim such as
"Disabled by Do Not Disturb on every device." A safer statement is: **"Sound
and haptics also follow your device settings."**

## React Native feasibility

The mobile app currently declares React Native 0.86 but no dedicated sound or
semantic-haptics dependency
([mobile package](../apps/mobile/package.json)). React Native's built-in
`Vibration` API produces a fixed roughly 400 ms vibration on iOS and defaults to
400 ms on Android
([React Native `Vibration`](https://reactnative.dev/docs/vibration)).
That is much coarser than the short, light semantic effect Android recommends
for confirmation feedback, so `Vibration.vibrate()` should not be the
production implementation for every chess move.

The production phase should expose a small typed native-facing boundary, for
example:

```ts
interface MoveFeedback {
  playCommittedMove(input: {
    actor: "user" | "opponent";
    soundEnabled: boolean;
    hapticsEnabled: boolean;
  }): void;
}
```

The iOS adapter can use `AVAudioPlayer` or an equivalent preloaded player under
an `ambient` audio session, plus `UIImpactFeedbackGenerator` with a light style
([Apple `AVAudioPlayer`](https://developer.apple.com/documentation/avfaudio/avaudioplayer),
[`UIImpactFeedbackGenerator.impactOccurred`](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator/impactoccurred%28%29)).
The Android adapter can use a preloaded `SoundPool` with
`CONTENT_TYPE_SONIFICATION`/`USAGE_GAME`, plus
`performHapticFeedback(CONFIRM)`. Library selection should wait for product
implementation and must prove React Native 0.86 compatibility and the exact
audio-session/AudioAttributes behavior; the Storybook phase must not add native
module wiring.

The move-completion decision belongs outside React components. A screen should
dispatch the committed-move feedback intent after the backend/domain result
confirms success; platform adapters decide whether the system can play it.

## What Storybook can and cannot preview

The current Interaction Lab runs on React Native Web and Vite
([Lab package](../apps/mobile-lab/package.json)). Repository policy explicitly
states that the Storybook phase cannot prove native sound, haptics, latency, or
device behavior, and that native-module wiring remains out of scope
([issue-triage guidance](agents/issue-triage.md#8-prototype-ui-and-functional-feedback)).

Storybook can still provide useful design evidence:

- **Sound:** yes, as a browser approximation. A **Preview sound** button can
  play the exact candidate audio asset using browser audio after an explicit
  click. It must not autoplay on story load; WebKit advises assuming audio
  requires a user gesture and handling rejected playback
  ([WebKit autoplay policy](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)).
  This proves the asset choice, relative loudness, and interaction timing in
  the design, but not native audio-session, ringer, route, or DND behavior.
- **Haptics:** not faithfully in this web Lab. A browser may expose
  `navigator.vibrate`, but the W3C specification permits the user agent to
  ignore a request because hardware is missing or a user preference disables
  it
  ([W3C Vibration API](https://www.w3.org/TR/vibration/)). Desktop review and
  unsupported mobile browsers will commonly produce no physical feedback. The
  story should therefore show a conspicuous visual pulse and an event log such
  as `Requested: light move haptic`. An optional **Try web vibration** button
  can be labeled **Web approximation**, never as native acceptance evidence.

The recommended Storybook slice is:

1. Settings with separate **Move sounds** and **Move haptics** switches.
2. A board feedback preview with **Make legal move**, **Preview sound**, and
   **Try web vibration** actions.
3. Deterministic device-policy fixtures for Normal, Silent, iOS Focus, Android
   DND, and No haptic hardware. These are simulation controls for reviewers,
   not production UI.
4. An event log that distinguishes `requested`, `suppressed by app setting`,
   and `suppressed by simulated device policy`.
5. A clear note: **Native sound and haptics require later real-device
   validation.**

## Downloadable sound sources and license handling

The easiest license chain for a prototype is a CC0 asset. Creative Commons
states that CC0 material can be copied, modified, distributed, and performed,
including commercially, without asking permission; it also warns that CC0 does
not cover unrelated trademark, privacy, or publicity rights
([CC0 1.0 deed](https://creativecommons.org/publicdomain/zero/1.0/)).

| Source | Commercial-use position | Recommendation |
| --- | --- | --- |
| [Kenney UI Audio](https://www.kenney.nl/assets/ui-audio), [Interface Sounds](https://kenney.nl/assets/interface-sounds), and [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Each asset page identifies the download as CC0; Kenney also states its asset-page game assets can be used in commercial projects without attribution ([Kenney support](https://www.kenney.nl/support)). | Best first stop for a Storybook candidate because the license is simple and the packs are small enough to audition quickly. |
| [Freesound](https://freesound.org/) | Each sound has its own license. Freesound offers CC0, CC BY, and CC BY-NC; its FAQ says CC BY requires attribution and CC BY-NC cannot be used commercially ([Freesound licensing FAQ](https://freesound.org/help/faq/)). | Filter to **CC0** first. CC BY 4.0 is commercially usable only if the app preserves appropriate credit, license link, and modification notice ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Do not use CC BY-NC. |
| [Sonniss GameAudioGDC archive](https://sonniss.com/gameaudiogdc/) | Sonniss states the archive is royalty-free, commercially usable, requires no attribution, and can be used on unlimited projects; its bundle EULA grants commercial synchronization in games and interactive projects ([bundle license](https://sonniss.com/gdc-bundle-license/)). | Strong professional source, but the bundles are very large; use only after identifying a specific suitable file. |
| [Pixabay Sound Effects](https://pixabay.com/sound-effects/) | Pixabay grants a worldwide, non-exclusive, royalty-free commercial-use license, subject to prohibited uses including standalone redistribution, and warns that additional third-party rights may still apply ([Pixabay terms](https://pixabay.com/service/terms/)). | Usable, but retain the exact asset page and download date, and prefer a simple foley recording with no voice, music sample, brand, or recognizable person. |

For any selected file, retain the original filename, creator, exact asset URL,
download date, license name/version, a copy of the license text, and a note
describing edits. Before the sound ships in the native app, add it to the
repository's [third-party notices](../THIRD_PARTY_NOTICES.md) even if
attribution is not legally required; this preserves the release evidence chain.
Do not treat a search-result badge as the license record—verify the individual
asset page at download time.

## Validation required after Storybook approval

The later product phase needs real-device checks because a browser preview
cannot prove platform policy:

- iPhone in Ring and Silent modes, with Move sounds/haptics independently on
  and off, and with Accessibility Vibration disabled.
- iPhone while other media is playing, proving the move sound mixes and does
  not pause or duck it.
- Android in Normal, Vibrate, and Silent ringer modes, plus representative DND
  filters and system touch-feedback off.
- A physical Android device with a lower-quality haptic actuator to confirm the
  semantic fallback remains subtle.
- Unsupported/no-haptics hardware, headphones, rapid consecutive moves, an
  illegal move, and an opponent/engine move.

The native validation should record the exact app commit, devices/OS versions,
switch states, and observed sound/haptic result. Storybook approval alone is
design approval, not proof of these behaviors.
