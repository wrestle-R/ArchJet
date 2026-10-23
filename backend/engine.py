#!/usr/bin/env python3
"""Local-only CUPS adapter. No shell interpolation, document uploads or persistent database."""

import base64
import fcntl
import json
import os
import pwd
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import struct
import urllib.request
import uuid

SUPPORTED = {
    ".pdf",
    ".doc",
    ".docx",
    ".odt",
    ".rtf",
    ".pptx",
    ".xlsx",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".webp",
}
IMAGES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}
ROOT = None


def tool(name):
    path = Path("/usr/bin") / name
    if path.is_file():
        return str(path)
    if name == "magick" and Path("/usr/bin/convert").is_file():
        return "/usr/bin/convert"
    raise ValueError(
        f"{name} is missing. Open Printer setup for installation instructions."
    )


def run(args, timeout=45):
    if Path(args[0]).name == "convert" and len(args) > 1 and args[1] == "identify":
        args = ["/usr/bin/identify", *args[2:]]
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            timeout=timeout,
            env={
                **os.environ,
                "LC_ALL": "C",
                "CUPS_SERVER": "localhost",
                "IPP_PORT": "631",
            },
        )
    except subprocess.TimeoutExpired:
        raise ValueError(
            f"{Path(args[0]).name} timed out. Check the printer and try again."
        )
    if result.returncode:
        detail = result.stderr.decode(errors="replace").strip()[-700:]
        raise ValueError(f"{Path(args[0]).name}: {detail or 'operation failed'}")
    return result.stdout.decode(errors="replace")


def read(name, default):
    path = ROOT / name
    return json.loads(path.read_text()) if path.exists() else default


def save(name, data):
    target = ROOT / name
    tmp = target.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(target)


def pages(expression, count, mode="custom"):
    if count < 1:
        raise ValueError("This document has no printable pages.")
    if mode == "all":
        return list(range(1, count + 1))
    if mode == "odd":
        return list(range(1, count + 1, 2))
    if mode == "even":
        selected = list(range(2, count + 1, 2))
        if not selected:
            raise ValueError("This document has no even pages.")
        return selected
    if not expression.strip():
        raise ValueError("Enter pages, for example 1,5,2-4.")
    if len(expression) > 10000:
        raise ValueError("Page selection is too long.")
    selected = []
    for item in expression.split(","):
        match = re.fullmatch(r"\s*(\d+)\s*(?:-\s*(\d+)\s*)?", item)
        if not match:
            raise ValueError(
                "Use page numbers and ranges separated by commas, for example 1,5,2-4."
            )
        a, b = int(match[1]), int(match[2] or match[1])
        if not (1 <= a <= count and 1 <= b <= count):
            raise ValueError(f"Choose pages between 1 and {count}.")
        selected.extend(range(a, b + (1 if b >= a else -1), 1 if b >= a else -1))
        if len(selected) > 2000:
            raise ValueError("Select at most 2,000 page occurrences per file.")
    return selected


def ipp_jobs():
    """Read structured job states from the local scheduler (RFC 8010/8011)."""

    def attribute(tag, name, value):
        key, data = name.encode(), value.encode()
        return (
            bytes([tag])
            + struct.pack(">H", len(key))
            + key
            + struct.pack(">H", len(data))
            + data
        )

    body = b"\x02\x00\x00\x0a\x00\x00\x00\x01\x01"
    body += attribute(0x47, "attributes-charset", "utf-8")
    body += attribute(0x48, "attributes-natural-language", "en")
    body += attribute(0x45, "printer-uri", "ipp://localhost/")
    body += attribute(0x42, "requesting-user-name", pwd.getpwuid(os.getuid()).pw_name)
    body += attribute(0x44, "which-jobs", "all")
    body += attribute(0x44, "requested-attributes", "job-id")
    for name in [
        "job-state",
        "job-name",
        "job-printer-uri",
        "job-originating-user-name",
        "job-state-reasons",
        "job-impressions-completed",
        "job-media-sheets-completed",
    ]:
        body += attribute(0x44, "", name)
    body += b"\x03"
    request = urllib.request.Request(
        "http://localhost:631/", data=body, headers={"Content-Type": "application/ipp"}
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        data = response.read(4 * 1024 * 1024)
    if len(data) < 8 or struct.unpack(">H", data[2:4])[0] >= 0x0400:
        raise ValueError("CUPS job attributes are unavailable.")
    offset, jobs, current, previous, group = 8, [], None, "", 0
    while offset < len(data):
        tag = data[offset]
        offset += 1
        if tag == 3:
            break
        if tag < 16:
            group = tag
            if tag == 2:
                current = {}
                jobs.append(current)
            continue
        length = struct.unpack(">H", data[offset : offset + 2])[0]
        offset += 2
        name = data[offset : offset + length].decode(errors="replace") or previous
        offset += length
        previous = name
        size = struct.unpack(">H", data[offset : offset + 2])[0]
        offset += 2
        raw = data[offset : offset + size]
        offset += size
        value = (
            struct.unpack(">i", raw)[0]
            if tag in (0x21, 0x23) and size == 4
            else raw.decode(errors="replace")
        )
        if group == 2 and current is not None:
            current[name] = value
    return jobs


def queue_status():
    result = run([tool("lpstat"), "-W", "not-completed", "-o"])
    active = []
    for line in result.splitlines():
        parts = line.split()
        if len(parts) >= 3 and re.fullmatch(r".+-\d+", parts[0]):
            active.append(
                {
                    "id": parts[0],
                    "owner": parts[1],
                    "bytes": parts[2],
                    "description": " ".join(parts[3:]),
                }
            )
    return active


def capabilities(name):
    try:
        output = run([tool("lpoptions"), "-p", name, "-l"])
    except ValueError:
        return {}
    caps = {}
    for line in output.splitlines():
        if ": " not in line:
            continue
        key, values = line.split(": ", 1)
        key = key.split("/")[0]
        values = values.split()
        caps[key] = {
            "values": [v.lstrip("*") for v in values],
            "default": next((v[1:] for v in values if v.startswith("*")), None),
        }
    return caps


def discover(_):
    try:
        states = run([tool("lpstat"), "-p"])
        uris = run([tool("lpstat"), "-v"])
        accepting = run([tool("lpstat"), "-a"])
    except ValueError as error:
        return {"printers": [], "warning": str(error)}
    try:
        default = run([tool("lpstat"), "-d"]).strip().split(": ", 1)[-1]
    except ValueError:
        default = ""
    printers = []
    for line in states.splitlines():
        match = re.match(r"printer (\S+) (.*)", line)
        if not match:
            continue
        name, state = match.groups()
        uri = next(
            (
                l.split(": ", 1)[1]
                for l in uris.splitlines()
                if l.startswith(f"device for {name}: ")
            ),
            "",
        )
        caps = capabilities(name)
        p1007 = "p1007" in (name + uri).lower()
        connected = None
        if p1007 and ("usb" in uri.lower()):
            connected = any(
                p.read_text().strip() == "03f0"
                and (p.parent / "idProduct").read_text().strip() == "4817"
                for p in Path("/sys/bus/usb/devices").glob("*/idVendor")
                if (p.parent / "idProduct").exists()
            )
        paper = caps.get("PageSize", caps.get("media", {}))
        duplex = caps.get("Duplex", caps.get("sides", {}))
        color = caps.get("ColorModel", caps.get("print-color-mode", {}))
        installed_duplex = caps.get("OptionDuplex", {}).get("default")
        printers.append(
            {
                "id": name,
                "name": name.replace("_", " "),
                "state": state,
                "uri": uri,
                "default": name == default,
                "connected": connected,
                "ready": "disabled" not in state
                and connected is not False
                and any(
                    l.startswith(name + " accepting") for l in accepting.splitlines()
                ),
                "compatibility": p1007,
                "papers": [
                    p
                    for p in paper.get("values", ["A4", "Letter"])
                    if not p.startswith("Custom.")
                ],
                "defaultPaper": paper.get("default") or "A4",
                "duplex": duplex.get("values", [])
                if installed_duplex not in ("False", "None", "NotInstalled")
                else [],
                "colors": color.get("values", []),
                "colorOption": "ColorModel"
                if "ColorModel" in caps
                else "print-color-mode",
                "capabilities": caps,
            }
        )
    return {"printers": printers}


def diagnostics(_):
    groups = [
        (
            "CUPS",
            ["lp", "lpstat", "lpoptions", "cancel"],
            "sudo pacman -S cups\nsudo systemctl enable --now cups.service",
        ),
        (
            "PDF tools",
            ["pdfinfo", "pdftoppm", "pdfseparate", "pdfunite"],
            "sudo pacman -S poppler",
        ),
        ("Office conversion", ["libreoffice"], "sudo pacman -S libreoffice-fresh"),
        ("Image conversion", ["magick"], "sudo pacman -S imagemagick"),
        (
            "HP driver (optional)",
            ["hp-info", "hp-firmware"],
            "sudo pacman -S hplip\nhp-plugin -i",
        ),
    ]
    helper = next((h for h in ["yay", "paru"] if shutil.which(h)), None)
    checks = [
        {
            "name": name,
            "ok": all(
                (Path("/usr/bin") / t).exists()
                or (t == "magick" and Path("/usr/bin/convert").exists())
                for t in tools
            ),
            "tools": tools,
            "command": command,
        }
        for name, tools, command in groups
    ]
    checks.append(
        {
            "name": "HP proprietary plugin (optional)",
            "ok": Path("/usr/share/hplip/prnt/plugins/lj.so").exists(),
            "tools": ["HPLIP plugin and firmware"],
            "command": f"{helper} -S hplip-plugin" if helper else "hp-plugin -i",
        }
    )
    return {
        "recoveryError": (ROOT / "recovery-error.txt").read_text()
        if (ROOT / "recovery-error.txt").exists()
        else "",
        "checks": checks,
        "desktop": os.environ.get("XDG_CURRENT_DESKTOP", "Unknown"),
        "session": os.environ.get("XDG_SESSION_TYPE", "Unknown"),
        "aurHelper": helper,
    }


def folder(payload):
    path = Path(payload["path"]).resolve(strict=True)
    if not path.is_dir():
        raise ValueError("Choose a folder.")
    candidates = path.rglob("*") if payload.get("recursive") else path.iterdir()
    files, unsupported = [], 0
    for item in candidates:
        if item.is_file() and not item.is_symlink():
            if item.suffix.lower() in SUPPORTED:
                files.append({"path": str(item), "name": str(item.relative_to(path))})
            else:
                unsupported += 1
        if len(files) >= 1000:
            break
    return {
        "files": sorted(files, key=lambda f: f["name"].lower()),
        "unsupported": unsupported,
    }


def image_pdf(source, dest):
    jpg = dest.with_suffix(".jpg")
    run(
        [
            tool("magick"),
            str(source) + "[0]",
            "-auto-orient",
            "-background",
            "white",
            "-alpha",
            "remove",
            "-colorspace",
            "sRGB",
            str(jpg),
        ],
        120,
    )
    dimensions = run([tool("magick"), "identify", "-format", "%w %h", str(jpg)]).split()
    width, height = map(int, dimensions)
    data = jpg.read_bytes()
    w, h = width * 0.75, height * 0.75
    content = f"q {w} 0 0 {h} 0 0 cm /Im0 Do Q".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>".encode(),
        f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(data)} >>\nstream\n".encode()
        + data
        + b"\nendstream",
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream",
    ]
    output, offsets = bytearray(b"%PDF-1.4\n"), [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(output)
    output.extend(f"xref\n0 6\n0000000000 65535 f \n".encode())
    for off in offsets[1:]:
        output.extend(f"{off:010d} 00000 n \n".encode())
    output.extend(
        f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    )
    dest.write_bytes(output)
    jpg.unlink()


def blank_pdf(path, reference):
    info = run([tool("pdfinfo"), str(reference)])
    match = re.search(r"Page size:\s+([\d.]+) x ([\d.]+)", info)
    width, height = (float(match[1]), float(match[2])) if match else (595.2, 841.92)
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Resources << >> >>".encode(),
    ]
    data, offsets = bytearray(b"%PDF-1.4\n"), [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(data)
    data.extend(b"xref\n0 4\n0000000000 65535 f \n")
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(
        f"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    )
    path.write_bytes(data)


def import_file(payload):
    source = Path(payload["path"]).resolve(strict=True)
    if not source.is_file() or source.suffix.lower() not in SUPPORTED:
        raise ValueError("Choose a supported PDF, office document or image.")
    if source.stat().st_size > 250 * 1024 * 1024:
        raise ValueError("This file exceeds the 250 MB import limit.")
    ident = uuid.uuid4().hex
    directory = ROOT / ident
    directory.mkdir(mode=0o700)
    pdf = directory / "document.pdf"
    try:
        if source.suffix.lower() == ".pdf":
            shutil.copyfile(source, pdf)
        elif source.suffix.lower() in IMAGES:
            image_pdf(source, pdf)
        else:
            conversion = directory / "conversion"
            conversion.mkdir()
            run(
                [
                    tool("libreoffice"),
                    f"-env:UserInstallation={directory.as_uri()}/lo-profile",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(conversion),
                    str(source),
                ],
                180,
            )
            converted = next(conversion.glob("*.pdf"), None)
            if not converted:
                raise ValueError(
                    "Office conversion did not produce a PDF. Check the document format."
                )
            shutil.move(converted, pdf)
        info = run([tool("pdfinfo"), str(pdf)])
        if re.search(r"Encrypted:\s+yes", info):
            raise ValueError(
                "This PDF is encrypted. Save an unlocked copy before adding it."
            )
        count = re.search(r"Pages:\s+(\d+)", info)
        if not count:
            raise ValueError("Unable to read the page count.")
        size = re.search(r"Page size:\s+([^\n]+)", info)
        item = {
            "id": ident,
            "name": source.name,
            "pages": int(count[1]),
            "size": size[1] if size else "",
            "bytes": source.stat().st_size,
        }
        documents = read("documents.json", {})
        documents[ident] = item
        save("documents.json", documents)
        return item
    except Exception:
        shutil.rmtree(directory, ignore_errors=True)
        raise


def document(ident):
    item = read("documents.json", {}).get(ident)
    if not item:
        raise ValueError("Document is no longer available. Add it again.")
    return item, ROOT / ident / "document.pdf"


def preview(payload):
    item, pdf = document(payload["id"])
    page = int(payload.get("page", 1))
    if not 1 <= page <= item["pages"]:
        raise ValueError("Page is outside this document.")
    stem = pdf.parent / f"preview-{page}"
    image = stem.with_suffix(".png")
    if not image.exists():
        run(
            [
                tool("pdftoppm"),
                "-f",
                str(page),
                "-l",
                str(page),
                "-scale-to",
                "1400",
                "-singlefile",
                "-png",
                str(pdf),
                str(stem),
            ],
            90,
        )
    return {
        "image": "data:image/png;base64,"
        + base64.b64encode(image.read_bytes()).decode()
    }


def status(_):
    active = queue_status()
    jobs = read("jobs.json", [])
    active_ids = {j["id"] for j in active}
    try:
        reported = ipp_jobs()
    except Exception:
        reported = []
    states = {
        3: "pending",
        4: "held",
        5: "processing",
        6: "stopped",
        7: "cancelled",
        8: "failed",
        9: "queue-cleared",
    }
    try:
        printer_states = run([tool("lpstat"), "-p"])
    except ValueError:
        printer_states = ""
    for pending in active:
        queue = pending["id"].rsplit("-", 1)[0]
        signal = next(
            (
                j
                for j in reported
                if str(j.get("job-id")) == pending["id"].rsplit("-", 1)[-1]
                and str(j.get("job-printer-uri", "")).rsplit("/", 1)[-1] == queue
            ),
            {},
        )
        pending["state"] = states.get(signal.get("job-state"), "pending")
        pending["reason"] = signal.get("job-state-reasons", "")
        pending["reportedSheets"] = signal.get("job-media-sheets-completed", 0)
        pending["printerPaused"] = any(
            line.startswith(f"printer {queue} ") and "disabled" in line
            for line in printer_states.splitlines()
        )
    for job in jobs:
        signal = next(
            (
                j
                for j in reported
                if j.get("job-name") == f"Print Arch {job['id']}"
                or (
                    job.get("cupsId")
                    and str(j.get("job-id")) == job["cupsId"].rsplit("-", 1)[-1]
                    and str(j.get("job-printer-uri", "")).rsplit("/", 1)[-1]
                    == job.get("printer")
                )
            ),
            None,
        )
        if signal:
            queue = str(signal.get("job-printer-uri", "")).rsplit("/", 1)[-1]
            job["cupsId"] = f"{queue}-{signal['job-id']}"
            job["state"] = states.get(signal.get("job-state"), "unknown")
            job["reportedSheets"] = signal.get("job-media-sheets-completed")
            expected = job.get(
                "expectedSheets", len(job.get("pages", [])) * job.get("copies", 1)
            )
            job["expectedSheets"] = expected
            if (
                isinstance(job["reportedSheets"], int)
                and job["reportedSheets"] > expected
            ):
                job["accountingWarning"] = (
                    f"CUPS reports {job['reportedSheets']} sheets, exceeding the expected {expected}. Check the physical output before printing again."
                )
        elif job.get("cupsId") in active_ids:
            job["state"] = "active"
        elif job.get("state") not in ("failed", "uncertain", "cancelled"):
            job["state"] = "unknown"
    return {"active": active, "jobs": jobs}


def validate_options(printer, options):
    paper = options.get("paper", printer["defaultPaper"])
    if paper not in printer["papers"]:
        raise ValueError("The selected paper is not supported by this printer.")
    sides = options.get("sides", "one-sided")
    if sides not in ("one-sided", "two-sided-long-edge", "two-sided-short-edge"):
        raise ValueError("Invalid sides setting.")
    duplex_map = {
        "two-sided-long-edge": ("DuplexNoTumble", "two-sided-long-edge"),
        "two-sided-short-edge": ("DuplexTumble", "two-sided-short-edge"),
    }
    if sides != "one-sided" and not any(
        v in printer["duplex"] for v in duplex_map[sides]
    ):
        raise ValueError(
            "This printer does not advertise the selected duplex capability."
        )
    color = options.get("color", "")
    if color and color not in printer["colors"]:
        raise ValueError("The selected color mode is not supported.")
    if options.get("orientation", "portrait") not in ("portrait", "landscape"):
        raise ValueError("Choose portrait or landscape orientation.")
    if options.get("scale", "fit") not in ("fit", "actual"):
        raise ValueError("Choose fit to paper or actual size scaling.")
    return {**options, "paper": paper, "sides": sides, "color": color}


def submit(payload):
    if (ROOT / "recovery-error.txt").exists():
        raise ValueError((ROOT / "recovery-error.txt").read_text())
    printers = discover({})["printers"]
    printer = next((p for p in printers if p["id"] == payload.get("printer")), None)
    if not printer or not printer["ready"]:
        raise ValueError(
            "Printer is unavailable. Check its connection and queue, then refresh."
        )
    token = payload.get("token", "")
    if not re.fullmatch("[a-zA-Z0-9-]{8,80}", token):
        raise ValueError("Invalid print request identity.")
    previous = read("jobs.json", [])
    if any(j.get("token") == token for j in previous):
        raise ValueError(
            "This request was already attempted. Check the queue before creating a new print request."
        )
    items = payload.get("items", [])
    if not items:
        raise ValueError("Add at least one document.")
    options = payload.get("options", {})
    work = ROOT / ("request-" + token)
    work.mkdir(mode=0o700)
    prepared = []
    # Finish all rendering before submitting the first file, so malformed later files cannot partially submit.
    for index, selected in enumerate(items):
        file_options = validate_options(
            printer, {**options, **selected.get("override", {})}
        )
        item, pdf = document(selected["id"])
        sequence = pages(
            selected.get("range", ""), item["pages"], selected.get("mode", "all")
        )
        copies = int(selected.get("copies", 1))
        if not 1 <= copies <= 99:
            raise ValueError("Copies must be between 1 and 99.")
        expanded_count = len(sequence) * copies + (
            (copies - 1)
            if file_options["sides"] != "one-sided" and len(sequence) % 2
            else 0
        )
        if expanded_count > 2000:
            raise ValueError(
                "Select at most 2,000 output page occurrences including copies per document."
            )
        if shutil.disk_usage(ROOT).free < expanded_count * (
            40_000_000 if printer["compatibility"] else 2_000_000
        ):
            raise ValueError(
                "Not enough temporary disk space. Free space or select fewer pages."
            )
        directory = work / str(index)
        directory.mkdir()
        unique = {}
        for number in dict.fromkeys(sequence):
            path = directory / f"source-{number}.pdf"
            run(
                [
                    tool("pdfseparate"),
                    "-f",
                    str(number),
                    "-l",
                    str(number),
                    str(pdf),
                    str(path),
                ]
            )
            unique[number] = path
        ordered = directory / "ordered.pdf"
        assembled = []
        for copy_index in range(copies):
            assembled.extend(str(unique[n]) for n in sequence)
            # Each collated duplex copy must begin on a fresh physical sheet.
            if (
                file_options["sides"] != "one-sided"
                and len(sequence) % 2
                and copy_index < copies - 1
            ):
                blank = directory / "blank.pdf"
                if not blank.exists():
                    blank_pdf(blank, unique[sequence[-1]])
                assembled.append(str(blank))
        run([tool("pdfunite"), *assembled, str(ordered)], 120)
        outputs = [ordered]
        if printer["compatibility"]:
            run(
                [
                    tool("pdftoppm"),
                    "-r",
                    "600",
                    "-png",
                    "-gray",
                    str(ordered),
                    str(directory / "raster"),
                ],
                600,
            )
            outputs = sorted(
                directory.glob("raster-*.png"), key=lambda p: int(p.stem.split("-")[-1])
            )
            if len(outputs) != expanded_count:
                raise ValueError(
                    "Raster output page count does not match the selection. Nothing was submitted."
                )
        prepared.append((item, sequence, copies, outputs, file_options))
    for item, sequence, copies, outputs, options in prepared:
        paper, sides, color = options["paper"], options["sides"], options["color"]
        job = {
            "id": uuid.uuid4().hex,
            "token": token,
            "name": item["name"],
            "pages": sequence,
            "copies": copies,
            "printer": printer["id"],
            "state": "uncertain",
            "created": time.time(),
            "expandedCopies": True,
            "expectedSheets": (
                (len(sequence) + 1) // 2 if sides != "one-sided" else len(sequence)
            )
            * copies,
        }
        previous.append(job)
        save(
            "jobs.json", previous
        )  # Journal before submission; never auto-retry an ambiguous lp outcome.
        args = [
            tool("lp"),
            "-d",
            printer["id"],
            "-t",
            f"Print Arch {job['id']}",
            "-n",
            "1",
            "-o",
            f"media={paper}",
            "-o",
            f"sides={sides}",
            "-o",
            "Collate=True",
        ]
        if options.get("orientation") == "landscape":
            args += ["-o", "orientation-requested=4"]
        if options.get("scale", "fit") == "fit":
            args += ["-o", "fit-to-page"]
        else:
            args += ["-o", "print-scaling=none"]
        if color:
            args += ["-o", f"{printer['colorOption']}={color}"]
        if printer["compatibility"]:
            args += ["-o", "print-color-mode=monochrome"]
        try:
            result = run([*args, *map(str, outputs)], 90)
            match = re.search(r"request id is (\S+)", result)
            if not match:
                raise ValueError(
                    "Submission outcome is uncertain. Inspect the queue; do not resend this request."
                )
            job.update(cupsId=match[1], state="active")
            save("jobs.json", previous)
        except Exception as error:
            job["detail"] = str(error)
            save("jobs.json", previous)
            raise ValueError(
                "Submission needs inspection. Earlier files may already be printing. Open Queue before trying again. "
                + str(error)
            )
    return {"jobs": previous}


def cancel_job(payload):
    ident = payload.get("id", "")
    if ident not in {j["id"] for j in queue_status()}:
        raise ValueError("This job is no longer active. Refresh the queue.")
    run([tool("cancel"), ident])
    return {"ok": True}


def recover(payload):
    printer = next(
        (p for p in discover({})["printers"] if p["id"] == payload.get("printer")), None
    )
    if not printer or printer["connected"] is False:
        raise ValueError("Connect and power on the printer before restoring its queue.")
    if any(j["id"].rsplit("-", 1)[0] == printer["id"] for j in queue_status()):
        raise ValueError(
            "This printer has pending jobs. Use Resume existing job from Queue after checking the physical output, or cancel the exact job first."
        )
    run([tool("cupsenable"), printer["id"]])
    run([tool("cupsaccept"), printer["id"]])
    if payload.get("firmware") and printer["compatibility"]:
        run([tool("hp-firmware"), "-n", "-d", printer["uri"]], 120)
    return discover({})


def resume_job(payload):
    if payload.get("confirmed") is not True:
        raise ValueError(
            "Check the output and load paper before continuing the existing job."
        )
    ident = payload.get("id", "")
    current = next((j for j in status({})["active"] if j["id"] == ident), None)
    if not current:
        raise ValueError(
            "This job is no longer active. Refresh Queue; no new job was created."
        )
    printer_id = ident.rsplit("-", 1)[0]
    printer = next((p for p in discover({})["printers"] if p["id"] == printer_id), None)
    if not printer or printer["connected"] is False:
        raise ValueError(
            "Connect and power on the printer first. The existing job has not been resubmitted."
        )
    if current["state"] == "processing" and not current["printerPaused"]:
        return {
            "ok": True,
            "message": "The existing job is still processing. After paper is loaded, the printer may continue automatically. No new job was sent.",
        }
    if current["printerPaused"]:
        run([tool("cupsenable"), printer_id])
        run([tool("cupsaccept"), printer_id])
    if current["state"] == "held":
        run([tool("lp"), "-i", ident, "-H", "resume"])
    return {
        "ok": True,
        "message": "The existing CUPS job was resumed. No new print request was created. Watch the output before attempting a reprint.",
    }


def cancel_all_local():
    # Some CUPS policies reject `cancel -a` even for an empty queue. Cancel each
    # discovered pending job explicitly, then verify that every local queue cleared.
    for _ in range(3):
        pending = queue_status()
        if not pending:
            return
        failures = []
        for job in pending:
            try:
                run([tool("cancel"), job["id"]])
            except ValueError as error:
                failures.append(str(error))
        remaining = queue_status()
        if not remaining:
            return
        if failures:
            raise ValueError(
                "Some local jobs could not be cancelled. CUPS may require authorization. "
                + "; ".join(failures)
            )
        time.sleep(0.2)
    raise ValueError(
        "Local jobs are still pending after cancellation. Check CUPS before exiting."
    )


def cleanup(payload):
    if payload.get("cancelAll"):
        # Explicit user requirement: all local pending jobs, including those created outside this app.
        cancel_all_local()
    elif queue_status():
        raise ValueError(
            "Printing is still active. Wait for the queues to clear or cancel all jobs."
        )
    for item in ROOT.iterdir():
        if item.name in ("engine.py", ".lock"):
            continue
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()
    clear_marker()
    (ROOT / ".clean-exit").touch()
    return {"ok": True}


def marker_path():
    return (
        Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state")))
        / "print-arch"
        / "session.json"
    )


def startup(payload):
    marker = marker_path()
    old = json.loads(marker.read_text()) if marker.exists() else None
    if old:
        # A previous crash/shutdown may have killed the watchdog too. Reconcile before accepting new work.
        cancel_all_local()
        previous = Path(old.get("root", ""))
        if (
            previous.parent == Path(tempfile.gettempdir())
            and previous.name.startswith("print-arch-")
            and not previous.is_symlink()
            and previous.exists()
            and previous.stat().st_uid == os.getuid()
        ):
            shutil.rmtree(previous)
    marker.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    marker.write_text(json.dumps({"root": str(ROOT)}))
    marker.chmod(0o600)
    return {"recovered": bool(old)}


def clear_marker():
    marker = marker_path()
    try:
        if json.loads(marker.read_text()).get("root") == str(ROOT):
            marker.unlink()
            marker.parent.rmdir()
    except (FileNotFoundError, OSError):
        pass


def watch(parent):
    while True:
        try:
            os.kill(parent, 0)
        except ProcessLookupError:
            break
        time.sleep(1)
    if (ROOT / ".clean-exit").exists():
        shutil.rmtree(ROOT, ignore_errors=True)
        return
    # Detached process survives SIGKILL of GUI. Machine shutdown requires next-launch reconciliation.
    for _ in range(5):
        try:
            with (ROOT / ".lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                cleanup({"cancelAll": True})
            shutil.rmtree(ROOT, ignore_errors=True)
            return
        except Exception:
            time.sleep(2)
    # Keep private session directory as evidence of incomplete cleanup, no false success claim.


ACTIONS = {
    "discover": discover,
    "diagnostics": diagnostics,
    "folder": folder,
    "import": import_file,
    "startup": startup,
    "preview": preview,
    "status": status,
    "submit": submit,
    "cancel": cancel_job,
    "recover": recover,
    "resume": resume_job,
    "cleanup": cleanup,
    "open-cups": lambda _: {
        "result": run([tool("xdg-open"), "http://localhost:631/admin"])
    },
    "selection": lambda p: {
        "pages": pages(p.get("range", ""), int(p["count"]), p.get("mode", "all"))
    },
}

if __name__ == "__main__":
    ROOT = Path(sys.argv[1]).resolve()
    if sys.argv[2] == "--watch":
        watch(int(sys.argv[3]))
    else:
        try:
            action = sys.argv[2]
            if action not in ACTIONS:
                raise ValueError("Unknown printer operation.")
            payload = json.load(sys.stdin)
            if action in ("import", "submit", "cleanup", "recover", "cancel", "resume"):
                with (ROOT / ".lock").open("a") as lock:
                    fcntl.flock(lock, fcntl.LOCK_EX)
                    result = ACTIONS[action](payload)
            else:
                result = ACTIONS[action](payload)
            print(json.dumps(result))
        except Exception as error:
            print(json.dumps({"error": str(error)}))
            sys.exit(1)
