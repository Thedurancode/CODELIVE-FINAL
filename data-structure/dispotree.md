# Dispotree Property Data Structure

## Complete Property Data Model

This document outlines the comprehensive data structure for properties in the Dispotree platform. Each field represents a critical piece of information needed for proper deal management, valuation, and distribution across marketplaces.

### Property Identification

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Property ID | String | Yes | Unique identifier for the property within Dispotree system |
| Parcel Number | String | No | APN (Assessor's Parcel Number) from county records |
| APN | String | No | Alternative field for Parcel Number |

### Property Details

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Property Type | String | Yes | Single Family, Multi-Family, Condo, Townhouse, etc. |
| Property Ownership | String | Yes | Individual, LLC, Corporation, Trust, etc. |
| Workflow Type | String | No | Standard, Expedited, Auction, etc. |
| Year Built | Integer | No | Year the property was originally constructed |
| Living Space in Sq Ft | Integer | No | Total heated/cooled living area |
| Lot Size in Sq Ft | Integer | No | Total lot size including land |
| Bedroom Count | Integer | Yes | Number of bedrooms |
| Bathroom Count | Integer | Yes | Number of bathrooms |

### Location Information

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Address (House number/Street) | String | Yes | Primary street address |
| Address 2 | String | No | Apartment, suite, or unit number |
| City | String | Yes | City name |
| State | String | Yes | Two-letter state abbreviation |
| Zip | String | Yes | ZIP or ZIP+4 code |
| County | String | Yes | County name |
| Country | String | No | Country (default: USA) |

### Ownership & Investor Information

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Investor Name | String | No | Name of the investor/entity |
| Investor ID | String | No | Unique investor identifier |
| Wholesaler LLC Name | String | No | Legal name of wholesaler's LLC |
| Name of Owner of LLC | String | No | Legal owner's name |
| LLC Business Address | String | No | Business address of LLC |
| LLC Owner Email Address | Email | No | Contact email for LLC owner |

### Financial Information

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Purchase Contract Price | Decimal | Yes | Contract purchase price |
| Reserve Price (Minimum Acceptable Offer) | Decimal | Yes | Minimum offer the seller will accept |
| Buy It Now Price | Decimal | No | Fixed price for immediate purchase |
| Starting Bid Amount | Decimal | No | Minimum bid for auction listings |
| BPO_Value_1 | Decimal | No | First Broker Price Opinion value |
| BPO_Value_1_Date | Date | No | Date of first BPO |
| BPO_Value_2 | Decimal | No | Second Broker Price Opinion value |
| BPO_Value_2_Date | Date | No | Date of second BPO |
| Appraisal_Value | Decimal | No | Professional appraisal value |
| Appraisal_Date | Date | No | Date of appraisal |
| ARV | Decimal | No | After Repair Value estimate |
| Monthly Rent | Decimal | No | Current or potential monthly rent |
| Taxes | Decimal | No | Annual property taxes |
| Renovation Budget | Decimal | No | Estimated cost for repairs/renovations |

### Contract & Timeline

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Purchase Contract Expiration | Date | Yes | Date the purchase contract expires |
| Property Contracts | Text | No | Details about existing contracts or liens |
| Delivered Vacant? | Boolean | Yes | Whether property will be vacant at closing |

### Occupancy & Access

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Occupancy Status | String | Yes | Vacant, Occupied, Tenant, etc. |
| Occupancy Details | Text | No | Additional occupancy information |
| Access to Property | Text | No | Instructions for property access |
| Lock_Box_Code | String | No | Code for lockbox access |
| Lock Box Code | String | No | Alternative field for lockbox code |

### HOA Information

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| HOA (Y/N) | Boolean | Yes | Whether property has HOA |
| HOA Dues Amount | Decimal | No | Monthly, quarterly, or yearly HOA fees |
| HOA Billing Frequency | String | No | Monthly, Quarterly, Yearly |

### Agent Information

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Agent_Name | String | No | Name of listing or buyer's agent |
| Agent_Email | Email | No | Agent's email address |
| Agent_Phone_Number | Phone | No | Agent's contact phone number |
| Agent_License_Number | String | No | Agent's license number |

### Marketing & Syndication

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Live on Hubzu | Boolean | Yes | Whether property is listed on Hubzu |
| MLS for syndication | Boolean | Yes | Whether property is syndicated on MLS |
| Listed on MLS? | Boolean | Yes | If property is actively listed on MLS |
| Listing Price | Decimal | No | MLS listing price if applicable |
| Will You Offer a Buyer's Agent Commission (Percentage) | Decimal | No | Commission percentage for buyer's agent |
| Syndication on Zillow, Realtor.com, Trulia, etc. | Array | No | List of platforms for syndication |

### Property Description

| Field Name | Data Type | Required | Max Length |
|------------|-----------|----------|-------------|
| Property Listing Description | Text | Yes | 750 characters maximum |

### Property Condition

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Roof | String | No | Roof condition, age, material |
| Sewer | String | No | Sewer system type and condition |
| Electric | String | No | Electrical system details |
| Water | String | No | Water system information |
| Foundation Type | String | No | Foundation type and condition |
| Water Heater | String | No | Water heater age and condition |
| HVAC | String | No | HVAC system details and condition |
| Type of Rehab | String | No | Category of needed renovations |
| Any Known Material Defects or Disclosures | Text | No | Known issues or required disclosures |

### Media

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Photos | Array | Yes | Array of photo URLs or file references |

### Additional Fields

| Field Name | Data Type | Required | Description |
|------------|-----------|----------|-------------|
| Client | String | No | Client name or reference |
| Live on Hubzu | Boolean | Yes | Duplicate field - consolidate with Hubzu field |

## Data Validation Rules

### Required Fields
The following fields are mandatory for all property submissions:
- Property ID
- Property Type
- Property Ownership
- Address (House number/Street)
- City
- State
- Zip
- County
- Bedroom Count
- Bathroom Count
- Purchase Contract Price
- Reserve Price
- Purchase Contract Expiration
- Delivered Vacant?
- Occupancy Status
- HOA (Y/N)
- Live on Hubzu
- MLS for syndication
- Listed on MLS?
- Property Listing Description
- Photos

### Data Format Standards

1. **Currency Fields**: Use decimal format (e.g., 250000.00)
2. **Dates**: ISO 8601 format (YYYY-MM-DD)
3. **Phone Numbers**: E.164 format (+1-555-555-5555)
4. **Email Addresses**: Standard email format validation
5. **Boolean Fields**: true/false values
6. **Arrays**: JSON array format for multiple values

## JSON Schema Example

```json
{
  "propertyId": "PROP-123456",
  "propertyType": "Single Family",
  "propertyOwnership": "LLC",
  "workflowType": "Standard",
  "address": {
    "street": "123 Main Street",
    "address2": "Apt 4B",
    "city": "Dallas",
    "state": "TX",
    "zip": "75201",
    "county": "Dallas",
    "country": "USA"
  },
  "parcelNumber": "123456789012",
  "investorName": "ABC Investments LLC",
  "investorId": "INV-001",
  "taxes": 3500.00,
  "bpoValues": [
    {
      "value": 280000.00,
      "date": "2024-01-15"
    },
    {
      "value": 275000.00,
      "date": "2024-01-20"
    }
  ],
  "appraisal": {
    "value": 285000.00,
    "date": "2024-01-25"
  },
  "financial": {
    "purchaseContractPrice": 200000.00,
    "reservePrice": 180000.00,
    "buyItNowPrice": 220000.00,
    "startingBidAmount": 150000.00,
    "arv": 350000.00,
    "monthlyRent": 2200.00,
    "renovationBudget": 45000.00
  },
  "contract": {
    "expirationDate": "2024-03-15",
    "deliveredVacant": true,
    "propertyContracts": "Standard wholesale contract"
  },
  "occupancy": {
    "status": "Vacant",
    "details": "Previously occupied, now vacant",
    "access": "Lockbox on front door",
    "lockboxCode": "1234"
  },
  "hoa": {
    "hasHoa": true,
    "duesAmount": 150.00,
    "billingFrequency": "Monthly"
  },
  "features": {
    "yearBuilt": 1985,
    "livingSpaceSqFt": 1850,
    "lotSizeSqFt": 6000,
    "bedroomCount": 3,
    "bathroomCount": 2
  },
  "agent": {
    "name": "John Doe",
    "email": "john@realestate.com",
    "phone": "+1-555-555-5555",
    "licenseNumber": "TX1234567"
  },
  "marketing": {
    "liveOnHubzu": true,
    "mlsSyndication": true,
    "listedOnMls": true,
    "listingPrice": 215000.00,
    "buyersAgentCommission": 2.5,
    "syndicationPlatforms": ["Zillow", "Realtor.com", "Trulia"]
  },
  "listingDescription": "Great investment opportunity! This 3 bed/2 bath single family home needs cosmetic updates but has great bones. Located in desirable neighborhood with good schools. ARV $350K after $45K in renovations.",
  "condition": {
    "roof": "10 years old, good condition",
    "sewer": "Public sewer, no issues",
    "electric": "200 amp service, updated panel",
    "water": "City water, no leaks",
    "foundation": "Slab, no visible cracks",
    "waterHeater": "5 years old, functioning",
    "hvac": "Central air, 8 years old",
    "typeOfRehab": "Cosmetic updates only",
    "knownDefects": "Minor cosmetic wear, no structural issues"
  },
  "media": {
    "photos": [
      "photo1.jpg",
      "photo2.jpg",
      "photo3.jpg"
    ]
  },
  "wholesaler": {
    "llcName": "Quick Flip Properties LLC",
    "ownerName": "Jane Smith",
    "businessAddress": "456 Business Rd, Suite 100, Dallas, TX 75201",
    "ownerEmail": "jane@quickflip.com"
  }
}
```

## Notes for Implementation

1. **Field Consolidation**: Some fields appear to be duplicates (Lock_Box_Code vs Lock Box Code, Live on Hubzu). These should be consolidated in the actual implementation.

2. **Nested Objects**: Consider grouping related fields into nested objects (like in the JSON example) for better organization.

3. **Data Validation**: Implement strict validation for all required fields and data formats.

4. **API Integration**: Ensure the data structure aligns with requirements of all marketplace integrations (Hubzu, Xome, etc.).

5. **Extensibility**: Design the schema to accommodate future fields and requirements.

6. **Indexing**: Consider which fields will need database indexing for efficient querying (especially for search and filtering operations).