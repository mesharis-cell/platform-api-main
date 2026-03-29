ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "po_number" varchar(100);
