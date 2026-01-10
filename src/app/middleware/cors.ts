import cors from "cors";
import { db } from "../../db";
import { platforms, companyDomains } from "../../db/schema";
import config from "../config";

// =====================================================================
// DYNAMIC CORS MIDDLEWARE
// =====================================================================
// This middleware handles CORS for a multi-tenant platform with:
// - Multiple platforms (each with their own domain)
// - Subdomain-based access (admin.xyz.com, warehouse.xyz.com, client.xyz.com)
// - Custom company domains (e.g., diageo.com instead of client.xyz.com)
// =====================================================================

// Cache for allowed origins (reduces database queries)
let allowedOriginsCache: Set<string> = new Set();
let lastCacheUpdate = 0;
const CACHE_TTL = 60000; // 1 minute - refresh cache periodically

// Development origins
const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  "http://localhost:5173", // Vite default
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
];

// Subdomain prefixes for platform domains
const SUBDOMAIN_PREFIXES = ["admin", "warehouse", "client", "logistics", "api"];

/**
 * Fetches all allowed origins from the database with caching
 */
async function getAllowedOrigins(): Promise<Set<string>> {
  const now = Date.now();

  // Return cached results if still valid
  if (now - lastCacheUpdate < CACHE_TTL && allowedOriginsCache.size > 0) {
    return allowedOriginsCache;
  }

  try {
    // Fetch platform domains and company custom domains in parallel
    const [platformDomains, customDomains] = await Promise.all([
      db.select({ domain: platforms.domain }).from(platforms),
      db.select({ hostname: companyDomains.hostname }).from(companyDomains),
    ]);

    const origins = new Set<string>();

    // Add platform domains with all subdomain variations
    platformDomains.forEach(({ domain }) => {
      if (domain) {
        // Add the base domain (both http and https for flexibility)
        origins.add(`https://${domain}`);
        origins.add(`http://${domain}`);

        // Add all subdomain prefixes
        SUBDOMAIN_PREFIXES.forEach((prefix) => {
          origins.add(`https://${prefix}.${domain}`);
          origins.add(`http://${prefix}.${domain}`);
        });
      }
    });

    // Add custom company domains (e.g., client.diageo.com, custom.example.com)
    customDomains.forEach(({ hostname }) => {
      if (hostname) {
        origins.add(`https://${hostname}`);
        origins.add(`http://${hostname}`);
      }
    });

    // Add development origins in non-production environments
    if (config.node_env !== "production") {
      DEV_ORIGINS.forEach((origin) => origins.add(origin));
    }

    // Update cache
    allowedOriginsCache = origins;
    lastCacheUpdate = now;

    return origins;
  } catch (error) {
    console.error("[CORS] Failed to fetch allowed origins:", error);

    // Return stale cache on error to prevent service disruption
    if (allowedOriginsCache.size > 0) {
      return allowedOriginsCache;
    }

    // If no cache available, allow dev origins as fallback
    return new Set(DEV_ORIGINS);
  }
}

/**
 * Manually refresh the CORS cache
 * Useful when domains are added/updated via admin panel
 */
export async function refreshCorsCache(): Promise<void> {
  lastCacheUpdate = 0; // Force cache refresh
  await getAllowedOrigins();
  console.log("[CORS] Cache refreshed");
}

/**
 * Get current cached origins (for debugging/monitoring)
 */
export function getCachedOrigins(): string[] {
  return Array.from(allowedOriginsCache);
}

/**
 * CORS origin validator function
 */
const corsOriginValidator = async (
  origin: string | undefined,
  callback: (err: Error | null, allow?: string | boolean) => void
) => {
  // Allow requests with no origin (Postman, server-to-server, mobile apps)
  if (!origin) {
    return callback(null, true);
  }

  try {
    const allowedOrigins = await getAllowedOrigins();

    if (allowedOrigins.has(origin)) {
      // Origin is allowed - reflect it back
      callback(null, origin);
    } else {
      // Log blocked origins for monitoring (only in development)
      if (config.node_env !== "production") {
        console.log(`[CORS] Blocked origin: ${origin}`);
      }
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  } catch (error) {
    console.error("[CORS] Error during origin validation:", error);
    // On error, deny the request for security
    callback(new Error("CORS validation failed"));
  }
};

/**
 * Main CORS middleware configuration
 */
export const corsMiddleware = cors({
  origin: corsOriginValidator,
  credentials: true, // Required for cookies/JWT in Authorization header
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-platform", // Platform identifier header
    "x-requested-with",
    "x-refresh-token",
  ],
  exposedHeaders: [
    "x-total-count", // For pagination
    "x-page-count",
  ],
  maxAge: 86400, // 24 hours - cache preflight requests
});

/**
 * Preflight handler for OPTIONS requests
 */
export const corsPreflightHandler = cors();
