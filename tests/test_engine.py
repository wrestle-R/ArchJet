import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "engine", Path(__file__).parents[1] / "backend/engine.py"
)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def fixture_pdf(path, count=5):
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{' '.join(f'{4 + i * 2} 0 R' for i in range(count))}] /Count {count} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for i in range(count):
        content = f"BT /F1 24 Tf 72 740 Td (Page {i + 1}) Tj ET".encode()
        objects += [
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {5 + i * 2} 0 R >>".encode(),
            f"<< /Length {len(content)} >>\nstream\n".encode()
            + content
            + b"\nendstream",
        ]
    data, offsets = bytearray(b"%PDF-1.4\n"), [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(data)
    data.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    )
    path.write_bytes(data)


class SelectionTests(unittest.TestCase):
    def test_custom_order_and_repeats(self):
        self.assertEqual(engine.pages("1,5,2-4,1", 5), [1, 5, 2, 3, 4, 1])

    def test_reverse_range(self):
        self.assertEqual(engine.pages("5-2", 5), [5, 4, 3, 2])

    def test_odd_even_all(self):
        self.assertEqual(engine.pages("", 5, "odd"), [1, 3, 5])
        self.assertEqual(engine.pages("", 5, "even"), [2, 4])
        self.assertEqual(engine.pages("", 2, "all"), [1, 2])

    def test_invalid_selection(self):
        for expression in ["", "0", "6", "-1", "1,,2", "1;touch /tmp/no", "1-6", "1.5"]:
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                engine.pages(expression, 5)

    def test_no_even_pages(self):
        with self.assertRaises(ValueError):
            engine.pages("", 1, "even")

    def test_max_selection(self):
        with self.assertRaises(ValueError):
            engine.pages(",".join(["1"] * 2001), 1)


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        engine.ROOT = self.root / "session"
        engine.ROOT.mkdir()
        self.source = self.root / "literal name (1);$file.pdf"
        fixture_pdf(self.source)

    def tearDown(self):
        self.tmp.cleanup()

    def add(self):
        return engine.import_file({"path": str(self.source)})

    def printer(self):
        return {
            "id": "Test",
            "ready": True,
            "papers": ["A4"],
            "defaultPaper": "A4",
            "duplex": [],
            "colors": ["Gray"],
            "colorOption": "ColorModel",
            "compatibility": False,
        }

    def test_import_preview_snapshot(self):
        doc = self.add()
        self.assertEqual(doc["pages"], 5)
        self.source.unlink()
        image = engine.preview({"id": doc["id"], "page": 5})["image"]
        self.assertTrue(image.startswith("data:image/png;base64,iVBOR"))

    def test_preview_outside_document(self):
        doc = self.add()
        with self.assertRaises(ValueError):
            engine.preview({"id": doc["id"], "page": 6})

    def test_folder_filters_symlinks_and_subfolders(self):
        (self.root / "ignore.txt").write_text("hi")
        (self.root / "link.pdf").symlink_to(self.source)
        nested = self.root / "nested"
        nested.mkdir()
        fixture_pdf(nested / "second.pdf", 1)
        result = engine.folder({"path": str(self.root)})
        self.assertEqual(len(result["files"]), 1)
        self.assertEqual(result["unsupported"], 1)
        self.assertEqual(
            len(engine.folder({"path": str(self.root), "recursive": True})["files"]), 2
        )

    def test_real_ordered_pdf_and_mock_submission(self):
        doc = self.add()
        real = engine.run
        captured = []

        def command(args, timeout=45):
            if Path(args[0]).name == "lp":
                captured.append(args)
                return "request id is Test-42 (1 file(s))"
            return real(args, timeout)

        payload = {
            "token": "test-token-123",
            "printer": "Test",
            "items": [
                {"id": doc["id"], "mode": "custom", "range": "5,1,3-2,1", "copies": 2}
            ],
            "options": {"paper": "A4", "color": "Gray"},
        }
        with (
            patch.object(
                engine, "discover", return_value={"printers": [self.printer()]}
            ),
            patch.object(engine, "run", side_effect=command),
        ):
            engine.submit(payload)
            with self.assertRaisesRegex(ValueError, "already attempted"):
                engine.submit(payload)
        output = engine.ROOT / "request-test-token-123/0/ordered.pdf"
        text = subprocess.check_output(
            ["/usr/bin/pdftotext", str(output), "-"], text=True
        )
        self.assertEqual(
            [v.strip() for v in text.split("\f") if v.strip()],
            ["Page 5", "Page 1", "Page 3", "Page 2", "Page 1"] * 2,
        )
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0][captured[0].index("-n") + 1], "1")

    def test_validate_all_files_before_submit(self):
        doc = self.add()
        with (
            patch.object(
                engine, "discover", return_value={"printers": [self.printer()]}
            ),
            patch.object(engine, "run", wraps=engine.run) as run,
        ):
            with self.assertRaises(ValueError):
                engine.submit(
                    {
                        "token": "invalid-order-123",
                        "printer": "Test",
                        "items": [{"id": doc["id"]}, {"id": "missing"}],
                    }
                )
            self.assertFalse(
                any(Path(c.args[0][0]).name == "lp" for c in run.call_args_list)
            )

    def test_disconnected_printer_blocks(self):
        with patch.object(
            engine,
            "discover",
            return_value={"printers": [{**self.printer(), "ready": False}]},
        ):
            with self.assertRaisesRegex(ValueError, "unavailable"):
                engine.submit({"printer": "Test"})

    def test_cleanup_refuses_active_jobs_without_cancel(self):
        self.add()
        with patch.object(engine, "queue_status", return_value=[{"id": "Other-1"}]):
            with self.assertRaisesRegex(ValueError, "still active"):
                engine.cleanup({})
        self.assertTrue((engine.ROOT / "documents.json").exists())

    def test_cleanup_cancels_all_and_checks_result(self):
        self.add()
        with (
            patch.object(engine, "run") as run,
            patch.object(
                engine,
                "queue_status",
                side_effect=[[{"id": "Other-1"}, {"id": "Test-2"}], []],
            ),
        ):
            engine.cleanup({"cancelAll": True})
            self.assertEqual(
                [c.args[0] for c in run.call_args_list],
                [["/usr/bin/cancel", "Other-1"], ["/usr/bin/cancel", "Test-2"]],
            )
        self.assertEqual([p.name for p in engine.ROOT.iterdir()], [".clean-exit"])

    def test_permission_failure_preserves_session(self):
        self.add()
        with (
            patch.object(engine, "queue_status", return_value=[{"id": "Other-1"}]),
            patch.object(engine, "run", side_effect=ValueError("Forbidden")),
        ):
            with self.assertRaisesRegex(ValueError, "Forbidden"):
                engine.cleanup({"cancelAll": True})
        self.assertTrue((engine.ROOT / "documents.json").exists())

    def test_unknown_not_marked_successful(self):
        engine.save(
            "jobs.json", [{"id": "test", "cupsId": "Test-99", "state": "active"}]
        )
        with (
            patch.object(engine, "queue_status", return_value=[]),
            patch.object(engine, "run", return_value=""),
        ):
            self.assertEqual(engine.status({})["jobs"][0]["state"], "unknown")

    def test_docx_conversion(self):
        source = self.root / "notes.docx"
        with zipfile.ZipFile(source, "w") as archive:
            archive.writestr(
                "[Content_Types].xml",
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
            )
            archive.writestr(
                "_rels/.rels",
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
            )
            archive.writestr(
                "word/document.xml",
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Local office conversion check.</w:t></w:r></w:p></w:body></w:document>',
            )
        result = engine.import_file({"path": str(source)})
        self.assertEqual(result["pages"], 1)
        self.assertTrue(
            engine.preview({"id": result["id"]})["image"].startswith(
                "data:image/png;base64,"
            )
        )

    def test_p1007_raster_path(self):
        source = self.root / "single.pdf"
        fixture_pdf(source, 1)
        doc = engine.import_file({"path": str(source)})
        actual = engine.run
        sent = []

        def command(args, timeout=45):
            if Path(args[0]).name == "lp":
                sent.append(args)
                return "request id is Test-100 (1 file(s))"
            return actual(args, timeout)

        with (
            patch.object(
                engine,
                "discover",
                return_value={"printers": [{**self.printer(), "compatibility": True}]},
            ),
            patch.object(engine, "run", side_effect=command),
        ):
            engine.submit(
                {
                    "token": "raster-check-123",
                    "printer": "Test",
                    "items": [{"id": doc["id"]}],
                }
            )
        self.assertEqual(len(sent), 1)
        self.assertTrue(sent[0][-1].endswith(".png"))
        png = Path(sent[0][-1]).read_bytes()
        import struct

        width, height = struct.unpack(">II", png[16:24])
        self.assertGreater(width, 4900)
        self.assertGreater(height, 6900)

    def test_duplex_copy_boundaries_include_blank(self):
        doc = self.add()
        actual = engine.run

        def command(args, timeout=45):
            if Path(args[0]).name == "lp":
                return "request id is Test-101 (1 file(s))"
            return actual(args, timeout)

        device = {**self.printer(), "duplex": ["DuplexNoTumble"]}
        with (
            patch.object(engine, "discover", return_value={"printers": [device]}),
            patch.object(engine, "run", side_effect=command),
        ):
            engine.submit(
                {
                    "token": "duplex-copies-123",
                    "printer": "Test",
                    "items": [
                        {"id": doc["id"], "mode": "custom", "range": "1", "copies": 2}
                    ],
                    "options": {"sides": "two-sided-long-edge"},
                }
            )
        pdf = engine.ROOT / "request-duplex-copies-123/0/ordered.pdf"
        info = actual(["/usr/bin/pdfinfo", str(pdf)])
        self.assertIn("Pages:           3", info)
        text = actual(["/usr/bin/pdftotext", str(pdf), "-"])
        self.assertEqual(text.count("Page 1"), 2)

    def test_uncertain_submission_is_journaled(self):
        doc = self.add()
        actual = engine.run

        def command(args, timeout=45):
            if Path(args[0]).name == "lp":
                raise ValueError("lp timed out")
            return actual(args, timeout)

        with (
            patch.object(
                engine, "discover", return_value={"printers": [self.printer()]}
            ),
            patch.object(engine, "run", side_effect=command),
        ):
            with self.assertRaisesRegex(ValueError, "Earlier files may already"):
                engine.submit(
                    {
                        "token": "uncertain-check-123",
                        "printer": "Test",
                        "items": [{"id": doc["id"]}],
                    }
                )
        jobs = engine.read("jobs.json", [])
        self.assertEqual(jobs[0]["state"], "uncertain")
        self.assertNotIn("cupsId", jobs[0])

    def test_watchdog_skips_repeat_cancellation_after_clean_exit(self):
        (engine.ROOT / ".clean-exit").touch()
        with (
            patch.object(engine.os, "kill", side_effect=ProcessLookupError),
            patch.object(engine, "cleanup") as cleanup,
        ):
            engine.watch(12345)
            cleanup.assert_not_called()
        self.assertFalse(engine.ROOT.exists())

    def test_watchdog_retries_cleanup_after_force_quit(self):
        with (
            patch.object(engine.os, "kill", side_effect=ProcessLookupError),
            patch.object(engine, "cleanup") as cleanup,
        ):
            engine.watch(12345)
            cleanup.assert_called_once_with({"cancelAll": True})
        self.assertFalse(engine.ROOT.exists())

    def test_cups_states_work_when_job_name_is_private(self):
        engine.save(
            "jobs.json",
            [
                {
                    "id": "request-id",
                    "cupsId": "Test-90",
                    "printer": "Test",
                    "pages": [1],
                    "copies": 1,
                    "state": "active",
                }
            ],
        )
        for reported, expected in [
            (5, "processing"),
            (7, "cancelled"),
            (8, "failed"),
            (9, "queue-cleared"),
        ]:
            with (
                patch.object(engine, "queue_status", return_value=[]),
                patch.object(
                    engine,
                    "ipp_jobs",
                    return_value=[
                        {
                            "job-id": 90,
                            "job-printer-uri": "ipp://localhost/printers/Test",
                            "job-state": reported,
                        }
                    ],
                ),
            ):
                self.assertEqual(engine.status({})["jobs"][0]["state"], expected)

    def test_cups_overcount_is_visible(self):
        engine.save(
            "jobs.json",
            [
                {
                    "id": "request-id",
                    "cupsId": "Test-90",
                    "printer": "Test",
                    "pages": [1],
                    "copies": 2,
                    "expectedSheets": 2,
                }
            ],
        )
        with (
            patch.object(engine, "queue_status", return_value=[]),
            patch.object(
                engine,
                "ipp_jobs",
                return_value=[
                    {
                        "job-id": 90,
                        "job-printer-uri": "ipp://localhost/printers/Test",
                        "job-state": 9,
                        "job-media-sheets-completed": 4,
                    }
                ],
            ),
        ):
            self.assertIn(
                "exceeding the expected 2",
                engine.status({})["jobs"][0]["accountingWarning"],
            )

    def test_empty_cleanup_needs_no_cancel_authorization(self):
        with (
            patch.object(engine, "queue_status", return_value=[]),
            patch.object(engine, "run") as run,
        ):
            engine.cancel_all_local()
            run.assert_not_called()

    def test_resume_held_job_keeps_original_identity(self):
        active = {"id": "Test-42", "state": "held", "printerPaused": False}
        with (
            patch.object(engine, "status", return_value={"active": [active]}),
            patch.object(
                engine,
                "discover",
                return_value={"printers": [{"id": "Test", "connected": True}]},
            ),
            patch.object(engine, "run") as run,
        ):
            engine.resume_job({"id": "Test-42", "confirmed": True})
            self.assertEqual(
                run.call_args.args[0], ["/usr/bin/lp", "-i", "Test-42", "-H", "resume"]
            )
            self.assertNotIn("-d", run.call_args.args[0])

    def test_resume_processing_job_does_not_restart(self):
        active = {"id": "Test-42", "state": "processing", "printerPaused": False}
        with (
            patch.object(engine, "status", return_value={"active": [active]}),
            patch.object(
                engine,
                "discover",
                return_value={"printers": [{"id": "Test", "connected": True}]},
            ),
            patch.object(engine, "run") as run,
        ):
            engine.resume_job({"id": "Test-42", "confirmed": True})
            run.assert_not_called()

    def test_resume_paused_queue_creates_no_new_job(self):
        active = {"id": "Test-42", "state": "pending", "printerPaused": True}
        with (
            patch.object(engine, "status", return_value={"active": [active]}),
            patch.object(
                engine,
                "discover",
                return_value={"printers": [{"id": "Test", "connected": True}]},
            ),
            patch.object(engine, "run") as run,
        ):
            engine.resume_job({"id": "Test-42", "confirmed": True})
            self.assertEqual(
                [c.args[0] for c in run.call_args_list],
                [["/usr/bin/cupsenable", "Test"], ["/usr/bin/cupsaccept", "Test"]],
            )

    def test_resume_needs_confirmation_and_live_job(self):
        with self.assertRaisesRegex(ValueError, "Check the output"):
            engine.resume_job({"id": "Test-42"})
        with patch.object(engine, "status", return_value={"active": []}):
            with self.assertRaisesRegex(ValueError, "no longer active"):
                engine.resume_job({"id": "Test-42", "confirmed": True})

    def test_recover_cannot_blindly_restart_pending_output(self):
        with (
            patch.object(
                engine,
                "discover",
                return_value={"printers": [{"id": "Test", "connected": True}]},
            ),
            patch.object(engine, "queue_status", return_value=[{"id": "Test-42"}]),
            patch.object(engine, "run") as run,
        ):
            with self.assertRaisesRegex(ValueError, "pending jobs"):
                engine.recover({"printer": "Test"})
            run.assert_not_called()

    def test_image_import(self):
        image = self.root / "image.png"
        engine.run([engine.tool("magick"), "-size", "64x64", "xc:white", str(image)])
        self.assertEqual(engine.import_file({"path": str(image)})["pages"], 1)


if __name__ == "__main__":
    unittest.main()
