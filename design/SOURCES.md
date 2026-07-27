# pedaterre — sources & claim verification

## Origin

Public NYC **Department of Finance property assessment** data (every tax lot, owner as filed, market value). Circulated widely in July 2026 (e.g. Trace Cohen’s post linking the DOF assessments page). Not a proprietary PDF: the source of truth is the **lot-level assessment roll**.

## Official sources

| What | URL |
|------|-----|
| DOF Property Assessments (downloads, FY roll) | https://www.nyc.gov/site/finance/property/property-assessments.page |
| Open Data · Tax classes 1–4 | https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data-Tax-Classes/8y4t-faws |
| Open Data · Property valuation (related) | https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data/yjxr-fw8i |
| Property Information Portal | https://propertyinformationportal.nyc.gov/ |
| Address → BBL | NYC Planning Labs GeoSearch |

## Field mapping (production)

Confirm exact column names against the published **record layout** for the roll year (linked next to the DOF zips).

| UI claim | Computation | Roll input |
|----------|-------------|------------|
| Lot value | `market_value` (or year-specific MV column) | DOF MV |
| Block total | `SUM(mv)` group by borough + block | BBL |
| City rank | dense rank of block totals | derived |
| Percentile | rank / n_blocks | derived |
| Whale share | max lot mv / block total | derived |
| $50M club | count / share of lots with mv > 50e6 | derived |
| LLC share | sum(mv) where owner matches entity regex / sum(mv) | owner as filed |
| Owner | exact string, no fuzzy resolution | owner |

## Production verification checklist

1. Ingest DOF zip or Open Data extract; store `roll_year`, `extract_sha256`, `ingested_at`.
2. Unit tests: known BBLs against PIP / raw CSV rows for MV and owner.
3. Aggregate job: city totals and $50M club must match a independent SQL/Polars recompute on the same file.
4. Footer on every page: roll year + “market value (assessment)” + link to DOF + extract hash (short).
5. Deep link: each lot → PIP with BBL.
6. Never hard-code citywide headline stats in production UI.

## Preview vs live

Design preview may use **illustrative lots** so UX can ship without ETL. All demo numbers must be labeled. Production flips the badge from DEMO → LIVE when queries hit the ingested roll.
