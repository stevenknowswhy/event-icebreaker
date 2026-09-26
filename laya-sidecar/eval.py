"""Measured evaluation of the sidecar pipeline over a hand-labeled corpus.

Run:  python eval.py                (uses eval_corpus.json in this directory)
      python eval.py my_corpus.json

Reports shape accuracy and precision curves for the model pass, accuracy of the
eval-validated offer→search 1→2 model read, accuracy of the deterministic code rules
that replaced the demoted dimensions, escalation behavior, and latency.
Writes eval_results.json with per-pair detail. This is a report, not a gate:
it always exits 0 so CI records the numbers instead of hiding them.
"""

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

from app.agent import LayaAgent
from app.compose import MatchInputs, build_dimensions, classify_shape, compose
from app.config import Settings
from app.questions import dimension_questions, interest_candidates, shape_questions
from app.state import pair_state
from app.textmatch import complementarity_code, goal_fit_code, offer_search_code
from app.validation import SharedProfileIn

SHAPE_IDS = ("peer", "collab", "mentor", "investor", "customer", "unclear")


def _offer_hit(answer: dict, expected) -> bool:
    return bool(float(answer["noul"]) >= 0.5) == bool(expected)


def main() -> None:
    corpus_path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "eval_corpus.json")
    corpus = json.loads(corpus_path.read_text())
    pairs = corpus["pairs"]

    agent = LayaAgent(Settings.from_env())
    agent.load_and_warm()

    rows = []
    for pair in pairs:
        sender = SharedProfileIn.model_validate(pair["sender"])
        receiver = SharedProfileIn.model_validate(pair["receiver"])
        expected = pair["expected"]
        candidates = interest_candidates(sender, receiver)

        state = pair_state(sender, receiver)
        dim_questions = dimension_questions(candidates)

        t0 = time.perf_counter()
        shape_result = agent.predict(state, shape_questions())
        dim_result = agent.predict(state, dim_questions)
        latency_ms = (time.perf_counter() - t0) * 1000

        shape_call = classify_shape(shape_result["answers"]["shape"])
        inputs = MatchInputs(
            sender=sender,
            receiver=receiver,
            candidates=candidates,
            shape=shape_call,
            answers=dim_result["answers"],
        )
        dimensions = build_dimensions(inputs)
        dossier = compose(inputs, dimensions, [], "")

        # Both confidence bases captured: `confidence` is entropy-based (uncalibrated,
        # collapses on many-option questions); `answer_confidence` is max-prob — the
        # temperature-calibrated quantity the library documents for gating.
        shape_ans = shape_result["answers"]["shape"]

        # Code-logic predictions for the demoted dimensions, judged against the same labels.
        goal_level, _ = goal_fit_code(sender, receiver)
        code_2_to_1, _ = offer_search_code(receiver.h, sender.q)
        p_1_to_2 = float(dim_result["answers"]["offer_search_1_to_2"]["noul"])
        comp_kind, _ = complementarity_code(
            sender, receiver, code_2_to_1 or p_1_to_2 >= 0.5
        )
        bridge_pick = (
            candidates.shared[0]
            if candidates.shared
            else (candidates.bridge_candidates[0] if candidates.bridge_candidates else None)
        )

        rows.append(
            {
                "id": pair["id"],
                "expected_shape": expected["shape"],
                "got_shape": shape_call.kind,
                "shape_conf": shape_call.confidence,
                "shape_conf_entropy": float(shape_ans.get("confidence", 0.0)),
                "shape_conf_calibrated": float(shape_ans.get("answer_confidence", shape_ans.get("confidence", 0.0))),
                "shape_top1_ok": shape_call.kind == expected["shape"],
                "expected_escalated": pair["expected_escalated"],
                "got_escalated": dossier.escalated,
                "escalation_ok": dossier.escalated == pair["expected_escalated"],
                "score": dossier.score.value,
                "band": dossier.score.band,
                "latency_ms": latency_ms,
                "answers": dim_result["answers"],
                "code_preds": {
                    "goal_fit": goal_level,
                    "offer_search_2_to_1": code_2_to_1,
                    "complementarity": comp_kind,
                    "bridge_pick": bridge_pick,
                },
                "expected": expected,
            }
        )
        print(f"{pair['id']}: shape {shape_call.kind}({shape_call.confidence:.2f}) vs {expected['shape']} · esc {dossier.escalated} vs {pair['expected_escalated']} · {latency_ms:.0f} ms")

    (Path(__file__).parent / "eval_results.json").write_text(json.dumps(rows, indent=2))
    report(rows)


def report(rows: list[dict]) -> None:
    print("\n" + "=" * 68)
    print("EVAL REPORT (measured, this checkpoint, this machine)")
    print("=" * 68)

    # --- shape -------------------------------------------------------------
    shape_rows = [(r["expected_shape"], r["got_shape"], r["shape_conf"]) for r in rows]
    shape_acc = sum(e == g for e, g, _ in shape_rows) / len(shape_rows)
    print(f"\nshape top-1 accuracy: {shape_acc:.0%} over {len(shape_rows)} labeled pairs")
    by_kind: dict[str, list[int]] = {}
    for e, g, _ in shape_rows:
        by_kind.setdefault(e, []).append(int(e == g))
    for kind, hits in sorted(by_kind.items()):
        print(f"  {kind:>10}: {sum(hits)}/{len(hits)}")

    # Confident-answer precision for the shape pass, on both confidence bases.
    for key, label in (("shape_conf_calibrated", "calibrated (max-prob)"), ("shape_conf_entropy", "entropy (uncalibrated)")):
        print(f"  precision curve on {label}:")
        for t in (0.30, 0.40, 0.50, 0.55, 0.60, 0.70, 0.80):
            sel = [(e == g) for e, g, _c, c in [(r["expected_shape"], r["got_shape"], r["shape_conf"], r[key]) for r in rows] if c >= t]
            if sel:
                print(f"    conf>={t:.2f}: precision {sum(sel) / len(sel):.0%} on {len(sel)}/{len(rows)} pairs")

    # --- model dimension reads ----------------------------------------------
    print("\nmodel read (Laya, confidence-gated) — shipped dimensions only:")
    labeled = [
        (r["answers"]["offer_search_1_to_2"], r["expected"]["offer_search_1_to_2"])
        for r in rows
        if "offer_search_1_to_2" in r["expected"]
    ]
    if labeled:
        hits = [_offer_hit(a, e) for a, e in labeled]
        print(f"  {'offer_search_1_to_2':>22}: {sum(hits)}/{len(hits)} = {sum(hits) / len(hits):.0%}")
        curve = [(_offer_hit(a, e), float(a.get("answer_confidence", a.get("confidence", 0.0)))) for a, e in labeled]
        for t in (0.30, 0.40, 0.50, 0.60, 0.70, 0.80):
            sel = [ok for ok, c in curve if c >= t]
            if sel:
                print(f"    conf>={t:.2f}: precision {sum(sel) / len(sel):.0%} on {len(sel)}/{len(curve)}")
    curiosity = [r["answers"].get("curiosity_gap") for r in rows if r["answers"].get("curiosity_gap")]
    if curiosity:
        confs = [float(a.get("answer_confidence", a.get("confidence", 0.0))) for a in curiosity]
        under = sum(c < 0.4 for c in confs)
        print(f"  {'curiosity_gap':>22}: picked on {len(curiosity)}/{len(rows)} pairs, "
              f"{under} under the 0.4 display threshold (no objective labels — personalization only)")

    # --- code logic for the demoted dimensions -------------------------------
    print("\ncode logic (deterministic; complementarity and reverse fit ship, goal_fit is measured but NOT shipped):")
    goal_rows = [(r["code_preds"]["goal_fit"], r["expected"]["goal_fit"]) for r in rows if "goal_fit" in r["expected"]]
    if goal_rows:
        hits = [g == int(e) for g, e in goal_rows]
        print(f"  {'goal_fit (code, NOT shipped)':>30}: {sum(hits)}/{len(hits)} = {sum(hits) / len(hits):.0%}")
    rev_rows = [
        (r["code_preds"]["offer_search_2_to_1"], r["expected"]["offer_search_2_to_1"])
        for r in rows if "offer_search_2_to_1" in r["expected"]
    ]
    if rev_rows:
        hits = [g == bool(e) for g, e in rev_rows]
        print(f"  {'offer_2_to_1 (code)':>22}: {sum(hits)}/{len(hits)} = {sum(hits) / len(hits):.0%}")
    comp_rows = [
        (r["code_preds"]["complementarity"], r["expected"]["complementarity"])
        for r in rows if "complementarity" in r["expected"]
    ]
    if comp_rows:
        hits = [g == e for g, e in comp_rows]
        print(f"  {'complementarity (code)':>22}: {sum(hits)}/{len(hits)} = {sum(hits) / len(hits):.0%}")
    bridge_rows = [
        (r["code_preds"]["bridge_pick"], r["expected"]["shared_interest"])
        for r in rows if "shared_interest" in r["expected"] and r["code_preds"]["bridge_pick"]
    ]
    if bridge_rows:
        hits = [(g or "").casefold() == str(e).casefold() for g, e in bridge_rows]
        print(f"  {'bridge pick (code)':>22}: {sum(hits)}/{len(hits)} = {sum(hits) / len(hits):.0%}")

    # --- escalation ------------------------------------------------------------
    clear = [r for r in rows if not r["expected_escalated"]]
    ambiguous = [r for r in rows if r["expected_escalated"]]
    esc_clear = sum(r["got_escalated"] for r in clear) / len(clear) if clear else 0.0
    esc_amb = sum(r["got_escalated"] for r in ambiguous) / len(ambiguous) if ambiguous else 0.0
    esc_ok = sum(r["escalation_ok"] for r in rows) / len(rows)
    print(f"\nescalation: escalated {sum(r['got_escalated'] for r in clear)}/{len(clear)} clear pairs "
          f"({esc_clear:.0%}) and {sum(r['got_escalated'] for r in ambiguous)}/{len(ambiguous)} ambiguous pairs "
          f"({esc_amb:.0%}); exact match {esc_ok:.0%}")

    # --- score bands -------------------------------------------------------------
    bands: dict[str, int] = {}
    for r in rows:
        bands[r["band"]] = bands.get(r["band"], 0) + 1
    print("score bands: " + ", ".join(f"{b} {n}" for b, n in sorted(bands.items())))

    # --- latency ----------------------------------------------------------------
    latencies = sorted(r["latency_ms"] for r in rows)
    print(f"\nlatency (shape pass + dimension pass, both profiles): mean {statistics.mean(latencies):.0f} ms, "
          f"p50 {latencies[len(latencies) // 2]:.0f} ms, max {latencies[-1]:.0f} ms")


if __name__ == "__main__":
    main()
