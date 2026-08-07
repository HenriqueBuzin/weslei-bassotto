#!/usr/bin/env python3
"""Format the API with Pint, the way the pre-commit hook needs it."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "api"
API_IMAGE = os.environ.get("WESLEI_API_IMAGE", "weslei-bassotto/api-ci:local")


def main() -> int:
    docker = shutil.which("docker") or shutil.which("docker.exe")

    if docker is None:
        print("docker not found; skipping Pint", file=sys.stderr)
        return 1

    env = os.environ.copy()
    # Without this, MSYS rewrites the container paths into C:/Program Files/Git/...
    # A `-e MSYS_NO_PATHCONV=1` on the docker command would not help: that sets
    # the variable inside the container, long after the mangling happened.
    env["MSYS_NO_PATHCONV"] = "1"

    command = [docker, "run", "--rm", "-v", f"{API}:/app", "-w", "/app", API_IMAGE, "vendor/bin/pint", *sys.argv[1:]]

    return subprocess.run(command, cwd=ROOT, env=env, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
