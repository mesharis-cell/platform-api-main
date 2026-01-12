import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import { companies, warehouses, zones, brands } from "../../../db/schema";

export type ValidationError = {
    field: string;
    value: any;
    error: string;
};

export type RowValidationResult = {
    rowNumber: number;
    name: string;
    errors: ValidationError[];
};

// ----------------------------------- VALIDATE COMPANY EXISTS ---------------------------------
export const validateCompanyExists = async (
    companyId: string,
    platformId: string
): Promise<ValidationError | null> => {
    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
        .limit(1);

    if (!company) {
        return {
            field: "company_id",
            value: companyId,
            error: "Company not found or does not belong to this platform",
        };
    }

    return null;
};

// ----------------------------------- VALIDATE WAREHOUSE EXISTS -------------------------------
export const validateWarehouseExists = async (
    warehouseId: string,
    platformId: string
): Promise<ValidationError | null> => {
    const [warehouse] = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(eq(warehouses.id, warehouseId), eq(warehouses.platform_id, platformId)))
        .limit(1);

    if (!warehouse) {
        return {
            field: "warehouse_id",
            value: warehouseId,
            error: "Warehouse not found or does not belong to this platform",
        };
    }

    return null;
};

// ----------------------------------- VALIDATE ZONE EXISTS ------------------------------------
export const validateZoneExists = async (
    zoneId: string,
    warehouseId: string,
    companyId: string,
    platformId: string
): Promise<ValidationError | null> => {
    const [zone] = await db
        .select({ id: zones.id })
        .from(zones)
        .where(
            and(
                eq(zones.id, zoneId),
                eq(zones.warehouse_id, warehouseId),
                eq(zones.company_id, companyId),
                eq(zones.platform_id, platformId)
            )
        )
        .limit(1);

    if (!zone) {
        return {
            field: "zone_id",
            value: zoneId,
            error: "Zone not found or does not belong to the specified warehouse and company",
        };
    }

    return null;
};

// ----------------------------------- VALIDATE BRAND EXISTS -----------------------------------
export const validateBrandExists = async (
    brandId: string,
    companyId: string,
    platformId: string
): Promise<ValidationError | null> => {
    const [brand] = await db
        .select({ id: brands.id })
        .from(brands)
        .where(
            and(
                eq(brands.id, brandId),
                eq(brands.company_id, companyId),
                eq(brands.platform_id, platformId)
            )
        )
        .limit(1);

    if (!brand) {
        return {
            field: "brand_id",
            value: brandId,
            error: "Brand not found or does not belong to this company",
        };
    }

    return null;
};

// ----------------------------------- VALIDATE ALL REFERENCES ---------------------------------
export const validateReferences = async (
    row: Record<string, any>,
    platformId: string
): Promise<ValidationError[]> => {
    const errors: ValidationError[] = [];

    // Validate company_id
    const companyError = await validateCompanyExists(row.company_id, platformId);
    if (companyError) {
        errors.push(companyError);
        // If company doesn't exist, skip other validations that depend on it
        return errors;
    }

    // Validate warehouse_id
    const warehouseError = await validateWarehouseExists(row.warehouse_id, platformId);
    if (warehouseError) {
        errors.push(warehouseError);
    }

    // Validate zone_id (depends on warehouse and company)
    const zoneError = await validateZoneExists(
        row.zone_id,
        row.warehouse_id,
        row.company_id,
        platformId
    );
    if (zoneError) {
        errors.push(zoneError);
    }

    // Validate brand_id (optional field)
    if (row.brand_id && row.brand_id.trim() !== "") {
        const brandError = await validateBrandExists(row.brand_id, row.company_id, platformId);
        if (brandError) {
            errors.push(brandError);
        }
    }

    return errors;
};
