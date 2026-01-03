import { Router } from "express";
import { CalendarRoutes } from "../modules/calendar/calendar.routes";
import { CatalogRoutes } from "../modules/catalog/catalog.routes";
import { InvoiceRoutes } from "../modules/invoice/invoice.routes";
import { OrderRoutes } from "../modules/order/order.routes";

const router = Router();

const routes = [
  {
    path: "/calendar",
    route: CalendarRoutes,
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
];


routes.forEach((route) => router.use(route.path, route.route));

export const ClientRoutes = router;
