import { Router } from "express";
import { OperationRoutes } from "./operation-routes";

const router = Router();

const routes = [
  {
    path: "/operations/v1",
    route: OperationRoutes,
  },
];

routes.forEach((route) => router.use(route.path, route.route));

export default router;
