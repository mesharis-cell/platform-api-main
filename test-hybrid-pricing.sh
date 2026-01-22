#!/bin/bash
# Test Script for Hybrid Pricing API Endpoints
# Run after: migration + seed

API_URL="http://localhost:3000/api"
PLATFORM_ID="your-platform-id"
TOKEN="your-jwt-token"

echo "🧪 Testing Hybrid Pricing API Endpoints"
echo "========================================"

# Test 1: Get pricing config
echo "1. GET Platform pricing config..."
curl -s -X GET "$API_URL/operations/v1/pricing/config" \
  -H "X-Platform: $PLATFORM_ID" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test 2: Lookup transport rate
echo -e "\n2. Lookup transport rate (Dubai, Round-trip, Standard)..."
curl -s -X GET "$API_URL/client/v1/pricing/transport-rate/lookup?emirate=Dubai&trip_type=ROUND_TRIP&vehicle_type=STANDARD" \
  -H "X-Platform: $PLATFORM_ID" \
  -H "Authorization: Bearer $TOKEN" | jq

# Test 3: List service types
echo -e "\n3. List service types..."
curl -s -X GET "$API_URL/operations/v1/pricing/service-types" \
  -H "X-Platform: $PLATFORM_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .data[0]

# Test 4: Create custom line item
echo -e "\n4. Create custom line item (example)..."
ORDER_ID="your-order-id"
curl -s -X POST "$API_URL/client/v1/order/$ORDER_ID/line-items/custom" \
  -H "X-Platform: $PLATFORM_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Throne Chair Rebrand",
    "category": "RESKIN",
    "total": 1500.00,
    "notes": "Red Bull branding"
  }' | jq

# Test 5: Calculate order estimate
echo -e "\n5. Calculate order estimate..."
curl -s -X POST "$API_URL/client/v1/order/estimate" \
  -H "X-Platform: $PLATFORM_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"asset_id": "asset-123", "quantity": 1}
    ],
    "venue_city": "Dubai",
    "transport_trip_type": "ROUND_TRIP"
  }' | jq

echo -e "\n✅ Test script complete"
echo "Note: Update PLATFORM_ID, TOKEN, and ORDER_ID with real values"
