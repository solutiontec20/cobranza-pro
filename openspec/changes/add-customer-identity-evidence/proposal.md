# Proposal: Customer Identity Evidence and RENIEC Enrichment

## Intent

Require identity evidence during registration while protecting documents and portfolio boundaries when RENIEC is unavailable.

## Proposal Question Round

Confirmed: both photos are mandatory; collectors see assigned customers; admins/supervisors see all; RENIEC failure allows manual entry; replacement deletes the prior object.

## Scope

### In Scope
- Capture one DNI photo and one customer photo, maximum 1 MB each.
- Keep private objects in R2 Standard and audited metadata in PostgreSQL.
- Add provider-neutral RENIEC enrichment with manual fallback.
- Authorize access and replacement by role and portfolio ownership.

### Out of Scope
- Public URLs, biometrics, OCR, image history, offline registration, or an unreviewed RENIEC reseller.

## Capabilities

### New Capabilities
- `customer-identity-evidence`: Private capture, authorization, replacement, and orphan cleanup.
- `customer-identity-enrichment`: Server-side lookup with non-blocking manual fallback.

### Modified Capabilities
- None.

## Approach

Use a private R2 bucket and short-lived presigned PUT/GET URLs issued by authenticated Supabase Edge Functions with R2 secrets. Upload to temporary keys, verify server-side, then finalize metadata with the customer or customer-plus-loan transaction. Store object keys, type, size, checksum, updater, and timestamps—not permanent URLs. Replace metadata before deleting the old object; scheduled cleanup removes abandoned uploads.

RENIEC runs server-side, never exposes credentials, executes once per valid DNI attempt, and is enrichment—not an authorization gate. The official service requires an agreement and currently charges S/0.40 per query.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/app/core/{models,repositories,adapters}` | Modified | Evidence/lookup contracts |
| `src/app/modules/{admin,collector}/clients` | Modified | Capture and fallback UX |
| `supabase/migrations/` | New | Metadata, RLS, audit, RPCs |
| `supabase/functions/` | New | R2 signing, finalization, RENIEC, cleanup |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Document exposure | Medium | Private bucket, short URLs, authorization, audit |
| Partial upload/customer creation | Medium | Temporary keys, server finalization, compensating cleanup |
| RENIEC cost/outage | Medium | Manual fallback, deduplication, explicit lookup action |

## Rollback Plan

Disable endpoints/UI, retain metadata for audit, delete objects under an approved retention process, and revert schema only through an additive migration.

## Dependencies

- Cloudflare R2 account/bucket and credentials.
- RENIEC agreement/credentials before production lookup.
- Approved consent and privacy/retention policy for identity images.

## Success Criteria

- [ ] No customer can be finalized without all configured evidence images.
- [ ] Unauthorized roles cannot obtain valid image URLs.
- [ ] At 770 customers and two 1 MB images, storage remains near 1.54 GB.
- [ ] RENIEC outage never blocks validated manual registration.
- [ ] Replacement leaves one current object per evidence type and no permanent public URL.
