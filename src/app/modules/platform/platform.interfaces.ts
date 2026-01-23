import z from "zod";
import { PlatformSchemas } from "./platform.schemas";

export type CreatePlatformPayload = z.infer<typeof PlatformSchemas.createPlatform>["body"];
