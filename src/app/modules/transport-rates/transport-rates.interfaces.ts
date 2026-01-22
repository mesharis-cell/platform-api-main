import z from 'zod'
import { TransportRatesSchemas } from './transport-rates.schemas'

export type CreateTransportRatePayload = z.infer<
  typeof TransportRatesSchemas.createTransportRateSchema
>['body'] & {
  platform_id: string
}

export type UpdateTransportRatePayload = z.infer<
  typeof TransportRatesSchemas.updateTransportRateSchema
>['body']

export type TransportRateLookupQuery = {
  emirate: string
  trip_type: string
  vehicle_type: string
}
