#!/usr/bin/env python3
"""
Week 4 Baseline Evaluation Script
--------------------------------
Evaluates retrieval/citation/faithfulness quality and adaptive-style behavior.

Usage:
  python scripts/week4_eval.py --book-id <id> --token <token>
  python scripts/week4_eval.py --book-id <id> --token <token> --api-url http://localhost:8000 --output-json backend/tests/data/week4_eval_report.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Optional

import requests


@dataclass
class EvalRow:
    case_id: str
    question: str
    success: bool
    error: Optional[str] = None
    confidence: float = 0.0
    insufficient_evidence: bool = False
    citations_count: int = 0
    citations_expected: int = 1
    citation_correctness_proxy: float = 0.0
    faithfulness_proxy_pass: bool = False


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_]+", (text or "").lower()))


def _request_json(method: str, url: str, token: str, payload: Optional[dict] = None) -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if method.upper() == "GET":
        resp = requests.get(url, headers=headers, timeout=30)
    else:
        resp = requests.post(url, headers=headers, json=payload or {}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _citation_correctness_proxy(question: str, citations: list[dict]) -> float:
    """
    Lightweight proxy for citation quality:
    - citation has quote
    - citation has a structural anchor (page or section_path)
    - citation shares at least one token with question
    """
    if not citations:
        return 0.0

    q_tokens = _tokenize(question)
    scored = 0
    for c in citations:
        quote = (c.get("quote") or "").strip()
        has_quote = len(quote) > 10
        has_anchor = c.get("page") is not None or bool(c.get("section_path"))
        overlap = len(_tokenize(quote).intersection(q_tokens)) > 0
        if has_quote and has_anchor and overlap:
            scored += 1
    return scored / len(citations)


def _faithfulness_proxy(answer: str, citations_count: int, confidence: float, insufficient_evidence: bool) -> bool:
    answer_low = (answer or "").lower()

    if insufficient_evidence:
        return "don't have enough" in answer_low or "not enough" in answer_low or confidence < 0.5

    # If model claims enough evidence, it should provide at least one citation and non-trivial confidence.
    return citations_count > 0 and confidence >= 0.3


def evaluate_case(api_url: str, token: str, book_id: int, case: dict) -> EvalRow:
    case_id = case["id"]
    question = case["question"]
    expected_citations = int(case.get("expected_citation_count", 1))

    row = EvalRow(
        case_id=case_id,
        question=question,
        success=False,
        citations_expected=expected_citations,
    )

    try:
        payload = {"question": question, "top_k": 5}
        res = _request_json("POST", f"{api_url}/api/books/{book_id}/qa", token, payload)

        citations = res.get("citations", []) or []
        row.confidence = float(res.get("confidence", 0.0) or 0.0)
        row.insufficient_evidence = bool(res.get("insufficient_evidence", False))
        row.citations_count = len(citations)
        row.citation_correctness_proxy = _citation_correctness_proxy(question, citations)
        row.faithfulness_proxy_pass = _faithfulness_proxy(
            answer=res.get("answer", ""),
            citations_count=row.citations_count,
            confidence=row.confidence,
            insufficient_evidence=row.insufficient_evidence,
        )
        row.success = True
    except Exception as exc:
        row.error = str(exc)

    return row


def evaluate_adaptive_style(api_url: str, token: str, book_id: int, questions: list[str]) -> dict:
    """
    Basic adaptive-style check:
    - set profile to beginner, ask same question
    - set profile to expert, ask same question
    - compare average sentence length as a rough style signal
    """

    def set_level_put(level: str) -> None:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        r = requests.put(
            f"{api_url}/api/personalization/profile",
            headers=headers,
            json={"explanation_level": level},
            timeout=30,
        )
        r.raise_for_status()

    def ask(question: str) -> dict:
        return _request_json(
            "POST",
            f"{api_url}/api/books/{book_id}/qa",
            token,
            {"question": question, "top_k": 5},
        )

    def avg_sentence_len(text: str) -> float:
        parts = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
        if not parts:
            return 0.0
        return mean(len(p.split()) for p in parts)

    try:
        style_probe_used = None
        beginner_len = 0.0
        expert_len = 0.0

        for q in questions:
            set_level_put("beginner")
            beginner_res = ask(q)
            if beginner_res.get("insufficient_evidence", False):
                continue

            set_level_put("expert")
            expert_res = ask(q)
            if expert_res.get("insufficient_evidence", False):
                continue

            beginner_answer = beginner_res.get("answer", "")
            expert_answer = expert_res.get("answer", "")
            beginner_len = avg_sentence_len(beginner_answer)
            expert_len = avg_sentence_len(expert_answer)
            style_probe_used = q
            break

        if style_probe_used is None:
            return {
                "success": False,
                "error": "No style probe question with sufficient evidence",
                "style_shift_detected": False,
            }

        return {
            "success": True,
            "style_probe_question": style_probe_used,
            "beginner_avg_sentence_len": round(beginner_len, 2),
            "expert_avg_sentence_len": round(expert_len, 2),
            "style_shift_detected": (expert_len - beginner_len) >= 1.0,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
            "style_shift_detected": False,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Week 4 baseline evaluation")
    parser.add_argument("--book-id", type=int, required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--dataset", default="tests/data/week1_eval.json")
    parser.add_argument("--output-json", default="")
    parser.add_argument("--style-question", default="Explain the key idea of this section.")
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"Dataset not found: {dataset_path}")
        sys.exit(1)

    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    cases = data.get("test_cases", [])

    rows = [evaluate_case(args.api_url, args.token, args.book_id, case) for case in cases]
    ok_rows = [r for r in rows if r.success]

    total = len(rows)
    successful = len(ok_rows)
    citation_coverage = (
        sum(1 for r in ok_rows if r.citations_count >= r.citations_expected) / successful
        if successful
        else 0.0
    )
    citation_correctness = mean([r.citation_correctness_proxy for r in ok_rows]) if ok_rows else 0.0
    faithfulness_pass_rate = (
        sum(1 for r in ok_rows if r.faithfulness_proxy_pass) / successful if successful else 0.0
    )

    style_questions = [case.get("question", "") for case in cases if case.get("question")]
    if args.style_question:
        style_questions.insert(0, args.style_question)

    adaptive = evaluate_adaptive_style(
        api_url=args.api_url,
        token=args.token,
        book_id=args.book_id,
        questions=style_questions,
    )

    report = {
        "summary": {
            "total_cases": total,
            "successful_cases": successful,
            "success_rate": round((successful / total) if total else 0.0, 3),
            "retrieval_recall_proxy": round(citation_coverage, 3),
            "citation_correctness_proxy": round(citation_correctness, 3),
            "faithfulness_proxy_pass_rate": round(faithfulness_pass_rate, 3),
        },
        "adaptive_style_check": adaptive,
        "cases": [r.__dict__ for r in rows],
    }

    print("=" * 80)
    print("WEEK 4 BASELINE EVAL")
    print("=" * 80)
    print(json.dumps(report["summary"], indent=2))
    print("Adaptive style:", json.dumps(adaptive, indent=2))

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Saved report to: {out_path}")

    # Baseline thresholds for CI gate.
    failed = False
    if report["summary"]["success_rate"] < 0.8:
        failed = True
    if report["summary"]["retrieval_recall_proxy"] < 0.7:
        failed = True
    if report["summary"]["faithfulness_proxy_pass_rate"] < 0.8:
        failed = True
    if not adaptive.get("style_shift_detected", False):
        failed = True

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
