# MailShield Lite — Full Build Plan (Instructions Only)

> **Scope:** A tiny web app that checks a domain's email authentication posture (SPF, DKIM, DMARC) and presents clear pass/warn/fail results plus a simple overall grade. Built for rapid deployment on Vercel. No code in this document—only instructions.

---

## 1) Goal, Users, and Success Criteria

**Primary Goal**
- Ship a small, useful, production-looking tool in one day that demonstrates full‑stack ability (frontend, backend, networking, deployment).

**Primary Users**
- Marketers and IT admins who need to verify deliverability setup.
- Recruiters/engineers evaluating your practical skills.

**Success Criteria (MVP)**
- Works for any public domain without login.
- Returns results for SPF, DKIM, DMARC and an overall grade.
- Clear pass / warn / fail messaging with one actionable fix per section.
- Never crashes on malformed DNS; degrades gracefully.
- Deployed on Vercel with a polished README and a short demo video or GIF.

**Non‑Goals (MVP)**
- Provider‑specific automation (e.g., auto-creating DNS records).
- Bulk checks, scheduled scans, historical trend graphs.
- Browser automation, OAuth, or paid APIs.

---

## 2) Product Narrative (What It Does)

1. User enters a domain such as example.com.
2. System performs three DNS TXT lookups: the root (for SPF), `_dmarc.<domain>` (for DMARC), and several common DKIM selectors under `._domainkey.<domain>`.
3. System analyzes records and returns: presence, key parameters/policy, detected issues, a simple numeric score per area, and an overall letter grade.
4. UI shows three cards (SPF, DKIM, DMARC) with green/amber/red states and a concise "Fix:" hint for each.

---

## 3) Architecture (High-Level)

- **Frontend:** Single Next.js page with a domain input, a "Check" button, and three result cards. Responsive design using a lightweight component library.
- **Backend:** One serverless API route that validates the domain, performs DNS TXT lookups using Node's DNS capabilities, interprets results, and returns a normalized report.
- **Runtime:** Node Serverless on Vercel (not Edge) to support DNS lookups.
- **Caching:** Cache API responses for 5 minutes to reduce latency and DNS load.
- **Observability:** Simple console logs for errors and major branches (development).

---

## 4) Data Flow (Plain English)

1. Frontend sends a GET request to `/api/check?domain=<domain>`.
2. Backend validates the domain string and rejects schemes or paths.
3. Backend queries DNS:
   - SPF: TXT records at `<domain>` and picks the record that begins with `v=spf1`.
   - DMARC: TXT records at `_dmarc.<domain>`; choose the record that begins with `v=DMARC1`.
   - DKIM: TXT records at `<selector>._domainkey.<domain>` where `<selector>` is drawn from a small list of common names.
4. Backend parses each record into structured facts and issues, applies a simple scoring heuristic, and returns a normalized report.
5. Frontend renders pass/warn/fail for each section plus an overall grade and shows one "Fix:" sentence per section.

---

## 5) Domain Validation Rules (Inputs)

- Accept bare domains only (no http/https, no slashes).
- Allow internationalized domains but ensure they are length-safe after conversion.
- Reject obviously invalid strings and respond with a friendly error message.
- Rate-limit politely at the UI level (e.g., disable the button while checking).

---

## 6) DNS Checks and Interpretation (What to Look For)

### SPF
- Find exactly one TXT record that starts with `v=spf1`.
- Note the overall qualifier: `-all` (strict), `~all` (softfail), `?all` (neutral), `+all` (overly permissive).
- Collect included domains (appear after `include:`) and warn if there are too many.
- Issues to flag:
  - No SPF record, or multiple different SPF records.
  - Missing an `all` qualifier.
  - Obvious over‑permissiveness or excessive includes.

### DMARC
- Lookup `_dmarc.<domain>` TXT and select the record that starts with `v=DMARC1`.
- Parse policy `p=` (none, quarantine, reject); optional `rua=`, `ruf=`, and `pct=`.
- Issues to flag:
  - Missing DMARC record.
  - Policy is `none` for a production‑looking domain.
  - Missing aggregate reporting address (`rua=`) to monitor adoption.

### DKIM
- Try a small list of selectors (e.g., default, google, s1, s2, selector1, selector2, mandrill, postmark, pm, k1, k2, mail).
- For each selector that returns a TXT:
  - Record the algorithm marker if present (e.g., rsa, ed25519).
  - Approximate key strength by the public key length (heuristic).
- Issues to flag:
  - No selectors found at all (may still be okay if not sending mail).
  - Suspiciously short keys (heuristic note).

---

## 7) Output Shape (Described, Not Code)

The API returns a report that contains:
- The domain checked and an ISO timestamp.
- A section for SPF with: presence boolean, the main policy qualifier, a list of include domains, a list of issues, and a numeric score.
- A section for DMARC with: presence boolean, main policy (`none/quarantine/reject`), any reporting addresses, issues, and a score.
- A section for DKIM with: list of found selectors, optional key notes, issues, and a score.
- An overall score and letter grade derived from the three sections.
- On error: a friendly message while still returning a minimal structure.

---

## 8) Scoring Heuristic (Simple, Explainable)

- Start each section at 60 points.
- **SPF:** add points for exactly one SPF record, presence of `-all`, and a reasonable number of `include:` entries; subtract for missing `-all`, multiple records, or permissive settings.
- **DMARC:** add points if policy is `reject` or `quarantine`, if `rua=` exists, and if `pct=100`; subtract if policy is `none` or if reporting is missing.
- **DKIM:** add points per valid selector discovered and for apparently strong keys; subtract if no selectors are found.
- Overall grade mapping: 90+ A, 80–89 B, 70–79 C, 60–69 D, <60 F.
- Always include one or two concise "notes" explaining the biggest deductions.

---

## 9) UI/UX Specification

**Layout**
- Header with product name and a short subtitle: "Will your emails land in the Inbox?"
- Main panel with a domain input, "Check Email Auth" button, and a small help icon.
- Three vertically stacked cards (SPF, DKIM, DMARC) showing:
  - Status chip: All good / Needs attention / Broken.
  - Two or three key facts.
  - A single line beginning with "Fix:" describing the most impactful next step.
- An overall grade badge placed near the top of the results.
- A compact "What are SPF/DKIM/DMARC?" modal with two‑line explanations each.

**States**
- Empty: gently prompt to enter a domain.
- Loading: show skeleton placeholders on all cards.
- Error: friendly message with "Try again" option.
- Mobile: input and results stack, large tap targets.

**Accessibility & Polish**
- Proper labels for the input and button.
- Clear color contrast for status states (also add an icon change).
- Keyboard navigation works from input to button to cards.

---

## 10) Edge Cases and Graceful Degradation

- Internationalized domains: accept within safe length; display the human form.
- Multiple SPF TXT records: warn about ambiguity, select the one starting with `v=spf1` if present.
- Multi‑chunk TXT: concatenate safely in record parsing.
- DNS errors (NXDOMAIN, SERVFAIL, timeout): return a friendly message and a non‑crashing partial report.
- Private or internal domains: communicate that non‑public DNS cannot be checked.

---

## 11) Testing Strategy (Outcomes, Not Tools)

**Unit‑Level Parsing (Inputs → Facts)**
- SPF strings: verify extraction of final qualifier and `include:` domains.
- DMARC strings: verify detection of policy, `rua`, `ruf`, and `pct`.
- DKIM strings: verify detection of algorithm markers and presence of a key.

**Integration‑Level (DNS Variants → Section Status)**
- Success records present for all three sections.
- Missing DMARC entirely.
- Multiple SPF records, only one valid.
- Huge TXT split across chunks.
- DKIM with at least one common selector found.
- DNS error cases: ensure the response is still well‑formed and helpful.

**Contract‑Level (Response Completeness)**
- Every reply includes domain, timestamp, three sections with scores, and an overall grade— even when some checks fail.

---

## 12) Manual QA Checklist (Fast Clickthrough)

- A domain with strong DMARC (reject policy).
- A domain with SPF softfail and many includes.
- A domain with no DMARC.
- A domain with at least one DKIM selector discoverable.
- A fake domain that does not resolve.
- A university or startup domain you know; sanity‑check results.
- Mobile viewport verification.

---

## 13) Deployment Plan (Vercel)

1. Create a new Vercel project from the repository.
2. Ensure the serverless runtime is **Node**, not Edge (DNS requires Node).
3. Use the default Next.js build settings; no environment secrets required.
4. After first deploy, test three real domains and one fake; confirm friendly errors.
5. Set API caching to approximately five minutes to keep it snappy.
6. Update README with live URL and a short demo GIF or clip.

---

## 14) Demo Script (≈40 Seconds)

1. Enter a well‑known domain and click "Check Email Auth."
2. Point to the three cards as they fill in; call out one green "All good."
3. Open the help modal; show two‑line explanations for each term.
4. Enter a second domain that's missing DMARC; point to red "Broken" and the "Fix:" hint.
5. Finish by showing the overall letter grade and stating who benefits (marketers/IT).

---

## 15) Roadmap (Post‑MVP)

- Provider presets for common email platforms with tailored "Fix:" guidance.
- Bulk checker (CSV upload) with downloadable results.
- Scheduled re‑checks with a summary email.
- Public, shareable report links for each scan.
- Historical snapshots and change comparisons.
- Lightweight analytics: count how often each issue appears.

---

## 16) Risks & Mitigations

- DNS variability and propagation delays → communicate that results reflect current public DNS only; suggest waiting after changes.
- False negatives for DKIM (custom selectors) → make selector list configurable later.
- Over‑strict scoring upsetting some users → keep scoring transparent; provide a short "How scoring works" note.

---

## 17) Metrics (What to Track Later)

- Total checks per day and unique domains scanned.
- Distribution of grades (A–F).
- Most common issues (missing DMARC, SPF without -all, no DKIM selectors).
- Average API latency and error rate.

---

## 18) Repository Structure (Descriptive)

- Root: README (with live link and demo), license, CI config.
- App directory: main page (domain input and results), about page.
- API directory: one route that performs validation, DNS lookups, parsing, scoring, and returns a normalized report.
- Lib directory: helpers for validation, formatting, and parsing.
- Public assets: social preview image for sharing.
- Tests directory: unit and integration tests according to the strategy above.

---

## 19) Task Breakdown & Timeline (One‑Day Sprint)

**Hour 1 — Skeleton & UI**
- Project scaffold with landing page, input, empty result cards, and help modal.

**Hour 2 — API Skeleton & Validation**
- Create the single API endpoint; implement input validation and happy‑path stubs.

**Hour 3 — DNS Integration & Parsing**
- Wire SPF, DMARC, DKIM lookups and turn raw strings into facts and issues.

**Hour 4 — Scoring & UX Polish**
- Apply the scoring heuristic; display pass/warn/fail; add overall grade and concise "Fix:" hints.

**Hour 5 — Edge Cases, Caching, Deploy**
- Handle multi‑record and error cases, add caching headers, deploy on Vercel, run manual QA, and record demo GIF.

---

## 20) Acceptance Criteria (MVP Done)

- Entering a valid public domain returns three section results, an overall grade, and at least one actionable "Fix:" sentence.
- Invalid or non‑resolving domains produce friendly, non‑crashing feedback.
- The app is live on Vercel with a README containing the URL and a short demo clip.
- The UI is responsive and readable on mobile.