"""Write the published allocation into frosted_cwl_members.csv, for Ka Wai to review and commit. Laptop only.

Only clan, cwl_slot and transferred_from change, and only on rows whose tag is in the publish. Every other column and
row is written back exactly as read. Run from the repo root:

    python -m server.pull_allocation              # fetch from the site, rewrite the CSV, print what changed
    python -m server.pull_allocation --dry-run    # print what would change, write nothing
    python -m server.pull_allocation --from-file allocation.csv

The server never writes to GitHub; committing the result is Ka Wai's step.
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
import urllib.request
from pathlib import Path

URL = "https://frosted-family.vercel.app/api/allocation.csv"
COLS = ("clan", "cwl_slot", "transferred_from")


def fetch(url: str) -> tuple[str, str]:
    req = urllib.request.Request(url, headers={"Accept": "text/csv"})
    with urllib.request.urlopen(req, timeout=30) as r:
        stamp = f"{r.headers.get('X-Published-At', '?')} by {urllib.request.unquote(r.headers.get('X-Published-By', '?'))}"
        return r.read().decode("utf-8"), stamp


def merge(roster_text: str, alloc_text: str) -> tuple[str, list[str], list[str]]:
    """The roster with the allocation applied, a line per changed player, and published tags not in the roster."""
    reader = csv.DictReader(io.StringIO(roster_text))
    fields, rows = reader.fieldnames, list(reader)
    alloc = {r["tag"]: r for r in csv.DictReader(io.StringIO(alloc_text))}
    changes = []
    seen = set()
    for r in rows:
        a = alloc.get(r.get("tag") or "")
        if not a:
            continue
        seen.add(r["tag"])
        new = {k: a[k] for k in COLS}
        old = {k: r[k] for k in COLS}
        if new != old:
            changes.append(f"{r['name']} ({r['tag']}): " + ", ".join(
                f"{k} {old[k] or '-'} -> {new[k] or '-'}" for k in COLS if old[k] != new[k]))
            r.update(new)
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return out.getvalue(), changes, sorted(set(alloc) - seen)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", default="frosted_cwl_members.csv")
    ap.add_argument("--url", default=URL)
    ap.add_argument("--from-file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    target = Path(args.csv)
    if args.from_file:
        alloc_text, stamp = Path(args.from_file).read_text(encoding="utf-8"), args.from_file
    else:
        alloc_text, stamp = fetch(args.url)
    merged, changes, missing = merge(target.read_text(encoding="utf-8"), alloc_text)

    print(f"Published allocation: {stamp}")
    print(f"{len(changes)} players change" + (":" if changes else "."))
    for c in changes:
        print("  " + c)
    for t in missing:
        print(f"  not in {target.name}, skipped: {t}")
    if changes and not args.dry_run:
        target.write_text(merged, encoding="utf-8", newline="")
        print(f"Wrote {target}. Review with git diff, then commit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
