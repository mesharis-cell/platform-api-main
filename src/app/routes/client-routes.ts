import { Router } from "express";
import { CatalogRoutes } from "../modules/catalog/catalog.routes";


const router = Router();

const routes = [
  {
    path: "/catalog",
    route: CatalogRoutes,
  },
];


routes.forEach((route) => router.use(route.path, route.route));

export const ClientRoutes = router;
