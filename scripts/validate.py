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

# Branch coverage needs Xdebug, and the API image's `test` target already carries
# it alongside PHP 8.5 and pdo_pgsql. Running the backend gates inside that image
# is also what keeps this script and the Jenkins stage checking the same thing.
API_IMAGE = os.environ.get("WESLEI_API_IMAGE", "weslei-bassotto/api-ci:local")

TEST_SUITES = ["unit", "integration", "api", "functional", "regression", "smoke"]


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


def in_api_image(docker: str, script: str) -> list[str]:
    """Wraps a shell snippet so it runs against the mounted API source."""
    return [
        docker,
        "run",
        "--rm",
        "-v",
        f"{API}:/app",
        "-w",
        "/app",
        API_IMAGE,
        "sh",
        "-lc",
        script,
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-e2e", action="store_true", help="Skip Playwright only when debugging locally.")
    args = parser.parse_args()

    docker = executable(["docker.exe", "docker"])
    npm = executable(["npm.cmd", "npm"])

    # MSYS on Windows would rewrite the container paths into C:/... otherwise.
    os.environ["MSYS_NO_PATHCONV"] = "1"

    try:
        run(
            "Backend toolchain image",
            [docker, "build", "--target", "test", "--build-arg", "API_PORT=8000", "-t", API_IMAGE, str(API)],
            ROOT,
        )
        run("Backend dependencies", in_api_image(docker, "composer install --no-interaction --no-progress"), ROOT)
        run("Backend formatting", in_api_image(docker, "vendor/bin/pint --test"), ROOT)
        run(
            "Backend static analysis",
            in_api_image(docker, "php -d memory_limit=1G vendor/bin/phpstan analyse --no-progress"),
            ROOT,
        )
        run(
            "Backend coverage: lines at 100%",
            in_api_image(
                docker,
                "php -d memory_limit=2G vendor/bin/phpunit"
                " --coverage-clover=coverage/clover.xml --coverage-filter app"
                " && php scripts/coverage-gate.php",
            ),
            ROOT,
        )
        for suite in TEST_SUITES:
            run(f"Backend {suite}", in_api_image(docker, f"vendor/bin/phpunit --testsuite {suite}"), ROOT)

        run("Frontend formatting", [npm, "run", "format:check"], FRONTEND)
        run("Frontend lint", [npm, "run", "lint"], FRONTEND)
        run("Frontend typecheck", [npm, "run", "typecheck"], FRONTEND)
        run("Frontend coverage: all metrics at 100%", [npm, "run", "test:coverage"], FRONTEND)
        for suite in TEST_SUITES:
            run(f"Frontend {suite}", [npm, "run", f"test:{suite}"], FRONTEND)
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
