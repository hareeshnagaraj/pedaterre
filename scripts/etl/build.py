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
PLUTO_BOROUGH_CODES = {code: boro for boro, code in BOROUGH_CODES.items()}
TAIL_LIMIT = 120
CLUB_THRESHOLD = 50_000_000
MAX_BUCKET_BYTES = 150 * 1024
MAX_CLUB_LOTS_BYTES = 500 * 1024
EXPECTED_ROWS = 1_167_962
EXPECTED_BLOCKS = 28_798
EXPECTED_TOTAL_MV = 1_911_446_867_962
EXPECTED_CLUB_LOTS = 2_821
EMPIRE_STATE_SQFT = 2_768_591
NYC_LATITUDE_RANGE = (40.47, 40.93)
NYC_LONGITUDE_RANGE = (-74.30, -73.68)
AIR_RIGHTS_CAVEAT = (
    "Capacity is a simplified as-of-right envelope only. It ignores overlays, "
    "special districts, landmarks, air-rights transfers, and lot mergers; a "
    "lot showing capacity may be legally unable to use it."
)

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

PLUTO_REQUIRED_COLUMNS = (
    "borough",
    "block",
    "lot",
    "latitude",
    "longitude",
    "lotarea",
    "bldgarea",
    "builtfar",
    "residfar",
    "commfar",
    "facilfar",
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


def taxable_assessment(act_total: int, act_exempt: int) -> bool:
    if act_total == 0:
        return False
    return act_exempt / act_total < 0.5


@dataclass
class BlockStats:
    total_mv: int = 0
    act_total: int = 0
    act_exempt: int = 0
    n_lots: int = 0
    llc_mv: int = 0

    @property
    def taxable(self) -> bool:
        return taxable_assessment(self.act_total, self.act_exempt)


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
    club_records: List[dict] = field(default_factory=list)


@dataclass
class PlutoBlock:
    land_area: float = 0
    built_sqft: float = 0
    capacity_sqft: float = 0
    unknown_lots: int = 0
    latitude_sum: float = 0
    longitude_sum: float = 0
    coordinate_lots: int = 0
    lot_capacity: Dict[int, float] = field(default_factory=dict)

    @property
    def latitude(self) -> Optional[float]:
        if self.coordinate_lots == 0:
            return None
        return self.latitude_sum / self.coordinate_lots

    @property
    def longitude(self) -> Optional[float]:
        if self.coordinate_lots == 0:
            return None
        return self.longitude_sum / self.coordinate_lots


@dataclass
class PlutoScanResult:
    rows_read: int = 0
    coordinate_rows: int = 0
    manhattan_residential_capacity_sqft: float = 0
    blocks: Dict[Tuple[int, int], PlutoBlock] = field(default_factory=dict)


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
    pluto: PlutoScanResult
    group_count: int
    emitted_group_count: int
    top25_taxable: List[dict]
    biggest_bucket: Path
    biggest_bucket_bytes: int
    blocks_with_coordinates: int
    blocks_without_coordinates: int


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


def club_lot_record(row: RawRow) -> Optional[dict]:
    if row.mv <= CLUB_THRESHOLD or is_pointer(row):
        return None
    bbl = f"{row.boro}{row.block:05d}{row.lot:04d}"
    if not re.fullmatch(r"[1-5]\d{9}", bbl):
        raise BuildError(
            f"invalid club-lot BBL components: {row.boro}-{row.block}-{row.lot}"
        )
    record = {
        "bbl": bbl,
        "boro": row.boro,
        "block": row.block,
        "lot": row.lot,
        "mv": row.mv,
        "address": " ".join(
            part for part in (row.housenum.strip(), row.street.strip()) if part
        ),
        "bldgClass": row.bldg_class,
        "taxable": taxable_assessment(row.act_total, row.act_exempt),
    }
    owner = repair_owner(row.owner).strip()
    if owner and owner.upper() != "NAME NOT ON FILE":
        record["owner"] = owner
    return record


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


def pluto_input_paths(raw_dir: Path = DEFAULT_RAW_DIR) -> List[Path]:
    def page_number(path: Path) -> int:
        match = re.search(r"pluto-page-(\d+)\.csv$", path.name)
        if not match:
            raise BuildError(f"unexpected PLUTO filename: {path}")
        return int(match.group(1))

    paths = sorted(raw_dir.glob("pluto-page-*.csv"), key=page_number)
    if not paths:
        raise BuildError(f"no PLUTO CSVs found in {raw_dir}")
    return paths


def _pluto_number(
    value: str,
    field_name: str,
    path: Path,
    line_number: int,
) -> Optional[float]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        number = float(value)
    except ValueError as exc:
        raise BuildError(
            f"{path}:{line_number}: non-numeric {field_name}={value!r}"
        ) from exc
    if not math.isfinite(number):
        raise BuildError(
            f"{path}:{line_number}: non-finite {field_name}={value!r}"
        )
    return number


def scan_pluto(paths: Sequence[Path]) -> PlutoScanResult:
    result = PlutoScanResult()
    for path in paths:
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None:
                raise BuildError(f"empty CSV: {path}")
            missing = [
                name for name in PLUTO_REQUIRED_COLUMNS
                if name not in reader.fieldnames
            ]
            if missing:
                raise BuildError(
                    f"{path}: missing PLUTO columns: {', '.join(missing)}"
                )

            for line_number, row in enumerate(reader, 2):
                result.rows_read += 1
                borough_code = (row["borough"] or "").strip()
                boro = PLUTO_BOROUGH_CODES.get(borough_code)
                if boro is None:
                    raise BuildError(
                        f"{path}:{line_number}: invalid PLUTO borough "
                        f"{borough_code!r}"
                    )
                block_number = _pluto_number(
                    row["block"], "block", path, line_number
                )
                lot_number = _pluto_number(row["lot"], "lot", path, line_number)
                if (
                    block_number is None
                    or not block_number.is_integer()
                    or lot_number is None
                    or not lot_number.is_integer()
                ):
                    raise BuildError(
                        f"{path}:{line_number}: PLUTO block and lot must be integers"
                    )
                key = (boro, int(block_number))
                block = result.blocks.setdefault(key, PlutoBlock())

                lot_area = (
                    _pluto_number(row["lotarea"], "lotarea", path, line_number)
                    or 0
                )
                built_sqft = (
                    _pluto_number(row["bldgarea"], "bldgarea", path, line_number)
                    or 0
                )
                block.land_area += lot_area
                block.built_sqft += built_sqft

                latitude = _pluto_number(
                    row["latitude"], "latitude", path, line_number
                )
                longitude = _pluto_number(
                    row["longitude"], "longitude", path, line_number
                )
                if (
                    latitude is not None
                    and longitude is not None
                    and latitude != 0
                    and longitude != 0
                ):
                    block.latitude_sum += latitude
                    block.longitude_sum += longitude
                    block.coordinate_lots += 1
                    result.coordinate_rows += 1

                # Lots without land cannot carry a meaningful FAR envelope.
                if lot_area <= 0:
                    continue

                far_values = [
                    _pluto_number(row[name], name, path, line_number)
                    for name in ("residfar", "commfar", "facilfar")
                ]
                max_far = max(value or 0 for value in far_values)
                if max_far <= 0:
                    block.unknown_lots += 1
                    continue

                built_far = (
                    _pluto_number(row["builtfar"], "builtfar", path, line_number)
                    or 0
                )
                capacity = max(0.0, max_far - built_far) * lot_area
                block.capacity_sqft += capacity
                lot = int(lot_number)
                block.lot_capacity[lot] = (
                    block.lot_capacity.get(lot, 0) + capacity
                )

                residential_far = far_values[0] or 0
                if boro == 1 and residential_far > 0:
                    result.manhattan_residential_capacity_sqft += (
                        max(0.0, residential_far - built_far) * lot_area
                    )
    return result


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
            record = club_lot_record(row)
            if record is None:
                raise BuildError(f"{row.parid}: qualifying club lot was not emitted")
            result.club_records.append(record)
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


def rank_records(records: Sequence[dict], value_field: str) -> List[dict]:
    ranked: List[dict] = []
    last_value: Optional[int] = None
    rank = 0
    for record in records:
        value = record[value_field]
        if last_value is None or value != last_value:
            rank += 1
            last_value = value
        ranked.append({**record, "rank": rank})
    return ranked


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
        return "No assessed market value on this roll."
    if character == "single":
        return "One lot. The whole block. One line in the roll."
    if character == "whale":
        percent = round(share * 100)
        if share >= 0.45:
            return f"One building is {percent}% of the block's assessed value."
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
            f"{displayed_groups} holdings, all within "
            f"{_ratio_text(spread)}× of each other. No single filing dominates."
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
    pluto_block: Optional[PlutoBlock] = None,
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

    folded_keys: List[tuple] = []
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
        folded_keys = [key for key, _ in tail]
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
            "ghost": None,
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
    if folded_keys:
        tail_index = key_index[("T", -1)]
        for key in folded_keys:
            key_index[key] = tail_index
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
    largest_lot = max(included_rows, key=lambda row: (row.mv, -row.lot))
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
        "largestLotBbl": f"{boro}{block:05d}{largest_lot.lot:04d}",
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
        "latitude": None,
        "longitude": None,
        "landArea": None,
        "builtSqft": None,
        "capacitySqft": None,
        "unknownLots": None,
        "ghostRatio": None,
        "lotToGroup": lot_to_group,
        "lots": lots_out,
    }
    if pluto_block is not None:
        latitude = pluto_block.latitude
        longitude = pluto_block.longitude
        built_sqft = round(pluto_block.built_sqft)
        capacity_sqft = round(pluto_block.capacity_sqft)
        denominator = built_sqft + capacity_sqft
        payload.update(
            {
                "latitude": round(latitude, 7) if latitude is not None else None,
                "longitude": (
                    round(longitude, 7) if longitude is not None else None
                ),
                "landArea": round(pluto_block.land_area),
                "builtSqft": built_sqft,
                "capacitySqft": capacity_sqft,
                "unknownLots": pluto_block.unknown_lots,
                "ghostRatio": (
                    round(capacity_sqft / denominator, 6)
                    if denominator > 0
                    else None
                ),
            }
        )
        group_capacity = [0.0 for _ in lots_out]
        for lot, capacity in pluto_block.lot_capacity.items():
            group_index = lot_to_group.get(str(lot))
            if group_index is not None:
                group_capacity[group_index] += capacity
        rounded_capacity = [math.floor(capacity) for capacity in group_capacity]
        remainder = round(sum(group_capacity)) - sum(rounded_capacity)
        fractional_order = sorted(
            range(len(group_capacity)),
            key=lambda index: (
                -(group_capacity[index] - rounded_capacity[index]),
                index,
            ),
        )
        for index in fractional_order[:remainder]:
            rounded_capacity[index] += 1
        for entry, capacity in zip(lots_out, rounded_capacity):
            entry["ghost"] = capacity

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
        "largestLotBbl",
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
        "latitude",
        "longitude",
        "landArea",
        "builtSqft",
        "capacitySqft",
        "unknownLots",
        "ghostRatio",
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
    if not re.fullmatch(r"[1-5]\d{9}", payload["largestLotBbl"]):
        raise BuildError("largestLotBbl must be a 10-digit BBL")
    for key in ("latitude", "longitude", "ghostRatio"):
        value = payload[key]
        if value is not None and (
            not isinstance(value, (int, float)) or isinstance(value, bool)
        ):
            raise BuildError(f"{key} must be numeric or null")
    for key in ("landArea", "builtSqft", "capacitySqft", "unknownLots"):
        value = payload[key]
        if value is not None and (not _is_int(value) or value < 0):
            raise BuildError(f"{key} must be a nonnegative integer or null")
    if payload["capacitySqft"] is not None and payload["capacitySqft"] < 0:
        raise BuildError("capacitySqft cannot be negative")
    if payload["ghostRatio"] is not None and not 0 <= payload["ghostRatio"] <= 1:
        raise BuildError("ghostRatio must be between 0 and 1")
    if not isinstance(payload["lotToGroup"], dict):
        raise BuildError("lotToGroup must be an object")
    if not isinstance(payload["lots"], list):
        raise BuildError("lots must be an array")
    if payload["nGroups"] != len(payload["lots"]):
        raise BuildError("nGroups does not match lots length")

    lot_required = {"bbl", "lot", "c", "r", "v", "nLots", "ghost"}
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
        if entry["ghost"] is not None and (
            not _is_int(entry["ghost"]) or entry["ghost"] < 0
        ):
            raise BuildError("lot.ghost must be a nonnegative integer or null")
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


def _air_rights_totals(blocks: Iterable[PlutoBlock]) -> dict:
    built_sqft = 0
    capacity_sqft = 0
    unknown_lots = 0
    for block in blocks:
        built_sqft += round(block.built_sqft)
        capacity_sqft += round(block.capacity_sqft)
        unknown_lots += block.unknown_lots
    denominator = built_sqft + capacity_sqft
    return {
        "builtSqft": built_sqft,
        "capacitySqft": capacity_sqft,
        "unknownLots": unknown_lots,
        "ghostRatio": (
            round(capacity_sqft / denominator, 6)
            if denominator > 0
            else None
        ),
    }


def build_ghost_stats(
    block_keys: Iterable[Tuple[int, int]],
    pluto: PlutoScanResult,
) -> dict:
    keys = sorted(block_keys)
    matched = [
        (key, pluto.blocks[key]) for key in keys if key in pluto.blocks
    ]
    boroughs = {
        BOROUGH_CODES[boro]: _air_rights_totals(
            block for (key_boro, _), block in matched if key_boro == boro
        )
        for boro in BOROUGH_CODES
    }
    top = sorted(
        matched,
        key=lambda item: (-round(item[1].capacity_sqft), item[0]),
    )[:50]
    return {
        "caveat": AIR_RIGHTS_CAVEAT,
        "empireStateSqft": EMPIRE_STATE_SQFT,
        "citywide": _air_rights_totals(block for _, block in matched),
        "boroughs": boroughs,
        "top50": [
            {
                "b": boro,
                "borough": BOROUGH_CODES[boro],
                "k": block_number,
                **_air_rights_totals([block]),
            }
            for (boro, block_number), block in top
        ],
    }


def build_block_map(
    scan: ScanResult,
    pluto: PlutoScanResult,
    ranks: Dict[Tuple[int, int], int],
) -> Tuple[dict, int, int]:
    columns = {
        "b": [],
        "k": [],
        "x": [],
        "y": [],
        "m": [],
        "a": [],
        "d": [],
        "t": [],
        "r": [],
    }
    for key in sorted(scan.blocks):
        geometry = pluto.blocks.get(key)
        if geometry is None:
            continue
        latitude = geometry.latitude
        longitude = geometry.longitude
        if latitude is None or longitude is None:
            continue
        if not NYC_LATITUDE_RANGE[0] <= latitude <= NYC_LATITUDE_RANGE[1]:
            raise BuildError(f"{key}: latitude outside NYC bounds: {latitude}")
        if not NYC_LONGITUDE_RANGE[0] <= longitude <= NYC_LONGITUDE_RANGE[1]:
            raise BuildError(f"{key}: longitude outside NYC bounds: {longitude}")

        boro, block = key
        stats = scan.blocks[key]
        land_area = round(geometry.land_area)
        columns["b"].append(boro)
        columns["k"].append(block)
        columns["x"].append(round((longitude + 74.3) * 100_000))
        columns["y"].append(round((latitude - 40.4) * 100_000))
        columns["m"].append(round(stats.total_mv / 1_000_000, 1))
        columns["a"].append(land_area)
        columns["d"].append(
            round(stats.total_mv / land_area, 1) if land_area > 0 else None
        )
        columns["t"].append(1 if stats.taxable else 0)
        columns["r"].append(ranks[key])

    emitted = len(columns["b"])
    if any(len(column) != emitted for column in columns.values()):
        raise BuildError("block-map columns differ in length")
    missing = len(scan.blocks) - emitted
    coverage = emitted / len(scan.blocks) if scan.blocks else 0
    if coverage <= 0.95:
        raise BuildError(
            f"PLUTO coordinate coverage {coverage:.2%} does not clear 95%"
        )
    if any(
        (land_area == 0) != (density is None)
        for land_area, density in zip(columns["a"], columns["d"])
    ):
        raise BuildError("block-map density nullability differs from land area")
    return columns, emitted, missing


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
        "index/block-map.json",
        "index/block-ranks.json",
        "index/city-stats.json",
        "index/club-lots.json",
        "index/ghost-stats.json",
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
    pluto_paths = pluto_input_paths(raw_dir)
    extract = load_extract_info(raw_dir, paths)
    scan = scan_inputs(paths)
    pluto = scan_pluto(pluto_paths)
    if enforce_anchors:
        _assert_anchors(scan)
    rank_all, rank_taxable = compute_ranks(scan.blocks)
    block_map, blocks_with_coordinates, blocks_without_coordinates = (
        build_block_map(scan, pluto, rank_all)
    )
    ghost_stats = build_ghost_stats(scan.blocks, pluto)
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
                pluto_block=pluto.blocks.get(key),
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
                "rank": rank_all[key],
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
            "nLocatedBlocks": blocks_with_coordinates,
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
            "geometry": {
                "pluto_rows": pluto.rows_read,
                "coordinate_rows": pluto.coordinate_rows,
                "blocks_with_coordinates": blocks_with_coordinates,
                "blocks_without_coordinates": blocks_without_coordinates,
                "coverage_ratio": round(
                    blocks_with_coordinates / len(scan.blocks), 6
                ),
            },
            "air_rights": {
                "matched_blocks": sum(
                    key in pluto.blocks for key in scan.blocks
                ),
                "unmatched_blocks": sum(
                    key not in pluto.blocks for key in scan.blocks
                ),
                "unknown_lots": ghost_stats["citywide"]["unknownLots"],
            },
        }
        block_ranks.sort(key=lambda item: (-item["m"], item["b"], item["k"]))
        club_records = rank_records(
            sorted(
                scan.club_records,
                key=lambda item: (
                    -item["mv"],
                    item["boro"],
                    item["block"],
                    item["lot"],
                ),
            ),
            "mv",
        )
        _write_json(staged / "index" / "block-map.json", block_map)
        _write_json(staged / "index" / "block-ranks.json", block_ranks)
        _write_json(staged / "index" / "city-stats.json", city_stats)
        club_bytes = _write_json(
            staged / "index" / "club-lots.json", club_records
        )
        if club_bytes > MAX_CLUB_LOTS_BYTES:
            raise BuildError(
                f"club-lots index exceeds {MAX_CLUB_LOTS_BYTES} bytes: "
                f"{club_bytes}"
            )
        _write_json(staged / "index" / "ghost-stats.json", ghost_stats)
        _write_json(staged / "meta.json", meta)
        biggest_staged, biggest_bytes = validate_tree(
            staged, expected_blocks=len(scan.blocks)
        )
        biggest_relative = biggest_staged.relative_to(staged)
        _replace_output(staged, output_dir)
        return BuildResult(
            scan=scan,
            pluto=pluto,
            group_count=group_count,
            emitted_group_count=emitted_group_count,
            top25_taxable=top25_taxable,
            biggest_bucket=output_dir / biggest_relative,
            biggest_bucket_bytes=biggest_bytes,
            blocks_with_coordinates=blocks_with_coordinates,
            blocks_without_coordinates=blocks_without_coordinates,
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
        f"Geometry coverage: {result.blocks_with_coordinates:,} of "
        f"{len(result.scan.blocks):,} blocks "
        f"({result.blocks_with_coordinates / len(result.scan.blocks):.2%}); "
        f"{result.blocks_without_coordinates:,} omitted from the map."
    )
    citywide_capacity = _air_rights_totals(
        block for key, block in result.pluto.blocks.items()
        if key in result.scan.blocks
    )["capacitySqft"]
    print(f"Unbuilt as-of-right capacity: {citywide_capacity:,} square feet.")
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
