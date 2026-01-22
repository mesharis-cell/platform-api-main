import z from 'zod'
import { PricingConfigSchemas } from './pricing-config.schemas'

export type SetPricingConfigPayload = z.infer<
  typeof PricingConfigSchemas.setPricingConfigSchema
>['body']

export type PricingConfigResponse = {
  id: string
  platform_id: string
  company_id: string | null
  warehouse_ops_rate: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}
