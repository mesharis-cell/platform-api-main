import { Router } from "express";
import { AssetCategoryRoutes } from "../modules/asset-categories/asset-categories.routes";
import { CalendarRoutes } from "../modules/calendar/calendar.routes";
import { CatalogRoutes } from "../modules/catalog/catalog.routes";
import { InvoiceRoutes } from "../modules/invoice/invoice.routes";
import { OrderRoutes } from "../modules/order/order.routes";
import { InboundRequestRoutes } from "../modules/inbound-request/inbound-request.routes";
import { ExportRoutes } from "../modules/export/export.routes";
import { ServiceRequestRoutes } from "../modules/service-request/service-request.routes";
import { SelfPickupClientRoutes } from "../modules/self-pickup/self-pickup.routes";
import { TeamClientRoutes } from "../modules/team/team.client-routes";

const router = Router();

const routes = [
    {
        path: "/calendar",
        route: CalendarRoutes,
    },
    {
        path: "/asset-category",
        route: AssetCategoryRoutes,
    },
    {
        path: "/catalog",
        route: CatalogRoutes,
    },
    {
        path: "/order",
        route: OrderRoutes,
    },
    {
        path: "/invoice",
        route: InvoiceRoutes,
    },
    {
        path: "/inbound-request",
        route: InboundRequestRoutes,
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
        path: "/self-pickup",
        route: SelfPickupClientRoutes,
    },
    {
        path: "/team",
        route: TeamClientRoutes,
    },
];

routes.forEach((route) => router.use(route.path, route.route));

export const ClientRoutes = router;
