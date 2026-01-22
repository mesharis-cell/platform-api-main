# DATABASE MIGRATION GUIDE
## Hybrid Pricing System

**Migration**: `0014_conscious_korath.sql`  
**Branch**: `feature/reskin-and-pricing-overhaul`

---

## BEFORE MIGRATION

### 1. Backup Database (Production)
```bash
pg_dump $DATABASE_URL > backup_before_hybrid_pricing_$(date +%Y%m%d).sql
```

### 2. Review Migration File
```bash
cat drizzle/0014_conscious_korath.sql
```

---

## MIGRATION STEPS

### Option A: Using Drizzle Kit Push (Staging/Dev)
```bash
cd api
npx drizzle-kit push
```

### Option B: Using Drizzle Kit Migrate (Production)
```bash
cd api
npx drizzle-kit migrate
```

---

## SEED DATA

### Run Seed Script
```bash
cd api
node src/db/seeds/hybrid-pricing-seed.ts
```

**What it seeds**:
- Platform default pricing config (25.20 AED/m³)
- 48 transport rates (8 emirates × 2 trip types × 3 vehicles)
- 8 service types (assembly, forklifts)

---

## VERIFICATION

### Check Tables Created
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'pricing_config',
    'transport_rates', 
    'service_types',
    'order_line_items',
    'reskin_requests'
  );
```

### Check Enums Added
```sql
SELECT 
  e.enumlabel 
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'order_status'
ORDER BY e.enumsortorder;

-- Should include: AWAITING_FABRICATION, CANCELLED
```

### Check Data Seeded
```sql
-- Pricing config
SELECT * FROM pricing_config WHERE company_id IS NULL;

-- Transport rates count
SELECT COUNT(*) FROM transport_rates; -- Should be 48+

-- Service types
SELECT name, category FROM service_types ORDER BY display_order;
```

---

## TEST API ENDPOINTS

```bash
# Run test script
cd api
bash test-hybrid-pricing.sh
```

Or test manually:
```bash
# Get transport rate
curl http://localhost:3000/api/client/v1/pricing/transport-rate/lookup?emirate=Dubai&trip_type=ROUND_TRIP&vehicle_type=STANDARD \
  -H "X-Platform: your-platform-id"
```

---

## ROLLBACK (If Needed)

### Drizzle Kit
```bash
npx drizzle-kit drop
# Then restore from backup
```

### Manual
```bash
psql $DATABASE_URL < backup_before_hybrid_pricing_YYYYMMDD.sql
```

---

## POST-MIGRATION

### Update Permissions
Ensure user roles have new permissions:
- `PRICING_CONFIG_READ`, `PRICING_CONFIG_UPDATE`
- `TRANSPORT_RATES_MANAGE`
- `SERVICE_TYPES_MANAGE`
- `ORDER_LINE_ITEMS_MANAGE`
- `RESKIN_REQUESTS_PROCESS`, etc.

### Monitor Logs
Watch for errors in:
- Pricing calculation
- Transport rate lookup
- Order submission

---

**IMPORTANT**: Old pricing system (pricing_tiers) still exists for backward compatibility. Can be removed after confirming new system works.
