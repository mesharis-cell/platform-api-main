import z from "zod";
import { PriceSchemas } from "./price.schemas";

export type UpdatePriceForTransportPayload = z.infer<typeof PriceSchemas.updatePriceForTransportSchema>['body'];
