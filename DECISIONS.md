# Assessment decisions

## Scope and assumption

The provided PDF describes an **existing Expo starter repository and mock server**, but neither is included with the PDF. This is a **standalone reference implementation**, not a patch against Copart's unreleased starter. It cannot preserve the original repo's commit history or demonstrate compatibility with unknown starter code. Assessment time-box: prioritize reliable submissions rather than polish or all possible edge cases.

## Priority order

1. **Never lose locally captured submissions during normal offline/poor-Wi-Fi use.** Save submission and copied photos in app-private persistent storage *before* attempting network I/O; app restart recovers `sending` to `queued`.
2. **Make every upload step retry-safe.** Client-generated submission/photo identifiers, deterministic byte offsets, and server-side duplicate detection prevent duplicate records on lost acknowledgements.
3. **Expose failures and manual recovery.** Clear outbox states, exponential retry delays and explicit Retry button. Automatic retries occur while app is active and reachable.
4. **Allow another category.** Schema-driven category field configuration keeps core queue/upload logic category-agnostic.
5. **Tests and review documentation.** Node tests exercise retry policy and actual HTTP server idempotency.

## Deliberate trade-offs / rejected approaches

- **No BackgroundFetch or native background upload**: requirement says Expo Go only. Retry runs every five seconds while the app is active, on foreground, and after enqueue; OS-killed/background apps are not guaranteed to sync.
- **No AsyncStorage-only photo paths**: copied images live under Expo's persistent document directory; metadata lives in SQLite. Deleting/reinstalling the app still loses local data.
- **No simple one-shot multipart POST**: chunk-level retries at deterministic offsets reduce bandwidth after connection failure.
- **No endless retry loop**: up to eight automatic attempts; failed work remains on device and can be retried manually.
- **No destructive outbox cleanup**: submitted items remain visible (and photos retained) to favor traceability over storage optimization.
- **No real authentication**: assessment mock server only; production needs auth, TLS, per-user authorization, quotas, encryption/privacy review and abuse limits.

## Known limitations / issues I intentionally did not solve

- Upload reads base64 chunks; larger raw photos could benefit from a streaming native transport, unavailable in standard Expo Go.
- File copying plus DB write is not one atomic transaction; process termination between steps may orphan a copied photo. A cleanup sweep would be sensible.
- Existing persisted jobs do not currently support editing or canceling before sync.
- No independent server-side content checksum is returned for final images; server verifies byte coverage and chunk idempotency but needs end-to-end checksum verification in production.
- No live mobile UI integration test has been executed in this artifact environment. `npm test` tests pure policy and the real mock HTTP server, not Expo native runtime.
- Local `http://` server is for development only. Android cleartext network policy and LAN firewalls differ across physical devices.
- Two categories are examples, not an official Purple Wave taxonomy.

## Next steps

1. Integrate the persistence/transport changes into Copart's actual starter repository and adapt its API contract.
2. Add app-level tests for SQLite recovery, file retention, queue lifecycle, airplane mode and app termination on real Android/iOS Expo Go devices.
3. Add a periodic resumable-sync status, partial-photo acknowledgements, observability, server final checksums, and authenticated HTTPS upload authorization.
4. Add photo file lifecycle management, per-file caps, disk-space handling and cancellation policies.

## AI use / review

Implementation was generated with ChatGPT assistance. The session summary under `transcripts/` records the prompts actually available in this conversation; it is **not** a fabricated Claude Code transcript. Independently run and inspect tests, verify on Expo Go, and commit any fixes before sending to an evaluator.
