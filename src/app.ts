import cookiePerser from "cookie-parser";
import express, { Application, Request, Response } from "express";
import httpStatus from "http-status";
import config from "./app/config";
import globalErrorHandler from "./app/middleware/global-error-handler";
import notFoundHandler from "./app/middleware/not-found-handler";
import {
  corsMiddleware,
  corsPreflightHandler,
} from "./app/middleware/cors";
import router from "./app/routes";
import swaggerRoutes from "./app/routes/swagger.routes";

const app: Application = express();

// third party middleware configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookiePerser());

// =====================
// CORS (Database-driven, Multi-tenant)
// =====================
// Handles dynamic CORS for:
// - Platform subdomains (admin.xyz.com, warehouse.xyz.com, client.xyz.com)
// - Custom company domains (diageo.com, etc.)
// - Development origins (localhost:3000, etc.)
// Origins are cached for 1 minute and fetched from platforms & companyDomains tables
app.use((req, res, next) => {
  res.header("Vary", "Origin");
  next();
});

app.use(corsMiddleware);

// Handle preflight BEFORE routes
app.options("/{*path}", corsPreflightHandler);

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
