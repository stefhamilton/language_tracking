# Tutor Interchange Format — v1

Structured JSON schema for bi-directional data exchange between the Hiligaynon
SLA Mastery Dashboard and an AI tutor agent.

---

## Overview

Two payloads replace the current freeform text prompt:

| Direction | Payload | Trigger |
|-----------|---------|---------|
| Dashboard → Tutor | **Session Context** | User clicks "Copy Session Context" |
| Tutor → Dashboard | **Learning Results** | Tutor outputs at end of session; user pastes into "Sync from Tutor" |

Both use the same top-level envelope so parsers can distinguish them by the
presence of their respective keys.

---

## 1. Envelope

```json
{
  "format": "hiligaynon-tutor-interchange",
  "version": "1.0",
  "generated_at": "2026-08-09T10:30:00+08:00",
  "direction": "context" | "results",
  "payload": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `format` | string (constant) | Always `"hiligaynon-tutor-interchange"` — lets either side validate it received the right blob. |
| `version` | string (semver) | Schema version. Consumers must reject major-version mismatches. |
| `generated_at` | ISO 8601 datetime | When this payload was produced. |
| `direction` | `"context"` or `"results"` | Whether this is going *to* the tutor or coming *back from* the tutor. |
| `payload` | object | Direction-specific body (§2 or §3). |

---

## 2. Session Context (Dashboard → Tutor)

Exported when the user starts a tutor session. Gives the tutor everything it
needs to pick up where the learner left off.

```json
{
  "format": "hiligaynon-tutor-interchange",
  "version": "1.0",
  "generated_at": "2026-08-09T10:30:00+08:00",
  "direction": "context",
  "payload": {
    "learner_profile": {
      "location": "Sapi-an, Capiz",
      "context": "Farm environment",
      "target_language": "Hiligaynon (Capiznon variant)"
    },
    "srs_policy": {
      "target_retention_rate": 0.88,
      "interval_sequence_days": [1, 2, 4, 7, 12, 20]
    },
    "current_phase": {
      "id": 1,
      "name": "Phase 1: Core Survival & Location",
      "focus": "Navigate the immediate environment, point to things, ask basic questions, and declare what exists or is missing.",
      "status": "In Progress"
    },
    "all_phases": [
      { "id": 1, "name": "Phase 1: Core Survival & Location", "status": "In Progress" },
      { "id": 2, "name": "Phase 2: Daily Farm Operations & Verb Focus", "status": "Not Started" }
    ],
    "concepts": [
      {
        "id": 3,
        "phase": 1,
        "name": "Spatial Pointing (ari vs. diri)",
        "description": "The difference between diri (here near me), dira (there near you), and didto (far away).",
        "mastered": false,
        "bloom_level": "Level 1: Remembering",
        "srs_state": {
          "current_step_index": 1,
          "consecutive_first_try_passes": 2,
          "total_reviews": 3,
          "first_try_failures": 1,
          "last_reviewed": "2026-08-09T10:25:00Z",
          "next_review_due": "2026-08-11T10:25:00Z"
        }
      }
    ],
    "vocab": [
      {
        "hil": "diri",
        "eng": "here",
        "cat": "Pointers (Location)",
        "phase": 1,
        "mastered": true,
        "times_correct": 5,
        "times_missed": 1,
        "last_reviewed": "2026-08-09T09:00:00Z"
      }
    ],
    "recent_session_log": [
      {
        "timestamp": "2026-08-09T09:15:00Z",
        "type": "drill",
        "detail": "here -> diri (correct)",
        "latency_seconds": 1.1
      }
    ],
    "session_stats": {
      "today_field_output_count": 4,
      "avg_latency_seconds": 2.3,
      "vocab_mastered_count": 22,
      "vocab_total_count": 105
    }
  }
}
```

### 2.1 Field reference

#### `learner_profile`

| Field | Type | Description |
|-------|------|-------------|
| `location` | string | Physical location — used by tutor for contextual examples. |
| `context` | string | Dominant real-world domain for vocabulary selection. |
| `target_language` | string | Target language and dialect. |

#### `srs_policy`

Communicates the learner's SRS settings so the tutor can schedule reviews
consistently.

| Field | Type | Description |
|-------|------|-------------|
| `target_retention_rate` | number (0–1) | Desired long-term retention probability. |
| `interval_sequence_days` | number[] | Fixed interval ladder. Step index advances on consecutive first-try passes; resets to 0 on failure. |

#### `current_phase`

The active phase the learner is working through.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Phase ID (matches Stages sheet). |
| `name` | string | Human-readable phase title. |
| `focus` | string | What this phase aims to achieve. |
| `status` | enum | `"Not Started"`, `"In Progress"`, or `"Done"`. |

#### `concepts[]`

Full list of concepts, or at minimum all concepts in the current phase. Each
entry carries its SRS scheduling state so the tutor knows *when* and *how hard*
to drill it.

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Concept ID. |
| `phase` | number | Which phase this belongs to. |
| `name` | string | Short concept label. |
| `description` | string | One-line explanation. |
| `mastered` | boolean | True once bloom_level ≥ 3 (Applying). |
| `bloom_level` | string | Current Bloom's Taxonomy level label (e.g. `"Level 3: Applying"`). |
| `srs_state` | object | Scheduling state (see below). |

##### `srs_state`

| Field | Type | Description |
|-------|------|-------------|
| `current_step_index` | number | Position in `interval_sequence_days`. |
| `consecutive_first_try_passes` | number | Streak of reviews where the first attempt passed. |
| `total_reviews` | number | Lifetime review count. |
| `first_try_failures` | number | Lifetime count of reviews where first attempt failed. |
| `last_reviewed` | ISO 8601 | When concept was last reviewed. |
| `next_review_due` | ISO 8601 | When the next review is scheduled. Dashboard computes this as `last_reviewed + interval_sequence_days[current_step_index]` days. |

#### `vocab[]`

Vocabulary items. Sent filtered to the current phase by default; the full deck
may be included when the tutor needs cross-phase context.

| Field | Type | Description |
|-------|------|-------------|
| `hil` | string | Hiligaynon word/phrase (canonical spelling). |
| `eng` | string | English gloss. |
| `cat` | string | Category tag. |
| `phase` | number | Curriculum phase this word belongs to. |
| `mastered` | boolean | Currently remembered. |
| `times_correct` | number | Lifetime correct count. |
| `times_missed` | number | Lifetime miss count. |
| `last_reviewed` | ISO 8601 or null | Last review timestamp. |

#### `recent_session_log[]`

Last N log entries (drills and field use). Gives the tutor recency context.

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO 8601 | When the event occurred. |
| `type` | `"drill"` or `"field"` | Event type. |
| `detail` | string | Human-readable description. |
| `latency_seconds` | number or null | Production latency (drills only). |

#### `session_stats`

Aggregate numbers for the dashboard at export time.

| Field | Type | Description |
|-------|------|-------------|
| `today_field_output_count` | number | Field-use phrases logged today. |
| `avg_latency_seconds` | number or null | Mean production latency across recent drills. |
| `vocab_mastered_count` | number | Total vocab items currently marked mastered. |
| `vocab_total_count` | number | Total vocab items in the deck. |

---

## 3. Learning Results (Tutor → Dashboard)

Produced by the tutor at session end. Reports what happened during the session
so the dashboard can update SRS state, Bloom levels, and mastery flags.

```json
{
  "format": "hiligaynon-tutor-interchange",
  "version": "1.0",
  "generated_at": "2026-08-09T11:45:00+08:00",
  "direction": "results",
  "payload": {
    "session_summary": {
      "started_at": "2026-08-09T10:30:00+08:00",
      "ended_at": "2026-08-09T11:45:00+08:00",
      "concepts_drilled": 3,
      "vocab_items_tested": 12,
      "notes": "Focused on spatial pointing. Learner struggles with ari vs diri distinction under speed."
    },
    "concept_results": [
      {
        "name": "Spatial Pointing (ari vs. diri)",
        "bloom_level_before": "Level 1: Remembering",
        "bloom_level_after": "Level 3: Applying",
        "mastered": true,
        "review": {
          "date": "2026-08-09",
          "first_attempt_passed": true,
          "final_attempt_passed": true,
          "latency_seconds": 1.1
        }
      }
    ],
    "vocab_results": [
      {
        "hil": "diri",
        "tested": true,
        "passed": true,
        "latency_seconds": 0.9
      },
      {
        "hil": "dira",
        "tested": true,
        "passed": false,
        "latency_seconds": 5.2
      }
    ],
    "srs_updates": [
      {
        "concept": "Spatial Pointing (ari vs. diri)",
        "previous_step_index": 1,
        "new_step_index": 2,
        "consecutive_first_try_passes": 3,
        "next_review_due": "2026-08-13T10:25:00Z"
      }
    ],
    "new_vocab_discovered": [
      {
        "hil": "punta",
        "eng": "go (colloquial)",
        "cat": "Movement Verbs",
        "phase": 2,
        "source": "Learner used in conversation"
      }
    ],
    "phase_recommendation": {
      "advance": false,
      "reason": "2 of 4 Phase 1 concepts still below Level 3."
    }
  }
}
```

### 3.1 Field reference

#### `session_summary`

| Field | Type | Description |
|-------|------|-------------|
| `started_at` | ISO 8601 | Session start time. |
| `ended_at` | ISO 8601 | Session end time. |
| `concepts_drilled` | number | How many concepts were actively tested. |
| `vocab_items_tested` | number | How many vocab items were tested. |
| `notes` | string | Free-text tutor observations for the learner. |

#### `concept_results[]`

One entry per concept that was reviewed or assessed during the session.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Concept name (must match a `concepts[].name` from the context payload). |
| `bloom_level_before` | string | Bloom level at session start (from context). |
| `bloom_level_after` | string | Bloom level assessed by tutor at session end. |
| `mastered` | boolean | True if `bloom_level_after` is Level 3 or above. |
| `review` | object | The review event for this concept (see below). |

##### `review`

| Field | Type | Description |
|-------|------|-------------|
| `date` | ISO 8601 date (`YYYY-MM-DD`) | Date of the review. |
| `first_attempt_passed` | boolean | Did the learner get it right on the first try? |
| `final_attempt_passed` | boolean | Did the learner eventually get it right (after hints/retries)? |
| `latency_seconds` | number or null | Time to produce the answer on first attempt. |

#### `vocab_results[]`

Per-word outcomes. Only words actually tested in the session are listed.

| Field | Type | Description |
|-------|------|-------------|
| `hil` | string | Hiligaynon word (canonical spelling, must match `vocab[].hil`). |
| `tested` | boolean | Always `true` (included for forward-compat if we want "observed but not tested"). |
| `passed` | boolean | Did the learner recall/produce this word correctly? |
| `latency_seconds` | number or null | Production latency. |

#### `srs_updates[]`

Computed SRS state transitions. The dashboard applies these directly — it
should not need to recompute scheduling.

| Field | Type | Description |
|-------|------|-------------|
| `concept` | string | Concept name. |
| `previous_step_index` | number | Step index before this session. |
| `new_step_index` | number | Step index after this session. On first-try pass: `min(prev + 1, max_index)`. On first-try fail: `0`. |
| `consecutive_first_try_passes` | number | Updated streak count. |
| `next_review_due` | ISO 8601 | Computed next review date. |

**SRS advancement rules (for the tutor to follow):**

1. **First-try pass** → increment `current_step_index` (capped at end of
   `interval_sequence_days`), increment `consecutive_first_try_passes`.
2. **First-try fail, final pass** → reset `current_step_index` to `0`, reset
   `consecutive_first_try_passes` to `0`. The concept stays in rotation.
3. **First-try fail, final fail** → same as (2), but tutor should flag the
   concept in `session_summary.notes`.
4. Next review due = `review.date + interval_sequence_days[new_step_index]` days.

#### `new_vocab_discovered[]`

Words the learner used or encountered during the session that aren't in the
current deck. Dashboard can offer to add them.

| Field | Type | Description |
|-------|------|-------------|
| `hil` | string | New Hiligaynon word. |
| `eng` | string | English gloss. |
| `cat` | string | Suggested category. |
| `phase` | number | Suggested phase. |
| `source` | string | Where it came from (e.g. "Learner used in conversation", "Tutor introduced"). |

#### `phase_recommendation`

| Field | Type | Description |
|-------|------|-------------|
| `advance` | boolean | Whether the tutor recommends moving to the next phase. |
| `reason` | string | Justification. |

---

## 4. SRS Policy Details

The `srs_policy` block is part of the context payload. It tells the tutor:

- **`target_retention_rate`** (0.88 = aim for 88% recall) — used by the tutor
  to judge whether a concept is "good enough" to advance, or needs extra reps.
- **`interval_sequence_days`** (`[1, 2, 4, 7, 12, 20]`) — fixed ladder. The
  step index determines days until next review.

### Step advancement logic

```
if first_attempt_passed:
    new_step = min(current_step + 1, len(intervals) - 1)
    consecutive_passes += 1
else:
    new_step = 0
    consecutive_passes = 0

next_review = today + intervals[new_step]
```

A concept is considered **graduated** (fully retained) when:
- `current_step_index == len(intervals) - 1` AND
- `consecutive_first_try_passes >= len(intervals)`

Graduated concepts are still included in the context but marked with
`mastered: true`. The tutor may spot-check them at lower frequency.

---

## 5. Integration Notes

### Dashboard changes needed

1. **Export**: Replace the freeform `promptText` in `updateDashboard()` with
   `JSON.stringify(contextPayload, null, 2)`.
2. **Import**: Extend `importTutorState()` to parse the `results` envelope,
   applying `concept_results`, `vocab_results`, and `srs_updates` to local
   state and syncing to the Apps Script backend.
3. **Storage**: Add `srs_state` columns to the Concepts sheet (`currentStepIndex`,
   `consecutivePasses`, `totalReviews`, `firstTryFailures`, `nextReviewDue`).
4. **New Vocab**: Surface `new_vocab_discovered` entries as a confirmation
   prompt before adding to the Vocab sheet.

### Tutor system prompt

The tutor's system prompt should include:
- The full schema definition (or a link to this spec).
- Instructions to output the Learning Results JSON as a fenced code block
  tagged `json` at the end of every session.
- The SRS advancement rules from §4.

### Backward compatibility

During migration, the dashboard should accept both:
- The legacy freeform text block (detected by absence of `"format"` key).
- The new JSON envelope (detected by `format === "hiligaynon-tutor-interchange"`).

---

## 6. Example: Full Round-Trip

### Step 1 — User copies context (dashboard → clipboard)

The dashboard produces the §2 payload and copies it.

### Step 2 — User pastes into tutor chat

The tutor parses it, conducts the lesson, then at session end outputs:

```
Here's your session update — paste this into the Sync from Tutor box:
```

Followed by the §3 payload as a JSON code block.

### Step 3 — User pastes results back (tutor → dashboard)

The dashboard's import function:
1. Detects the `"format"` key → structured mode.
2. Applies `concept_results` → updates Bloom levels and mastery.
3. Applies `vocab_results` → updates per-word mastery/counters.
4. Applies `srs_updates` → updates scheduling columns.
5. Offers to add `new_vocab_discovered` entries.
6. Shows `phase_recommendation` as a banner.
