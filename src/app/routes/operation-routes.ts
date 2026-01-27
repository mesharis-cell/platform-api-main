import { Router } from "express";
import { AnalyticsRoutes } from "../modules/analytics/analytics.routes";
import { AssetRoutes } from "../modules/asset/asset.routes";
import { BrandRoutes } from "../modules/brand/brand.routes";
import { CollectionRoutes } from "../modules/collection/collection.routes";
import { CompanyRoutes } from "../modules/company/company.routes";
import { CountryRoutes } from "../modules/country/country.routes";
import { NotificationLogRoutes } from "../modules/notification-logs/notification-logs.routes";
import { PlatformRoutes } from "../modules/platform/platform.routes";
import { PricingConfigRoutes } from "../modules/pricing-config/pricing-config.routes";
import { TransportRatesRoutes } from "../modules/transport-rates/transport-rates.routes";
import { ServiceTypesRoutes } from "../modules/service-types/service-types.routes";
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
        path: "/country",
        route: CountryRoutes,
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
        path: "/pricing/config",
        route: PricingConfigRoutes,
    },
    {
        path: "/pricing/transport-rates",
        route: TransportRatesRoutes,
    },
    {
        path: "/pricing/service-types",
        route: ServiceTypesRoutes,
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
    },
];

routes.forEach((route) => router.use(route.path, route.route));

export const OperationRoutes = router;
