# AI Assistance — Technical Concepts and Design Flow

**Project:** Purple Wave Equipment Intake  
**AI Tool:** ChatGPT

## 1. Backend API and Mock Network Behavior

**Concept explored:** How should a backend handle submissions when users have unstable internet connectivity?

AI assistance was used to explore:

- Structuring REST APIs for equipment submissions.
- Simulating failed requests and slow network responses.
- Using idempotency keys to avoid duplicate submissions.
- Handling interrupted image uploads.

**Design direction:** Keep backend operations retry-safe so the mobile application can resend requests without creating duplicate records.

## 2. Offline-First Submission Flow

**Concept explored:** How can an Expo application preserve submission data when the network is unavailable?

Topics discussed with AI:

- SQLite versus AsyncStorage for persistent submission queues.
- Saving equipment details before making network requests.
- Maintaining pending, uploading, failed, and completed submission states.
- Retrying submissions after connectivity is restored.

**Design direction:** Persist submissions locally first and let a separate synchronization process handle network delivery.

## 3. Resumable Photo Uploads

**Concept explored:** How can large equipment photos be uploaded reliably over poor Wi-Fi?

AI assistance was used to understand:

- Chunk-based file uploads.
- Resuming an interrupted upload without starting over.
- Recording uploaded chunks on the backend.
- Validating upload completeness before finalization.
- Preventing duplicate chunks and corrupted image submissions.

**Design direction:** Use resumable uploads with server-side validation instead of treating every upload as a single network request.

## 4. Retry and Recovery Strategy

**Concept explored:** Which network failures should trigger automatic retries?

Topics explored:

- Exponential backoff.
- Temporary versus permanent HTTP failures.
- Avoiding continuous retry loops.
- Retaining local submission data after unsuccessful attempts.

**Design direction:** Retry temporary failures while preserving the submission for recovery.

## 5. Equipment Category Extensibility

**Concept explored:** How can another equipment category be introduced without duplicating the existing application?

AI assistance was used to consider configuration-driven forms and shared submission logic.

**Design direction:** Separate category-specific fields from the common intake and synchronization workflow.

---

## Scope of AI Assistance

AI was used as a technical reference and design assistant for selected engineering concepts, including backend API behavior, offline persistence, retry strategies, and resumable uploads.

The focus of these discussions was understanding trade-offs and selecting appropriate approaches for the assessment.

**Note:** This document is a concise conceptual overview, not a verbatim prompt transcript. The topics should be represented as actual AI interactions only where supported by the conversation history.