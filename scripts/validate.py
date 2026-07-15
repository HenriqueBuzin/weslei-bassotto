#!/usr/bin/env python3
"""Run every local quality gate used by CI before a commit is created."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "api"
FRONTEND = ROOT / "frontend"
DEDICATED_VENV = Path(os.environ.get("WESLEI_VENV", r"C:\Users\henri\Documents\Projects\venv\weslei-bassotto"))


def executable(candidates: list[Path | str]) -> str:
    for candidate in candidates:
        path = Path(candidate)
        if path.is_file():
            return str(path)
        resolved = shutil.which(str(candidate))
        if resolved:
            return resolved
    raise RuntimeError(f"Executable not found: {', '.join(map(str, candidates))}")


def run(label: str, command: list[str], cwd: Path) -> None:
    print(f"\n==> {label}", flush=True)
    print("    " + " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True, env=os.environ.copy())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-e2e", action="store_true", help="Skip Playwright only when debugging locally.")
    args = parser.parse_args()

    python = executable(
        [
            DEDICATED_VENV / "Scripts" / "python.exe",
            API / ".venv" / "Scripts" / "python.exe",
            API / ".venv" / "bin" / "python",
            "python3",
            "python",
        ]
    )
    npm = executable(["npm.cmd", "npm"])
    if DEDICATED_VENV.is_dir():
        os.environ["VIRTUAL_ENV"] = str(DEDICATED_VENV)
        os.environ["POETRY_VIRTUALENVS_CREATE"] = "false"
    poetry = [python, "-m", "poetry", "run"]

    backend_categories = ["unit", "integration", "api", "functional", "regression", "smoke"]
    frontend_categories = ["unit", "integration", "api", "functional", "regression", "smoke"]

    try:
        run(
            "Backend coverage: statements, lines and branches at 100%",
            [
                *poetry,
                "pytest",
                "--cov=app",
                "--cov-branch",
                "--cov-report=term-missing",
                "--cov-fail-under=100",
                "-q",
            ],
            API,
        )
        for category in backend_categories:
            run(f"Backend {category}", [*poetry, "pytest", "-m", category, "-q"], API)

        run("Frontend formatting", [npm, "run", "format:check"], FRONTEND)
        run("Frontend lint", [npm, "run", "lint"], FRONTEND)
        run("Frontend coverage: all metrics at 100%", [npm, "run", "test:coverage"], FRONTEND)
        for category in frontend_categories:
            run(f"Frontend {category}", [npm, "run", f"test:{category}"], FRONTEND)
        run("Frontend production build", [npm, "run", "build"], FRONTEND)

        if not args.skip_e2e:
            run("End-to-end desktop and mobile", [npm, "run", "test:e2e"], FRONTEND)
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"\nVALIDATION FAILED: {error}", file=sys.stderr)
        return 1

    print("\nALL QUALITY GATES PASSED", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
