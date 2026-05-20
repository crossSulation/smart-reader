#!/usr/bin/env python3
"""
Release Check Orchestrator
--------------------------
Runs key validation checks for Weeks 1-4.

Default checks:
- backend compile/import checks

Optional API checks (when --book-id and --token are provided):
- week1_eval.py
- week4_eval.py
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run_step(name: str, cmd: list[str], cwd: Path) -> bool:
    print(f"\n[STEP] {name}")
    print(" ".join(cmd))
    res = subprocess.run(cmd, cwd=str(cwd))
    ok = res.returncode == 0
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Run release checks for Smart Reader")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--book-id", type=int)
    parser.add_argument("--token", default="")
    parser.add_argument("--strict", action="store_true", help="Fail if API eval args are missing")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]

    checks_ok = True

    checks_ok &= run_step(
        "Backend compile check",
        [sys.executable, "-m", "compileall", "app"],
        backend_dir,
    )
    checks_ok &= run_step(
        "Backend import check",
        [
            sys.executable,
            "-c",
            "from app.main import app; from app.routers.ai import router as ai_router; from app.routers.personalization import profile_router, analytics_router; print('import_ok')",
        ],
        backend_dir,
    )

    can_run_api_eval = bool(args.book_id and args.token)
    if can_run_api_eval:
        checks_ok &= run_step(
            "Week 1 regression eval",
            [
                sys.executable,
                "scripts/week1_eval.py",
                "--book-id",
                str(args.book_id),
                "--token",
                args.token,
                "--api-url",
                args.api_url,
            ],
            backend_dir,
        )
        checks_ok &= run_step(
            "Week 4 baseline eval",
            [
                sys.executable,
                "scripts/week4_eval.py",
                "--book-id",
                str(args.book_id),
                "--token",
                args.token,
                "--api-url",
                args.api_url,
                "--output-json",
                "tests/data/week4_eval_report.json",
            ],
            backend_dir,
        )
    else:
        msg = (
            "Skipped API evaluations (missing --book-id/--token). "
            "Provide both to run week1/week4 endpoint checks."
        )
        print(f"\n[WARN] {msg}")
        if args.strict:
            checks_ok = False

    print("\n" + "=" * 80)
    print("RELEASE CHECK RESULT:", "PASS" if checks_ok else "FAIL")
    print("=" * 80)
    sys.exit(0 if checks_ok else 1)


if __name__ == "__main__":
    main()
