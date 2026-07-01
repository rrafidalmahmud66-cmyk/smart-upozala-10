# Security Specification for Smart Upazila Platform (Zero-Trust ABAC)

This specification defines the strict security posture for our Firebase Firestore instance, preventing Update-Gaps, Orphaned Writes, and Privilege Escalation attacks.

---

## 1. Data Invariants

- **User Profiles (`/users/{userId}`)**: 
  - A user can only manage a document whose ID precisely matches their authenticated UID.
  - No user can self-promote their role parameter to `admin` during creation or update.
- **Support Messages & Citizen Reports (`/reports/{reportId}`)**:
  - Authenticated reports must belong strictly to the submitting authenticated user's `userId`.
  - Anonymous submissions are allowed but must explicitly set `userId` to `"anonymous"`.
  - Modification of the report's processing state (`status`, `priority`) is strictly forbidden for standard citizens and restricted entirely to verified admins.
- **Service Directory Providers (`/providers/{providerId}`)**:
  - Providers must begin as `"pending"`.
  - Standard users can only read approved providers, their own draft registrations, or as a verified admin.
- **Provider Reviews (`/reviews/{reviewId}`)**:
  - Authenticated and verified email owners can write reviews. Standard citizens cannot spoof reviewer identities or modify review metadata.

---

## 2. The "Dirty Dozen" Poison Payloads

The following malicious payloads must be intercepted and rejected by the Firestore rules:

### Payload 1: Privilege Escalation on User Creation
```json
// Collection: /users/victim-user-id
{
  "uid": "victim-user-id",
  "role": "admin",
  "createdAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (User trying to register themselves as an admin).

### Payload 2: Self-Promotion via Profile Update
```json
// Collection: /users/standard-user-id
{
  "uid": "standard-user-id",
  "role": "admin",
  "displayName": "Hacker Master",
  "updatedAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (Hacker trying to inject `role: "admin"` through standard update).

### Payload 3: ID Poisoning Attack on News
```json
// Path: /news/malicious-extremely-long-id-that-is-over-128-characters-acting-as-denial-of-wallet-vector-junk-characters-payload-leak
{
  "title": "Poison News Title",
  "description": "Short Description",
  "category": "Notice",
  "createdAt": "2026-05-20T08:00:00Z",
  "authorId": "attacker-uid"
}
```
*Expected Result:* `PERMISSION_DENIED` (Extremely long document ID rejected by `isValidId()` guard).

### Payload 4: Complaint Report Identity Spoofing
```json
// Path: /reports/some-report-id
{
  "userId": "another-innocent-user-id",
  "title": "Injected Report Header",
  "description": "Malicious content text",
  "category": "Utility",
  "status": "pending",
  "createdAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (Attacker attempting to submit a report mapped to another user's identity).

### Payload 5: Rapid Complaint Status Transition (Admin Spoofing)
```json
// Path: /reports/citizen-complaint-id
{
  "userId": "attacker-uid",
  "title": "Legitimate Complaint Info",
  "description": "Slight issue",
  "category": "Roads",
  "status": "resolved", // Injected status modification bypassing admin review
  "createdAt": "2026-05-19T00:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (Standard user versucht `status: "resolved"` or admin fields to write).

### Payload 6: Provider Status Bypass (Approved by Default)
```json
// Path: /providers/new-provider-id
{
  "userId": "attacker-uid",
  "name": "Hacker Handyman",
  "category": "Plumbing",
  "status": "approved", // Injected approved status to bypass verification
  "createdAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (State shortcutting: standard user must start with status `"pending"`).

### Payload 7: Fake Review Rating Escalation
```json
// Path: /reviews/new-review-id
{
  "userId": "attacker-uid",
  "providerId": "provider-to-sabotage-id",
  "rating": 99, // Outside [1, 5] bounds
  "createdAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (Value Poisoning: Rating values strictly validated to be integers between 1 and 5).

### Payload 8: Blanket Admin Settings Ransom
```json
// Path: /settings/system-config
{
  "maintenance": true,
  "updatedBy": "attacker-uid",
  "systemNotice": "Your smart upazila is locked!"
}
```
*Expected Result:* `PERMISSION_DENIED` (Global configurations read/write only managed by valid admins).

### Payload 9: Unauthorized Review Hijacking
```json
// Path: /reviews/exist-review-id-belong-to-victim
{
  "userId": "attacker-uid", // Swapping reviewer ID to bypass ownership
  "rating": 5,
  "comment": "Nice!"
}
```
*Expected Result:* `PERMISSION_DENIED` (Identity integrity constraint: Cannot update reviews unless UID matches the author).

### Payload 10: Notification Feed Hijacking
```json
// Path: /notifications/fake-broadcast
{
  "title": "Spam Broadcast Event",
  "message": "Visit this malicious link!",
  "type": "emergency",
  "createdAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (Only verified admins can trigger broadcasts and notifications).

### Payload 11: Denial of Wallet via Giant Resource Fields
```json
// Path: /reports/overflow-report
{
  "userId": "attacker-uid",
  "title": "Extremely huge title exceeding maximum configured size bounds designed to exploit downstream server resources ... (1000+ characters)",
  "description": "Overflow target",
  "category": "Trash",
  "status": "pending",
  "createdAt": "2026-05-20T08:00:00Z"
}
```
*Expected Result:* `PERMISSION_DENIED` (Size guards enforce field limits on every entity write).

### Payload 12: Invalid Timestamp Forgery
```json
// Path: /reports/timestamp-hack
{
  "userId": "attacker-uid",
  "title": "Forged Stamp",
  "description": "Standard complaint",
  "category": "Water",
  "status": "pending",
  "createdAt": "2001-01-01T00:00:00Z" // Client provided forged history
}
```
*Expected Result:* `PERMISSION_DENIED` (Server-side timestamp enforce prevents falsified history).

---

## 3. The Test Runner Summary

Our `DRAFT_firestore.rules` is engineered to immediately fail when any of these payloads is executed. We verify these rulesets statically to confirm compliance across zero-trust benchmarks.
