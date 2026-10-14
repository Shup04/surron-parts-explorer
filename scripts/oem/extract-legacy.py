#!/usr/bin/env python3
"""Reproduce factual Motorino/emotobykes PDF table transcriptions.

Requires Poppler's pdftotext. Originals are read only. The checked-in source
audit records independent visual row counts and review exceptions for these
exact file hashes. A different PDF cannot silently reuse their visual sign-off.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
NS = {"x": "http://www.w3.org/1999/xhtml"}
CALLOUT = re.compile(r"^\d+_\d+(?:-\d+)?$")
OEM = re.compile(r"^[A-Za-z0-9]+(?:-[A-Za-z0-9.]+){2,}$")
FIGURE = re.compile(r"(?:Illustration|FIGURE)-(\d+)")

COMMON_GROUPS = {
    1: ("frame", "Frame and seat frame"),
    2: ("swingarm", "Swingarm"),
    3: ("battery", "Battery and controller"),
    4: ("motor", "Motor and primary drive"),
    5: ("battery-body", "Battery enclosure and bodywork"),
    6: ("battery-mounts", "Battery and controller mounts"),
    7: ("rear-wheel", "Rear wheel"),
    8: ("electrical", "Electrical equipment"),
    9: ("body", "Seat and rear bodywork"),
    10: ("battery-lock", "Battery lock covers"),
    11: ("rear-suspension", "Rear suspension and linkage"),
    12: ("footpegs", "Footpegs and side stand"),
    13: ("front-suspension", "Front suspension, steering and controls"),
    14: ("brakes", "Brakes"),
    15: ("jackshaft", "Midshaft and final drive"),
    16: ("wiring", "Wiring and circuit protection"),
    17: ("front-wheel", "Front wheel"),
    18: ("controls", "Throttle cable and miscellaneous fittings"),
}

SOURCES = {
    "motorino": {
        "filename": "Sur-Ron-Spare-Parts.pdf",
        "title": "Motorino — Spare Parts Catalog of Light Bee & Light Bee (X)",
        "url": "https://motorino.ca/wp-content/uploads/2022/04/Sur-Ron-Spare-Parts.pdf",
        "applicabilityNotes": (
            "Title explicitly covers Light Bee and Light Bee (X), including several "
            "X Version, fork, regional charger and refitting alternatives. No model "
            "year is stated. The URL date and PDF creation date are not fitment years."
        ),
        "groups": {
            **COMMON_GROUPS,
            19: ("pedal-kit", "Optional pedal drive"),
            20: ("suspension-adapter", "Optional damping adapter"),
            21: ("supermoto-front-wheel", "Super Motor front tire kit"),
            22: ("supermoto-rear-wheel", "Super Motor rear tire kit"),
        },
    },
    "emotobykes": {
        "filename": "sur-ron-light-bee-parts-diagrams.pdf",
        "title": "Emotobykes — Sur-Ron Light Bee parts diagrams",
        "url": "https://emotobykes.com/manuals/sur-ron-light-bee-parts-diagrams.pdf",
        "applicabilityNotes": (
            "Light Bee source with YQ2A/YQ2B references and road-equipment figures. "
            "No model year or universal Light Bee X fitment is established by the PDF. "
            "Part-number prefixes are preserved, not interpreted as compatibility."
        ),
        "groups": {
            **COMMON_GROUPS,
            19: ("rear-lighting", "Rear lighting and road equipment"),
            20: ("front-lighting", "Front lighting and instruments"),
            21: ("decals", "Decals"),
        },
    },
}


def compact(value: str) -> str:
    return " ".join(value.split())


def normalize_name(description: str, oem: str | None) -> str:
    if not description:
        return f"Unidentified source part {oem}" if oem else "Unidentified source part"
    result = description
    for pattern, replacement in (
        (r"\bIntermediate Shaft\b", "Midshaft"),
        (r"\bMid\. Shaft\b", "Midshaft"),
        (r"\bAssy\.?", "assembly"),
        (r"\bFr\.", "Front"),
        (r"\bRr\.", "Rear"),
        (r"\bR\. ", "Right "),
        (r"\bL\. ", "Left "),
        (r"\bRear-Whel\b", "Rear-wheel"),
        (r"\bSpeedoemeter\b", "Speedometer"),
        (r"\bLisence\b", "License"),
    ):
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


def dimension_text(description: str) -> str | None:
    # Preserve the literal designation. Do not derive measurements from OEM numbers
    # or assume that unlabelled dimensions are mm.
    groups = re.findall(r"[（(]([^）)]+)[）)]", description)
    dimension_groups = [
        g for g in groups
        if re.search(r"(?:Φ|\bM\d|\bST\d|\bPB\d|\bL\d|\d\s*\*\s*\d|\d\s*mm\b)", g)
    ]
    return "; ".join(dimension_groups) or None


def parse_cells(line: str) -> dict:
    cells = re.split(r"\s{2,}", line.strip())
    callout = cells.pop(0) if cells and CALLOUT.fullmatch(cells[0]) else None
    oem = cells.pop(0) if cells and OEM.fullmatch(cells[0]) else None
    description = cells.pop(0) if cells and not cells[0].isdigit() else ""
    quantity_text = cells.pop(0) if cells and cells[0].isdigit() else None
    return {
        "callout": callout,
        "oemNumber": oem,
        "originalDescription": description,
        "quantity": int(quantity_text) if quantity_text is not None else None,
        "quantityText": quantity_text,
        "remarks": cells,
    }


def bbox_rows(page: ET.Element) -> list[list[ET.Element]]:
    groups: list[list[ET.Element]] = []
    for word in sorted(page.findall(".//x:word", NS), key=lambda w: float(w.get("yMin", "0"))):
        if not groups or abs(float(word.get("yMin", "0")) - float(groups[-1][0].get("yMin", "0"))) > 2:
            groups.append([])
        groups[-1].append(word)
    candidates = []
    for words in groups:
        words.sort(key=lambda w: float(w.get("xMin", "0")))
        first = words[0].text or ""
        text = " ".join(w.text or "" for w in words)
        if CALLOUT.fullmatch(first) or OEM.fullmatch(first):
            candidates.append(words)
        elif text.startswith("Mounting Screw, Absorber Protection Plate") and (words[-1].text or "").isdigit():
            # The FAST variant at Motorino p21 has both blank OEM and blank callout.
            candidates.append(words)
    return candidates


def row_review(row: dict, previous_callout: str | None, audit: dict) -> None:
    flags = row["reviewFlags"]
    if row["oemNumber"] is None:
        flags.append("missing-oem-number")
    if row["quantity"] is None:
        flags.append("missing-quantity")
    if not row["originalDescription"]:
        flags.append("missing-description")
    if row["callout"] is None:
        flags.extend(["missing-callout", "variant-group-needs-review"])
        row["notes"].append(
            f"The printed callout cell is blank. Previous printed callout: {previous_callout}; "
            "this is source context, not a confirmed shared callout or mechanical relationship."
        )
    if row["dimensionsText"] is not None:
        flags.append("unverified-dimensions")
    for issue in audit.get("rowIssues", []):
        if issue["page"] == row["page"] and (
            issue.get("callout") == row["callout"] if "callout" in issue
            else issue.get("oemNumber") == row["oemNumber"]
        ):
            flags.extend(issue["flags"])
            row["notes"].append(issue["note"])
    row["reviewFlags"] = sorted(set(flags))
    # Confidence refers to extraction fidelity, not mechanical accuracy or fitment.
    row["confidence"] = "medium" if (
        row["callout"] is None or not row["originalDescription"]
    ) else "high"


def extract(source_id: str, source_dir: Path, output_dir: Path) -> dict:
    config = SOURCES[source_id]
    pdf = source_dir / config["filename"]
    audit_path = ROOT / "data/oem/audits" / f"{source_id}-visual-audit.json"
    audit = json.loads(audit_path.read_text())
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if digest != audit["sha256"]:
        raise ValueError(f"{source_id}: PDF hash differs from visual audit; audit the new document first")
    with tempfile.TemporaryDirectory(prefix="surron-legacy-") as temp:
        layout = Path(temp) / "layout.txt"
        bbox = Path(temp) / "bbox.xml"
        subprocess.run(["pdftotext", "-layout", str(pdf), str(layout)], check=True)
        subprocess.run(["pdftotext", "-bbox-layout", str(pdf), str(bbox)], check=True)
        pages = layout.read_text().split("\f")
        if not pages[-1].strip():
            pages.pop()
        xml_pages = ET.parse(bbox).findall(".//x:page", NS)
    if len(pages) != len(audit["tableRowCounts"]) or len(xml_pages) != len(pages):
        raise ValueError(f"{source_id}: unexpected page count")
    rows, page_audits = [], []
    figure, previous_callout = None, None
    for number, (page_text, xml_page) in enumerate(zip(pages, xml_pages), 1):
        candidates = bbox_rows(xml_page)
        page_rows = []
        for line in page_text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            heading = FIGURE.fullmatch(stripped)
            if heading:
                figure = str(int(heading[1]))
                continue
            if re.match(r"^(?:ITEM|Item)\s|^SPARE PARTS|^第", stripped):
                continue
            if figure is None:
                raise ValueError(f"{source_id} p{number}: row before a figure heading: {line}")
            cells = parse_cells(line)
            callout = cells["callout"]
            if callout is not None:
                if str(int(callout.split("_")[0])) != figure:
                    raise ValueError(f"{source_id} p{number}: callout {callout} under wrong figure {figure}")
                previous_callout = callout
            row_index = len(page_rows) + 1
            bbox_match = [w for w in candidates if compact(" ".join(v.text or "" for v in w)) == compact(line)]
            if len(bbox_match) != 1:
                # Identical repeated rows are intentionally preserved; assign by their
                # vertical ordinal to avoid collapsing source duplicates.
                if len(bbox_match) > 1:
                    bbox_match = bbox_match[:1]
                else:
                    raise ValueError(f"{source_id} p{number} r{row_index}: layout/bbox disagreement: {line}")
            words = bbox_match[0]
            candidates.remove(words)
            description = cells["originalDescription"]
            remarks = cells.pop("remarks")
            item_type = "component"
            if re.search(r"\bAssy\b", description, re.I):
                item_type = "assembly"
            if callout is None:
                item_type = "variant"
            if "Refitting Part" in remarks:
                item_type = "optional"
            if not description:
                item_type = "unknown"
            explicit_qualifiers = re.findall(r"\(([^)]*(?:Version|E-Mark|DNM|FAST|RST|Market)[^)]*)\)", description)
            if description.startswith("X Controller"):
                explicit_qualifiers.append("X Controller")
            explicit_qualifiers.extend(r for r in remarks if r != "Refitting Part")
            key, name = config["groups"][int(figure)]
            material = re.search(r"\b(Plastic|Nylon|Rubber)\b", description, re.I)
            row = {
                "id": f"{source_id}-p{number}-r{row_index}",
                "sourceId": source_id,
                "page": number,
                "figure": figure,
                "rowIndex": row_index,
                **cells,
                "normalizedName": normalize_name(description, cells["oemNumber"]),
                "dimensionsText": dimension_text(description),
                "weightText": None,
                "material": material[0] if material else None,
                "notes": remarks,
                "applicability": "; ".join(dict.fromkeys(explicit_qualifiers)) or None,
                "modelYears": [],
                "itemType": item_type,
                "confidence": "high",
                "reviewFlags": [],
                "assemblyKey": key,
                "assemblyName": name,
                "rawText": line.rstrip(),
                "bounds": [
                    min(float(w.get("xMin", "0")) for w in words),
                    min(float(w.get("yMin", "0")) for w in words),
                    max(float(w.get("xMax", "0")) for w in words),
                    max(float(w.get("yMax", "0")) for w in words),
                ],
            }
            row_review(row, previous_callout, audit)
            page_rows.append(row)
        if candidates:
            raise ValueError(f"{source_id} p{number}: {len(candidates)} bbox rows were not imported")
        expected = audit["tableRowCounts"][number - 1]
        if len(page_rows) != expected:
            raise ValueError(f"{source_id} p{number}: {len(page_rows)} parsed rows != {expected} visually audited rows")
        rows.extend(page_rows)
        notes = ["All table rows visually reconciled against the rendered source page; layout and bbox text independently match."]
        page_note = audit.get("pageNotes", {}).get(str(number))
        if page_note:
            notes.append(page_note)
        page_audits.append({
            "page": number,
            "figures": list(dict.fromkeys(row["figure"] for row in page_rows)),
            "detectedRows": expected,
            "importedRows": len(page_rows),
            "reviewRowIds": [row["id"] for row in page_rows if row["reviewFlags"]],
            "exceptions": [{k: v for k, v in e.items() if k != "page"} for e in audit["exceptions"] if e["page"] == number],
            "visualStatus": "inspected",
            "notes": notes,
        })
    # Repeated printed callouts are alternatives or source duplicates, never a
    # unique catalog identity and never a reason to drop a row.
    counts = Counter(row["callout"] for row in rows if row["callout"])
    for row in rows:
        if row["callout"] and counts[row["callout"]] > 1:
            row["reviewFlags"] = sorted(set(row["reviewFlags"] + ["repeated-source-callout"]))
    for page in page_audits:
        page["reviewRowIds"] = [row["id"] for row in rows if row["page"] == page["page"] and row["reviewFlags"]]
    try:
        local_path = str(pdf.relative_to(ROOT))
    except ValueError:
        local_path = str(pdf)
    result = {
        "version": 1,
        "source": {
            "id": source_id,
            "title": config["title"],
            "filename": config["filename"],
            "localPath": local_path,
            "url": config["url"],
            "sha256": digest,
            "pageCount": len(pages),
            "edition": None,
            "modelYears": [],
            "applicabilityNotes": config["applicabilityNotes"],
            "redistribution": "reference-only",
            "retrievedAt": audit["inspectedAt"],
            "kind": "pdf",
        },
        "rows": rows,
        "pages": page_audits,
        "notes": [
            "Every physical table row, including blank OEM/callout/description/quantity cells and repeated alternatives, is preserved.",
            "Stable row IDs identify a physical source page and row, not a universal part or callout identity.",
            "Assembly grouping is the documented source figure. No mechanically significant subassembly relationships are inferred from names.",
            "Part numbers and original descriptions retain extracted source characters. Normalized names expand abbreviations only; original claims remain immutable.",
            "Dimension text is literal and mechanically unverified. No units, weights, OEM numbers or model years are inferred.",
            "Visual confidence concerns transcription fidelity, not mechanical verification or cross-year compatibility.",
            "Neither legacy PDF contains a separate bolt-summary table; fasteners are included in the figure tables.",
            "Diagram-only callouts without source table rows are explicit review exceptions, not fabricated catalog records.",
            *audit.get("notes", []),
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"{source_id}.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"{source_id}: {len(pages)} pages; {len(set(row['figure'] for row in rows))} figures; {len(rows)} rows; "
          f"{sum(bool(row['reviewFlags']) for row in rows)} needing review; "
          f"{sum(len(page['exceptions']) for page in page_audits)} page exceptions")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=SOURCES, action="append")
    parser.add_argument("--source-dir", type=Path, default=ROOT / "reference/parts-catalogue")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/oem/extracted")
    args = parser.parse_args()
    for source_id in args.source or SOURCES:
        extract(source_id, args.source_dir, args.output_dir)


if __name__ == "__main__":
    main()
