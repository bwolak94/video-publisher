"""NicheProfile registry — loads and validates YAML presets at startup.

Built-in presets are shipped as package data under app/niche_profiles/presets/.
Users can register custom profiles via load_custom() which supports `extends`
inheritance: user overrides are merged on top of the named parent preset.

PRD REQ-4.1.3:
  "Profiles ship as built-in presets (15+) and are fully user-editable."
  (Sprint 1 ships 5 presets; 15+ is the Sprint 4 target.)

Task rules:
  #1  Built-in presets are read-only.
  #2  Schema validated on load, not at runtime.
  #4  'default' profile must always exist.
  #5  No field may be None at runtime.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.models.director import NicheProfile

_PRESETS_DIR = Path(__file__).parent / "presets"

# Names of all built-in preset YAML files (without extension)
_BUILTIN_NAMES: list[str] = [
    "default",
    "tech",
    "finance",
    "health",
    "entertainment",
    "education",
]


class ProfileNotFoundError(Exception):
    """Raised when ProfileRegistry.get() is called with an unknown profile name."""


class ProfileRegistry:
    """Loads and caches NicheProfile presets.  Thread-safe for read-only access.

    Usage::

        registry = ProfileRegistry()           # loads all built-ins at construction
        profile  = registry.get("tech")        # returns validated NicheProfile
        profile  = registry.get_for_channel("chan-123")  # falls back to 'default'
    """

    def __init__(self) -> None:
        self._profiles: dict[str, NicheProfile] = {}
        self._load_builtins()

    # ── Public API ────────────────────────────────────────────────────────────

    def get(self, name: str) -> NicheProfile:
        """Return the named NicheProfile.

        Raises:
            ProfileNotFoundError: if the name is not registered.
        """
        if name not in self._profiles:
            available = ", ".join(sorted(self._profiles))
            raise ProfileNotFoundError(
                f"Profile {name!r} not found. Available: {available}"
            )
        return self._profiles[name]

    def get_for_channel(
        self,
        channel_id: str,
        channel_profile_map: dict[str, str] | None = None,
    ) -> NicheProfile:
        """Return the profile for a channel, falling back to 'default'.

        Args:
            channel_id: The channel identifier.
            channel_profile_map: Optional mapping of channelId → profile name.
                If the channel has no entry, 'default' is returned.
        """
        profile_name = (channel_profile_map or {}).get(channel_id, "default")
        return self.get(profile_name)

    def load_custom(self, yaml_path: str | Path) -> NicheProfile:
        """Load and register a user-defined profile from a YAML file.

        If the profile declares `extends: <preset_name>`, the preset is loaded
        first and user overrides are merged on top (task rule #1: presets are
        read-only; the merge produces a new profile, not a mutation).

        Raises:
            ProfileNotFoundError: if the declared `extends` preset is unknown.
            pydantic.ValidationError: if the merged profile fails schema validation.
        """
        raw = self._read_yaml(Path(yaml_path))
        parent_name = raw.get("extends")
        if parent_name:
            parent = self.get(parent_name)
            # Start from parent defaults, overlay user values
            merged = parent.model_dump()
            merged.update(raw)
            profile = NicheProfile.model_validate(merged)
        else:
            profile = NicheProfile.model_validate(raw)

        self._profiles[profile.name] = profile
        return profile

    @property
    def available(self) -> list[str]:
        """Sorted list of all registered profile names."""
        return sorted(self._profiles)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _load_builtins(self) -> None:
        for name in _BUILTIN_NAMES:
            path = _PRESETS_DIR / f"{name}.yaml"
            raw = self._read_yaml(path)
            # Pydantic validates schema at load time (task rule #2 — fail fast)
            profile = NicheProfile.model_validate(raw)
            self._profiles[profile.name] = profile

    @staticmethod
    def _read_yaml(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as fh:
            return yaml.safe_load(fh)  # type: ignore[no-any-return]
