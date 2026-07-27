#!/usr/bin/env python3
"""Build the deterministic FY2027 static assessment-roll data tree."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median
from typing import Dict, Iterable, Iterator, List, NamedTuple, Optional, Sequence, Tuple


csv.field_size_limit(10**7)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RAW_DIR = Path("/Users/hareeshnagaraj/Development/pedaterre/data/raw")
DEFAULT_OUTPUT_DIR = REPOSITORY_ROOT / "data" / "generated"
ROLL_YEAR = "FY2027"
ROLL_YEAR_LONG = "FY2027 (final roll)"
SOURCE_URL = (
    "https://data.cityofnewyork.us/resource/8y4t-faws.csv"
    "?year=2027&period=3&rectype=1"
)
BOROUGH_CODES = {1: "MN", 2: "BX", 3: "BK", 4: "QN", 5: "SI"}
TAIL_LIMIT = 120
CLUB_THRESHOLD = 50_000_000
MAX_BUCKET_BYTES = 150 * 1024
EXPECTED_ROWS = 1_167_962
EXPECTED_BLOCKS = 28_798
EXPECTED_TOTAL_MV = 1_911_446_867_962
EXPECTED_CLUB_LOTS = 2_821

ENTITY_RE = re.compile(
    r"(?<!\w)(LLC|L\.L\.C\.|LP|L\.P\.|LLP|CORP|CORPORATION|INC|"
    r"INCORPORATED|TRUST|HOLDINGS|PARTNERS|REALTY|PROPERTIES)(?!\w)",
    re.IGNORECASE,
)

REQUIRED_COLUMNS = (
    "parid",
    "boro",
    "block",
    "lot",
    "curmkttot",
    "curacttot",
    "curactextot",
    "owner",
    "bldg_class",
    "housenum_lo",
    "street_name",
    "period",
    "rectype",
)


class BuildError(RuntimeError):
    """Raised when the input or generated tree violates the ETL contract."""


class RawRow(NamedTuple):
    parid: str
    boro: int
    block: int
    lot: int
    mv: int
    act_total: int
    act_exempt: int
    owner: str
    bldg_class: str
    housenum: str
    street: str
    period: str = "3"
    rectype: str = "1"


@dataclass
class BlockStats:
    total_mv: int = 0
    act_total: int = 0
    act_exempt: int = 0
    n_lots: int = 0
    llc_mv: int = 0

    @property
    def taxable(self) -> bool:
        if self.act_total == 0:
            return False
        return self.act_exempt / self.act_total < 0.5


@dataclass
class ScanResult:
    rows_read: int = 0
    n_lots: int = 0
    total_mv: int = 0
    club_lots: int = 0
    club_mv: int = 0
    excluded_rows: Dict[str, int] = field(
        default_factory=lambda: {"zero_value_r0_pointer": 0}
    )
    borough_totals: Dict[int, int] = field(
        default_factory=lambda: {boro: 0 for boro in BOROUGH_CODES}
    )
    blocks: Dict[Tuple[int, int], BlockStats] = field(default_factory=dict)


@dataclass
class Group:
    mv: int = 0
    n: int = 0
    owners: set[str] = field(default_factory=set)
    owner_raws: Dict[str, set[str]] = field(default_factory=dict)
    lot: int = -1
    housenum: str = ""
    street: str = ""
    max_raw_lot: int = 0

    def add(self, row: RawRow) -> None:
        repaired = repair_owner(row.owner)
        self.mv += row.mv
        self.n += 1
        self.owners.add(repaired)
        self.owner_raws.setdefault(repaired, set()).add(row.owner)
        self.max_raw_lot = max(self.max_raw_lot, row.mv)


class BuiltBlock(NamedTuple):
    payload: dict
    real_group_count: int
    address_hint: str
    owner_hint: str


@dataclass
class ExtractInfo:
    full_hash: str
    short_hash: str
    manifest: Dict[str, str]
    source_url: str
    ingested_at: str


@dataclass
class BuildResult:
    scan: ScanResult
    group_count: int
    emitted_group_count: int
    top25_taxable: List[dict]
    biggest_bucket: Path
    biggest_bucket_bytes: int


def repair_owner(owner: str) -> str:
    """Rejoin a fixed-width owner field only when the split is mid-word."""
    if len(owner) > 41 and owner[40] == " ":
        left, right = owner[:40], owner[41:]
        if (
            left
            and right
            and left[-1] != " "
            and right[:1] != " "
            and not left.endswith((" AND", " OF", " THE", "&"))
        ):
            return left + right
    return owner


def low_housenum(housenum: str) -> str:
    """Return the leading integer used by the condo grouping rule."""
    match = re.match(r"\s*([0-9]+)", housenum or "")
    return match.group(1) if match else (housenum or "").strip()


def is_pointer(row: RawRow) -> bool:
    return row.bldg_class == "R0" and row.mv == 0


def group_key(row: RawRow) -> tuple:
    housenum = low_housenum(row.housenum)
    street = row.street.strip()
    if row.lot >= 1001 and housenum and street:
        return ("C", housenum, street)
    return ("F", row.lot)


def _integer(value: str, field_name: str, path: Path, line_number: int) -> int:
    value = (value or "").strip()
    if not value:
        if field_name in {"curmkttot", "curacttot", "curactextot"}:
            return 0
        raise BuildError(f"{path}:{line_number}: blank {field_name}")
    try:
        return int(value)
    except ValueError as exc:
        raise BuildError(
            f"{path}:{line_number}: non-integer {field_name}={value!r}"
        ) from exc


def _parid(value: str, path: Path, line_number: int) -> str:
    value = (value or "").strip()
    if not value:
        raise BuildError(f"{path}:{line_number}: blank parid")
    return value


def input_paths(raw_dir: Path = DEFAULT_RAW_DIR) -> List[Path]:
    def page_number(path: Path) -> int:
        match = re.search(r"page-(\d+)\.csv$", path.name)
        if not match:
            raise BuildError(f"unexpected extract filename: {path}")
        return int(match.group(1))

    paths = sorted(raw_dir.glob("fy2027-final-page-*.csv"), key=page_number)
    if not paths:
        raise BuildError(f"no FY2027 final-roll CSVs found in {raw_dir}")
    return paths


def iter_rows(paths: Sequence[Path]) -> Iterator[RawRow]:
    for path in paths:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            try:
                header = next(reader)
            except StopIteration as exc:
                raise BuildError(f"empty CSV: {path}") from exc
            missing = [name for name in REQUIRED_COLUMNS if name not in header]
            if missing:
                raise BuildError(f"{path}: missing columns: {', '.join(missing)}")
            indexes = {name: header.index(name) for name in REQUIRED_COLUMNS}
            required_width = max(indexes.values()) + 1
            for line_number, values in enumerate(reader, 2):
                if len(values) < required_width:
                    raise BuildError(
                        f"{path}:{line_number}: expected at least "
                        f"{required_width} columns, got {len(values)}"
                    )
                row = RawRow(
                    parid=_parid(values[indexes["parid"]], path, line_number),
                    boro=_integer(values[indexes["boro"]], "boro", path, line_number),
                    block=_integer(
                        values[indexes["block"]], "block", path, line_number
                    ),
                    lot=_integer(values[indexes["lot"]], "lot", path, line_number),
                    mv=_integer(
                        values[indexes["curmkttot"]],
                        "curmkttot",
                        path,
                        line_number,
                    ),
                    act_total=_integer(
                        values[indexes["curacttot"]],
                        "curacttot",
                        path,
                        line_number,
                    ),
                    act_exempt=_integer(
                        values[indexes["curactextot"]],
                        "curactextot",
                        path,
                        line_number,
                    ),
                    owner=values[indexes["owner"]],
                    bldg_class=values[indexes["bldg_class"]].strip(),
                    housenum=values[indexes["housenum_lo"]].strip(),
                    street=values[indexes["street_name"]].strip(),
                    period=values[indexes["period"]].strip(),
                    rectype=values[indexes["rectype"]].strip(),
                )
                if row.period != "3" or row.rectype != "1":
                    raise BuildError(
                        f"{path}:{line_number}: non-final row "
                        f"period={row.period!r} rectype={row.rectype!r}"
                    )
                if row.boro not in BOROUGH_CODES:
                    raise BuildError(
                        f"{path}:{line_number}: invalid borough {row.boro}"
                    )
                yield row


def scan_inputs(paths: Sequence[Path]) -> ScanResult:
    result = ScanResult()
    parids: set[str] = set()
    for row in iter_rows(paths):
        result.rows_read += 1
        if row.parid in parids:
            raise BuildError(f"duplicate parid: {row.parid}")
        parids.add(row.parid)
        if is_pointer(row):
            result.excluded_rows["zero_value_r0_pointer"] += 1
            continue

        key = (row.boro, row.block)
        stats = result.blocks.setdefault(key, BlockStats())
        stats.total_mv += row.mv
        stats.act_total += row.act_total
        stats.act_exempt += row.act_exempt
        stats.n_lots += 1
        result.n_lots += 1
        result.total_mv += row.mv
        result.borough_totals[row.boro] += row.mv
        if ENTITY_RE.search(row.owner):
            stats.llc_mv += row.mv
        if row.mv > CLUB_THRESHOLD:
            result.club_lots += 1
            result.club_mv += row.mv
    return result


def rows_by_block(paths: Sequence[Path]) -> Iterator[Tuple[Tuple[int, int], List[RawRow]]]:
    current_key: Optional[Tuple[int, int]] = None
    current_rows: List[RawRow] = []
    previous_key: Optional[Tuple[int, int]] = None
    for row in iter_rows(paths):
        key = (row.boro, row.block)
        if previous_key is not None and key < previous_key:
            raise BuildError(
                "extract rows are not ordered by borough/block; "
                f"saw {key} after {previous_key}"
            )
        previous_key = key
        if current_key is None:
            current_key = key
        if key != current_key:
            yield current_key, current_rows
            current_key = key
            current_rows = []
        current_rows.append(row)
    if current_key is not None:
        yield current_key, current_rows


def dense_ranks(values: Iterable[Tuple[Tuple[int, int], int]]) -> Dict[Tuple[int, int], int]:
    ranks: Dict[Tuple[int, int], int] = {}
    last_value: Optional[int] = None
    rank = 0
    for key, value in sorted(values, key=lambda item: (-item[1], item[0])):
        if last_value is None or value != last_value:
            rank += 1
            last_value = value
        ranks[key] = rank
    return ranks


def compute_ranks(
    blocks: Dict[Tuple[int, int], BlockStats]
) -> Tuple[Dict[Tuple[int, int], int], Dict[Tuple[int, int], int]]:
    rank_all = dense_ranks((key, stats.total_mv) for key, stats in blocks.items())
    rank_taxable = dense_ranks(
        (key, stats.total_mv) for key, stats in blocks.items() if stats.taxable
    )
    return rank_all, rank_taxable


def _group_owner(group: Group) -> Tuple[Optional[str], Optional[str]]:
    if len(group.owners) != 1:
        return None, None
    repaired = next(iter(group.owners))
    if not repaired:
        return None, None
    raw_values = group.owner_raws.get(repaired, set())
    raw = next(iter(raw_values)) if len(raw_values) == 1 else None
    return repaired, raw if raw is not None and raw != repaired else None


def block_character(groups: Sequence[Group]) -> str:
    total = sum(group.mv for group in groups)
    largest = max((group.mv for group in groups), default=0)
    values = [group.mv for group in groups if group.mv > 0]
    if total <= 0:
        return "empty"
    if len(groups) == 1:
        return "single"
    if largest / total >= 0.32:
        return "whale"
    if values and max(values) / max(min(values), 1) < 3:
        return "flat"
    if any(group.max_raw_lot > CLUB_THRESHOLD for group in groups):
        return "spread"
    return "spread" if largest / total >= 0.15 else "flat"


def _ratio_text(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def make_quip(character: str, groups: Sequence[Group], displayed_groups: int) -> str:
    total = sum(group.mv for group in groups)
    largest = max((group.mv for group in groups), default=0)
    share = largest / total if total > 0 else 0.0
    positive = sorted(group.mv for group in groups if group.mv > 0)
    club_groups = sum(
        group.max_raw_lot > CLUB_THRESHOLD for group in groups
    )

    if character == "empty":
        return "Assessed at zero. The roll has nothing to say here."
    if character == "single":
        return "One lot. The whole block. One line in the roll."
    if character == "whale":
        percent = round(share * 100)
        if share >= 0.45:
            return (
                f"One building is {percent}% of the block's assessed value. "
                "Everyone else is a row house in its shadow."
            )
        return f"The largest holding here carries {percent}% of the block."
    if character == "spread" and club_groups:
        return (
            f"{club_groups} of {displayed_groups} property groups on this "
            "block clear $50M."
        )
    if character == "spread":
        middle = median(positive)
        multiple = largest / middle
        return (
            f"{displayed_groups} property groups. The top one is "
            f"{_ratio_text(multiple)}× the median holding here."
        )
    if character == "flat":
        spread = max(positive) / min(positive)
        return (
            f"No towers here — {displayed_groups} holdings within "
            f"{_ratio_text(spread)}× of each other. The roll calls that balance."
        )
    raise BuildError(f"unknown block character: {character}")


def build_block_payload(
    rows: Sequence[RawRow],
    *,
    rank: int,
    rank_taxable: int,
    percentile: float,
    extract_hash: str,
    expected_stats: Optional[BlockStats] = None,
) -> BuiltBlock:
    if not rows:
        raise BuildError("cannot build an empty block")
    boro, block = rows[0].boro, rows[0].block
    if any((row.boro, row.block) != (boro, block) for row in rows):
        raise BuildError("build_block_payload received rows from multiple blocks")

    groups_by_key: Dict[tuple, Group] = {}
    for row in rows:
        if is_pointer(row):
            continue
        key = group_key(row)
        group = groups_by_key.get(key)
        if group is None:
            group = Group(
                lot=row.lot,
                housenum=low_housenum(row.housenum),
                street=row.street.strip(),
            )
            groups_by_key[key] = group
        group.add(row)
    if not groups_by_key:
        raise BuildError(f"{boro}-{block}: block contains only excluded pointers")

    original_items = list(groups_by_key.items())
    original_groups = [group for _, group in original_items]
    total = sum(group.mv for group in original_groups)
    largest_group = max(original_groups, key=lambda group: group.mv)
    largest = largest_group.mv
    items = sorted(original_items, key=lambda item: -item[1].mv)

    if len(items) > TAIL_LIMIT:
        protected = [
            item for item in items if item[1].max_raw_lot > CLUB_THRESHOLD
        ]
        if len(protected) > TAIL_LIMIT - 1:
            raise BuildError(
                f"{boro}-{block}: {len(protected)} club groups cannot fit "
                f"under the {TAIL_LIMIT}-group tail cap"
            )
        rest = [
            item for item in items if item[1].max_raw_lot <= CLUB_THRESHOLD
        ]
        keep_count = TAIL_LIMIT - 1 - len(protected)
        keep = protected + rest[:keep_count]
        tail = rest[keep_count:]
        tail_group = Group(
            mv=sum(group.mv for _, group in tail),
            n=sum(group.n for _, group in tail),
            owners={"other lots"},
            owner_raws={"other lots": {"other lots"}},
            lot=-1,
            max_raw_lot=0,
        )
        items = keep + [(("T", -1), tail_group)]

    side = max(1, math.ceil(math.sqrt(len(items))))
    lots_out: List[dict] = []
    for index, (_, group) in enumerate(items):
        entry = {
            "bbl": (
                f"{boro}-{block:05d}-{group.lot:04d}"
                if group.lot >= 0
                else "other"
            ),
            "lot": group.lot,
            "c": index % side,
            "r": index // side,
            "v": round(group.mv / 1_000_000, 3),
            "nLots": group.n,
        }
        owner, owner_raw = _group_owner(group)
        if owner:
            entry["owner"] = owner[:80]
        if owner_raw is not None:
            entry["ownerRaw"] = owner_raw
        if group.max_raw_lot > CLUB_THRESHOLD:
            entry["club"] = True
        if group.mv == 0:
            entry["zero"] = True
        lots_out.append(entry)

    address_index = {
        (group.housenum, group.street): index
        for index, (_, group) in enumerate(items)
        if group.housenum and group.street
    }
    key_index = {key: index for index, (key, _) in enumerate(items)}
    lot_to_group: Dict[str, int] = {}
    for row in rows:
        housenum = low_housenum(row.housenum)
        street = row.street.strip()
        if is_pointer(row):
            address_key = (housenum, street)
            if address_key in address_index:
                lot_to_group[str(row.lot)] = address_index[address_key]
            continue
        key = group_key(row)
        if key in key_index:
            lot_to_group[str(row.lot)] = key_index[key]

    included_rows = [row for row in rows if not is_pointer(row)]
    n_lots = len(included_rows)
    llc_mv = sum(row.mv for row in included_rows if ENTITY_RE.search(row.owner))
    if expected_stats is not None:
        observed = (total, n_lots, llc_mv)
        expected = (
            expected_stats.total_mv,
            expected_stats.n_lots,
            expected_stats.llc_mv,
        )
        if observed != expected:
            raise BuildError(
                f"{boro}-{block}: block summary mismatch "
                f"observed={observed} expected={expected}"
            )

    character = block_character(original_groups)
    llc_share = round(llc_mv / total, 4) if total > 0 else 0.0
    payload = {
        "borough": BOROUGH_CODES[boro],
        "block": block,
        "bblPrefix": f"{boro}-{block:05d}",
        "totalMv": total,
        "totalM": round(total / 1_000_000, 2),
        "rank": rank,
        "rankTaxable": rank_taxable,
        "percentile": percentile,
        "largestGroupShare": round(largest / total, 4) if total > 0 else None,
        "llcShare": llc_share,
        "nLots": n_lots,
        "nGroups": len(items),
        "character": character,
        "rollYear": ROLL_YEAR,
        "extractHash": extract_hash,
        "quip": make_quip(character, original_groups, len(items)),
        "lotToGroup": lot_to_group,
        "lots": lots_out,
    }

    owner_hint, _ = _group_owner(largest_group)
    address_hint = " ".join(
        part for part in (largest_group.housenum, largest_group.street) if part
    )
    return BuiltBlock(
        payload=payload,
        real_group_count=len(original_groups),
        address_hint=address_hint,
        owner_hint=(owner_hint or "")[:80],
    )


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def assert_finite(value: object, path: str = "$") -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise BuildError(f"non-finite number at {path}")
    if isinstance(value, dict):
        for key, child in value.items():
            assert_finite(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_finite(child, f"{path}[{index}]")


def validate_payload(payload: dict) -> None:
    required = {
        "borough",
        "block",
        "bblPrefix",
        "totalMv",
        "totalM",
        "rank",
        "rankTaxable",
        "percentile",
        "largestGroupShare",
        "llcShare",
        "nLots",
        "nGroups",
        "character",
        "rollYear",
        "extractHash",
        "quip",
        "lotToGroup",
        "lots",
    }
    if set(payload) != required:
        raise BuildError(
            f"payload keys differ: missing={required - set(payload)}, "
            f"extra={set(payload) - required}"
        )
    for key in ("block", "totalMv", "rank", "rankTaxable", "nLots", "nGroups"):
        if not _is_int(payload[key]):
            raise BuildError(f"{key} must be an integer")
    for key in ("totalM", "percentile", "llcShare"):
        if not isinstance(payload[key], (int, float)) or isinstance(
            payload[key], bool
        ):
            raise BuildError(f"{key} must be numeric")
    share = payload["largestGroupShare"]
    if share is not None and not isinstance(share, (int, float)):
        raise BuildError("largestGroupShare must be numeric or null")
    if payload["borough"] not in BOROUGH_CODES.values():
        raise BuildError(f"invalid borough code: {payload['borough']!r}")
    if payload["character"] not in {"empty", "single", "whale", "flat", "spread"}:
        raise BuildError(f"invalid character: {payload['character']!r}")
    if not isinstance(payload["lotToGroup"], dict):
        raise BuildError("lotToGroup must be an object")
    if not isinstance(payload["lots"], list):
        raise BuildError("lots must be an array")
    if payload["nGroups"] != len(payload["lots"]):
        raise BuildError("nGroups does not match lots length")

    lot_required = {"bbl", "lot", "c", "r", "v", "nLots"}
    lot_optional = {"owner", "ownerRaw", "club", "zero"}
    for entry in payload["lots"]:
        if not isinstance(entry, dict):
            raise BuildError("lot entry must be an object")
        if not lot_required.issubset(entry):
            raise BuildError(f"lot entry missing keys: {lot_required - set(entry)}")
        if set(entry) - lot_required - lot_optional:
            raise BuildError(f"lot entry has extra keys: {set(entry) - lot_required - lot_optional}")
        for key in ("lot", "c", "r", "nLots"):
            if not _is_int(entry[key]):
                raise BuildError(f"lot.{key} must be an integer")
        if not isinstance(entry["v"], (int, float)) or isinstance(entry["v"], bool):
            raise BuildError("lot.v must be numeric")
        for key in ("bbl", "owner", "ownerRaw"):
            if key in entry and not isinstance(entry[key], str):
                raise BuildError(f"lot.{key} must be a string")
        for key in ("club", "zero"):
            if key in entry and entry[key] is not True:
                raise BuildError(f"lot.{key} must be true when present")

    for lot, index in payload["lotToGroup"].items():
        if not isinstance(lot, str) or not _is_int(index):
            raise BuildError("lotToGroup must map strings to integers")
        if index < 0 or index >= len(payload["lots"]):
            raise BuildError(f"lotToGroup index out of range: {lot} -> {index}")
    assert_finite(payload)


def _json_bytes(value: object) -> bytes:
    return json.dumps(
        value, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def _write_json(path: Path, value: object) -> int:
    payload = _json_bytes(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return len(payload)


def validate_tree(output_dir: Path, expected_blocks: Optional[int] = None) -> Tuple[Path, int]:
    bucket_files = sorted((output_dir / "buckets").glob("*/*.json"))
    if not bucket_files:
        raise BuildError("generated tree contains no bucket files")
    block_count = 0
    biggest_path = bucket_files[0]
    biggest_bytes = -1
    for path in bucket_files:
        size = path.stat().st_size
        if size > MAX_BUCKET_BYTES:
            raise BuildError(f"bucket exceeds {MAX_BUCKET_BYTES} bytes: {path}")
        if size > biggest_bytes:
            biggest_path, biggest_bytes = path, size
        with path.open(encoding="utf-8") as handle:
            bucket = json.load(handle)
        if not isinstance(bucket, dict):
            raise BuildError(f"{path}: bucket must be an object")
        for block_key, payload in bucket.items():
            if block_key != str(payload.get("block")):
                raise BuildError(f"{path}: bucket key {block_key!r} mismatches payload")
            validate_payload(payload)
            block_count += 1
    if expected_blocks is not None and block_count != expected_blocks:
        raise BuildError(
            f"tree has {block_count} blocks, expected {expected_blocks}"
        )
    for relative in (
        "index/block-ranks.json",
        "index/city-stats.json",
        "meta.json",
    ):
        path = output_dir / relative
        with path.open(encoding="utf-8") as handle:
            assert_finite(json.load(handle), relative)
    return biggest_path, biggest_bytes


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_extract_info(raw_dir: Path, paths: Sequence[Path]) -> ExtractInfo:
    manifest_path = raw_dir / "extract.sha256"
    manifest: Dict[str, str] = {}
    for line in manifest_path.read_text(encoding="utf-8").splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            raise BuildError(f"invalid extract hash line: {line!r}")
        manifest[Path(parts[1].strip()).name] = parts[0]
    if [path.name for path in paths] != list(manifest):
        raise BuildError("extract manifest does not match input CSV pages")
    for path in paths:
        observed = _sha256_file(path)
        if observed != manifest[path.name]:
            raise BuildError(
                f"extract hash mismatch for {path.name}: "
                f"{observed} != {manifest[path.name]}"
            )

    raw_meta_path = raw_dir / "meta.json"
    raw_meta = json.loads(raw_meta_path.read_text(encoding="utf-8"))
    first_hash = manifest[paths[0].name]
    return ExtractInfo(
        full_hash=first_hash,
        short_hash=first_hash[:8],
        manifest=manifest,
        source_url=raw_meta.get("source_url", SOURCE_URL),
        ingested_at=raw_meta["ingested_at"],
    )


def _assert_anchors(scan: ScanResult) -> None:
    observed = {
        "rows": scan.rows_read,
        "blocks": len(scan.blocks),
        "total_mv": scan.total_mv,
        "club_lots": scan.club_lots,
    }
    expected = {
        "rows": EXPECTED_ROWS,
        "blocks": EXPECTED_BLOCKS,
        "total_mv": EXPECTED_TOTAL_MV,
        "club_lots": EXPECTED_CLUB_LOTS,
    }
    if observed != expected:
        raise BuildError(f"anchor mismatch: observed={observed}, expected={expected}")


def _replace_output(staged: Path, output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    os.replace(staged, output_dir)


def build_tree(
    raw_dir: Path = DEFAULT_RAW_DIR,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    *,
    enforce_anchors: bool = True,
) -> BuildResult:
    raw_dir = Path(raw_dir)
    output_dir = Path(output_dir)
    paths = input_paths(raw_dir)
    extract = load_extract_info(raw_dir, paths)
    scan = scan_inputs(paths)
    if enforce_anchors:
        _assert_anchors(scan)
    rank_all, rank_taxable = compute_ranks(scan.blocks)
    taxable_keys = sorted(
        (key for key, stats in scan.blocks.items() if stats.taxable),
        key=lambda key: (-scan.blocks[key].total_mv, key),
    )
    top25_keys = taxable_keys[:25]
    top25_key_set = set(top25_keys)

    staged = output_dir.with_name(f".{output_dir.name}.staged-{os.getpid()}")
    if staged.exists():
        shutil.rmtree(staged)
    staged.mkdir(parents=True)

    group_count = 0
    emitted_group_count = 0
    block_count = 0
    block_ranks: List[dict] = []
    top_hints: Dict[Tuple[int, int], Tuple[str, str]] = {}
    current_bucket_key: Optional[Tuple[int, int]] = None
    current_bucket: Dict[str, dict] = {}

    def flush_bucket() -> None:
        nonlocal current_bucket
        if current_bucket_key is None:
            return
        boro, bucket = current_bucket_key
        _write_json(
            staged / "buckets" / str(boro) / f"{bucket}.json",
            current_bucket,
        )
        current_bucket = {}

    try:
        for key, rows in rows_by_block(paths):
            stats = scan.blocks.get(key)
            if stats is None:
                if any(not is_pointer(row) for row in rows):
                    raise BuildError(f"{key}: missing first-pass block summary")
                continue
            boro, block = key
            bucket_key = (boro, block // 10)
            if current_bucket_key != bucket_key:
                flush_bucket()
                current_bucket_key = bucket_key
            built = build_block_payload(
                rows,
                rank=rank_all[key],
                rank_taxable=rank_taxable.get(key, 0),
                percentile=round(rank_all[key] / len(scan.blocks) * 100, 1),
                extract_hash=extract.short_hash,
                expected_stats=stats,
            )
            current_bucket[str(block)] = built.payload
            group_count += built.real_group_count
            emitted_group_count += built.payload["nGroups"]
            block_count += 1
            rank_row = {
                "b": boro,
                "k": block,
                "m": stats.total_mv,
                "t": stats.taxable,
                "c": built.payload["character"],
            }
            if built.address_hint:
                rank_row["a"] = built.address_hint[:28]
            block_ranks.append(rank_row)
            if key in top25_key_set:
                top_hints[key] = (built.address_hint, built.owner_hint)
        flush_bucket()

        if block_count != len(scan.blocks):
            raise BuildError(
                f"serialized {block_count} blocks, expected {len(scan.blocks)}"
            )

        top25_taxable = []
        for key in top25_keys:
            boro, block = key
            address_hint, owner = top_hints[key]
            top25_taxable.append(
                {
                    "borough": BOROUGH_CODES[boro],
                    "block": block,
                    "totalM": round(scan.blocks[key].total_mv / 1_000_000, 2),
                    "addressHint": address_hint,
                    "owner": owner,
                }
            )

        city_stats = {
            "totalMv": scan.total_mv,
            "clubLots": scan.club_lots,
            "clubShareOfMv": (
                round(scan.club_mv / scan.total_mv, 4)
                if scan.total_mv > 0
                else 0.0
            ),
            "nBlocks": len(scan.blocks),
            "nLots": scan.n_lots,
            "boroughTotals": {
                BOROUGH_CODES[boro]: scan.borough_totals[boro]
                for boro in BOROUGH_CODES
            },
            "top25Taxable": top25_taxable,
            "rollYear": ROLL_YEAR,
            "extractHash": extract.short_hash,
        }
        meta = {
            "roll_year": ROLL_YEAR_LONG,
            "extract_sha256": extract.full_hash,
            "extract_manifest": extract.manifest,
            "source_url": extract.source_url,
            "ingested_at": extract.ingested_at,
            "row_count": scan.rows_read,
            "block_count": len(scan.blocks),
            "group_count": group_count,
            "emitted_group_count": emitted_group_count,
            "lot_count": scan.n_lots,
            "excluded_row_counts": scan.excluded_rows,
        }
        block_ranks.sort(key=lambda item: (-item["m"], item["b"], item["k"]))
        _write_json(staged / "index" / "block-ranks.json", block_ranks)
        _write_json(staged / "index" / "city-stats.json", city_stats)
        _write_json(staged / "meta.json", meta)
        biggest_staged, biggest_bytes = validate_tree(
            staged, expected_blocks=len(scan.blocks)
        )
        biggest_relative = biggest_staged.relative_to(staged)
        _replace_output(staged, output_dir)
        return BuildResult(
            scan=scan,
            group_count=group_count,
            emitted_group_count=emitted_group_count,
            top25_taxable=top25_taxable,
            biggest_bucket=output_dir / biggest_relative,
            biggest_bucket_bytes=biggest_bytes,
        )
    except BaseException:
        if staged.exists():
            shutil.rmtree(staged)
        raise


def streaming_recompute(paths: Sequence[Path]) -> Tuple[int, int, int]:
    """Independently recompute row count, total MV, and club-lot count."""
    rows = 0
    total_mv = 0
    club_lots = 0
    for path in paths:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            try:
                header = next(reader)
            except StopIteration as exc:
                raise BuildError(f"empty CSV: {path}") from exc
            mv_index = header.index("curmkttot")
            period_index = header.index("period")
            rectype_index = header.index("rectype")
            for values in reader:
                if values[period_index] != "3" or values[rectype_index] != "1":
                    raise BuildError(f"{path}: non-final row in independent pass")
                rows += 1
                mv = int(values[mv_index] or 0)
                total_mv += mv
                if mv > CLUB_THRESHOLD:
                    club_lots += 1
    return rows, total_mv, club_lots


def hash_tree(output_dir: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(path for path in Path(output_dir).rglob("*") if path.is_file()):
        digest.update(path.relative_to(output_dir).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def print_summary(result: BuildResult) -> None:
    top = result.top25_taxable[:5]
    top_label = lambda item: (
        f"{item['borough']} {item['block']} ${item['totalM']:,.2f}M"
    )
    print("FY2027 final-roll ETL complete.")
    print(
        f"Rows read: {result.scan.rows_read:,}; included lots: "
        f"{result.scan.n_lots:,}."
    )
    print(
        f"Blocks: {len(result.scan.blocks):,}; excluded R0 pointers: "
        f"{result.scan.excluded_rows['zero_value_r0_pointer']:,}."
    )
    print(
        f"Groups: {result.group_count:,} raw; "
        f"{result.emitted_group_count:,} emitted after tail folding."
    )
    print(f"Citywide assessed value: ${result.scan.total_mv:,}.")
    print(
        f"$50M club: {result.scan.club_lots:,} raw lots "
        f"({result.scan.club_mv / result.scan.total_mv:.2%} of value)."
    )
    print(f"Top taxable #1: {top_label(top[0])}.")
    print(f"Top taxable #2: {top_label(top[1])}.")
    print("Top taxable #3–5: " + "; ".join(top_label(item) for item in top[2:]) + ".")
    print(
        f"Biggest bucket: {result.biggest_bucket.relative_to(DEFAULT_OUTPUT_DIR)} "
        f"({result.biggest_bucket_bytes:,} bytes)."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    result = build_tree()
    print_summary(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
