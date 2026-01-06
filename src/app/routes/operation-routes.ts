import { Router } from "express";
import { AnalyticsRoutes } from "../modules/analytics/analytics.routes";
import { AssetRoutes } from "../modules/asset/asset.routes";
import { BrandRoutes } from "../modules/brand/brand.routes";
import { CollectionRoutes } from "../modules/collection/collection.routes";
import { CompanyRoutes } from "../modules/company/company.routes";
import { NotificationLogRoutes } from "../modules/notification-logs/notification-logs.routes";
import { PlatformRoutes } from "../modules/platform/platform.routes";
import { PricingTierRoutes } from "../modules/pricing-tier/pricing-tier.routes";
import { UserRoutes } from "../modules/user/user.routes";
import { WarehouseRoutes } from "../modules/warehouse/warehouse.routes";
import { ZoneRoutes } from "../modules/zone/zone.routes";
import { ScanningRoutes } from "../modules/scanning/scanning.routes";
import { UploadRoutes } from "../modules/upload/upload.route";


const router = Router();

const routes = [
  {
    path: "/platform",
    route: PlatformRoutes,
  },
  {
    path: "/user",
    route: UserRoutes,
  },
  {
    path: "/company",
    route: CompanyRoutes,
  },
  {
    path: "/brand",
    route: BrandRoutes,
  },
  {
    path: "/warehouse",
    route: WarehouseRoutes,
  },
  {
    path: "/zone",
    route: ZoneRoutes,
  },
  {
    path: "/collection",
    route: CollectionRoutes,
  },
  {
    path: "/pricing-tier",
    route: PricingTierRoutes,
  },
  {
    path: "/asset",
    route: AssetRoutes,
  },
  {
    path: "/scanning",
    route: ScanningRoutes,
  },
  {
    path: "/upload",
    route: UploadRoutes,
  },
  {
    path: "/analytics",
    route: AnalyticsRoutes,
  },
  {
    path: "/notification-logs",
    route: NotificationLogRoutes,
  }
];


routes.forEach((route) => router.use(route.path, route.route));

export const OperationRoutes = router;
