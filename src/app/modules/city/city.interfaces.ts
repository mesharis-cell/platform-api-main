import z from "zod";
import { citiesSchemas } from "./city.schemas";

export type CityPayload = z.infer<typeof citiesSchemas.citySchema>["body"] & {
    platform_id: string;
};
