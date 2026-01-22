import z from 'zod'
import { ServiceTypesSchemas } from './service-types.schemas'

export type CreateServiceTypePayload = z.infer<
  typeof ServiceTypesSchemas.createServiceTypeSchema
>['body'] & {
  platform_id: string
}

export type UpdateServiceTypePayload = z.infer<
  typeof ServiceTypesSchemas.updateServiceTypeSchema
>['body']
