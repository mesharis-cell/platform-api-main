import { Router } from 'express'
import auth from '../../middleware/auth'
import payloadValidator from '../../middleware/payload-validator'
import platformValidator from '../../middleware/platform-validator'
import requirePermission from '../../middleware/permission'
import { PERMISSIONS } from '../../constants/permissions'
import { TransportRatesControllers } from './transport-rates.controllers'
import { TransportRatesSchemas } from './transport-rates.schemas'

const router = Router()

// List all transport rates
router.get(
  '/',
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  requirePermission(PERMISSIONS.TRANSPORT_RATES_MANAGE),
  TransportRatesControllers.listTransportRates
)

// Lookup transport rate
router.get(
  '/lookup',
  platformValidator,
  auth('ADMIN', 'LOGISTICS', 'CLIENT'),
  TransportRatesControllers.lookupTransportRate
)

// Get transport rate by ID
router.get(
  '/:id',
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  requirePermission(PERMISSIONS.TRANSPORT_RATES_MANAGE),
  TransportRatesControllers.getTransportRateById
)

// Create transport rate
router.post(
  '/',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.TRANSPORT_RATES_MANAGE),
  payloadValidator(TransportRatesSchemas.createTransportRateSchema),
  TransportRatesControllers.createTransportRate
)

// Update transport rate
router.put(
  '/:id',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.TRANSPORT_RATES_MANAGE),
  payloadValidator(TransportRatesSchemas.updateTransportRateSchema),
  TransportRatesControllers.updateTransportRate
)

// Delete (deactivate) transport rate
router.delete(
  '/:id',
  platformValidator,
  auth('ADMIN'),
  requirePermission(PERMISSIONS.TRANSPORT_RATES_MANAGE),
  TransportRatesControllers.deleteTransportRate
)

export const TransportRatesRoutes = router
