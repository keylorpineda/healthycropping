"""Idempotent, checksum-verified dataset download and structure validation utilities."""

from __future__ import annotations

import hashlib
import json
import struct
import tarfile
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

DEFAULT_TIMEOUT = httpx.Timeout(60.0, connect=30.0)
USER_AGENT = "HealthyCropping-ML/0.1.0 (+https://github.com/keylorpineda/healthycropping)"
ZIP_LOCAL_HEADER_MAGIC = b"PK\x03\x04"


class DatasetDownloadError(RuntimeError):
    """Raised when a dataset download, checksum check, or license check fails."""


@dataclass(frozen=True)
class FileSpec:
    """Specification for a single remote dataset file."""

    filename: str
    url: str
    sha256: str
    size_bytes: int | None = None
    relative_subdir: str = ""


@dataclass(frozen=True)
class MendeleyDatasetMetadata:
    """Parsed metadata from the Mendeley Data public API."""

    dataset_id: str
    name: str
    version: int
    doi: str
    license_short_name: str
    license_url: str
    files: tuple[FileSpec, ...]


def compute_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Compute the lowercase hexadecimal SHA-256 digest of a file."""
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest().lower()


def compute_checksum(path: Path, expected: str, chunk_size: int = 1024 * 1024) -> tuple[str, str]:
    """Compute digest and normalize expected string, supporting md5: prefix or default sha256."""
    expected_clean = expected.strip().lower()
    if expected_clean.startswith("md5:"):
        hasher = hashlib.md5()
        target = expected_clean.removeprefix("md5:")
    else:
        hasher = hashlib.sha256()
        target = expected_clean
    with path.open("rb") as fh:
        while chunk := fh.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest().lower(), target


def verify_checksum(path: Path, expected: str) -> bool:
    """Return True if path exists and digest matches expected (sha256 or md5:...)."""
    if not path.is_file():
        return False
    if not expected:
        return True
    actual, target = compute_checksum(path, expected)
    return actual == target


def verify_sha256(path: Path, expected_sha256: str) -> bool:
    """Return True if `path` exists and its SHA-256 (or md5 if prefixed) matches."""
    return verify_checksum(path, expected_sha256)


def verify_license_allowed(
    license_short_name: str,
    allowed_licenses: tuple[str, ...] = ("CC BY 4.0", "CC BY-NC 4.0", "CC0 1.0", "MIT"),
) -> None:
    """Ensure the dataset license is present and in the approved open license list."""
    normalized = license_short_name.strip()
    if not normalized or normalized not in allowed_licenses:
        msg = (
            f"Dataset license '{license_short_name}' is missing or not in allowed list "
            f"{allowed_licenses}. Stop and consult the repository owner before proceeding."
        )
        raise DatasetDownloadError(msg)


def fetch_mendeley_metadata(
    dataset_id: str,
    client: httpx.Client | None = None,
) -> MendeleyDatasetMetadata:
    """Fetch dataset metadata, license, and file list from the Mendeley Data public API."""
    url = f"https://data.mendeley.com/public-api/datasets/{dataset_id}"
    close_client = client is None
    http = client or httpx.Client(
        timeout=DEFAULT_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    )
    try:
        response = http.get(url)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except Exception as exc:
        raise DatasetDownloadError(
            f"Failed to query Mendeley Data API for dataset '{dataset_id}': {exc}"
        ) from exc
    finally:
        if close_client:
            http.close()

    lic = payload.get("data_licence") or {}
    license_short = str(lic.get("short_name") or "").strip()
    license_url = str(lic.get("url") or "").strip()
    verify_license_allowed(license_short)

    doi_obj = payload.get("doi") or {}
    doi = str(doi_obj.get("id") or "")
    version = int(payload.get("version") or 1)
    name = str(payload.get("name") or dataset_id).strip()

    specs: list[FileSpec] = []
    for raw_file in payload.get("files") or []:
        filename = str(raw_file.get("filename") or "").strip()
        details = raw_file.get("content_details") or {}
        sha256 = str(details.get("sha256_hash") or "").strip().lower()
        download_url = str(details.get("download_url") or "").strip()
        size_val = details.get("size") or raw_file.get("size")
        size_bytes = int(size_val) if size_val is not None else None
        if filename and sha256 and download_url:
            specs.append(
                FileSpec(
                    filename=filename,
                    url=download_url,
                    sha256=sha256,
                    size_bytes=size_bytes,
                )
            )

    return MendeleyDatasetMetadata(
        dataset_id=dataset_id,
        name=name,
        version=version,
        doi=doi,
        license_short_name=license_short,
        license_url=license_url,
        files=tuple(specs),
    )


def download_file_verified(
    spec: FileSpec,
    target_dir: Path,
    client: httpx.Client | None = None,
) -> Path:
    """Download `spec` into `target_dir` idempotently and verify its SHA-256 digest."""
    dest_dir = target_dir / spec.relative_subdir if spec.relative_subdir else target_dir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / spec.filename

    if verify_sha256(dest_path, spec.sha256):
        return dest_path

    part_path = dest_dir / f".{spec.filename}.part"
    close_client = client is None
    http = client or httpx.Client(
        timeout=DEFAULT_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    )
    try:
        expected_clean = spec.sha256.strip().lower()
        use_md5 = expected_clean.startswith("md5:")
        target_hash = expected_clean.removeprefix("md5:") if use_md5 else expected_clean
        hasher = hashlib.md5() if use_md5 else hashlib.sha256()

        with http.stream("GET", spec.url) as response:
            response.raise_for_status()
            with part_path.open("wb") as out_fh:
                for chunk in response.iter_bytes(chunk_size=1024 * 256):
                    out_fh.write(chunk)
                    hasher.update(chunk)
        actual_hash = hasher.hexdigest().lower()
        if actual_hash != target_hash:
            part_path.unlink(missing_ok=True)
            algo_name = "MD5" if use_md5 else "SHA-256"
            raise DatasetDownloadError(
                f"{algo_name} mismatch for '{spec.filename}': "
                f"expected {target_hash}, got {actual_hash}."
            )
        part_path.replace(dest_path)
        return dest_path
    except DatasetDownloadError:
        raise
    except Exception as exc:
        part_path.unlink(missing_ok=True)
        raise DatasetDownloadError(
            f"Download failed for '{spec.filename}' from {spec.url}: {exc}"
        ) from exc
    finally:
        if close_client:
            http.close()


def download_files_concurrently(
    specs: list[FileSpec],
    target_dir: Path,
    max_workers: int = 8,
) -> list[Path]:
    """Download multiple `FileSpec` items concurrently with SHA-256 verification."""
    target_dir.mkdir(parents=True, exist_ok=True)
    results: list[Path] = []
    with (
        httpx.Client(
            timeout=DEFAULT_TIMEOUT,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            limits=httpx.Limits(
                max_connections=max_workers * 2,
                max_keepalive_connections=max_workers,
            ),
        ) as client,
        ThreadPoolExecutor(max_workers=max_workers) as pool,
    ):
        future_to_spec = {
            pool.submit(download_file_verified, spec, target_dir, client): spec for spec in specs
        }
        total = len(specs)
        for completed, future in enumerate(as_completed(future_to_spec), start=1):
            path = future.result()
            results.append(path)
            if completed % 100 == 0 or completed == total:
                print(f"  Verified {completed}/{total} files...")
    return sorted(results)


def _extract_zip_local_headers_safe(archive_path: Path, extract_to: Path) -> int:
    """Extract intact entries from a PK\\x03\\x04 stream lacking a central directory."""
    resolved_root = extract_to.resolve()
    data = archive_path.read_bytes()
    if not data.startswith(ZIP_LOCAL_HEADER_MAGIC):
        raise DatasetDownloadError(f"File is not a valid ZIP archive: {archive_path.name}")

    pos = 0
    extracted_files = 0
    while pos + 30 <= len(data):
        if data[pos : pos + 4] != ZIP_LOCAL_HEADER_MAGIC:
            break
        (
            _ver,
            _flag,
            method,
            _mtime,
            _mdate,
            expected_crc,
            csize,
            usize,
            fn_len,
            extra_len,
        ) = struct.unpack("<HHHHHIIIHH", data[pos + 4 : pos + 30])
        fn_start = pos + 30
        fn_end = fn_start + fn_len
        if fn_end + extra_len > len(data):
            break
        member_name = data[fn_start:fn_end].decode("utf-8", errors="replace")
        member_target = (extract_to / member_name).resolve()
        if not member_target.is_relative_to(resolved_root):
            raise DatasetDownloadError(f"Unsafe zip member path detected: '{member_name}'")

        data_start = fn_end + extra_len
        data_end = data_start + csize
        if data_end > len(data):
            # Upstream archive truncated mid-entry at EOF; skip incomplete trailing entry.
            break

        if member_name.endswith("/"):
            member_target.mkdir(parents=True, exist_ok=True)
        else:
            raw_payload = data[data_start:data_end]
            if method == 0:
                payload = raw_payload
            elif method == 8:
                payload = zlib.decompress(raw_payload, -zlib.MAX_WBITS)
            else:
                raise DatasetDownloadError(
                    f"Unsupported ZIP compression method {method} in '{member_name}'"
                )
            actual_crc = zlib.crc32(payload) & 0xFFFFFFFF
            if actual_crc != expected_crc or len(payload) != usize:
                raise DatasetDownloadError(f"CRC-32 or size mismatch in '{member_name}'")
            member_target.parent.mkdir(parents=True, exist_ok=True)
            member_target.write_bytes(payload)
            extracted_files += 1

        pos = data_end

    if extracted_files == 0:
        raise DatasetDownloadError(f"No intact files found in ZIP stream: {archive_path.name}")
    return extracted_files


def extract_archive_safe(archive_path: Path, extract_to: Path) -> None:
    """Safely extract a `.zip` or `.tar.gz` archive while preventing path traversal."""
    extract_to.mkdir(parents=True, exist_ok=True)
    resolved_root = extract_to.resolve()

    if archive_path.name.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(archive_path, "r") as zf:
                for zip_member in zf.infolist():
                    member_target = (extract_to / zip_member.filename).resolve()
                    if not member_target.is_relative_to(resolved_root):
                        raise DatasetDownloadError(
                            f"Unsafe zip member path detected: '{zip_member.filename}'"
                        )
                zf.extractall(extract_to)
        except zipfile.BadZipFile:
            _extract_zip_local_headers_safe(archive_path, extract_to)
        return

    if archive_path.name.lower().endswith((".tar.gz", ".tgz")):
        with tarfile.open(archive_path, "r:gz") as tf:
            for tar_member in tf.getmembers():
                member_target = (extract_to / tar_member.name).resolve()
                if not member_target.is_relative_to(resolved_root):
                    raise DatasetDownloadError(
                        f"Unsafe tar member path detected: '{tar_member.name}'"
                    )
            tf.extractall(extract_to, filter="data")
        return

    raise DatasetDownloadError(f"Unsupported archive format: {archive_path.name}")


def write_checksum_manifest(target_dir: Path, metadata: MendeleyDatasetMetadata) -> Path:
    """Write a local JSON manifest of dataset metadata, license, and verified checksums."""
    manifest_path = target_dir / "dataset_manifest.json"
    payload = {
        "dataset_id": metadata.dataset_id,
        "name": metadata.name,
        "version": metadata.version,
        "doi": metadata.doi,
        "license_short_name": metadata.license_short_name,
        "license_url": metadata.license_url,
        "file_count": len(metadata.files),
        "files": [
            {
                "filename": f.filename,
                "sha256": f.sha256,
                "size_bytes": f.size_bytes,
                "relative_subdir": f.relative_subdir,
            }
            for f in metadata.files
        ],
    }
    manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return manifest_path


def validate_dataset_dir(
    target_dir: Path,
    required_files: tuple[str, ...] = (),
    min_image_count: int = 1,
    image_extensions: tuple[str, ...] = (".jpg", ".jpeg", ".png"),
) -> int:
    """Validate that `target_dir` exists, has required files, and >= `min_image_count` images."""
    if not target_dir.is_dir():
        raise DatasetDownloadError(f"Dataset directory does not exist: {target_dir}")

    for req in required_files:
        req_path = target_dir / req
        if not req_path.exists():
            raise DatasetDownloadError(f"Missing required dataset file or folder: {req_path}")

    ext_set = {ext.lower() for ext in image_extensions}
    image_count = sum(
        1
        for p in target_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in ext_set and not p.name.startswith(".")
    )
    if image_count < min_image_count:
        raise DatasetDownloadError(
            f"Expected at least {min_image_count} images in {target_dir}, found {image_count}."
        )
    return image_count


def format_manual_instructions(
    dataset_name: str,
    doi_url: str,
    target_dir: Path,
    steps: list[str],
) -> str:
    """Format clear manual download instructions when automated download fails."""
    numbered = "\n".join(f"  {idx}. {step}" for idx, step in enumerate(steps, start=1))
    return (
        f"\n[MANUAL DOWNLOAD INSTRUCTIONS FOR {dataset_name}]\n"
        f"Upstream URL / DOI: {doi_url}\n"
        f"Target Directory:   {target_dir}\n"
        f"Steps:\n{numbered}\n"
        f"After placing the files, re-run with `--verify-only` to validate the structure.\n"
    )


__all__ = [
    "DatasetDownloadError",
    "FileSpec",
    "MendeleyDatasetMetadata",
    "compute_sha256",
    "download_file_verified",
    "download_files_concurrently",
    "extract_archive_safe",
    "fetch_mendeley_metadata",
    "format_manual_instructions",
    "validate_dataset_dir",
    "verify_license_allowed",
    "verify_sha256",
    "write_checksum_manifest",
]
