#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Inventory locked dependencies; optionally collect installed license texts.

Use --output to refresh the reviewed JSON inventory. --bundle requires all
explicit Go modules and all installed npm packages to have local legal texts.
It deliberately fails on missing evidence rather than assigning a license.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def legal_files(directory):
    if not directory.is_dir():
        return []
    return sorted(
        p for p in directory.iterdir()
        if p.is_file() and re.match(r"^(licen[cs]e|copying|notice|copyright)([.\-_]|$)", p.name, re.I)
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--bundle", type=Path)
    args = parser.parse_args()
    lock = json.loads((ROOT / "frontend/package-lock.json").read_text())
    fallbacks = json.loads((ROOT / "LICENSES/npm-sources.json").read_text())
    cache = Path(subprocess.check_output(["go", "env", "GOMODCACHE"], text=True).strip())
    modules = []
    required = False
    for line in (ROOT / "go.mod").read_text().splitlines():
        if line.startswith("require ("):
            required = True
        elif line == ")":
            required = False
        elif required:
            parts = line.strip().split()
            if len(parts) >= 2:
                modules.append((parts[0], parts[1]))
    inventory = {"scope": "npm lock entries and explicit go.mod requirements; not a legal certification", "npm": [], "go": []}
    sections, missing = [], []
    for path, data in sorted(lock["packages"].items()):
        if not path:
            continue
        entry = {"path": path, "version": data.get("version"), "declared_license": data.get("license", "UNKNOWN"), "dev": data.get("dev", False), "optional": data.get("optional", False)}
        inventory["npm"].append(entry)
        fallback = fallbacks.get(path + "@" + str(entry["version"]))
        if fallback:
            entry["upstream_legal_text"] = fallback
        directory = ROOT / "frontend" / path
        if args.bundle and directory.is_dir():
            texts = legal_files(directory)
            if not texts and fallback:
                text = ROOT / fallback["file"]
                if hashlib.sha256(text.read_bytes()).hexdigest() != fallback["sha256"]:
                    raise SystemExit(f"Modified upstream legal text: {text}")
                texts = [text]
            if not texts:
                missing.append(path)
            for text in texts:
                sections.append(f"npm {path}@{entry['version']} — {text.name}\n\n{text.read_text(errors='replace')}")
    for name, version in sorted(modules):
        escaped = re.sub(r"[A-Z]", lambda m: "!" + m[0].lower(), name)
        directory = cache / f"{escaped}@{version}"
        texts = legal_files(directory)
        inventory["go"].append({"module": name, "version": version, "available_legal_texts": [{"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in texts], "status": "texts available; review required" if texts else "MISSING: not verified"})
        if args.bundle:
            if not texts:
                missing.append(f"{name}@{version}")
            for text in texts:
                sections.append(f"Go {name}@{version} — {text.name}\n\n{text.read_text(errors='replace')}")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(inventory, indent=2, ensure_ascii=False) + "\n")
    if args.bundle:
        if missing:
            raise SystemExit("Incomplete license evidence; bundle not written:\n" + "\n".join(missing))
        args.bundle.write_text("THIRD-PARTY LICENSES — retain these texts on redistribution\n\n" + "\n\n".join(sections))
    print(f"Inventoried {len(inventory['npm'])} npm entries and {len(inventory['go'])} Go modules")


if __name__ == "__main__":
    main()
