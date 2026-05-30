/**
 * Reports routes — dual-mounted. Operations mount (ADMIN+LOGISTICS) under
 * /operations/v1/reports; client mount (CLIENT, audience-filtered) under
 * /client/v1/reports. Per-report permission + audience + operationsRoles are
 * enforced inside the controller (the generic :key route can't gate statically).
 */
import express from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { ReportsControllers } from "./reports.controllers";

const opsRouter = express.Router();
opsRouter.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    ReportsControllers.listReportsOps
);
opsRouter.get(
    "/:key/run",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    ReportsControllers.runReportOps
);

const clientRouter = express.Router();
clientRouter.get("/", platformValidator, auth("CLIENT"), ReportsControllers.listReportsClient);
clientRouter.get(
    "/:key/run",
    platformValidator,
    auth("CLIENT"),
    ReportsControllers.runReportClient
);

export const ReportsOperationRoutes = opsRouter;
export const ReportsClientRoutes = clientRouter;
