import { Router } from "express";
import { AssetRoutes } from "../modules/asset/asset.routes";
import { BrandRoutes } from "../modules/brand/brand.routes";
import { CollectionRoutes } from "../modules/collection/collection.routes";
import { CompanyRoutes } from "../modules/company/company.routes";
import { PlatformRoutes } from "../modules/platform/platform.routes";
import { PricingTierRoutes } from "../modules/pricing-tier/pricing-tier.routes";
import { UserRoutes } from "../modules/user/user.routes";
import { WarehouseRoutes } from "../modules/warehouse/warehouse.routes";
import { ZoneRoutes } from "../modules/zone/zone.routes";


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
    path: "/pricing-tier",
    route: PricingTierRoutes,
  },
  {
    path: "/asset",
    route: AssetRoutes,
  },
];


routes.forEach((route) => router.use(route.path, route.route));

export const OperationRoutes = router;
