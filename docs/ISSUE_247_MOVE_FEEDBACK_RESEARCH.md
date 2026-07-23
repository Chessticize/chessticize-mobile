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
3. Use two restrained board sounds, **Move** and **Capture**, plus one
   short/light haptic for the first version. A **Low Time** cue can be
   considered later; check, castling, and game-end variants remain out of
   scope until the basic feedback is evaluated on real devices. Apple and
   Android both recommend short,
   semantically consistent haptics and warn against overuse or long, buzzy
   effects
   ([Apple](https://developer.apple.com/design/human-interface-guidelines/playing-haptics),
   [Android](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).
4. Do not request permissions or use flags that override device quieting
   policies. An enabled in-app switch means "the app may request this feedback";
   the operating system can still suppress it.
5. Keep **Try feedback** in the Storybook design-review scenario only. The
   formal Settings presentation contains the two preference switches but no
   sound or haptic preview controls.

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
  story should therefore state that haptics require the native app instead of
  presenting a browser vibration request as a successful preview.

The recommended Storybook slice is:

1. The existing Settings clone with separate **Sound effects** and
   **Haptic feedback** switches.
2. Web-only previews for **Move** and **Capture**, using the selected Freesound
   CC0 `Piece Placement.mp3` and `Piece Capture.mp3` recordings. The samples may
   use Lichess timing and interaction patterns as references but must not copy
   the non-free Lichess standard files.
3. A clear note that the browser demo can request audio but cannot preview
   native haptic feel.
4. The entire **Try feedback** block is Storybook-only and must be absent from
   the formal product Settings UI. There is no production navigation,
   persistence, native-module wiring, analytics, or rollout behavior during the
   Storybook gate.

## Downloadable sound sources and license handling

**Lichess conclusion: do not copy or redistribute its standard `Move.mp3` or
`Capture.mp3` on the evidence currently available.** Both files are publicly
downloadable, and Lichess's
[round controller](https://github.com/lichess-org/lila/blob/master/ui/round/src/ctrl.ts)
distinguishes an ordinary move from a capture, so they remain useful interaction
references. Download availability is not reuse permission, however. The current
official
[`COPYING.md`](https://github.com/lichess-org/lila/blob/ebe4157a2881a8df0d25ea6b482f012aedb3bb7e/COPYING.md#L83-L101)
places “the other sounds in `public/sound`” under **non-free** exceptions rather
than the project's general AGPL grant. In the official asset-license audit,
maintainer Niklas Fiekas explicitly classified the **standard** theme as
non-free
([issue #789 comment](https://github.com/lichess-org/lila/issues/789#issuecomment-253326817));
the resulting
[2016 audit commit](https://github.com/lichess-org/lila/commit/0a5310e27b53249337e55842c0ecbd2a74d86116)
introduced that non-free exception. Lichess later opened
[issue #6829](https://github.com/lichess-org/lila/issues/6829) specifically to
either acquire a FOSS license for the standard set or replace it, and closed the
issue as not planned.

The repository history does not supply a separate usable grant. `Move.mp3`
descends from `move3.mp3`, added in
[commit `f7c6817`](https://github.com/lichess-org/lila/commit/f7c68175278c761d1756c43c7575465ead225d8a),
and `Capture.mp3` descends from `take2.mp3`, added in
[commit `14b2369`](https://github.com/lichess-org/lila/commit/14b236994a79cfebf14f55b465f32b383d2e11f9);
both were renamed into the standard theme in
[commit `8bf5f90`](https://github.com/lichess-org/lila/commit/8bf5f906ccb11a247b0dde36365cb47ac51a0167).
The repository then had a general MIT `doc/LICENSE`, but neither asset-add
commit identifies an audio author, source, purchase, or asset-specific license.
That general software license is not sufficient evidence that Lichess could
relicense third-party audio, particularly in light of its later, specific
non-free audit. The MIT permission discussed in
[issue #594](https://github.com/lichess-org/lila/issues/594#issuecomment-115862552)
was accepted by the contributor of the new Piano and NES themes, which
`COPYING.md` lists separately as free; it does not retroactively license the
older standard theme. The latest
[2022 sound-edit PR](https://github.com/lichess-org/lila/pull/10771) also gives
no source or license for either edited file.

Inspection of the embedded metadata in the exact current
[`Move.mp3`](https://raw.githubusercontent.com/lichess-org/lila/ebe4157a2881a8df0d25ea6b482f012aedb3bb7e/public/sound/standard/Move.mp3)
and
[`Capture.mp3`](https://raw.githubusercontent.com/lichess-org/lila/ebe4157a2881a8df0d25ea6b482f012aedb3bb7e/public/sound/standard/Capture.mp3)
blobs reports the title `Wooden piece - sharp hit` and
`Copyright 2000, Sounddogs.com`. This traces the present files to SoundDogs but
does not identify the catalog item or prove which party purchased it.
SoundDogs's current
[end-user license](https://sounddogs.com/Page/Sound-Effects-End-User-License)
permits synchronized use in apps after purchase, but describes the license as
non-transferable and prohibits giving away or distributing the unsynchronized
effect without an additional license. A Lichess download therefore cannot
transfer any SoundDogs license to Chessticize.

Required next action: do not import either Lichess file into Storybook or the
app. Prefer a separately sourced CC0 candidate below. If product direction
requires these exact sounds, first obtain written permission that identifies
the exact current blobs and grants Chessticize commercial mobile-app use and
repository/app redistribution from SoundDogs or another demonstrated
rightsholder; contact Lichess as well for any provenance or purchase record.
The unresolved catalog identity and ownership chain make the present conclusion
conservative rather than a definitive legal opinion. The Lichess
[download forum thread](https://lichess.org/forum/lichess-feedback/download-lichess-sounds-)
only explains how to clone or download the repository, while its
[rights thread](https://lichess.org/forum/lichess-feedback/what-are-the-rights-for-the-standard-lichess-sound-effect-2)
points back to the non-free classification; neither grants reuse permission.

The easiest license chain for a public source repository is a CC0 asset.
Creative Commons states that CC0 material can be copied, modified, distributed,
and performed, including commercially, without asking permission; it also warns
that CC0 does not cover unrelated trademark, privacy, or publicity rights
([CC0 1.0 deed](https://creativecommons.org/publicdomain/zero/1.0/)).

### Decision-oriented library shortlist

| Source | Commercial app and repository rights | Attribution and evidence | Practical risk | Decision |
| --- | --- | --- | --- | --- |
| **Record and edit Chessticize's own board** | Chessticize owns the recording and may ship both the app and the raw asset in the public repository. | Keep the raw takes, editing project, recording date, equipment, and a short signed provenance note. | Lowest legal risk and the best chance of creating a distinctive physical identity. Recording quality and post-processing require a small amount of craft. | **Preferred production source.** Record this before selecting a stock or generated fallback. |
| [Kenney Impact Sounds](https://www.kenney.nl/assets/impact-sounds), [UI Audio](https://www.kenney.nl/assets/ui-audio), and [Interface Sounds](https://www.kenney.nl/assets/interface-sounds) | Each named pack is CC0. Kenney says asset-page game assets may be used in commercial projects and attribution is not required ([Kenney support](https://www.kenney.nl/support)). CC0 permits redistribution of the raw asset, so a public Git repository is not a special problem. | Preserve the pack's included license and exact version. A courtesy credit is optional. | Very clean license chain, but the generic interface/impact palette may not sound like a real chess set without layering and editing. | **Safest free stock source.** Audition Impact Sounds first and use one quiet layer as raw material, not necessarily as the final unedited cue. |
| [Freesound](https://freesound.org/) filtered to **CC0** | Freesound offers CC0, CC BY, and CC BY-NC. Its official FAQ says CC0 can be used commercially without attribution, CC BY requires attribution, and CC BY-NC cannot be used commercially; it also warns that user-uploaded material can still be unauthorized despite the uploader rules ([Freesound licensing FAQ](https://freesound.org/help/faq/)). CC0 permits raw repository redistribution. | Save the individual asset page, uploader, download date, original file, and a PDF or text snapshot of the page. Do not rely on a search badge. | Better variety than Kenney but weaker provenance because users supply the files. Avoid voices, brands, music, recognizable media, and suspicious reuploads. | **Primary stock audition pair:** el_boss's CC0 [`Piece Placement.mp3`](https://freesound.org/people/el_boss/sounds/546119/) is a 111 ms mono/48 kHz light snap, and CC0 [`Piece Capture.mp3`](https://freesound.org/people/el_boss/sounds/546120/) is a 236 ms mono/48 kHz louder capture. The creator says both were recorded on a wood board for Chess Puzzle Blitz, so the two files already express the exact Move/Capture distinction. If they are too bright or heavy, audition the synthesized CC0 [`wood-click-1`](https://freesound.org/people/husamalhomsi/sounds/500926/), [`wood-click-2`](https://freesound.org/people/husamalhomsi/sounds/500928/), and [`wood-click-3`](https://freesound.org/people/husamalhomsi/sounds/500927/) as secondary layers. |
| [Pixabay Sound Effects](https://pixabay.com/sound-effects/) | Pixabay permits free use, modification, and use without attribution, but prohibits selling or distributing content on a **standalone** basis and warns that additional third-party rights may apply ([Pixabay Content License summary](https://pixabay.com/service/license-summary/)). An effect embedded in an app is a larger creative work; the same unchanged WAV committed to a public repository is a less comfortable case because it can be downloaded by itself. | Keep the asset URL, filename, contributor, download date, and current license text. Pixabay recommends retaining this evidence for audio without a download certificate ([Pixabay FAQ](https://pixabay.com/service/faq/)). | The custom license is less repository-friendly than CC0, and user-contributed provenance can still be imperfect. A search result such as [“Chess Pieces hitting wooden board”](https://pixabay.com/sound-effects/chess-pieces-hitting-wooden-board-99336/) is also a two-second multi-piece fall, not the restrained one-move cue required here. | **Do not make this the default for an open-source app.** Use only if a specific file is clearly superior and written confirmation covers raw storage in the public repository. |
| [OpenGameArt](https://opengameart.org/) filtered to **CC0 downloadable audio** | OpenGameArt says CC0 works may be used commercially without credit, but its other supported licenses have attribution, share-alike, GPL, and/or DRM implications. Its App Store FAQ specifically warns that GPL, CC BY, and CC BY-SA assets may conflict with App Store terms unless the artist separately permits the use ([OpenGameArt licensing FAQ](https://opengameart.org/content/faq#q-proprietary)). It also says preview audio may be all-rights-reserved even when the downloadable submission is free ([preview FAQ](https://opengameart.org/content/faq#q-preview)). | Verify the license on the downloadable file, not the preview, and retain the submission page and original archive. | License choices vary per submission, provenance is user-supplied, and a preview may not share the download's license. | **CC0 downloads only.** Skip CC BY, CC BY-SA, OGA-BY, and GPL for this two-file mobile use case unless legal review and all required permissions are documented. |
| [Sonniss GameAudioGDC archive](https://sonniss.com/gameaudiogdc/) | Sonniss grants royalty-free commercial synchronization in games and interactive projects and requires no attribution ([bundle license](https://sonniss.com/gdc-bundle-license/)). It is not CC0 and does not grant a general right to redistribute the raw library. | Preserve the specific bundle EULA, year, source file, and edits. | Excellent professional material, but a raw effect in a public repository can become an extractable standalone download rather than only a synchronized game asset. | **Private-project fallback, not the cleanest public-repository choice.** |

For any selected third-party file, retain the original filename, creator, exact
asset URL, download date, license name/version, a copy of the license text, and
a note describing edits. Before the sound ships in the native app, add it to
the repository's [third-party notices](../THIRD_PARTY_NOTICES.md) even if
attribution is not legally required; this preserves the release evidence chain.

### Generative sound-effect options

Generated output is not automatically risk-free. Service terms govern whether
the output can be used commercially or redistributed, and the output might not
be exclusive. The U.S. Copyright Office says purely AI-generated material is
not copyrightable where there is insufficient human control; prompting and
selecting one result alone are normally insufficient, while creative human
editing or arrangement can be protected
([Copyright and AI, Part 2](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)).
This does not prevent app use, but it means a raw generated click may be easy
for others to reuse and should not be treated as an exclusive brand asset.

| Tool or model | Commercial and output terms | Repository fit and risk | Decision |
| --- | --- | --- | --- |
| [Adobe Firefly Generate Sound Effects](https://helpx.adobe.com/firefly/web/firefly-video-editor/generate-audio/generate-sound-effects.html) | The sound-effect tool accepts text plus optional voice timing and returns four variations up to 30 seconds. It is currently beta. Adobe says beta Firefly outputs may be used commercially unless the product explicitly says otherwise, and says Firefly models are trained on licensed and public-domain content ([Firefly FAQ](https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/adobe-firefly-faq.html)). Adobe also states that Firefly outputs are customer content, it asserts no IP rights in them, and distribution channels are not restricted, while actual copyrightability depends on local law ([Adobe data and content usage](https://business.adobe.com/content/dam/dx/us/en/resources/sdk/adobe-firefly-data-and-content-usage/adobe-firefly-data-and-content-usage.pdf)). | Better public-repository fit than a stock license with a standalone-file ban. Beta outputs do not receive the same indemnification as eligible enterprise outputs, and the product must be checked for any explicit beta restriction at generation time. | **Best hosted AI experiment** if the available Firefly entitlement covers the generation. Archive the prompt, output, date, model/feature name, and terms snapshot. |
| [ElevenLabs Sound Effects](https://elevenlabs.io/docs/eleven-creative/playground/sound-effects) | ElevenLabs says free-plan output is non-commercial; a paid-plan output can be used commercially and indefinitely if it is not a Beta Service ([publishing FAQ](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)). Its terms say the customer retains rights in output, while outputs may not be unique ([Terms of Service](https://elevenlabs.io/terms-of-use)). Its Sound Effects terms allow the service to sublicense SFX outputs unless the user disables that setting; disabling it does not revoke earlier sublicenses ([Sound Effects Terms](https://elevenlabs.io/sound-effects-terms)). The prohibited-use policy also forbids commercial distribution of Sound Effects output on a standalone basis ([policy](https://elevenlabs.io/use-policy)). | Suitable for an effect embedded in the app, but committing the unchanged output as a directly downloadable raw file in a public repository is avoidable license ambiguity. Disable SFX sharing **before** generating; do not use a free plan, Beta Service, or community output. | **Good quality paid audition tool, not the cleanest final source for this public repository.** Use only after confirming the repository packaging with ElevenLabs in writing. |
| [Stable Audio 3.0 Small SFX](https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models) | Stability says this open-weight model is for on-device sound-effect generation, is trained on fully licensed data, and that users own, distribute, and commercialize outputs. The Community License is free for organizations with less than USD 1 million in total annual revenue; commercial users must register, and organizations above that threshold need an Enterprise license ([license FAQ](https://stability.ai/license)). | It can be run locally, provides a clear output-distribution statement, and avoids uploading prompts or recordings to a hosted service. The revenue threshold, registration, AUP, model version, and license must be tracked. An AI-only output may still lack copyright exclusivity. | **Best free/open-weight AI option** if Chessticize is eligible and registers before commercial use. Generate candidates locally, then make substantial human edits and preserve the exact model hash, prompt, seed, raw output, edit project, and license snapshot. |
| [Meta AudioCraft / AudioGen](https://github.com/facebookresearch/audiocraft) | The code is MIT, but Meta's released model weights are CC BY-NC 4.0. In the project's [commercial-license issue](https://github.com/facebookresearch/audiocraft/issues/198), a maintainer states that another license is not available because the source rights were negotiated for research use. | Using the weights to produce an app asset creates unnecessary commercial-use uncertainty. | **Do not use for Issue #247.** |

### Recommended production path

The recommended order is:

1. **Record an original physical set.** Use a real wooden piece and board that
   Chessticize owns, in a quiet soft-furnished room. Record mono at 48 kHz/24
   bit from several distances and make at least 20 placements plus 20 capture
   gestures. A recent phone can be sufficient for selection; a close microphone
   gives more editing headroom. Do not sample a digital instrument's factory
   ROM sounds; Freesound's own upload guidance warns that those recordings may
   copy embedded samples
   ([Freesound FAQ](https://freesound.org/help/faq/#what-sounds-are-legal-to-put-on-freesound)).
2. If those recordings are not polished enough, audition the matched
   **Freesound CC0 Piece Placement/Piece Capture pair** first, then **Kenney
   CC0** and the three documented **Freesound CC0 wood clicks** as secondary
   layers. Keep the real Chessticize transient dominant in any layered result
   so it has an attributable human production history.
3. In parallel, generate an AI palette with **Firefly** or eligible **Stable
   Audio 3.0 Small SFX**. Treat AI as a source of raw material, not a one-click
   final asset. Do not upload a Lichess sound as a reference and do not prompt
   for “the Lichess sound”; describe physical properties instead.
4. Put three candidate Move/Capture pairs into the existing Storybook story for
   a blind product choice. Do not wire them into native code until one pair is
   approved.

Suggested generation prompts:

- **Move:** “One subtle close-miked wooden chess piece placed on a solid maple
  chessboard; single dry tactile click, soft felt base, premium natural
  material, no clatter, no second impact, no room reverb, no music.”
- **Capture:** “A restrained chess capture on a wooden board; two tightly spaced
  natural transients, a quiet piece removal followed by a slightly lower,
  firmer placement; close-miked and dry, no clatter, no long resonance, no
  room reverb, no music.”

Post-process every candidate rather than relying on the model's full clip:

- Trim Move to roughly 70–110 ms and Capture to roughly 100–160 ms, with less
  than 5 ms of pre-roll and a short click-free fade.
- Make Capture distinguishable by its transient pattern and slightly lower
  body, not merely by making it much louder.
- Remove low-frequency table rumble and long room tails; keep enough midrange
  energy to survive a phone speaker at low volume.
- Export a mono 48 kHz WAV master, then derive the mobile asset from that
  master. Keep peaks below clipping and compare perceived loudness on hardware.
- Audition each pair through at least ten rapid alternating moves. Reject any
  cue that becomes tiring, resembles a notification alert, masks spoken audio,
  or cannot be distinguished at low volume.

The final asset record should include raw takes or generator output, prompts
and seeds, all edits, the chosen master hash, the service/model and plan used,
the exact terms and license snapshot, and the human who selected and edited the
result. This makes a future license or provenance audit reproducible.

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
