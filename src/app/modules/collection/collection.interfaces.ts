import z from "zod";
import { CollectionSchemas } from "./collection.schemas";

export type CreateCollectionPayload = z.infer<typeof CollectionSchemas.collectionSchema>["body"] & {
    platform_id: string;
};

export type UpdateCollectionPayload = z.infer<typeof CollectionSchemas.updateCollectionSchema>["body"];

export type CreateCollectionItemPayload = z.infer<typeof CollectionSchemas.collectionItemSchema>["body"] & {
    collection_id: string;
};

export type UpdateCollectionItemPayload = z.infer<typeof CollectionSchemas.updateCollectionItemSchema>["body"];
