#!/bin/bash

echo "🧪 Testing Dispotree API..."

# Wait a moment for the API to be fully ready
sleep 5

# Test health check endpoint
echo "1. Testing health check endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3001/api/health)
if [[ $HEALTH_RESPONSE == *"OK"* ]]; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    echo "Response: $HEALTH_RESPONSE"
fi

# Test creating a property
echo ""
echo "2. Testing property creation..."
CREATE_RESPONSE=$(curl -s -X POST http://localhost:3001/api/listings \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "TEST-001",
    "liveOnHubzu": false,
    "propertyOwnership": "LLC",
    "propertyType": "Single Family",
    "address": {
      "houseNumber": "123",
      "street": "Test St"
    },
    "city": "Test City",
    "state": "TX",
    "zip": "75001",
    "county": "Test County",
    "occupancyStatus": "Vacant",
    "bedroomCount": 3,
    "bathroomCount": 2,
    "hoa": false,
    "listedOnMLS": false,
    "syndication": []
  }')

if [[ $CREATE_RESPONSE == *"TEST-001"* ]]; then
    echo "✅ Property creation successful"
    # Extract property ID
    PROPERTY_ID=$(echo $CREATE_RESPONSE | grep -o '"id":[0-9]*' | cut -d':' -f2)
    echo "   Created property ID: $PROPERTY_ID"

    # Test getting the property
    echo ""
    echo "3. Testing property retrieval..."
    GET_RESPONSE=$(curl -s http://localhost:3001/api/listings/$PROPERTY_ID)
    if [[ $GET_RESPONSE == *"TEST-001"* ]]; then
        echo "✅ Property retrieval successful"
    else
        echo "❌ Property retrieval failed"
    fi

    # Test updating the property
    echo ""
    echo "4. Testing property update..."
    UPDATE_RESPONSE=$(curl -s -X PUT http://localhost:3001/api/listings/$PROPERTY_ID \
      -H "Content-Type: application/json" \
      -d '{
        "bedroomCount": 4
      }')
    if [[ $UPDATE_RESPONSE == *"4"* ]]; then
        echo "✅ Property update successful"
    else
        echo "❌ Property update failed"
    fi

    # Test deleting the property
    echo ""
    echo "5. Testing property deletion..."
    DELETE_RESPONSE=$(curl -s -w "%{http_code}" -X DELETE http://localhost:3001/api/listings/$PROPERTY_ID)
    if [[ $DELETE_RESPONSE == *"204"* ]]; then
        echo "✅ Property deletion successful"
    else
        echo "❌ Property deletion failed (HTTP code: $DELETE_RESPONSE)"
    fi

else
    echo "❌ Property creation failed"
    echo "Response: $CREATE_RESPONSE"
fi

# Test getting all properties
echo ""
echo "6. Testing get all properties endpoint..."
ALL_RESPONSE=$(curl -s http://localhost:3001/api/listings)
if [[ $ALL_RESPONSE == *"[]"* ]] || [[ $ALL_RESPONSE == *"[{"* ]]; then
    echo "✅ Get all properties successful"
else
    echo "❌ Get all properties failed"
fi

echo ""
echo "🎉 API testing complete!"