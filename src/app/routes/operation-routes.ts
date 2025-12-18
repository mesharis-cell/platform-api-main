import { Router } from "express";
import { CompanyRoutes } from "../modules/company/company.routes";
import { PlatformRoutes } from "../modules/platform/platform.routes";
import { UserRoutes } from "../modules/user/user.routes";

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
];

routes.forEach((route) => router.use(route.path, route.route));

export const OperationRoutes = router;
