import { Router } from "express";
import { AnalyticsRoutes } from "../modules/analytics/analytics.routes";
import { AssetRoutes } from "../modules/asset/asset.routes";
import { BrandRoutes } from "../modules/brand/brand.routes";
import { CityRoutes } from "../modules/city/city.routes";
import { CollectionRoutes } from "../modules/collection/collection.routes";
import { CompanyRoutes } from "../modules/company/company.routes";
import { CountryRoutes } from "../modules/country/country.routes";
import { NotificationLogRoutes } from "../modules/notification-logs/notification-logs.routes";
import { NotificationRuleRoutes } from "../modules/notification-rules/notification-rules.routes";
import { EventsRoutes } from "../modules/events/events.routes";
import { InvoiceRoutes } from "../modules/invoice/invoice.routes";
import { PlatformRoutes } from "../modules/platform/platform.routes";
import { ServiceTypesRoutes } from "../modules/service-types/service-types.routes";
import { UserRoutes } from "../modules/user/user.routes";
import { WarehouseRoutes } from "../modules/warehouse/warehouse.routes";
import { ZoneRoutes } from "../modules/zone/zone.routes";
import { ScanningRoutes } from "../modules/scanning/scanning.routes";
import { UploadRoutes } from "../modules/upload/upload.route";
import { LineItemsRoutes } from "../modules/order-line-items/order-line-items.routes";
import { ExportRoutes } from "../modules/export/export.routes";
import { ServiceRequestRoutes } from "../modules/service-request/service-request.routes";
import { SelfBookingsRoutes } from "../modules/self-bookings/self-bookings.routes";
import { TeamRoutes } from "../modules/team/team.routes";
import { CompanyDomainRoutes } from "../modules/company-domain/company-domain.routes";
import { OrderTransportTripsRoutes } from "../modules/order-transport-trips/order-transport-trips.routes";
import { LineItemRequestsRoutes } from "../modules/line-item-requests/line-item-requests.routes";
import { AttachmentTypesRoutes } from "../modules/attachment-types/attachment-types.routes";
import { AttachmentsRoutes } from "../modules/attachments/attachments.routes";
import { WorkflowRequestRoutes } from "../modules/workflow-request/workflow-request.routes";

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
    {
        path: "/notification-rules",
        route: NotificationRuleRoutes,
    },
    {
        path: "/events",
        route: EventsRoutes,
    },
    {
        path: "/line-item",
        route: LineItemsRoutes,
    },
    {
        path: "/line-item-requests",
        route: LineItemRequestsRoutes,
    },
    {
        path: "/attachment-types",
        route: AttachmentTypesRoutes,
    },
    {
        path: "/attachments",
        route: AttachmentsRoutes,
    },
    {
        path: "/invoice",
        route: InvoiceRoutes,
    },
    {
        path: "/workflow-request",
        route: WorkflowRequestRoutes,
    },
    {
        path: "/order",
        route: OrderTransportTripsRoutes,
    },
    {
        path: "/export",
        route: ExportRoutes,
    },
    {
        path: "/service-request",
        route: ServiceRequestRoutes,
    },
    {
        path: "/self-bookings",
        route: SelfBookingsRoutes,
    },
    {
        path: "/team",
        route: TeamRoutes,
    },
    {
        path: "/company-domain",
        route: CompanyDomainRoutes,
    },
];

routes.forEach((route) => router.use(route.path, route.route));

export const OperationRoutes = router;
