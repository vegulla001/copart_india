# Purple Wave equipment intake — Expo Go assessment implementation

Standalone implementation based on **Copart India – Mobile Engineering: Take-Home Exercise**. The PDF references a starter repo supplied separately; it was **not provided**, so this is not a patch to that repo. Review `DECISIONS.md` first.

## Requirements

- Node 20+, npm, Git and Expo Go (iOS simulator, Android emulator or phone)
- Computer and device on the same network when using a real phone

## Start

```bash
npm install
npm run server
# in a second terminal
npm start
```

Scan the QR code with Expo Go. Android emulator server address defaults to `http://10.0.2.2:4000`. For a **physical phone**, edit **Connection settings** to `http://YOUR_COMPUTER_LAN_IP:4000`, then save. On iOS simulator, use `http://localhost:4000` when applicable. Make sure port 4000 is allowed by your firewall.

## Test poor Wi-Fi

Run the server with simulated 50% failures and 500 ms added latency:

```bash
FAIL_RATE=0.5 DELAY_MS=500 npm run server
```

On Windows PowerShell:

```powershell
$env:FAIL_RATE='0.5'; $env:DELAY_MS='500'; npm run server
```

Create an equipment submission with at least one image. Disable Wi-Fi while saving: it remains in the outbox and syncs on re-connection while the app is open. Kill/restart the app: the queued/sending state is recovered. Explicit Retry is available after exhausting automatic retries. Server-side local records are saved under `server/data/` (gitignored). GET `http://localhost:4000/submissions` on the computer to inspect submitted metadata.

## Test and typecheck

```bash
npm test
npm run typecheck
```

Tests use Node's built-in test runner and need no installed dependencies. Expo typecheck needs `npm install`.

## Reliability design

1. Copy selected images to persistent app document storage, then commit job metadata in SQLite before starting I/O.
2. Retry idempotent creation by client-generated stable submission ID.
3. Upload byte chunks with stable offsets. Server accepts duplicate chunks with the same checksum, rejects conflicting retries, and persists progress.
4. Mark job submitted only after a successful server finalize acknowledgement. If acknowledgement is lost, retry the same finalization safely.
5. Use bounded exponential backoff and manual retry; preserve failed work in SQLite.

**Important:** Automatic upload only runs with the app open/foregrounded; the app does not guarantee background or OS-terminated transfers. Server is mock HTTP only and not suitable for production.

## Folder structure

- `App.tsx` – Expo Go capture and visible outbox
- `src/db.ts`, `src/files.ts` – durable SQLite queue / persisted photo copies
- `src/queue.ts`, `src/transport.ts` – retry coordinator and idempotent chunk API
- `shared/policy.js` – pure retry and category rules
- `server/` – mock unreliable HTTP server with disk-backed submission tracking
- `tests/` – policy and HTTP integration tests
- `DECISIONS.md` – prioritization, assumptions, limitations
- `transcripts/` – accurate summary of AI work; attach your own full export if required

## Reproducing the Git history

The ZIP includes `.git/` with separate implementation commits if supported by the extraction tool. Extract all files (including hidden `.git`), then run `git log --oneline`. Do not squash when submitting.

## Verification status (2026-11-18)

- `npm test`: **15 passed** (run without external dependencies), including a regression where bytes 3–5 are missing in a 9-byte photo.
- `npm install`: **blocked in the artifact environment** by unavailable npm registry DNS (`EAI_AGAIN`), so TypeScript and Expo Go runtime are **not verified** here. On a machine with npm access, run `npm install`, `npm run typecheck`, `npm test`, and `npm start` before submission.
- The server rejects incomplete/corrupted images instead of acknowledging submission. The app retains rejected work in its persistent outbox; server data repair after disk corruption is not automated.
- This is **not the supplied original assessment repository**; the PDF identifies its link as TBD.
