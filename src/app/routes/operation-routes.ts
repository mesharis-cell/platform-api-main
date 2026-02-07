import { Router } from "express";
import { AnalyticsRoutes } from "../modules/analytics/analytics.routes";
import { AssetRoutes } from "../modules/asset/asset.routes";
import { BrandRoutes } from "../modules/brand/brand.routes";
import { CityRoutes } from "../modules/city/city.routes";
import { CollectionRoutes } from "../modules/collection/collection.routes";
import { CompanyRoutes } from "../modules/company/company.routes";
import { CountryRoutes } from "../modules/country/country.routes";
import { NotificationLogRoutes } from "../modules/notification-logs/notification-logs.routes";
import { PlatformRoutes } from "../modules/platform/platform.routes";
import { TransportRatesRoutes } from "../modules/transport-rates/transport-rates.routes";
import { ServiceTypesRoutes } from "../modules/service-types/service-types.routes";
import { UserRoutes } from "../modules/user/user.routes";
import { WarehouseRoutes } from "../modules/warehouse/warehouse.routes";
import { ZoneRoutes } from "../modules/zone/zone.routes";
import { ScanningRoutes } from "../modules/scanning/scanning.routes";
import { UploadRoutes } from "../modules/upload/upload.route";
import { VehicleTypeRoutes } from "../modules/vehicle-type/vehicle-type.routes";
import { LineItemsRoutes } from "../modules/order-line-items/order-line-items.routes";
import { PriceRoutes } from "../modules/price/price.routes";

const router = Router();

const routes = [
    {
        path: "/platform",
        route: PlatformRoutes,
    },
    {
        path: "/price",
        route: PriceRoutes,
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
        path: "/city",
        route: CityRoutes,
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
        path: "/pricing/transport-rates",
        route: TransportRatesRoutes,
    },
    {
        path: "/pricing/service-types",
        route: ServiceTypesRoutes,
    },
    {
        path: "/pricing/vehicle-types",
        route: VehicleTypeRoutes,
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
    {
        path: "/line-item",
        route: LineItemsRoutes,
    },
];

routes.forEach((route) => router.use(route.path, route.route));

export const OperationRoutes = router;
