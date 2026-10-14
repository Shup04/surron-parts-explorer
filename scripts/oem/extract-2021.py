#!/usr/bin/env python3
"""Reproduce the complete 20-page 2021-reference transcription.

Requirements: Python 3 standard library, Poppler pdftotext, qpdf.
No OCR, network access, source modification, or third-party Python package needed.
The PDF's actual table rules determine cells, including vertically merged cells.
Run from any directory; optional positional input and output paths are supported.
"""

import argparse
import bisect
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
FILENAME = "katalog-zapchastej-surron-light-bee-2021.pdf"
SHA256 = "5a7100d973a84b32aaa7ddeacd7423edb5c43b32ab718bcbffec13dc9dc55505"
NS = {"p": "http://www.w3.org/1999/xhtml"}
# All table pages share the source's column boundaries, in PDF points.
COLUMNS = [41.58, 69.204, 157.4, 422.65, 501.25, 563.68, 588.28]
COLUMN_NAMES = ["ITEM", "PARTS NO.", "PARTS NAME (EN)", "DIMENSION (mm)", "WEIGHT (kg)", "QTY"]
# Visually audited physical table rows, counting every variant and unnumbered row.
EXPECTED_ROWS = [23, 18, 21, 18, 26, 24, 22, 31, 29, 11, 7, 27, 25, 27, 32, 13, 11, 5, 15, 7]
ASSEMBLIES = {
    "1": ("frame", "Frame, swingarm and seat-frame mounting"),
    "2": ("swingarm", "Swingarm"),
    "3": ("body", "Chain guide and fenders"),
    "4": ("battery", "Battery, controller and charger"),
    "5": ("motor", "Motor and front belt pulley"),
    "6": ("battery-body", "Battery enclosure and covers"),
    "7": ("battery-mounts", "Battery, controller and motor mounts"),
    "8": ("front-wheel", "Front wheel"),
    "9": ("rear-wheel", "Rear wheel"),
    "10": ("electrical", "Lighting, instruments and switches"),
    "11": ("seat-body", "Seat and rear bodywork"),
    "12": ("battery-lock", "Battery lock covers"),
    "13": ("rear-suspension", "Rear suspension and linkage"),
    "14": ("footpegs-stand", "Footpegs and side stand"),
    "15": ("front-suspension", "Steering, headset, handlebars and front fork"),
    "16": ("brakes", "Front and rear brakes"),
    "17": ("jackshaft", "Midshaft / jackshaft and transmission"),
    "18": ("wiring", "Wiring and electrical protection"),
    "19": ("controls-accessories", "Throttle cable, clips and identification plates"),
    "unnumbered-stickers": ("stickers", "Stickers (unnumbered source table)"),
    "21": ("rear-suspension-adapter", "Rear shock adapter (refitting part)"),
    "23": ("pedal-kit", "Pedal conversion kit (refitting parts)"),
    "24": ("supermoto", "Supermoto wheels and rear fender (refitting parts)"),
    "25": ("tools", "Tools and optional accessories"),
}
NORMALIZED_MIDSHAFT = {
    "17_02": "Midshaft right bushing",
    "17_04": "Midshaft right oil seal (Φ15-Φ24-7)",
    "17_05": "Output sprocket (14T)",
    "17_07": "Midshaft bearing",
    "17_08": "Midshaft inner bushing",
    "17_10": "Midshaft left oil seal (Φ15-Φ26-6)",
    "17_11": "Rear belt pulley",
    "17_12": "Midshaft left bushing",
}
SOURCE_ANOMALIES = {
    "3_04": "Source says Screw (M5*12), but this same OEM number is described as M5*10 elsewhere. Neither claim is corrected.",
    "5_16": "Source says Screw (M8*20) against OEM B3-001-08-025-F0. Confirm specification against a factory source; do not infer size from the identifier.",
    "8_14": "Source dimension starts 16O (letter O), not a confirmed numeric 160. Preserved exactly.",
    "10_03": "Source says Screw (M6*16), but this same OEM number is described as M6*10 elsewhere. Neither claim is corrected.",
    "22_15": "Source prints callout 22_15 in the figure-24 supermoto table. Figure grouping follows the actual table; the anomalous callout is unchanged.",
}


def normalize(description, callout):
    if callout in NORMALIZED_MIDSHAFT:
        return NORMALIZED_MIDSHAFT[callout]
    text = description
    replacements = [
        (r"\bMid\. Shaft", "Midshaft"),
        (r"\bRr\. Fork", "Swingarm"),
        (r"\bFr\.", "Front"),
        (r"\bRr\.", "Rear"),
        (r"\bAssy\.?", "Assembly"),
        (r"\bL\b", "Left"),
        (r"\bR\b", "Right"),
        (r"\bBush\b", "Bushing"),
        (r"\bClipper\b", "Caliper"),
        (r"\bNiddle\b", "Needle"),
        (r"\bBrocket\b", "Bracket"),
        (r"\bHanldebar\b", "Handlebar"),
        (r"\bNylion\b", "Nylon"),
        (r"\bUper\b", "Upper"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)
    return text.replace("（", "(").replace("）", ")").strip()


def cell_words(words, left, right, top, bottom):
    # Font changes can move symbols up by < 2 points on the same baseline.
    # Each source cell is a single text line; x order prevents swapped symbols.
    selected = sorted(
        (w for w in words if left < (w[0] + w[2]) / 2 < right and top < (w[1] + w[3]) / 2 < bottom),
        key=lambda w: w[0],
    )
    return " ".join(w[4] for w in selected)


def read_pdf(input_path, temp):
    xml = temp / "layout.xml"
    qdf = temp / "uncompressed.pdf"
    subprocess.run(["pdftotext", "-bbox-layout", str(input_path), str(xml)], check=True)
    subprocess.run(["qpdf", "--qdf", "--object-streams=disable", str(input_path), str(qdf)], check=True)
    raw = qdf.read_bytes().decode("latin1")
    objects = {int(m[1]): m[2] for m in re.finditer(r"(?m)^(\d+) 0 obj\n(.*?)\nendobj", raw, re.S)}
    page_objects = {
        int(m[1]): int(m[2])
        for m in re.finditer(r"%% Page (\d+)\n%% Original object ID: [^\n]+\n(\d+) 0 obj", raw)
    }
    xml_pages = ET.parse(xml).findall(".//p:page", NS)
    if len(xml_pages) != 20 or len(page_objects) != 20:
        raise ValueError("Expected audited 20-page source.")
    result = []
    for page_number, page in enumerate(xml_pages, 1):
        content_id = int(re.search(r"/Contents (\d+) 0 R", objects[page_objects[page_number]])[1])
        content = objects[content_id]
        height = float(page.attrib["height"])
        lines = []
        for match in re.finditer(r"([-\d.]+) ([-\d.]+) m\s*([-\d.]+) ([-\d.]+) l\s*S", content):
            x1, y1, x2, y2 = map(float, match.groups())
            if abs(y1 - y2) < 0.01:
                lines.append((min(x1, x2), max(x1, x2), height - y1))
        rules = [
            sorted({round(y, 2) for x1, x2, y in lines if x1 < (COLUMNS[j] + COLUMNS[j + 1]) / 2 < x2})
            for j in range(6)
        ]
        words = [
            (float(w.attrib["xMin"]), float(w.attrib["yMin"]), float(w.attrib["xMax"]), float(w.attrib["yMax"]), w.text or "")
            for w in page.findall(".//p:word", NS)
        ]
        rows = []
        for top, bottom in zip(rules[1], rules[1][1:]):
            if bottom - top > 35:
                continue  # Space between separate tables/illustrations.
            cells, merged = [], []
            for j in range(6):
                index = bisect.bisect_right(rules[j], (top + bottom) / 2)
                if index == 0 or index == len(rules[j]):
                    cells.append("")
                    continue
                cell_top, cell_bottom = rules[j][index - 1:index + 1]
                value = cell_words(words, COLUMNS[j], COLUMNS[j + 1], cell_top, cell_bottom)
                cells.append(value)
                if value and cell_bottom - cell_top > bottom - top + 1:
                    merged.append(COLUMN_NAMES[j])
            if cells[0] == "ITEM" or not (cells[1] or cells[2]):
                continue
            if not cells[2]:
                raise ValueError(f"Unrecognized row on page {page_number}: {cells}")
            rows.append({"cells": cells, "merged": merged, "bounds": [COLUMNS[0], top, COLUMNS[-1], bottom]})
        if len(rows) != EXPECTED_ROWS[page_number - 1]:
            raise ValueError(f"Page {page_number}: expected {EXPECTED_ROWS[page_number - 1]} physical rows; got {len(rows)}")
        result.append(rows)
    return result


def extract(input_path):
    digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    if digest != SHA256:
        raise ValueError("Source checksum differs from the visually audited edition. Re-audit before applying page corrections.")
    with tempfile.TemporaryDirectory(prefix="lbx2021-") as directory:
        tables = read_pdf(input_path, Path(directory))
    output, page_audits = [], []
    previous_figure = None
    for page_number, table_rows in enumerate(tables, 1):
        imported = []
        for index, table in enumerate(table_rows, 1):
            callout, oem, description, dimensions, weight, quantity = table["cells"]
            notes, flags = [], []
            # The source's 16_03 merged callout is clipped at the page break.
            # Both glyphs remain in the text layer and were visually reconciled.
            if (page_number, oem) in [(14, "52191-YQ2A-0100"), (15, "52191-YQ2B-0100")]:
                callout = "16_03"
                notes.append("Callout 16_03 crosses the page-14/page-15 break; visually reconciled with the clipped printed cell.")
            if page_number == 17 and table["bounds"][1] > 400:
                figure = "unnumbered-stickers"
                flags.append("missing-figure")
            elif callout == "22_15":
                figure = "24"
                flags.append("callout-figure-conflict")
            elif callout:
                if not re.fullmatch(r"\d+_\d+", callout):
                    raise ValueError(f"Malformed callout {callout!r} on page {page_number}")
                figure = callout.split("_")[0]
            else:
                figure = previous_figure
                notes.append("Callout cell is blank; figure association follows the containing source table, not an inferred mechanical parent.")
            previous_figure = figure
            if figure not in ASSEMBLIES:
                raise ValueError(f"Unrecognized figure {figure}")
            if table["merged"]:
                notes.append("Printed vertically merged cell applies to this row: " + ", ".join(table["merged"]) + ".")
            if not callout:
                flags.append("missing-callout")
            if not oem:
                flags.append("missing-oem")
                notes.append("The source OEM cell is empty/diagonally struck through. No part number is inferred from another figure.")
            if not quantity:
                flags.append("missing-quantity")
            elif not quantity.isdigit():
                raise ValueError(f"Unrecognized quantity {quantity!r} on page {page_number}")
            if dimensions:
                notes.append("Dimension column heading: mm. Explicit units/counts within the original cell take precedence.")
                flags.append("dimensions-unverified")
            if weight:
                notes.append("Weight column heading: kg. Decimal comma preserved exactly.")
            if callout in SOURCE_ANOMALIES:
                flags.append("source-content-anomaly")
                notes.append(SOURCE_ANOMALIES[callout])
            if callout == "8_08" and oem == "51290-YQ2A-0100":
                flags.append("source-content-anomaly")
                notes.append("Source dimension cell is 0,2 under DIMENSION (mm); this unusual claim is not corrected or interpreted as a weight.")
            if callout == "8_04" and oem == "51232-YQ2A-0010":
                flags.append("source-content-anomaly")
                notes.append("Source explicitly prints weight 1,322 kg for E-Mark inner tube; kept as printed for review.")
            if callout in {"15_34", "15_35"}:
                notes.append("Shared callout includes multiple records; it does not establish that those records are interchangeable.")
            if figure in {"21", "23", "24", "25"} or "Refitting Part" in description:
                item_type = "optional"
                notes.append("Source identifies this item or its table as Refitting Part / Optional Part; not assumed stock equipment.")
            elif re.search(r"\bAssy\b|\bKit\b|\bSet\b|\+", description, re.I):
                item_type = "assembly"
            elif callout in {"4_01", "4_10", "8_03", "8_04", "9_01", "9_08", "9_09", "9_19", "15_25", "15_34", "16_03", "17_01", "19_08"} or "silence" in description.lower():
                item_type = "variant"
            else:
                item_type = "component"
            material_match = re.search(r"\b(Plastic|Nylon|Steel|Rubber)\b", description)
            # Steel-Grey is a color, not evidence of construction material.
            material = material_match[1] if material_match and not description[material_match.end():].startswith("-") else None
            assembly_key, assembly_name = ASSEMBLIES[figure]
            row = {
                "id": f"lbx2021-p{page_number}-r{index}", "sourceId": "lbx2021",
                "page": page_number, "figure": figure, "callout": callout or None, "rowIndex": index,
                "oemNumber": oem or None, "originalDescription": description,
                "normalizedName": normalize(description, callout),
                "quantity": int(quantity) if quantity else None, "quantityText": quantity or None,
                "dimensionsText": dimensions or None, "weightText": weight or None, "material": material,
                "notes": notes,
                "applicability": "Light Bee X; 2021 reference filename/edition label only. Production-year coverage and cross-year fitment are unverified.",
                "modelYears": [2021], "itemType": item_type,
                "confidence": "high", "reviewFlags": flags,
                "assemblyKey": assembly_key, "assemblyName": assembly_name,
                "rawText": " | ".join(table["cells"]), "bounds": table["bounds"],
            }
            if dimensions:
                row["dimensionUnitText"] = "mm (column heading; explicit cell units take precedence)"
            if weight:
                row["weightUnitText"] = "kg (column heading)"
            imported.append(row)
        output.extend(imported)
        figures = list(dict.fromkeys(row["figure"] for row in imported))
        if page_number == 11:
            figures.append("13")  # Figure 13 illustration; table continues on p12.
        exceptions = []
        if page_number == 3:
            exceptions.append({"callout": "4_09", "reason": "Illustrated callout has no corresponding source table row.", "evidence": "Page 3 charger illustration labels 9; printed table jumps from 4_08 to 4_10. No OEM, quantity or name invented."})
        if page_number == 9:
            exceptions.extend({"callout": f"10_{n}", "reason": "Illustrated callout has no corresponding source table row.", "evidence": f"Page 9 side-stand switch drawing labels {n}, inside assembly 30; tables on pages 9–10 do not contain a 10_{n} row."} for n in (31, 32))
        page_audits.append({
            "page": page_number, "figures": figures, "detectedRows": EXPECTED_ROWS[page_number - 1],
            "importedRows": len(imported), "reviewRowIds": [r["id"] for r in imported if r["reviewFlags"]],
            "exceptions": exceptions, "visualStatus": "inspected",
            "notes": ["Rendered original page visually inspected, including diagram/table membership. Physical row count reconciled with original table rules; merged cells preserve their printed extent."],
        })
    return {
        "version": 1,
        "source": {
            "id": "lbx2021", "title": "Sur-Ron Light Bee X Spare Parts Catalog (2021 reference)",
            "filename": FILENAME, "localPath": f"reference/parts-catalogue/{FILENAME}",
            "url": "https://surron-russia.ru/wp-content/uploads/2022/05/katalog-zapchastej-surron-light-bee-2021.pdf",
            "sha256": digest, "pageCount": 20, "edition": "2021 (filename label; PDF metadata created May 2022)",
            "modelYears": [2021],
            "applicabilityNotes": "Title states Light Bee X. 2021 comes from reference filename, not an explicit production-year fitment statement. Includes color, regional, fork, wheel and optional refitting variants. Do not extend to other model years or treat all entries as simultaneously installed stock equipment.",
            "redistribution": "reference-only", "retrievedAt": "2026-10-13", "kind": "pdf",
        },
        "rows": output, "pages": page_audits,
        "notes": [
            "392 physical parts-table rows transcribed across every page, including blank OEM/callout/quantity cells, continuation pages, color/market alternatives and optional/refitting parts.",
            "Source-table transcription is checked; mechanical dimensions, weights, installation quantities, production-year applicability and interchangeability still need qualified verification.",
            "DIMENSION (mm) and WEIGHT (kg) headings apply unless cell text explicitly gives other units/counts. Raw text preserves Unicode, OEM characters and comma decimal marks. No conversions or suspicious-value corrections were silently applied.",
            "Column/table geometry was extracted from the original PDF vector rules, not guessed by text-line proximity. Shared cells are copied only within their printed borders; blank cells are not filled down.",
            "Assembly membership follows source figure/table grouping only. Commercial complete assemblies are distinct from their listed components; quantities must not be summed into a total motorcycle bill of materials.",
            "The sticker illustration/table has no printed figure or callout; unnumbered-stickers is an audit label, not an invented OEM figure number. Source callout 22_15 is retained within the actual figure-24 table.",
            "Three diagram-only callouts (4_09, 10_31, 10_32) have explicit page-audit exceptions because the source supplies no table rows for them.",
            "Original PDF and rendered reference artwork are local development assets only and must not be published without redistribution rights.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=ROOT / "reference/parts-catalogue" / FILENAME)
    parser.add_argument("output", nargs="?", type=Path, default=ROOT / "data/oem/extracted/lbx2021.json")
    args = parser.parse_args()
    extraction = extract(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(extraction, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(extraction['rows'])} physical rows across {len(extraction['pages'])} audited pages -> {args.output}")
