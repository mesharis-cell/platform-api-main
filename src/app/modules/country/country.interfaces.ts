import z from "zod";
import { countriesSchemas } from "./country.schemas";

export type CountryPayload = z.infer<typeof countriesSchemas.countrySchema>["body"] & {
    platform_id: string;
};
