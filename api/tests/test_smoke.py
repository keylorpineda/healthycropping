"""Empty suite smoke test for Phase 0 CI verification."""

from healthycropping_api import __version__


def test_version() -> None:
    assert __version__ == "0.5.0"
