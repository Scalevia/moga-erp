# Moga ERP

ERP for the Moga mobile & accessories shop: POS on the shop laptop + owner dashboard (PWA).

**Status:** UI prototype — all data is mock data stored in the browser (`localStorage`). No backend yet.

## Run

```bash
corepack pnpm install
corepack pnpm dev        # http://localhost:3100 (3000 is used by another project)
```

Demo PINs: owner `0000` · Mohamed `1111` · Karim `2222`.
"Reset demo data" on the start page restores the seed data.

## Layout

```
apps/erp/src/
  app/pos/login          PIN login
  app/pos/(shell)/*      POS screens: sale, returns, installments, services, used phones,
                         supplier purchases, finance movements, shift close
  app/admin/*            Owner dashboard (mobile-first): home, money, inventory, staff, IMEI lookup
  components/            Shared UI, checkout, receipt, charts
  lib/store.ts           Mock store — each action maps to a planned Postgres RPC
  lib/mock-data.ts       Deterministic seed data (12 months of history)
```
