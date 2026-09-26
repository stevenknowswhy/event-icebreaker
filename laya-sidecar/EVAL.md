# Measured evaluation of the Laya sidecar

This is the report the approved spec's "Laya's judgments carry real signal" row asks
for. Every number below was measured on this machine (sandbox CPU, no GPU) against
the real `convaiinnovations/laya` checkpoint (English root model, launch default per
the spec), over a hand-labeled corpus of **45 realistic event profile pairs**
(`eval_corpus.json`). Reproduce with:

```bash
source .venv/bin/activate   # or any venv with requirements-dev.txt installed
HF_HUB_OFFLINE=1 python eval.py            # writes eval_results.json (per-pair detail)
pytest -q                                  # unit + contract tests
```

The harness always exits 0 — it is a report, not a gate.

## What shipped, and why

The eval drove the pipeline through several demotion rounds. Final state:

| Judgment | Decided by | Measured accuracy | Status |
|---|---|---|---|
| Offer→search fit, 1→2 | **Laya** (one batched pass) | **31/31 = 100%**, precision 100% at every confidence level ≥0.30 | Shipped model read |
| Relationship shape | **Laya** (one forward pass) | top-1 47% overall; precision **100% at calibrated confidence ≥0.60** (5/45), 86–88% in the 0.40–0.60 band | Shipped, strictly gated |
| Curiosity gap pick | **Laya** (same batched pass) | no objective labels (personalization); calibrated confidence <0.4 on 1/45 | Shipped, display-only, unweighted |
| Bridge interest | **Code** (exact set intersection) | pick 16/18 = 89% | Shipped code rule |
| Offer→search fit, 2→1 | **Code** (shared-content-word rule) | 22/32 = 69% | Shipped code rule |
| Skill complementarity | **Code** (overlap + fit rule) | 24/36 = 67% | Shipped code rule |
| Goal fit | model 34–37% → code 5/35 = **14%** | worse than the model it replaced | **Not shipped** — no weight, no chip |
| Stage gap | model 0% (0/5 labeled) | no code rule can derive it | **Not shipped** (round 1) |
| Shared-interest pick | model 44% | exact set intersection in code | Replaced by code (89%) |

## Demotion journey

**Round 0 — original brief thresholds (route 0.6 / escalate 0.55) on the entropy
confidence, all six dimensions model-scored.** Shape top-1 47%; goal fit 34%;
complementarity 67%; offer→search 1→2 84%; 2→1 31%; stage gap 0%; shared-interest
pick 44%. All 38 expected-clear pairs escalated. Nothing was shippable unchanged.

**Round 1 — rephrased questions (2–3 phrasings per the brief's guidance).**
Offer→search 1→2 rose 84% → **100%**; everything else held: goal fit 34%,
complementarity 67%, 2→1 31%, stage gap 0% (0/5), shared-interest 44%. Consequence:
the 1→2 read ships as a model read; the rest were demoted to deterministic code rules
or cut. A pipe-delimited vs prose state format A/B (7 pairs) was mixed and was not
adopted — the original pipe format stayed rather than overfit a small sample.

**Round 2 — code rules measured against the same labels.** Bridge 89%, reverse
offer→search 69%, complementarity 67%, goal fit **14%**. Goal alignment is semantic,
not lexical: neither Laya (34%) nor a token rule (14%) reads it from short profile
text, so goal fit carries no score weight and renders no chip — the looking-for lines
surface only as evidence inside the offer→search chip. (This is the spec's "demote
to code logic" path terminating honestly: when the code rule is also below threshold,
the dimension does not ship at all.)

**Round 3 — the confidence-basis fix.** Escalation still fired on 35/38 clear pairs.
Root cause, from the library's own source: the answer field the pipeline gated on
(`confidence`, normalized entropy) is *not calibrated* — the checkpoint's temperature
scaling fits `answer_confidence` (max-probability) instead, "of the answers returned
at confidence c, about c of them are right." Measured precision curves (45 pairs):

| Calibrated (max-prob) threshold | Shape precision | Coverage |
|---|---|---|
| ≥ 0.30 | 61% | 28/45 |
| ≥ 0.40 | 72% | 18/45 |
| ≥ 0.50 | 88% | 8/45 |
| **≥ 0.60 (shipped route)** | **100%** | **5/45** |

Entropy-based thresholds measured 100% precision only at ≥0.30 with 1/45 at ≥0.40 —
the entropy number collapses on six-option questions and is unusable for gating.

## Shipped thresholds (all on the calibrated confidence)

- **Shape:** route (assert the kind, no flag) at **≥ 0.60** — the spec's product
  default, now on the scale it was meant for, where it measures 100% precision.
  0.40–0.60: the kind is named but the dossier is flagged `escalated: true`.
  < 0.40: demoted to `unclear` (measured 61–72% — too soft to assert).
- **Offer→search (1→2) dimension:** 0.5 (calibrated confidences cluster ≥ 0.8; the
  read was 31/31).
- **Curiosity gap:** 0.4 display threshold (1/45 under on the calibrated scale).
- **Escalation:** ≥ 2 dimensions under threshold, or an unclear shape — per the
  spec's locked "cascade over false confidence" decision.

## Honest costs, stated plainly

- **Shape top-1 accuracy is 47%.** The strict route threshold keeps every *asserted*
  shape right (100% at ≥0.60), but coverage is thin: only 5/45 eval pairs route
  clean, so most pairs ride the flagged or escalated state. That is the measured
  trade the spec locked in ("cascade over false confidence"): the client's escalated
  state renders the full local estimate, evidence and the sharper-read offer instead
  of asserting. Reversal condition: a recalibrated checkpoint (the load warning below)
  or richer profiles — re-measure, then lower the route line.
- **Per-kind shape accuracy** on this corpus: investor 7/9, mentor 4/5, unclear 5/7,
  peer 4/8, collab 1/7, customer 0/9. Cross-domain customer/collab distinctions are
  where the checkpoint is weakest — exactly the ordinal/nuanced band the integration
  brief predicted (35–65%).
- **Latency:** mean 981 ms, p50 1004 ms, max 1211 ms per request (shape pass +
  dimension pass, both profiles) on this sandbox CPU. That is 30–50× the brief's
  20–35 ms laptop-class reference and leaves thin margin under the client's 2.5 s
  abort. Deployment must be an always-on warm container — see DEPLOY.md — and the
  client timeout is the first thing to revisit if p95 grows.
- **Checkpoint caveat:** loading logs that one temperature was outside its valid
  range and was clamped — the checkpoint's own calibration warning. Calibration
  figures here are therefore from the shipped artifact as-is.

## Corpus

45 hand-authored pairs (`eval_corpus.json`): 5 each of investor, peer, collab,
mentor, customer; 10 deliberately ambiguous; 10 mixed-shape. 7 pairs are labeled
`expected_escalated: true`. Labels are present only where the expected answer is
defensible from the profile text (shape on all 45; goal_fit 35; complementarity 36;
offer→search 1→2 31, 2→1 32; shared interest 18; stage gap 5 — the stage-gap labels
existed only to prove the question's 0%).

## What the eval cannot tell you

The curiosity-gap pick has no objective labels — it is personalization, judged by
feel in the demo, and never contributes to the score. The code rules are
deterministic; their measured percentages describe agreement with human labels, not
variance between runs — the same profiles always produce the same dossier.
