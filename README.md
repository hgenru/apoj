# APOZH

APOZH is a local, browser-based reverse-song party game. One player sings a familiar song, another player imitates short reversed fragments without hearing the original, and the app reconstructs the imitation into something that almost resembles the song again.

**Live app:** [apoj.saa.sh](https://apoj.saa.sh)

The interface is available in English and Russian. APOZH is an independent, unofficial implementation intended for parties and private events.

## What you need

- A current desktop version of Chrome or Edge
- Two players
- A microphone or a USB audio interface/mixer
- Speakers or headphones connected to the computer's system output

No server, account, or internet connection is required after the app has been loaded once.

## How to play

1. Send player two to another room or give them headphones. They must not hear the original song.
2. Player one records a verse or chorus normally.
3. APOZH trims the recording and proposes chunk boundaries near quiet parts of the performance.
4. Check the waveform. Drag a divider if it cuts through a word, then invite player two back.
5. Player two hears each reversed chunk twice, with a two-second visible countdown between repeats.
6. After a five-second preparation countdown and a beep, player two imitates the sound. Recording starts on their voice and stops on silence.
7. APOZH joins all imitations, reverses the complete recording, and plays the result.

During the challenge, **Listen again** replays the current chunk. **Discard and try again** throws away the current take, while **Record again** replaces a take that has just finished. A manual start remains available if automatic voice detection cannot distinguish the singer from a noisy room.

## Install the PWA and play offline

1. Open [apoj.saa.sh](https://apoj.saa.sh) once while online.
2. In Chrome or Edge, click the install icon in the address bar. APOZH also shows an **Install app** action when the browser makes installation available.
3. Launch APOZH from the desktop, Start menu, or app launcher.

The application shell, audio worklet, icons, and interface assets are cached by a service worker. Once installed and opened successfully, the game can be launched without internet access.

## Sound setup

Open **Setup** before the party and select the desired audio input. Stereo USB devices can be recorded as:

- `L + R to mono`
- `Left only`
- `Right only`

Browser echo cancellation, noise suppression, and automatic gain control are disabled to preserve the signal from an external mixer. Playback uses the operating system's selected output device.

Before every answer, APOZH measures the current room level and raises its voice gate above that baseline. Brief bumps are ignored, and an answer is only started by a sustained signal. For the most reliable automatic stopping, still route only the active vocal microphone into the USB recording bus: music and unused microphones can keep the level above the silence threshold. The minimum voice level and target chunk duration can be adjusted in Setup.

## Audio and privacy

Audio is captured as uncompressed mono PCM with the Web Audio API and an AudioWorklet. Recordings are processed entirely in browser memory:

- nothing is uploaded;
- nothing is saved to cloud storage;
- refreshing or closing the app removes the current round.

The smart splitter analyzes a smoothed RMS envelope and uses dynamic programming to prefer quiet boundaries without producing extremely short or long chunks. All proposed boundaries remain manually adjustable.

## Browser support

Chrome and Edge are the supported browsers. Other browsers may work, but microphone constraints, AudioWorklet behavior, PWA installation, and audio-device handling vary between engines.

Microphone access requires HTTPS in production. `localhost` is treated as a secure context during development.

## Local development

The required Node.js version is recorded in `.node-version`.

```bash
npm install
npm run dev
```

Open `http://localhost:4174`. Use **Demo without a microphone** to inspect the complete UI without audio hardware.

Useful commands:

```bash
npm test             # DSP tests
npm run test:e2e     # production PWA and browser flows
npm run build        # type-check and create dist/
npm run preview      # serve the production build locally
```

The end-to-end suite uses a fake Chromium microphone to exercise `getUserMedia`, the AudioWorklet recorder, waveform generation, repeat controls, the web app manifest, and offline reloads.

## Deploy to Cloudflare

Connect this repository from **Workers & Pages** using the Git integration and use:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: leave empty

The Node.js version and static asset directory are already declared in `.node-version` and `wrangler.jsonc`. No environment variables or backend services are required. Cloudflare deploys the generated `dist` directory as static assets. Add `apoj.saa.sh` under **Custom domains** after the first successful deployment.

See [docs/PLAN.md](docs/PLAN.md) for implementation details and tuning notes.
