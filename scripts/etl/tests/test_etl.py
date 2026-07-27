import csv
import json
import math
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

    def test_quip_templates_are_deterministic(self):
        large_whale = [
            build.Group(mv=50, n=1, max_raw_lot=0),
            build.Group(mv=50, n=1, max_raw_lot=0),
        ]
        self.assertEqual(
            build.make_quip("whale", large_whale, 2),
            "One building is 50% of the block's assessed value. "
            "Everyone else is a row house in its shadow.",
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
            "No towers here — 2 holdings within 2× of each other. "
            "The roll calls that balance.",
        )
        self.assertEqual(
            build.make_quip("single", [build.Group(mv=1, n=1)], 1),
            "One lot. The whole block. One line in the roll.",
        )
        self.assertEqual(
            build.make_quip("empty", [build.Group(mv=0, n=1)], 1),
            "Assessed at zero. The roll has nothing to say here.",
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
            sum(city["boroughTotals"].values()), build.EXPECTED_TOTAL_MV
        )
        self.assertEqual(len(city["top25Taxable"]), 25)

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
