# Mobile Jest tests

- `App.test.tsx`: Expo screen, form, image picker, local queue request, URL settings.
- `serverStatus.test.ts`: health endpoint, validation, timeout, and error handling.
- `queue.test.ts`: no upload offline, successful sync, backoff, retry eligibility,
  permanent failure, app restart recovery hook.

Run with `npm run test:mobile` at repository root after `npm install`.

**Limit:** Native services are intentionally mocked. These tests do not replace
Expo Go smoke tests or actual offline + app restart verification.
