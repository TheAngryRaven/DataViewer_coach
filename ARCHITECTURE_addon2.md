# Architecture Addendum B — The Coaching Stage: AI as a Paid Second Stage & Setup Advice

Companion to `ARCHITECTURE.md` for `@theangryraven/eye-in-the-sky`. Read after §8
(the coaching layer). This expands the "Stage 2" idea introduced in §1/§3: what the
model is *for*, why setup configuration is its flagship job, and the
commercial/execution shape that makes it a paid feature.

> Status: design / direction, same caveat as the parent. Type sketches are
> illustrative, not committed. This describes phases 4–5 of §9.

## B.1 The two stages, and why they're split

The system is two layers with a hard boundary between them:

- **Stage 1 — analysis core. Deterministic, local, free.** All telemetry math
  (§4–§7): ingest, distance model, segmentation, metrics, deltas, consistency,
  technique evaluators. Runs in the plugin, no model, no network. The Labs panel is
  already a Stage-1 surface. This is where the heavy math lives.
- **Stage 2 — AI coach. A model, behind a subscription, on a provider-funded
  backend.** It consumes Stage-1's structured outputs (and setup metadata) and does
  the *qualitative* work the math can't.

The split is deliberate, not incidental:

1. **The model is bad at the math and good at the judgement.** Time deltas, apex
   location, V-Min — deterministic, reproducible, and trust-critical (§3.1). Setup
   cause-and-effect — qualitative, combinatorial, knowledge-heavy. Put each where
   it belongs.
2. **It draws the paywall cleanly.** Everything a model isn't needed for is free and
   works offline; the model-powered features are the paid tier. No model call is on
   the critical path of basic analysis.
3. **It bounds cost.** Inference only runs for Stage-2 features, on demand, cached.

## B.2 What the model touches — and what it must not

- **Never** raw telemetry arrays, and **never** a derived number it wasn't handed.
  It does not locate apexes, compute deltas, or estimate time loss (§3.1, addon A.8).
- **It reasons over** Stage-1's structured insights (`{ corner, timeLost, rootCause,
  … }`), the consistency/technique findings, and **setup metadata** — plus baked-in
  karting domain knowledge.
- **Telemetry-coaching prose is optional.** Because Stage-1 insights are already
  structured, the per-corner debrief can be rendered by templates with no model
  (Stage 1). The AI is an *upgrade* there (better clustering, prioritization, tone),
  not a requirement — which is the honest answer to "what can the model actually
  manage?": keep it off the numbers, let it phrase and reason.

## B.3 The flagship: setup-configuration advice

This is the use that justifies the AI tier. Karting setup tuning is qualitative,
combinatorial, and rich in folk/engineering knowledge — and crucially it's about
**cause and effect between a change you made and how the kart then behaved**, which
is precisely model-shaped reasoning over structured deltas.

**The unit of work is an A/B comparison:** `(setupA, logA)` vs `(setupB, logB)`.
Stage 1 turns each log into per-corner metrics; the model is handed the **setup
delta** (what changed between A and B) alongside the **telemetry delta** (what
changed in the resulting behaviour) and asked: what did this change do, and what
should we try next?

```ts
// Illustrative.
interface SetupRun {
  setup: KartSetup;            // the config for this run (B.3.1)
  metrics: SessionMetrics;     // Stage-1 output for the run's log
}
interface SetupComparison {
  a: SetupRun;
  b: SetupRun;
  setupDelta: SetupChange[];   // e.g. [{ field: "rearAxle", from: "medium", to: "soft" }]
  metricDelta: CornerMetricDelta[]; // Stage-1 per-corner deltas, A → B
}
```

### B.3.1 The setup-data dimension (new)

Stage 2 introduces data Stage 1 never needed: the kart's configuration per run.
For karts this is things like — tyre pressures (hot/cold), rear axle stiffness, hub
length, rear track width, front track/Ackermann, caster/camber, ride height, seat
position/stiffness, torsion bars, and gearing (sprocket teeth). The exact schema is
class-dependent (an open question, B.7). It is **user-entered metadata**, not
sensor data — which is why it carries no telemetry-confidence concerns but does
carry data-entry-quality ones.

### B.3.2 Why this is genuinely the model's job

- **Combinatorial knowledge.** "Softer rear axle → more mid-corner grip but more
  exit slide; effect depends on tyre pressure and track grip" is exactly the kind of
  conditional, multi-factor domain reasoning a model holds and code would need a
  hand-built expert system to fake.
- **Grounded by the A/B deltas.** The advice isn't free-floating folklore: it's
  anchored to *this driver's measured response* to *this change* (the metricDelta),
  so the model explains the observed effect, not a generic one.
- **One change at a time.** Good setup practice is single-variable changes measured
  against a baseline. The model should encourage that, use the single-variable A/B as
  its cleanest signal, and **flag confounding** when more than one thing changed.

## B.4 Grounding the setup advice

Same discipline as §8, applied to setup:

- The model may cite only the setup fields the user entered and the metric deltas
  Stage 1 produced. It never invents a telemetry number to justify a setup claim.
- When the A/B is confounded (multiple changes) or the metric delta is within noise
  (cross with the consistency layer, §7.2), it says so and stays conservative rather
  than over-attributing.
- **Claude API shape:** structured output so each recommendation traces to a
  `(setupDelta, metricDelta)` pair; tool-use to fetch specific metrics on demand;
  **prompt caching** on the static karting setup knowledge + the per-class setup
  schema + coaching rules, with the volatile per-comparison data after the prefix.

## B.5 Execution & commercial model

Decisions (recorded so ARCHITECTURE.md §10 can drop these as open risks):

- **Provider pays inference; users subscribe to the AI tier.** Stage 1 is free and
  local. Stage 2 features are gated by an entitlement.
- **Backend service, keys server-side.** A plugin runs in the host's client; it
  cannot hold the model API key or call the provider directly without leaking it.
  Stage-2 requests go to a provider-run backend that holds the key, checks the
  subscription, calls the model, and returns structured results.
- **Cache results.** Coaching/setup output is cached per `(inputs)` so re-opening a
  panel or re-rendering doesn't re-bill. Inference runs on explicit user action
  ("analyze", "compare setups"), not on every render.
- **Cost unit.** Roughly one model call per debrief or per A/B comparison, over a
  few dozen numbers — small and cacheable, not per-telemetry-sample.

The plugin's Stage-2 surface is therefore: gather Stage-1 metrics + setup → POST to
the backend → render the structured response. No model logic ships in the package.

## B.6 Non-goals / guardrails

- The model never does Stage-1 math (§3.1). If a number isn't in the structured
  input, it isn't said.
- No setup advice without a measured basis: recommendations are anchored to A/B
  metric deltas (or explicitly flagged as general guidance when no comparison
  exists — see cold-start, B.7).
- No model on the critical path of free analysis; Stage 1 must stand alone.
- Keep it primitive (§3.5): setup capture is metadata entry + a comparison builder;
  the AI call is one backend request with a structured contract. No agent framework,
  no fine-tuning, until a phase needs it.

## B.7 Open questions

- **Setup data capture & schema.** Where does setup come from — a manual entry form
  in the host? A per-class schema (the field set differs by kart class)? Defaults
  and units?
- **Cold start.** First run has no A/B to compare. Does the model give general,
  clearly-labelled setup guidance, or stay silent until a second run exists?
- **How many runs for a trend.** A/B is the unit; multi-run setup trends (a tuning
  session's worth) are a richer but later target.
- **Validating setup advice.** Same problem as telemetry coaching (§10): how do we
  know a recommendation is right? Track whether following it improved the next run.
- **Subscription/entitlement mechanics** and backend hosting — out of scope for this
  package, but the contract it calls must be defined.

## B.8 Prior art worth pinning (open)

- Karting setup guides (class-specific tuning matrices: axle/hub/pressure/track-width
  effects) — the domain knowledge the model reasons with; worth grounding against
  reputable sources before trusting baked-in priors.
- How commercial coaches handle setup vs driving (most sim coaches focus on driving;
  setup-from-telemetry advice is a thinner, more differentiated space — part of why
  it's the flagship here).
