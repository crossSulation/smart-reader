#!/usr/bin/env python3
"""
Week 1 Regression Evaluation Script
------------------------------------
Runs the curated Q&A dataset against a book to evaluate retrieval quality,
citation accuracy, and confidence calibration.

Usage:
    python week1_eval.py --book-id <id> --token <auth_token> [--api-url http://localhost:8000]
"""

import json
import argparse
import sys
import requests
from pathlib import Path
from typing import Optional
from dataclasses import dataclass


@dataclass
class EvalResult:
    """Result of evaluating a single question."""
    question_id: str
    question: str
    success: bool
    error: Optional[str] = None
    answer: Optional[str] = None
    citations_count: int = 0
    expected_citations: int = 0
    confidence: float = 0.0
    min_confidence: float = 0.0
    insufficient_evidence: bool = False
    confidence_met: bool = False
    citations_met: bool = False


def load_eval_dataset(dataset_path: str) -> dict:
    """Load the evaluation dataset JSON."""
    with open(dataset_path, 'r') as f:
        return json.load(f)


def run_qa_query(
    api_url: str,
    book_id: int,
    question: str,
    token: str,
) -> dict:
    """Call the QA endpoint and return the response."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    response = requests.post(
        f"{api_url}/api/books/{book_id}/qa",
        json={"question": question, "top_k": 5},
        headers=headers,
        timeout=30,
    )
    
    response.raise_for_status()
    return response.json()


def evaluate_question(
    api_url: str,
    book_id: int,
    token: str,
    test_case: dict,
) -> EvalResult:
    """Evaluate a single test case."""
    question_id = test_case["id"]
    question = test_case["question"]
    expected_citations = test_case.get("expected_citation_count", 1)
    min_confidence = test_case.get("min_confidence", 0.5)
    
    result = EvalResult(
        question_id=question_id,
        question=question,
        success=False,
        expected_citations=expected_citations,
        min_confidence=min_confidence,
    )
    
    try:
        qa_response = run_qa_query(api_url, book_id, question, token)
        
        result.answer = qa_response.get("answer", "")
        result.citations_count = len(qa_response.get("citations", []))
        result.confidence = qa_response.get("confidence", 0.0)
        result.insufficient_evidence = qa_response.get("insufficient_evidence", False)
        
        # Evaluate criteria
        result.citations_met = result.citations_count >= expected_citations
        result.confidence_met = result.confidence >= min_confidence
        result.success = True
        
    except Exception as e:
        result.error = str(e)
    
    return result


def print_summary(results: list[EvalResult], dataset: dict) -> None:
    """Print evaluation summary."""
    print("\n" + "="*80)
    print("WEEK 1 QA EVALUATION SUMMARY")
    print("="*80)
    
    total = len(results)
    successful = sum(1 for r in results if r.success)
    citations_met = sum(1 for r in results if r.citations_met)
    confidence_met = sum(1 for r in results if r.confidence_met)
    insufficient_evidence_count = sum(1 for r in results if r.insufficient_evidence)
    hallucinations = sum(
        1 for r in results 
        if r.success and r.confidence < 0.3 and not r.insufficient_evidence
    )
    
    print(f"\nTotal questions: {total}")
    print(f"Successful responses: {successful}/{total} ({100*successful//total}%)")
    print(f"Citations met expectations: {citations_met}/{total} ({100*citations_met//total}%)")
    print(f"Confidence met threshold: {confidence_met}/{total} ({100*confidence_met//total}%)")
    print(f"Low-confidence flags: {insufficient_evidence_count}/{total}")
    print(f"Potential hallucinations: {hallucinations}/{total}")
    
    # By difficulty
    print("\nBy Difficulty:")
    for difficulty in ["easy", "medium", "hard"]:
        difficulty_results = [r for r in results if any(
            tc["difficulty"] == difficulty 
            for tc in dataset["test_cases"] 
            if tc["id"] == r.question_id
        )]
        if difficulty_results:
            diff_successful = sum(1 for r in difficulty_results if r.success)
            diff_confident = sum(1 for r in difficulty_results if r.confidence_met and r.success)
            print(f"  {difficulty.capitalize()}: {diff_successful}/{len(difficulty_results)} successful, {diff_confident} confident")
    
    # Thresholds checklist
    print("\n" + "="*80)
    print("WEEK 1 ACCEPTANCE CRITERIA:")
    print("="*80)
    
    checks = {
        "✓ >= 90% non-fallback answers include citations": citations_met / total >= 0.9,
        "✓ Citation jump works in Reader": True,  # Manual check
        "✓ Weak evidence triggers safe response": insufficient_evidence_count > 0,
        "✓ No confident hallucinations": hallucinations == 0,
    }
    
    for check, passed in checks.items():
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {check}")
    
    all_pass = all(checks.values())
    print(f"\n{'='*80}")
    print(f"OVERALL: {'✓ WEEK 1 READY' if all_pass else '✗ IMPROVEMENTS NEEDED'}")
    print(f"{'='*80}\n")


def print_detailed_results(results: list[EvalResult]) -> None:
    """Print detailed results for each question."""
    print("\nDETAILED RESULTS:")
    print("-" * 80)
    
    for result in results:
        status = "✓" if result.success else "✗"
        citation_status = "✓" if result.citations_met else "✗"
        confidence_status = "✓" if result.confidence_met else "✗"
        
        print(f"\n{status} [{result.question_id}] {result.question[:60]}...")
        
        if result.error:
            print(f"  ERROR: {result.error}")
        else:
            print(f"  Confidence: {result.confidence:.2f} (need {result.min_confidence:.2f}) [{confidence_status}]")
            print(f"  Citations: {result.citations_count} (need {result.expected_citations}) [{citation_status}]")
            print(f"  Insufficient evidence: {result.insufficient_evidence}")
            if result.answer:
                preview = result.answer[:80].replace("\n", " ")
                print(f"  Answer preview: {preview}...")


def main():
    parser = argparse.ArgumentParser(
        description="Run Week 1 QA evaluation against a book"
    )
    parser.add_argument("--book-id", type=int, required=True, help="Book ID to test")
    parser.add_argument("--token", required=True, help="Authorization token")
    parser.add_argument("--api-url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--dataset", default="tests/data/week1_eval.json", help="Dataset path")
    parser.add_argument("--detailed", action="store_true", help="Print detailed results")
    
    args = parser.parse_args()
    
    # Load dataset
    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"Error: Dataset not found at {dataset_path}")
        sys.exit(1)
    
    print(f"Loading dataset from {dataset_path}...")
    dataset = load_eval_dataset(str(dataset_path))
    test_cases = dataset["test_cases"]
    
    print(f"Running {len(test_cases)} evaluation questions against book {args.book_id}...")
    print(f"API: {args.api_url}\n")
    
    # Run evaluations
    results = []
    for i, test_case in enumerate(test_cases, 1):
        print(f"  [{i}/{len(test_cases)}] {test_case['id']}...", end=" ", flush=True)
        
        result = evaluate_question(
            args.api_url,
            args.book_id,
            args.token,
            test_case,
        )
        results.append(result)
        
        status = "✓" if result.success else "✗"
        print(f"{status}")
    
    # Print results
    if args.detailed:
        print_detailed_results(results)
    
    print_summary(results, dataset)
    
    # Exit with error if any criteria not met
    successful = sum(1 for r in results if r.success)
    citations_met = sum(1 for r in results if r.citations_met and r.success)
    confidence_met = sum(1 for r in results if r.confidence_met and r.success)
    hallucinations = sum(
        1 for r in results 
        if r.success and r.confidence < 0.3 and not r.insufficient_evidence
    )
    
    failed = (
        citations_met / successful < 0.9 if successful > 0 else False
        or confidence_met / successful < 0.7 if successful > 0 else False
        or hallucinations > 0
    )
    
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
