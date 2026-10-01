"""
Shama Abidi PhD System — Global Target Countries Configuration Manager (`backend/app/target_countries.py`)
Enforces the 7 target regions, country lookup & aliasing, Pakistan exclusion,
and runtime configurability without rebuilding the system.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

CONFIG_FILE_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "target_countries.json"

_cached_config: Optional[Dict[str, Any]] = None


def load_target_countries_config(reload: bool = False) -> Dict[str, Any]:
    global _cached_config
    if _cached_config is not None and not reload:
        return _cached_config

    if not CONFIG_FILE_PATH.exists():
        raise FileNotFoundError(f"Target countries config file not found at {CONFIG_FILE_PATH}")

    data = json.loads(CONFIG_FILE_PATH.read_text(encoding="utf-8"))
    _cached_config = data
    return data


def save_target_countries_config(new_config: Dict[str, Any]) -> None:
    global _cached_config
    CONFIG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE_PATH.write_text(json.dumps(new_config, indent=2, ensure_ascii=False), encoding="utf-8")
    _cached_config = new_config


def normalize_country_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def is_country_excluded(country_name_or_code: str) -> bool:
    """Checks if the country is on the exclusion list (e.g., Pakistan / PK)."""
    cfg = load_target_countries_config()
    clean = normalize_country_text(country_name_or_code)
    for exc in cfg.get("excluded_countries", []):
        if clean in (normalize_country_text(exc.get("name", "")), normalize_country_text(exc.get("code", ""))):
            return True
    return False


def resolve_target_country(country_str: str) -> Optional[Dict[str, Any]]:
    """
    Resolves any country name, alias, or ISO code against the 7 target regions.
    Returns matched country metadata dict including `region_key` and `region_name`.
    """
    if not country_str or is_country_excluded(country_str):
        return None

    cfg = load_target_countries_config()
    clean = normalize_country_text(country_str)

    for r_key, r_val in cfg.get("regions", {}).items():
        if not r_val.get("is_enabled", True):
            continue
        for c in r_val.get("countries", []):
            aliases = [c.get("name", ""), c.get("code", "")] + c.get("aliases", [])
            for a in aliases:
                if clean == normalize_country_text(a):
                    return {
                        "name": c.get("name"),
                        "code": c.get("code"),
                        "region_key": r_key,
                        "region_name": r_val.get("name"),
                    }
    return None


def get_all_target_countries_flat(include_disabled_regions: bool = False) -> List[Dict[str, Any]]:
    cfg = load_target_countries_config()
    results = []
    for r_key, r_val in cfg.get("regions", {}).items():
        if not include_disabled_regions and not r_val.get("is_enabled", True):
            continue
        for c in r_val.get("countries", []):
            results.append(
                {
                    "name": c.get("name"),
                    "code": c.get("code"),
                    "region_key": r_key,
                    "region_name": r_val.get("name"),
                    "aliases": c.get("aliases", []),
                }
            )
    return results


def get_regions_summary() -> Dict[str, Any]:
    cfg = load_target_countries_config()
    summary = {}
    for r_key, r_val in cfg.get("regions", {}).items():
        summary[r_key] = {
            "name": r_val.get("name"),
            "is_enabled": r_val.get("is_enabled", True),
            "country_count": len(r_val.get("countries", [])),
            "countries": [c["name"] for c in r_val.get("countries", [])],
        }
    return summary
