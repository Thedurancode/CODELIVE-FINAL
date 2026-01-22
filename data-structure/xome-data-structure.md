# Xome Data Structure

## Xome Property Data Model

This document outlines the specific data structure requirements for properties being submitted to Xome (a major real estate auction platform). Xome has specific field requirements that differ from other platforms and must be carefully mapped from the Dispotree standard format.

### Core Property Information

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Asset Type | String | Yes | Property classification (Residential, Commercial, etc.) | Property Type |
| Address 1 | String | Yes | Primary street address | Address (House number/Street) |
| Address 2 | String | No | Apartment, suite, or unit number | Address 2 |
| City | String | Yes | City name | City |
| State (Abbreviation) | String | Yes | Two-letter state abbreviation | State |
| Zip/Postal Code | String | Yes | ZIP or ZIP+4 code | Zip |
| County | String | Yes | County name | County |
| Property Type | String | Yes | Single Family, Multi-Family, Condo, etc. | Property Type |
| Occupancy Status | String | Yes | Vacant, Occupied, Tenant, etc. | Occupancy Status |
| APN | String | No | Assessor's Parcel Number | Parcel Number / APN |

### Financial Information

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Reserve Price | Decimal | Yes | Minimum acceptable bid amount | Reserve Price |
| Listing Price | Decimal | No | Original listing price | Purchase Contract Price |
| Listing Price Date | Date | No | Date of listing price determination | Contract Date |
| Lowest Acceptable Offer | Decimal | No | Absolute minimum offer amount | Reserve Price |
| Own It Now Price | Decimal | No | Fixed price for immediate purchase | Buy It Now Price |

### Auction Options

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Financeable | Boolean | Yes | Whether property can be financed | N/A (Business Logic) |
| Own It Now allowed during Auction | Boolean | Yes | Enable Own It Now during auction | N/A (Business Logic) |
| Own It Now allowed during PreAuction | Boolean | Yes | Enable Own It Now before auction | N/A (Business Logic) |

### Property Characteristics

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Bedrooms | Integer | Yes | Number of bedrooms | Bedroom Count |
| Full Bathrooms | Integer | Yes | Number of full bathrooms | Bathroom Count (calculate) |
| Partial Bathrooms | Integer | No | Number of half bathrooms | N/A (May need separate field) |
| Square Feet | Integer | Yes | Total living area | Living Space in Sq Ft |
| LotSize | Integer | No | Lot size in square feet | Lot Size in Sq Ft |
| Stories | Integer | No | Number of stories | N/A (May need new field) |
| Year Built | Integer | Yes | Year property was built | Year Built |
| Number of Garages | Integer | No | Number of garage spaces | N/A (May need new field) |

### MLS Information

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| MLS Number | String | No | Multiple Listing Service number | N/A (New field needed) |
| MLS Listed Date | Date | No | Date property was listed on MLS | N/A (New field needed) |
| MLS Expiration Date | Date | No | MLS listing expiration date | N/A (New field needed) |
| MLS Eligible | Boolean | Yes | Whether property can be listed on MLS | Listed on MLS? |

### Marketing Content

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Marketing Description | Text | Yes | Property description for marketing | Property Listing Description |
| Contract-Link | URL | No | Link to contract documents | N/A (New field needed) |
| Pictures-Link | URL | No | Link to property photos | Photos (convert to URL) |

### Agent Information

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Agent First Name | String | Yes | Agent's first name | Agent_Name (split) |
| Agent Last Name | String | Yes | Agent's last name | Agent_Name (split) |
| Agent License Number | String | Yes | Agent's license number | Agent_License_Number |
| Licensed State | String | Yes | State where agent is licensed | State |
| Agent Address | String | No | Agent's business address | N/A (New field needed) |
| Agent City | String | No | Agent's city | N/A (New field needed) |
| Agent State | String | No | Agent's state | State (may be same) |
| Agent Zip | String | No | Agent's ZIP code | N/A (New field needed) |
| Agent Phone Number | Phone | Yes | Agent's contact phone | Agent_Phone_Number |
| Agent Email | Email | Yes | Agent's email address | Agent_Email |

### Broker Information

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Broker Company | String | Yes | Name of brokerage firm | N/A (New field needed) |
| Broker License Number | String | Yes | Broker's license number | N/A (New field needed) |
| Managing Broker | String | No | Name of managing broker | N/A (New field needed) |
| Managing Broker License Number | String | No | Managing broker's license | N/A (New field needed) |

### Transaction Information

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| ConveyanceType | String | Yes | Type of property conveyance | N/A (Business Logic) |

## Field Mapping Logic

### Required Business Logic Fields
These fields require business logic rather than direct mapping:

1. **Financeable**: Determine based on property condition, location, and type
2. **Own It Now options**: Business decision per property
3. **ConveyanceType**: Typically "Assignment of Contract" for wholesale deals
4. **Full/Partial Bathrooms**: May need to separate from total bathroom count
5. **MLS Information**: Need to capture MLS data if property was previously listed

### New Fields Required in Dispotree
To fully support Xome integration, Dispotree should consider adding:

1. **MLS Number**: Track original MLS listing
2. **MLS Listed Date**: When property was on MLS
3. **MLS Expiration Date**: MLS listing expiration
4. **Partial Bathrooms**: Separate count of half bathrooms
5. **Stories**: Number of floors in property
6. **Number of Garages**: Garage parking spaces
7. **Agent Address**: Full agent business address
8. **Broker Company**: Brokerage firm name
9. **Broker License Number**: Broker's license
10. **Managing Broker**: Managing broker name
11. **Managing Broker License Number**: Managing broker license
12. **Contract Document Link**: URL to contract documents

## JSON Schema for Xome Submission

```json
{
  "xomeSubmission": {
    "assetType": "Residential",
    "address": {
      "address1": "123 Main Street",
      "address2": "Apt 4B",
      "city": "Dallas",
      "state": "TX",
      "zipCode": "75201",
      "county": "Dallas"
    },
    "propertyDetails": {
      "propertyType": "Single Family",
      "occupancyStatus": "Vacant",
      "apn": "123456789012",
      "bedrooms": 3,
      "fullBathrooms": 2,
      "partialBathrooms": 1,
      "squareFeet": 1850,
      "lotSize": 6000,
      "stories": 1,
      "yearBuilt": 1985,
      "garages": 2
    },
    "financial": {
      "reservePrice": 180000.00,
      "listingPrice": 200000.00,
      "listingPriceDate": "2024-01-15",
      "lowestAcceptableOffer": 175000.00,
      "ownItNowPrice": 220000.00,
      "financeable": true,
      "ownItNowDuringAuction": true,
      "ownItNowDuringPreAuction": true
    },
    "mls": {
      "mlsNumber": "12345678",
      "mlsListedDate": "2023-12-01",
      "mlsExpirationDate": "2024-03-01",
      "mlsEligible": true
    },
    "marketing": {
      "description": "Great investment opportunity! This 3 bed/2.5 bath single family home needs cosmetic updates...",
      "contractLink": "https://dispotree.com/contracts/PROP-123456",
      "picturesLink": "https://dispotree.com/photos/PROP-123456"
    },
    "agent": {
      "firstName": "John",
      "lastName": "Doe",
      "licenseNumber": "TX1234567",
      "licensedState": "TX",
      "address": "456 Real Estate Ave",
      "city": "Dallas",
      "state": "TX",
      "zip": "75202",
      "phoneNumber": "+1-555-555-5555",
      "email": "john@realestate.com"
    },
    "broker": {
      "company": "Premier Real Estate Brokerage",
      "licenseNumber": "BR7654321",
      "managingBroker": "Jane Smith",
      "managingBrokerLicenseNumber": "BR9876543"
    },
    "transaction": {
      "conveyanceType": "Assignment of Contract"
    }
  }
}
```

## Data Validation Rules for Xome

### Mandatory Fields
The following fields are required by Xome:
- Asset Type
- Address 1, City, State, Zip, County
- Property Type
- Occupancy Status
- Reserve Price
- Financeable (boolean)
- Bedrooms
- Full Bathrooms
- Square Feet
- Year Built
- MLS Eligible (boolean)
- Marketing Description
- Agent First Name, Last Name, License Number, Licensed State, Phone, Email
- Broker Company, Broker License Number
- ConveyanceType

### Field Format Requirements
1. **State**: Two-letter abbreviation (TX, CA, FL, etc.)
2. **Phone Number**: Format: XXX-XXX-XXXX or +1-XXX-XXX-XXXX
3. **License Numbers**: Include state prefix (TX1234567)
4. **Currency**: Use decimal format with two places (180000.00)
5. **Dates**: MM/DD/YYYY or ISO format (YYYY-MM-DD)

## Integration Notes

1. **Field Validation**: Xome has strict validation - ensure all required fields are populated
2. **Character Limits**: Marketing description may have length restrictions
3. **Photo Requirements**: Pictures-Link must point to publicly accessible images
4. **Document Links**: Contract-Link must be accessible to Xome reviewers
5. **Agent Verification**: All agent and broker licenses must be valid and active
6. **State Compliance**: Different states may have additional requirements

## Error Handling

Common errors when submitting to Xome:
- Missing required fields
- Invalid license numbers
- Inaccessible document or photo links
- Non-existent APN numbers
- Invalid email or phone formats
- State-specific compliance issues

Implement validation checks before submission to avoid these common issues.