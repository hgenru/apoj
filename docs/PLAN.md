# APOZH PWA: implementation plan

## Product flow

1. The second player leaves the room or puts on headphones.
2. The first player records a normal song fragment.
3. The app trims only the outer silence and proposes chunk boundaries.
4. The host can drag a bad boundary, then invites the second player back.
5. For source chunks `[A][B][C]`, the app plays `reverse(C)`, `reverse(B)`, `reverse(A)`.
6. Each fragment is played once or twice. After a cue, voice activity starts and silence stops the answer recording.
7. The recorded answers are concatenated in challenge order and the whole result is reversed.
8. The group compares the reconstructed song with the original.

Auto and Manual are selected on the home screen. Auto mode only needs the initial “ready” button; voice detection runs the challenge after that and plays the reconstructed result after a short reveal. Manual mode keeps automatic playback repeats but requires explicit start, stop, and next-fragment actions for rooms where reliable detection is impossible. Space and common media keys trigger the primary action on each stage; R or Previous Track handles replay and retake actions.

## Stack

- SolidJS and TypeScript for a small reactive UI.
- Vite and `vite-plugin-pwa` for a static installable app and offline cache.
- Web Audio API plus an AudioWorklet for raw mono PCM. `MediaRecorder` is deliberately avoided because compressed blobs are awkward for sample-accurate reversal.
- A custom SVG waveform. This keeps playback, samples, selection, and draggable boundaries on the same coordinate system without importing a full editor.
- `@solid-primitives/i18n` for flat, type-checked Russian and English dictionaries.
- Vitest for deterministic DSP tests and Playwright for real Chromium flows.

There is no backend. Recordings stay in memory and disappear on refresh.

## Smart splitting

The splitter works on the normal source recording, not on reversed audio:

1. Calculate a smoothed RMS envelope with a 24 ms window and 12 ms hop.
2. Pick a chunk count close to `duration / targetDuration`, constrained by minimum and maximum chunk lengths.
3. Around every ideal boundary, collect nearby local energy minima.
4. Use dynamic programming to choose all boundaries together. Its cost combines boundary energy and deviation from an even chunk duration.
5. If no feasible quiet-valley path exists, fall back to evenly spaced boundaries.

This makes normal phrasing win when pauses exist, while remaining predictable for legato singing, room noise, or a sustained note.

Current defaults:

- target: 2.1 seconds;
- minimum: 52% of target, never below 0.8 seconds;
- maximum: 145% of target;
- draggable boundary minimum spacing: 0.55 seconds;
- playback edge fade: 7 ms.

## Automatic answer capture

- Browser echo cancellation, noise suppression, and automatic gain control are disabled so a USB mixer signal is not altered.
- Stereo input can be mixed to mono or restricted to the left or right channel.
- The 2.4-second pre-roll doubles as room-noise calibration before every automatic answer.
- The start and stop gates adapt above the median room level while respecting the configured minimum threshold.
- Five consecutive 50 ms frames above the adaptive start gate mark voice onset, filtering out brief knocks and shuffles.
- After onset, 950 ms of silence stops recording; a lower stop gate adds hysteresis.
- A manual start button remains available if an unusually loud room defeats voice detection.
- A duration guard prevents permanent recording when room noise never falls below the threshold.

For reliable party use, route only the active vocal microphone to the recorded USB bus. Music and unused microphones can otherwise defeat silence detection.

## Delivery steps

- [x] Static PWA shell and offline build
- [x] RU/EN UI and persistent language choice
- [x] Input setup, channel selection, meter, raw PCM capture
- [x] Smart splitter, draggable SVG boundaries, forward/reverse preview
- [x] Automated challenge and final reconstruction
- [x] Unit tests and Chromium end-to-end tests
- [ ] Tune thresholds with the actual Behringer mixer in the party room
- [ ] Add 192 px and 512 px raster install icons before public launch
- [ ] Deploy `dist/` to Cloudflare Pages and verify microphone permission over HTTPS
