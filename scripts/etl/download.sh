#!/usr/bin/env bash
# Download the FY2027 FINAL DOF assessment roll (trimmed columns) from NYC Open Data.
# Dataset 8y4t-faws holds roll years 2023-2027, each with tentative (period=1) and
# final (period=3) records; we take year=2027 period=3 rectype=1 only.
# Paged by :id (unique system column) so pages never overlap or skip.
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE="https://data.cityofnewyork.us/resource/8y4t-faws.csv"
OUT="data/raw"
LIMIT=500000
mkdir -p "$OUT"

page=0
while :; do
  offset=$((page * LIMIT))
  f="$OUT/fy2027-final-page-$page.csv"
  echo "[$(date +%T)] page $page offset $offset"
  curl -sfG "$BASE" \
    --data-urlencode "\$select=parid,boro,block,lot,curmkttot,finmkttot,curacttot,curactextot,curtaxclass,owner,bldg_class,units,coop_num,housenum_lo,housenum_hi,street_name,period,rectype" \
    --data-urlencode "\$where=year='2027' AND period='3' AND rectype='1'" \
    --data-urlencode "\$order=:id" \
    --data-urlencode "\$limit=$LIMIT" \
    --data-urlencode "\$offset=$offset" \
    -o "$f" --max-time 900 --retry 3 --retry-delay 5
  rows=$(( $(wc -l < "$f") - 1 ))
  echo "  rows=$rows"
  if [ "$rows" -lt "$LIMIT" ]; then break; fi
  page=$((page + 1))
done

shasum -a 256 "$OUT"/fy2027-final-page-*.csv > "$OUT/extract.sha256"
cat > "$OUT/meta.json" <<META
{
  "roll_year": "FY2027 (final roll, period 3)",
  "source_url": "https://data.cityofnewyork.us/resource/8y4t-faws.csv?year=2027&period=3&rectype=1",
  "ingested_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pages": $((page + 1))
}
META
echo "DONE"
