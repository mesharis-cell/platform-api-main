import z from "zod";
import { AssetSchemas } from "./asset.schemas";

export type CreateAssetPayload = z.infer<typeof AssetSchemas.createAssetSchema>["body"] & {
    platform_id: string;
};

export type UpdateAssetPayload = z.infer<typeof AssetSchemas.updateAssetSchema>["body"];

// ----------------------------------- BULK UPLOAD INTERFACES ---------------------------------

// CSV row structure (as received from CSV file)
export interface CSVAssetRow {
    company: string;
    warehouse: string;
    zone: string;
    name: string;
    category: string;
    trackingMethod: string;
    weight: string;
    dimensionLength: string;
    dimensionWidth: string;
    dimensionHeight: string;
    volume: string;
    totalQuantity: string;
    packaging?: string;
    brand?: string;
    description?: string;
    handlingTags?: string;
    images?: string;
    condition?: string;
}

// Parsed CSV row with row number for error reporting
export interface ParsedCSVRow extends CSVAssetRow {
    rowNumber: number;
}

// Validated asset data ready for database insertion
export interface ValidatedAssetData {
    platform_id: string;
    company_id: string;
    warehouse_id: string;
    zone_id: string;
    name: string;
    category: string;
    tracking_method: 'INDIVIDUAL' | 'BATCH';
    weight_per_unit: number;
    dimensions: {
        length?: number;
        width?: number;
        height?: number;
    };
    volume_per_unit: number;
    total_quantity: number;
    packaging?: string | null;
    brand_id?: string | null;
    description?: string | null;
    handling_tags: string[];
    images: string[];
    condition: 'GREEN' | 'ORANGE' | 'RED';
}

// Row validation error
export interface RowValidationError {
    row: number;
    errors: string[];
}

// Validation result
export interface ValidationResult {
    isValid: boolean;
    fileErrors: string[];
    rowErrors: RowValidationError[];
    validRows: ValidatedAssetData[];
    totalErrors: number;
    totalRows: number;
}

// Bulk upload API response
export interface BulkUploadResponse {
    success: boolean;
    data?: {
        created: number;
        assets: Array<{
            id: string;
            name: string;
            qr_code: string;
        }>;
    };
    error?: string;
    details?: {
        fileErrors: string[];
        rowErrors: RowValidationError[];
        totalErrors: number;
        totalRows: number;
    };
}

// Foreign key cache for validation
export interface ForeignKeyCache {
    companies: Map<string, { id: string; name: string }>;
    warehouses: Map<string, { id: string; name: string }>;
    zones: Map<string, { id: string; name: string; warehouse_id: string; company_id: string }>;
    brands: Map<string, { id: string; name: string; company_id: string }>;
}
