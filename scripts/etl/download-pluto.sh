#!/usr/bin/env bash
# Download NYC PLUTO (64uk-42ks) lot geometry and zoning-capacity columns.
# Feeds two features: block centroids/land area for the city map, and
# built-vs-permitted FAR for unbuilt air rights ("ghost city").
# Paged by :id (unique system column) so pages never overlap or skip.
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE="https://data.cityofnewyork.us/resource/64uk-42ks.csv"
OUT="data/raw"
LIMIT=500000
mkdir -p "$OUT"

page=0
while :; do
  offset=$((page * LIMIT))
  f="$OUT/pluto-page-$page.csv"
  echo "[$(date +%T)] page $page offset $offset"
  curl -sfG "$BASE" \
    --data-urlencode "\$select=borough,block,lot,latitude,longitude,lotarea,bldgarea,builtfar,residfar,commfar,facilfar,numfloors,yearbuilt,unitsres,bldgclass,landuse" \
    --data-urlencode "\$order=:id" \
    --data-urlencode "\$limit=$LIMIT" \
    --data-urlencode "\$offset=$offset" \
    -o "$f" --max-time 900 --retry 3 --retry-delay 5
  rows=$(( $(wc -l < "$f") - 1 ))
  echo "  rows=$rows"
  if [ "$rows" -lt "$LIMIT" ]; then break; fi
  page=$((page + 1))
done

shasum -a 256 "$OUT"/pluto-page-*.csv > "$OUT/pluto.sha256"
cat > "$OUT/pluto-meta.json" <<META
{
  "dataset": "NYC PLUTO (64uk-42ks)",
  "source_url": "https://data.cityofnewyork.us/resource/64uk-42ks.csv",
  "ingested_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pages": $((page + 1))
}
META
echo "DONE"
