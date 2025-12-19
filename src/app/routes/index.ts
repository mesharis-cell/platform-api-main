import { Router } from "express";
import { AuthRoutes } from "../modules/Auth/Auth.routes";
import { OperationRoutes } from "./operation-routes";

const router = Router();

const routes = [
  {
    path: "/operations/v1",
    route: OperationRoutes,
  },
  {
    path: "/auth",
    route: AuthRoutes,
  },
];

routes.forEach((route) => router.use(route.path, route.route));

export default router;
