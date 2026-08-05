# Port Polygon Dashboard

Map dashboard of port/terminal/berth polygons (Port/Country/Region scope, KPI cards) backed by Supabase.

## Database setup (required before anything else works)

This app has no schema until you apply the migrations in `load/migrations/` to your Supabase project, **in order**:

1. `001_schema.sql`
2. `002_aggregates.sql`
3. `003_geojson_rpc.sql`
4. `004_security_hardening.sql`
5. `005_security_hardening_public_revoke.sql`

Apply them via any of:
- The Supabase SQL editor: paste each file's contents in and run it, in order.
- The Supabase CLI, if you have it linked to the project: `supabase db push`.
- An MCP `apply_migration` call, if you're using an AI coding tool with Supabase MCP access (pass each file's name and contents).

## Local dev
npm install
cp .env.local.example .env.local   # fill in VITE_SUPABASE_ANON_KEY
npm run dev

## Data refresh

`load/load.py` reads the provider's raw CSVs from local `Data/` and `References/` directories and writes them into Supabase. Those directories live **outside** this repo by design (they're the provider's raw exports, not app source) - by default the script searches upward from its own location for an ancestor directory containing both a `Data/` and a `References/` folder, which only exists if you have this repo checked out inside the internal monorepo layout.

If you've cloned just this repo (e.g. from GitHub) and don't have that monorepo layout, `load.py` will raise `FileNotFoundError` unless you tell it where the CSVs are. Copy/sync the `Data/` and `References/` directories in somewhere, then point the script at their parent directory with either:

```
python load.py --data-dir /path/to/dir/containing/Data/and/References
```

or

```
POLYGONS_DATA_DIR=/path/to/dir/containing/Data/and/References python load.py
```

Setup:
cd load
cp .env.example .env               # fill in SUPABASE_SERVICE_ROLE_KEY
pip install -r requirements.txt
python load.py                     # or python load.py --data-dir ...
