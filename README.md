# Purple Wave equipment intake — npm workspaces monorepo

Standalone Expo Go assessment implementation. The assessment PDF describes a separate Copart starter repository that was **not supplied**; this is not an in-place patch to that starter.

## Layout

```text
apps/
  mobile/     Expo React Native app, SQLite queue, photo picker, backend status UI
  server/     Node.js mock server and its tests
packages/
  shared/     Equipment category validation and retry policy
DECISIONS.md
transcripts/
package.json  Workspace scripts
```

## Prerequisites

Node 20+, npm, Git, Expo Go compatible with the SDK version in `apps/mobile/package.json` (currently **Expo SDK 54**). Expo Go SDK 58 cannot open an SDK 54 app; install the matching Expo Go or deliberately upgrade all Expo packages together after testing.

## Install and run (from repository root)

```powershell
npm install
npm run server
```

Open a **second terminal** at repository root:

```powershell
npm start
```

For Android emulator, set the URL in the app's **Connection settings** to `http://10.0.2.2:4000`. For a physical Android phone on the same Wi-Fi as your PC, enter its LAN address. For example, with a PC at `192.168.0.20`, use `http://192.168.0.20:4000`. The URL is device-specific and saved in SQLite. Allow inbound Windows firewall port 4000 if required. `http://0.0.0.0:4000` is the *server bind address*, **not** a phone URL.

A **Backend connection** card displays `CHECKING`, `CONNECTED`, or `FAILED` and a short explanation. It checks `GET /health` every five seconds and on app foreground, with a 3.5-second timeout. `Check connection` triggers an immediate refresh. Status represents **reachability to the configured mock backend**, not whether a submission has succeeded. The server exposes `/health` independently of its failure simulator so the status can remain connected while individual upload requests fail.

## Check connectivity

Open `http://localhost:4000/health` on your PC, or `http://192.168.0.20:4000/health` on your phone (replace the IP as appropriate). The response should be `{"ok":true}`. `GET /submissions` returns submission records.

## Tests

```powershell
npm test
npm run typecheck
```

`npm test` runs Node server and pure shared-policy tests. Typechecking and Expo bundling need npm dependencies installed. A real Expo Go device test is still required.

## Simulate unreliable Wi-Fi (PowerShell)

```powershell
$env:FAIL_RATE='0.5'
$env:DELAY_MS='500'
npm run server
```

Set both back to `0` for normal behavior. The app's backend connection badge can still show CONNECTED with this setting because `/health` is intentionally exempted from fake failures; check the **Submission outbox** for actual upload status.

## Submission process

Capture images and input equipment details. The app copies photos to persistent storage, saves the work in SQLite, attempts resumable uploads when open, and retries recoverable failures. Failed work remains in the outbox. Automatic background transfers while terminated are **not** implemented.

## Submission note

The included `.git` history is the standalone implementation's history. `transcripts/` is a summary, not a fabricated verbatim transcript. Refer to `DECISIONS.md` for limitations and tradeoffs.
