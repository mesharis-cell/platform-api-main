import cookiePerser from "cookie-parser";
import express, { Application, Request, Response } from "express";
import httpStatus from "http-status";
import config from "./app/config";
import globalErrorHandler from "./app/middleware/global-error-handler";
import notFoundHandler from "./app/middleware/not-found-handler";
import { corsMiddleware, corsPreflightHandler } from "./app/middleware/cors";
import router from "./app/routes";
import swaggerRoutes from "./app/routes/swagger.routes";

const app: Application = express();

// third party middleware configuration
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookiePerser());

// =====================
// CORS (Database-driven, Multi-tenant)
// =====================
// Handles dynamic CORS for:
// - Platform subdomains (admin.xyz.com, warehouse.xyz.com, client.xyz.com)
// - Custom company domains (diageo.com, etc.)
// - Development origins (localhost:3000, etc.)
// Origins are cached for 1 minute and fetched from platforms & companyDomains tables

// CRITICAL: Set headers to prevent Vercel Edge/CDN from caching responses with wrong origin
// This middleware runs BEFORE cors middleware to ensure headers are set first
app.use((req, res, next) => {
    // Tell caches to vary response by Origin - different origins = different cached responses
    res.header("Vary", "Origin, Accept-Encoding");

    // Disable ALL caching at Vercel CDN/Edge level
    res.header("CDN-Cache-Control", "no-store");
    res.header("Vercel-CDN-Cache-Control", "no-store");

    // Disable browser/proxy caching of API responses
    res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.header("Pragma", "no-cache");
    res.header("Expires", "0");
    res.header("Surrogate-Control", "no-store");

    next();
});

app.use(corsMiddleware);

// Handle preflight BEFORE routes
// Add Cache-Control to prevent CDN from caching preflight responses with wrong origin
app.options(
    "/{*path}",
    (req, res, next) => {
        // Prevent CDN caching of preflight - each origin needs its own response
        res.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", "0");
        next();
    },
    corsPreflightHandler
);

// test server
app.get("/", (req: Request, res: Response) => {
    res.status(httpStatus.OK).json({
        success: true,
        message: `${config.app_name} server is working fine`,
    });
});

// main routes
app.use("/api", router);
app.use("/api-docs", swaggerRoutes);

// handle error
app.use(globalErrorHandler);
app.use(notFoundHandler);

export default app;
