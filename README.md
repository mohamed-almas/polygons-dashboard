# Port Polygon Dashboard

Map dashboard of port/terminal/berth polygons (Port/Country/Region scope, KPI cards) backed by Supabase.

## Local dev
npm install
cp .env.local.example .env.local   # fill in VITE_SUPABASE_ANON_KEY
npm run dev

## Data refresh
cd load
cp .env.example .env               # fill in SUPABASE_SERVICE_ROLE_KEY
pip install -r requirements.txt
python load.py
