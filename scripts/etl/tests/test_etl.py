import csv
import json
import math
import re
import sys
import tempfile
import unittest
from pathlib import Path


ETL_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ETL_DIR.parents[1]
sys.path.insert(0, str(ETL_DIR))

import build  # noqa: E402


def row(**changes):
    values = {
        "parid": "1000010001",
        "boro": 1,
        "block": 1,
        "lot": 1,
        "mv": 1_000_000,
        "act_total": 100,
        "act_exempt": 0,
        "owner": "JANE DOE",
        "bldg_class": "A1",
        "housenum": "1",
        "street": "MAIN STREET",
        "period": "3",
        "rectype": "1",
    }
    values.update(changes)
    return build.RawRow(**values)


def payload(rows):
    return build.build_block_payload(
        rows,
        rank=1,
        rank_taxable=1,
        percentile=1.0,
        extract_hash="deadbeef",
    ).payload


def write_pluto(path, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=build.PLUTO_REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def generated_payload(boro, block):
    path = (
        build.DEFAULT_OUTPUT_DIR
        / "buckets"
        / str(boro)
        / f"{block // 10}.json"
    )
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)[str(block)]


class RuleTests(unittest.TestCase):
    def test_rule_1_r0_pointers_are_excluded_and_resolve_by_address(self):
        rows = [
            row(
                parid="1014201001",
                block=1420,
                lot=1001,
                mv=2_000_000,
                housenum="200",
                street="EAST 66 STREET",
            ),
            row(
                parid="1014207501",
                block=1420,
                lot=7501,
                mv=0,
                bldg_class="R0",
                housenum="200",
                street="EAST 66 STREET",
            ),
            row(
                parid="1014207502",
                block=1420,
                lot=7502,
                mv=500_000,
                bldg_class="R0",
                housenum="202",
                street="EAST 66 STREET",
            ),
        ]
        result = payload(rows)
        self.assertEqual(result["nLots"], 2)
        self.assertEqual(result["totalMv"], 2_500_000)
        self.assertEqual(result["lotToGroup"]["1001"], result["lotToGroup"]["7501"])
        self.assertNotIn(7501, [entry["lot"] for entry in result["lots"]])
        self.assertIn(7502, [entry["lot"] for entry in result["lots"]])

    def test_rule_2_condo_grouping_blank_fallback_and_owner_suppression(self):
        rows = [
            row(
                parid="1",
                lot=1001,
                mv=10,
                housenum="41-53",
                owner="OWNER A",
            ),
            row(
                parid="2",
                lot=1002,
                mv=20,
                housenum="41",
                owner="OWNER B",
            ),
            row(parid="3", lot=1003, mv=30, housenum="", owner="OWNER A"),
            row(parid="4", lot=1004, mv=40, housenum="", owner="OWNER A"),
        ]
        result = payload(rows)
        self.assertEqual(result["nGroups"], 3)
        condo_index = result["lotToGroup"]["1001"]
        self.assertEqual(condo_index, result["lotToGroup"]["1002"])
        self.assertNotIn("owner", result["lots"][condo_index])
        self.assertNotEqual(
            result["lotToGroup"]["1003"], result["lotToGroup"]["1004"]
        )

    def test_rule_3_owner_repair_and_owner_raw(self):
        raw_owner = "A" * 40 + " " + "BC"
        repaired = "A" * 40 + "BC"
        self.assertEqual(build.repair_owner(raw_owner), repaired)
        self.assertEqual(
            build.repair_owner("A" * 36 + " AND" + " " + "BC"),
            "A" * 36 + " AND" + " " + "BC",
        )
        result = payload([row(owner=raw_owner)])
        self.assertEqual(result["lots"][0]["owner"], repaired)
        self.assertEqual(result["lots"][0]["ownerRaw"], raw_owner)
        unchanged = payload([row(owner="UNCHANGED OWNER")])
        self.assertNotIn("ownerRaw", unchanged["lots"][0])

    def test_rule_4_duplicate_parid_is_a_hard_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "fy2027-final-page-0.csv"
            headers = list(build.REQUIRED_COLUMNS)
            common = {
                "parid": "DUPLICATE",
                "boro": "1",
                "block": "1",
                "lot": "1",
                "curmkttot": "100",
                "curacttot": "100",
                "curactextot": "0",
                "owner": "OWNER",
                "bldg_class": "A1",
                "housenum_lo": "1",
                "street_name": "MAIN STREET",
                "period": "3",
                "rectype": "1",
            }
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=headers)
                writer.writeheader()
                writer.writerow(common)
                writer.writerow({**common, "lot": "2"})
            with self.assertRaisesRegex(build.BuildError, "duplicate parid"):
                build.scan_inputs([path])

    def test_rule_5_tail_keeps_club_and_folds_remainder(self):
        rows = [
            row(parid=str(index), lot=index, mv=index)
            for index in range(1, 122)
        ]
        rows[0] = row(parid="1", lot=1, mv=60_000_001)
        result = payload(rows)
        self.assertEqual(result["nGroups"], 120)
        self.assertEqual(sum(entry["nLots"] for entry in result["lots"]), 121)
        self.assertTrue(result["lots"][0]["club"])
        other = next(entry for entry in result["lots"] if entry["bbl"] == "other")
        self.assertEqual(other["nLots"], 2)

    def test_rule_6_club_is_raw_lot_based_and_zero_is_group_total_based(self):
        rows = [
            row(parid="1", lot=1001, mv=30_000_000),
            row(parid="2", lot=1002, mv=30_000_000),
            row(parid="3", lot=2, mv=50_000_001),
            row(parid="4", lot=3, mv=0),
            row(
                parid="5",
                lot=1003,
                mv=10,
                housenum="2",
                street="OTHER STREET",
            ),
            row(
                parid="6",
                lot=1004,
                mv=-10,
                housenum="2",
                street="OTHER STREET",
            ),
        ]
        result = payload(rows)
        combined = result["lots"][result["lotToGroup"]["1001"]]
        raw_club = result["lots"][result["lotToGroup"]["2"]]
        zero = result["lots"][result["lotToGroup"]["3"]]
        net_zero = result["lots"][result["lotToGroup"]["1003"]]
        self.assertNotIn("club", combined)
        self.assertTrue(raw_club["club"])
        self.assertTrue(zero["zero"])
        self.assertTrue(net_zero["zero"])

    def test_club_record_keeps_raw_lot_fields_and_lot_taxability(self):
        raw_owner = "A" * 40 + " " + "BC"
        record = build.club_lot_record(
            row(
                boro=4,
                block=123,
                lot=45,
                mv=50_000_001,
                act_total=200,
                act_exempt=99,
                owner=raw_owner,
                housenum=" 10-12 ",
                street=" MAIN STREET ",
                bldg_class="O4",
            )
        )
        self.assertEqual(
            record,
            {
                "bbl": "4001230045",
                "boro": 4,
                "block": 123,
                "lot": 45,
                "mv": 50_000_001,
                "owner": "A" * 40 + "BC",
                "address": "10-12 MAIN STREET",
                "bldgClass": "O4",
                "taxable": True,
            },
        )
        self.assertIsNone(build.club_lot_record(row(mv=build.CLUB_THRESHOLD)))
        unnamed = build.club_lot_record(
            row(mv=50_000_001, act_total=0, owner=" NAME NOT ON FILE ")
        )
        self.assertNotIn("owner", unnamed)
        self.assertFalse(unnamed["taxable"])

    def test_rule_7_character_thresholds_and_ties(self):
        group = lambda value, maximum=None: build.Group(
            mv=value, n=1, max_raw_lot=value if maximum is None else maximum
        )
        self.assertEqual(build.block_character([group(0), group(0)]), "empty")
        self.assertEqual(build.block_character([group(10)]), "single")
        self.assertEqual(
            build.block_character([group(32), group(23), group(23), group(22)]),
            "whale",
        )
        self.assertEqual(
            build.block_character([group(10), group(11), group(12), group(13)]),
            "flat",
        )
        self.assertEqual(
            build.block_character([group(10), group(29), group(30), group(31)]),
            "spread",
        )

    def test_rule_8_zero_guard_and_nonfinite_rejection(self):
        result = payload([row(mv=0)])
        self.assertIsNone(result["largestGroupShare"])
        build.assert_finite(result)
        for value in (math.nan, math.inf, -math.inf):
            with self.assertRaisesRegex(build.BuildError, "non-finite"):
                build.assert_finite({"value": value})

    def test_rule_9_llc_share_uses_word_bounded_owner_matches(self):
        rows = [
            row(parid="1", lot=1, mv=50, owner="EXAMPLE LLC"),
            row(parid="4", lot=4, mv=25, owner="EXAMPLE L.L.C."),
            row(parid="2", lot=2, mv=20, owner="JANE DOE"),
            row(parid="3", lot=3, mv=5, owner="SMALLCORPUS"),
        ]
        result = payload(rows)
        self.assertEqual(result["llcShare"], 0.75)
        for token in (
            "LLC",
            "L.L.C.",
            "LP",
            "L.P.",
            "LLP",
            "CORP",
            "CORPORATION",
            "INC",
            "INCORPORATED",
            "TRUST",
            "HOLDINGS",
            "PARTNERS",
            "REALTY",
            "PROPERTIES",
        ):
            with self.subTest(token=token):
                self.assertIsNotNone(build.ENTITY_RE.search(f"ACME {token}"))
        self.assertIsNone(build.ENTITY_RE.search("SMALLCORPUS"))

    def test_rule_10_dense_rank_and_taxable_universe(self):
        blocks = {
            (1, 1): build.BlockStats(total_mv=100, act_total=100, act_exempt=0),
            (1, 2): build.BlockStats(total_mv=100, act_total=100, act_exempt=50),
            (1, 3): build.BlockStats(total_mv=50, act_total=100, act_exempt=49),
            (1, 4): build.BlockStats(total_mv=25, act_total=0, act_exempt=0),
        }
        rank_all, rank_taxable = build.compute_ranks(blocks)
        self.assertEqual(rank_all, {(1, 1): 1, (1, 2): 1, (1, 3): 2, (1, 4): 3})
        self.assertEqual(rank_taxable, {(1, 1): 1, (1, 3): 2})
        self.assertEqual(
            build.rank_records(
                [{"mv": 100}, {"mv": 100}, {"mv": 50}, {"mv": 25}],
                "mv",
            ),
            [
                {"mv": 100, "rank": 1},
                {"mv": 100, "rank": 1},
                {"mv": 50, "rank": 2},
                {"mv": 25, "rank": 3},
            ],
        )

    def test_pluto_geometry_capacity_and_unknown_far_rules(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "pluto-page-0.csv"
            write_pluto(
                path,
                [
                    {
                        "borough": "MN",
                        "block": "1",
                        "lot": "1",
                        "latitude": "40.7",
                        "longitude": "-74.0",
                        "lotarea": "100",
                        "bldgarea": "50",
                        "builtfar": "1",
                        "residfar": "3",
                        "commfar": "0",
                        "facilfar": "2",
                    },
                    {
                        "borough": "MN",
                        "block": "1",
                        "lot": "2",
                        "latitude": "40.8",
                        "longitude": "-73.9",
                        "lotarea": "80",
                        "bldgarea": "20",
                        "builtfar": "1",
                        "residfar": "",
                        "commfar": "0",
                        "facilfar": "0",
                    },
                    {
                        "borough": "MN",
                        "block": "1",
                        "lot": "3",
                        "latitude": "0",
                        "longitude": "0",
                        "lotarea": "0",
                        "bldgarea": "10",
                        "builtfar": "0",
                        "residfar": "0",
                        "commfar": "0",
                        "facilfar": "0",
                    },
                ],
            )
            result = build.scan_pluto([path])
            block = result.blocks[(1, 1)]
            self.assertEqual(result.rows_read, 3)
            self.assertEqual(block.latitude, 40.75)
            self.assertEqual(block.longitude, -73.95)
            self.assertEqual(block.land_area, 180)
            self.assertEqual(block.built_sqft, 80)
            self.assertEqual(block.lot_built_sqft, {1: 50, 2: 20, 3: 10})
            self.assertEqual(block.capacity_sqft, 200)
            self.assertEqual(block.unknown_lots, 1)
            self.assertEqual(result.manhattan_residential_capacity_sqft, 200)

    def test_air_rights_are_allocated_to_existing_groups_in_square_feet(self):
        geometry = build.PlutoBlock(
            land_area=100,
            built_sqft=50,
            capacity_sqft=200,
            latitude_sum=40.7,
            longitude_sum=-74.0,
            coordinate_lots=1,
            lot_built_sqft={1: 50},
            lot_capacity={1: 200},
        )
        result = build.build_block_payload(
            [row()],
            rank=1,
            rank_taxable=1,
            percentile=1.0,
            extract_hash="deadbeef",
            pluto_block=geometry,
        ).payload
        self.assertEqual(result["builtSqft"], 50)
        self.assertEqual(result["capacitySqft"], 200)
        self.assertEqual(result["lots"][0]["builtSqft"], 50)
        self.assertEqual(result["lots"][0]["ghost"], 200)
        self.assertNotIn("$", build.AIR_RIGHTS_CAVEAT)

    def test_group_built_area_sums_to_rounded_block_built_area(self):
        geometry = build.PlutoBlock(
            built_sqft=70.8,
            lot_built_sqft={1: 50.4, 2: 20.4},
        )
        result = build.build_block_payload(
            [row(), row(parid="1000010002", lot=2, owner="JOHN DOE")],
            rank=1,
            rank_taxable=1,
            percentile=1.0,
            extract_hash="deadbeef",
            pluto_block=geometry,
        ).payload
        self.assertEqual(
            sum(group["builtSqft"] for group in result["lots"]),
            result["builtSqft"],
        )

    def test_block_without_pluto_match_reports_unknown_not_zero(self):
        result = payload([row()])
        for key in (
            "landArea",
            "builtSqft",
            "capacitySqft",
            "unknownLots",
            "ghostRatio",
        ):
            self.assertIsNone(result[key])
        self.assertIsNone(result["lots"][0]["builtSqft"])
        self.assertIsNone(result["lots"][0]["ghost"])

    def test_quip_templates_are_deterministic(self):
        large_whale = [
            build.Group(mv=50, n=1, max_raw_lot=0),
            build.Group(mv=50, n=1, max_raw_lot=0),
        ]
        self.assertEqual(
            build.make_quip("whale", large_whale, 2),
            "One building is 50% of the block's assessed value.",
        )
        small_whale = [
            build.Group(mv=40, n=1),
            build.Group(mv=30, n=1),
            build.Group(mv=30, n=1),
        ]
        self.assertEqual(
            build.make_quip("whale", small_whale, 3),
            "The largest holding here carries 40% of the block.",
        )
        spread_club = [
            build.Group(mv=60, n=1, max_raw_lot=51_000_000),
            build.Group(mv=50, n=1),
            build.Group(mv=50, n=1),
            build.Group(mv=40, n=1),
        ]
        self.assertEqual(
            build.make_quip("spread", spread_club, 4),
            "1 of 4 property groups on this block clear $50M.",
        )
        spread = [
            build.Group(mv=40, n=1),
            build.Group(mv=30, n=1),
            build.Group(mv=20, n=1),
            build.Group(mv=10, n=1),
        ]
        self.assertEqual(
            build.make_quip("spread", spread, 4),
            "4 property groups. The top one is 1.6× the median holding here.",
        )
        flat = [build.Group(mv=20, n=1), build.Group(mv=10, n=1)]
        self.assertEqual(
            build.make_quip("flat", flat, 2),
            "2 holdings, all within 2× of each other. "
            "No single filing dominates.",
        )
        self.assertEqual(
            build.make_quip("single", [build.Group(mv=1, n=1)], 1),
            "One lot. The whole block. One line in the roll.",
        )
        self.assertEqual(
            build.make_quip("empty", [build.Group(mv=0, n=1)], 1),
            "No assessed market value on this roll.",
        )


class ProductionTreeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = build.build_tree()

    def test_anchor_counts(self):
        self.assertEqual(self.result.scan.rows_read, build.EXPECTED_ROWS)
        self.assertEqual(len(self.result.scan.blocks), build.EXPECTED_BLOCKS)
        self.assertEqual(self.result.scan.total_mv, build.EXPECTED_TOTAL_MV)
        self.assertEqual(self.result.scan.club_lots, build.EXPECTED_CLUB_LOTS)

    def test_two_way_streaming_recompute(self):
        observed = build.streaming_recompute(build.input_paths())
        self.assertEqual(
            observed,
            (
                self.result.scan.rows_read,
                self.result.scan.total_mv,
                self.result.scan.club_lots,
            ),
        )

    def test_all_six_golden_fixtures(self):
        excluded = {"rank", "rankTaxable", "percentile", "llcShare", "quip"}
        borough_number = {value: key for key, value in build.BOROUGH_CODES.items()}

        def compare_fixture_fields(actual, fixture, location):
            if isinstance(fixture, dict):
                self.assertIsInstance(actual, dict, location)
                for key, value in fixture.items():
                    if location == "$" and key in excluded:
                        continue
                    self.assertIn(key, actual, f"{location}.{key}")
                    compare_fixture_fields(actual[key], value, f"{location}.{key}")
            elif isinstance(fixture, list):
                self.assertEqual(len(actual), len(fixture), location)
                for index, value in enumerate(fixture):
                    compare_fixture_fields(actual[index], value, f"{location}[{index}]")
            else:
                self.assertEqual(actual, fixture, location)

        for fixture_path in sorted((REPOSITORY_ROOT / "data" / "fixtures").glob("*.json")):
            with self.subTest(fixture=fixture_path.name):
                with fixture_path.open(encoding="utf-8") as handle:
                    fixture = json.load(handle)
                actual = generated_payload(
                    borough_number[fixture["borough"]], fixture["block"]
                )
                compare_fixture_fields(actual, fixture, "$")

    def test_condo_acceptance_and_largest_blocks(self):
        bpc = generated_payload(1, 16)
        self.assertGreaterEqual(bpc["nGroups"], 40)
        self.assertLessEqual(bpc["nGroups"], 80)

        largest = sorted(
            self.result.scan.blocks.items(),
            key=lambda item: (-item[1].n_lots, item[0]),
        )[:20]
        for (boro, block), _ in largest:
            with self.subTest(boro=boro, block=block):
                self.assertGreater(generated_payload(boro, block)["nGroups"], 1)

        condo = generated_payload(1, 1420)
        unit_group = condo["lotToGroup"]["1001"]
        self.assertEqual(unit_group, condo["lotToGroup"]["7501"])
        self.assertGreater(condo["lots"][unit_group]["v"], 0)

    def test_full_tree_schema_finiteness_and_bucket_limits(self):
        biggest, size = build.validate_tree(
            build.DEFAULT_OUTPUT_DIR, expected_blocks=build.EXPECTED_BLOCKS
        )
        self.assertEqual(biggest, self.result.biggest_bucket)
        self.assertEqual(size, self.result.biggest_bucket_bytes)
        self.assertLessEqual(size, build.MAX_BUCKET_BYTES)
        self.assertEqual(
            len(list((build.DEFAULT_OUTPUT_DIR / "buckets").glob("*/*.json"))),
            3_585,
        )

    def test_meta_and_city_index(self):
        with (build.DEFAULT_OUTPUT_DIR / "meta.json").open(encoding="utf-8") as handle:
            meta = json.load(handle)
        with (build.DEFAULT_OUTPUT_DIR / "index" / "city-stats.json").open(
            encoding="utf-8"
        ) as handle:
            city = json.load(handle)
        self.assertEqual(meta["row_count"], build.EXPECTED_ROWS)
        self.assertEqual(meta["block_count"], build.EXPECTED_BLOCKS)
        self.assertEqual(meta["group_count"], self.result.group_count)
        self.assertEqual(
            city["nLocatedBlocks"], self.result.blocks_with_coordinates
        )
        self.assertEqual(
            sum(city["boroughTotals"].values()), build.EXPECTED_TOTAL_MV
        )
        self.assertEqual(len(city["top25Taxable"]), 25)

    def test_geometry_map_coverage_join_and_null_density(self):
        with (
            build.DEFAULT_OUTPUT_DIR / "index" / "block-map.json"
        ).open(encoding="utf-8") as handle:
            block_map = json.load(handle)
        lengths = {len(column) for column in block_map.values()}
        self.assertEqual(len(lengths), 1)
        self.assertEqual(next(iter(lengths)), self.result.blocks_with_coordinates)
        self.assertGreater(
            self.result.blocks_with_coordinates / build.EXPECTED_BLOCKS,
            0.95,
        )
        self.assertEqual(
            self.result.blocks_with_coordinates
            + self.result.blocks_without_coordinates,
            build.EXPECTED_BLOCKS,
        )
        for land_area, density in zip(block_map["a"], block_map["d"]):
            self.assertEqual(density is None, land_area == 0)
        with (
            build.DEFAULT_OUTPUT_DIR / "index" / "block-ranks.json"
        ).open(encoding="utf-8") as handle:
            rank_rows = json.load(handle)
        self.assertEqual(
            set(zip(block_map["b"], block_map["k"])),
            {(row["b"], row["k"]) for row in rank_rows}
            - {
                key
                for key in self.result.scan.blocks
                if self.result.pluto.blocks[key].latitude is None
            },
        )

    def test_air_rights_citywide_benchmarks_and_caveat(self):
        with (
            build.DEFAULT_OUTPUT_DIR / "index" / "ghost-stats.json"
        ).open(encoding="utf-8") as handle:
            ghost = json.load(handle)
        self.assertAlmostEqual(
            ghost["citywide"]["capacitySqft"],
            8_696_000_000,
            delta=8_696_000_000 * 0.02,
        )
        self.assertAlmostEqual(
            self.result.pluto.manhattan_residential_capacity_sqft,
            571_400_000,
            delta=571_400_000 * 0.02,
        )
        self.assertGreater(ghost["citywide"]["unknownLots"], 0)
        self.assertEqual(ghost["empireStateSqft"], build.EMPIRE_STATE_SQFT)
        self.assertIn("simplified as-of-right", ghost["caveat"])
        self.assertNotIn("$", json.dumps(ghost))
        self.assertTrue(
            all(row["capacitySqft"] >= 0 for row in ghost["top50"])
        )

    def test_full_city_block_ranks_index(self):
        with (
            build.DEFAULT_OUTPUT_DIR / "index" / "block-ranks.json"
        ).open(encoding="utf-8") as handle:
            rows = json.load(handle)

        self.assertEqual(len(rows), build.EXPECTED_BLOCKS)
        self.assertEqual(sum(row["m"] for row in rows), build.EXPECTED_TOTAL_MV)
        self.assertTrue(
            all(left["m"] >= right["m"] for left, right in zip(rows, rows[1:]))
        )

        bucket_ranks = {}
        for bucket_path in (
            build.DEFAULT_OUTPUT_DIR / "buckets"
        ).glob("*/*.json"):
            boro = int(bucket_path.parent.name)
            with bucket_path.open(encoding="utf-8") as handle:
                bucket_ranks.update(
                    {
                        (boro, int(block)): payload["rank"]
                        for block, payload in json.load(handle).items()
                    }
                )

        self.assertEqual(
            {(row["b"], row["k"]) for row in rows},
            set(bucket_ranks),
        )
        self.assertTrue(
            all(
                row["rank"] == bucket_ranks[(row["b"], row["k"])]
                for row in rows
            )
        )
        self.assertTrue(
            all(
                {"b", "k", "m", "t", "c", "rank"}.issubset(row)
                and set(row).issubset(
                    {"b", "k", "m", "t", "a", "c", "rank"}
                )
                for row in rows
            )
        )
        self.assertTrue(all(len(row.get("a", "")) <= 28 for row in rows))

    def test_club_lot_index_matches_city_anchors_and_bucket_tree(self):
        with (
            build.DEFAULT_OUTPUT_DIR / "index" / "club-lots.json"
        ).open(encoding="utf-8") as handle:
            rows = json.load(handle)
        with (
            build.DEFAULT_OUTPUT_DIR / "index" / "city-stats.json"
        ).open(encoding="utf-8") as handle:
            city = json.load(handle)

        self.assertEqual(len(rows), city["clubLots"])
        self.assertLessEqual(
            (build.DEFAULT_OUTPUT_DIR / "index" / "club-lots.json").stat().st_size,
            build.MAX_CLUB_LOTS_BYTES,
        )
        self.assertTrue(all(row["mv"] > build.CLUB_THRESHOLD for row in rows))
        self.assertTrue(
            all(
                left["mv"] >= right["mv"]
                for left, right in zip(rows, rows[1:])
            )
        )
        dense_rank = 0
        previous_value = None
        for row in rows:
            if previous_value is None or row["mv"] != previous_value:
                dense_rank += 1
                previous_value = row["mv"]
            self.assertEqual(row["rank"], dense_rank)
        self.assertEqual(
            round(sum(row["mv"] for row in rows) / city["totalMv"], 4),
            city["clubShareOfMv"],
        )
        self.assertTrue(
            all(re.fullmatch(r"[1-5]\d{9}", row["bbl"]) for row in rows)
        )

        bucket_keys = set()
        for bucket_path in (
            build.DEFAULT_OUTPUT_DIR / "buckets"
        ).glob("*/*.json"):
            boro = int(bucket_path.parent.name)
            with bucket_path.open(encoding="utf-8") as handle:
                bucket_keys.update(
                    (boro, int(block)) for block in json.load(handle)
                )
        self.assertTrue(
            all((row["boro"], row["block"]) in bucket_keys for row in rows)
        )

    def test_z_determinism(self):
        first = build.hash_tree(build.DEFAULT_OUTPUT_DIR)
        second_result = build.build_tree()
        second = build.hash_tree(build.DEFAULT_OUTPUT_DIR)
        self.assertEqual(first, second)
        self.assertEqual(
            self.result.biggest_bucket_bytes, second_result.biggest_bucket_bytes
        )


if __name__ == "__main__":
    unittest.main()
