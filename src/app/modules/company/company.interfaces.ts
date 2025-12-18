import z from "zod";
import { UserSchemas } from "./company.schemas";

export type TCreateUserPayload = z.infer<typeof UserSchemas.createUser>[
  "body"
];
