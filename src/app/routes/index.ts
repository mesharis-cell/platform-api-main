import { Router } from "express";
import { AuthRoutes } from "../modules/auth/Auth.routes";
import { CronRoutes } from "../modules/cron/cron.routes";
import { ClientRoutes } from "./client-routes";
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
  {
    path: "/client/v1",
    route: ClientRoutes,
  },
  {
    path: "/cron",
    route: CronRoutes,
  }
];

routes.forEach((route) => router.use(route.path, route.route));

export default router;
