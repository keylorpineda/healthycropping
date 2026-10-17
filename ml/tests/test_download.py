"""Unit tests for idempotent dataset downloading, SHA-256 verification, and archive safety."""

from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path

import httpx
import pytest

from healthycrop_ml.download import (
    DatasetDownloadError,
    FileSpec,
    MendeleyDatasetMetadata,
    compute_sha256,
    download_file_verified,
    extract_archive_safe,
    format_manual_instructions,
    validate_dataset_dir,
    verify_license_allowed,
    verify_sha256,
    write_checksum_manifest,
)


def test_compute_and_verify_sha256(tmp_path: Path) -> None:
    sample = tmp_path / "sample.bin"
    payload = b"healthycrop-coffee-dataset-bytes"
    sample.write_bytes(payload)
    expected = hashlib.sha256(payload).hexdigest()

    assert compute_sha256(sample) == expected
    assert verify_sha256(sample, expected.upper()) is True
    assert verify_sha256(sample, "0" * 64) is False
    assert verify_sha256(tmp_path / "missing.bin", expected) is False


def test_verify_license_gate() -> None:
    verify_license_allowed("CC BY 4.0")
    with pytest.raises(DatasetDownloadError, match="not in allowed list"):
        verify_license_allowed("Proprietary-Commercial-Only")
    with pytest.raises(DatasetDownloadError, match="not in allowed list"):
        verify_license_allowed("")


def test_download_file_verified_idempotent_and_checksum_enforcement(tmp_path: Path) -> None:
    payload = b"coffee-leaf-image-bytes"
    digest = hashlib.sha256(payload).hexdigest()
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, content=payload, request=request)

    transport = httpx.MockTransport(handler)
    spec = FileSpec(
        filename="leaf.jpg",
        url="https://example.org/leaf.jpg",
        sha256=digest,
        size_bytes=len(payload),
        relative_subdir="Photos",
    )

    with httpx.Client(transport=transport) as client:
        out_path = download_file_verified(spec, tmp_path, client=client)
        assert out_path.is_file()
        assert out_path.read_bytes() == payload
        assert call_count == 1

        # Second call is idempotent and skips network download
        out_path_again = download_file_verified(spec, tmp_path, client=client)
        assert out_path_again == out_path
        assert call_count == 1

        # Mismatched SHA-256 raises DatasetDownloadError and cleans up .part file
        bad_spec = FileSpec(
            filename="corrupt.jpg",
            url="https://example.org/corrupt.jpg",
            sha256="f" * 64,
        )
        with pytest.raises(DatasetDownloadError, match="SHA-256 mismatch"):
            download_file_verified(bad_spec, tmp_path, client=client)
        assert not (tmp_path / "corrupt.jpg").exists()
        assert not (tmp_path / ".corrupt.jpg.part").exists()


def test_extract_archive_safe_and_path_traversal_guard(tmp_path: Path) -> None:
    good_zip = tmp_path / "good.zip"
    with zipfile.ZipFile(good_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("leaf/img1.jpg", b"abc" * 50)

    extract_dir = tmp_path / "extracted"
    extract_archive_safe(good_zip, extract_dir)
    assert (extract_dir / "leaf" / "img1.jpg").read_bytes() == b"abc" * 50

    # Simulate Mendeley BRACOL archive missing central directory / EOCD at EOF
    raw_zip_bytes = good_zip.read_bytes()
    eocd_pos = raw_zip_bytes.rfind(b"PK\x01\x02")
    truncated_zip = tmp_path / "truncated_eocd.zip"
    truncated_zip.write_bytes(raw_zip_bytes[:eocd_pos])

    trunc_extract_dir = tmp_path / "extracted_trunc"
    extract_archive_safe(truncated_zip, trunc_extract_dir)
    assert (trunc_extract_dir / "leaf" / "img1.jpg").read_bytes() == b"abc" * 50

    evil_zip = tmp_path / "evil.zip"
    with zipfile.ZipFile(evil_zip, "w") as zf:
        zf.writestr("../escaped.txt", b"evil")

    with pytest.raises(DatasetDownloadError, match="Unsafe zip member path"):
        extract_archive_safe(evil_zip, tmp_path / "evil_out")


def test_validate_dataset_dir_and_manifest(tmp_path: Path) -> None:
    photos_dir = tmp_path / "Photos"
    photos_dir.mkdir(parents=True)
    (photos_dir / "img1.jpg").write_bytes(b"1")
    (photos_dir / "img2.png").write_bytes(b"2")
    (tmp_path / "labels.csv").write_text("id,label\n", encoding="utf-8")

    count = validate_dataset_dir(
        tmp_path,
        required_files=("labels.csv",),
        min_image_count=2,
    )
    assert count == 2

    with pytest.raises(DatasetDownloadError, match="Missing required dataset file"):
        validate_dataset_dir(tmp_path, required_files=("nonexistent.csv",))

    with pytest.raises(DatasetDownloadError, match="Expected at least 5 images"):
        validate_dataset_dir(tmp_path, min_image_count=5)

    meta = MendeleyDatasetMetadata(
        dataset_id="c5yvn32dzg",
        name="RoCoLe",
        version=2,
        doi="10.17632/c5yvn32dzg.2",
        license_short_name="CC BY 4.0",
        license_url="http://creativecommons.org/licenses/by/4.0",
        files=(
            FileSpec(
                filename="img1.jpg",
                url="https://example.org/img1.jpg",
                sha256="a" * 64,
                size_bytes=1,
                relative_subdir="Photos",
            ),
        ),
    )
    manifest_file = write_checksum_manifest(tmp_path, meta)
    assert manifest_file.is_file()
    instructions = format_manual_instructions(
        "RoCoLe", "https://doi.org/10.17632/c5yvn32dzg.2", tmp_path, ["Step 1"]
    )
    assert "Step 1" in instructions
