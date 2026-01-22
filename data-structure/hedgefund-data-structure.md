# Hedge Fund Data Structure

## Hedge Fund Property Data Requirements

This document outlines the specific data structure and requirements for submitting properties to hedge funds and institutional buyers. Hedge funds typically require detailed property information in spreadsheet format, often via email submission, as many do not have API integrations.

### Property Identification

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Property Address | String | Yes | Full street address | Address (House number/Street) + Address 2 |
| City | String | Yes | City name | City |
| State | String | Yes | Two-letter state abbreviation | State |
| Zip | String | Yes | ZIP or ZIP+4 code | Zip |
| Photos Folder | String | Yes | Path or link to property photos | Photos (convert to folder/link) |
| On Market/Off Market | String | Yes | Current market status | Occupancy Status or new field |

### Property Characteristics

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Beds | Integer | Yes | Number of bedrooms | Bedroom Count |
| Baths | Decimal | Yes | Number of bathrooms (can include halves) | Bathroom Count |
| Living Space Sq ft | Integer | Yes | Total heated/cooled living area | Living Space in Sq Ft |
| Lot Size (Sq ft) | Integer | Yes | Total lot size | Lot Size in Sq Ft |
| Year Built | Integer | Yes | Year property was constructed | Year Built |
| Garage | String | Yes | Garage details (2-car, none, detached, etc.) | N/A (New field needed) |
| HOA | Boolean | Yes | Property has HOA | HOA (Y/N) |
| HOA Fee | Decimal | No | Monthly HOA dues amount | HOA Dues Amount |
| Pool | Boolean | Yes | Property has swimming pool | N/A (New field needed) |
| Solar | Boolean | Yes | Property has solar panels | N/A (New field needed) |

### Utilities & Systems

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| Septic | Boolean | Yes | Property uses septic system | N/A (Map from Sewer field) |
| Well | Boolean | Yes | Property uses well water | N/A (Map from Water field) |
| Roof | String | Yes | Roof condition, age, material | Roof |
| Electric | String | Yes | Electrical system details | Electric |
| Plumbing | String | Yes | Plumbing system details | N/A (New field needed) |
| Foundation | String | Yes | Foundation type and condition | Foundation Type |
| Water Heater | String | Yes | Water heater age and condition | Water Heater |
| HVAC | String | Yes | HVAC system details | HVAC |

### Property Condition

| Field Name | Data Type | Required | Description | Dispotree Mapping |
|------------|-----------|----------|-------------|-------------------|
| General Property Condition | String | Yes | Overall condition rating/description | Type of Rehab or Known Defects |
| Property Description | Text | Yes | Detailed property description | Property Listing Description |

## Field Mapping and Transformation

### Direct Mappings
These fields can be directly mapped from Dispotree:

- Property Address = Address (House number/Street) + " " + Address 2
- City = City
- State = State
- Zip = Zip
- Beds = Bedroom Count
- Baths = Bathroom Count
- Living Space Sq ft = Living Space in Sq Ft
- Lot Size (Sq ft) = Lot Size in Sq Ft
- Year Built = Year Built
- HOA = HOA (Y/N)
- HOA Fee = HOA Dues Amount
- Roof = Roof
- Electric = Electric
- Foundation = Foundation Type
- Water Heater = Water Heater
- HVAC = HVAC
- Property Description = Property Listing Description

### Business Logic Required
These fields need calculation or business rules:

1. **On Market/Off Market**:
   - If Listed on MLS = "On Market"
   - If Live on Hubzu = "On Market"
   - Else = "Off Market"

2. **Photos Folder**:
   - Convert Photos array to folder path or shared link
   - Example: "https://dispotree.com/properties/PROP-123456/photos"

3. **Garage**:
   - Extract from property description or photos
   - Common formats: "2-car", "Detached 2-car", "None", "1-car"

4. **Septic**:
   - If Sewer field contains "septic" = TRUE
   - If Sewer field contains "city" or "public" = FALSE

5. **Well**:
   - If Water field contains "well" = TRUE
   - If Water field contains "city" or "public" = FALSE

6. **Pool**:
   - Search Property Description for "pool", "swimming", etc.
   - Check photos for pool presence
   - If found = TRUE, else = FALSE

7. **Solar**:
   - Search Property Description for "solar", "panels", etc.
   - Check known defects for solar system
   - If found = TRUE, else = FALSE

### New Fields Needed
Dispotree should consider adding these fields for complete hedge fund support:

1. **Garage Type**: Specific garage details
2. **Pool**: Boolean field for pool presence
3. **Solar Panels**: Boolean field for solar system
4. **Plumbing System**: Details about plumbing
5. **Market Status**: Direct On/Off market tracking
6. **Photos Folder Path**: Direct link to photo storage

## Hedge Fund Spreadsheet Template

### CSV Format Example

```csv
Property Address,City,State,Zip,Photos Folder,On Market/Off Market,Beds,Baths,Living Space Sq ft,Lot Size (Sq ft),Year Built,Garage,HOA,HOA Fee,Pool,Solar,Septic,Well,Roof,Electric,Plumbing,Foundation,Water Heater,HVAC,General Property Condition,Property Description
"123 Main Street Apt 4B","Dallas","TX","75201","https://dispotree.com/photos/PROP-123456","Off Market",3,2.5,1850,6000,1985,"2-car attached",TRUE,150,FALSE,FALSE,FALSE,FALSE,"10 years old, composition shingles","200 amp service, updated panel","Copper pipes, good condition","Slab, no issues","5 years old, gas","Central air, 8 years old","Good condition, needs cosmetic updates","Great 3 bed/2.5 bath single family home in Dallas. Needs cosmetic updates but has good bones. Great location near schools and shopping."
```

### Excel Format Template

| Column | Data Type | Example | Notes |
|--------|-----------|---------|-------|
| Property Address | Text | 123 Main Street | Include unit number if applicable |
| City | Text | Dallas | |
| State | Text | TX | 2-letter abbreviation |
| Zip | Text | 75201 | 5-digit ZIP |
| Photos Folder | URL | https://.../photos/123456 | Link to shared folder |
| On Market/Off Market | Text | Off Market | Must be exactly "On Market" or "Off Market" |
| Beds | Number | 3 | Integer only |
| Baths | Number | 2.5 | Can include .5 for half baths |
| Living Space Sq ft | Number | 1850 | Integer only |
| Lot Size (Sq ft) | Number | 6000 | Integer only |
| Year Built | Number | 1985 | 4-digit year |
| Garage | Text | 2-car attached | Describe garage type |
| HOA | TRUE/FALSE | TRUE | Excel boolean format |
| HOA Fee | Currency | $150 | Monthly fee amount |
| Pool | TRUE/FALSE | FALSE | Excel boolean format |
| Solar | TRUE/FALSE | FALSE | Excel boolean format |
| Septic | TRUE/FALSE | FALSE | Excel boolean format |
| Well | TRUE/FALSE | FALSE | Excel boolean format |
| Roof | Text | 10 years old, comp | Brief description |
| Electric | Text | 200 amp, updated | Electrical details |
| Plumbing | Text | Copper, good condition | Plumbing details |
| Foundation | Text | Slab, no issues | Foundation details |
| Water Heater | Text | 5 years old, gas | Water heater details |
| HVAC | Text | Central air, 8 years | HVAC system details |
| General Property Condition | Text | Good, needs updates | Overall condition |
| Property Description | Text | Great 3 bed/2.5 bath... | Full description, can be long |

## Email Submission Template

### Subject Line Format
```
[Property Submission] 123 Main Street, Dallas TX 75201 - Dispotree
```

### Email Body Template
```
Dear [Fund Name],

Please find attached a new property submission from Dispotree that matches your buy box criteria.

Property Details:
- Address: 123 Main Street, Dallas TX 75201
- Beds/Baths: 3 bed, 2.5 bath
- Size: 1,850 sq ft on 6,000 sq ft lot
- Year Built: 1985
- Price: $200,000
- ARV: $350,000
- Rehab Budget: $45,000

The property is off-market and available for immediate acquisition. Photos and additional documentation are included in the attached spreadsheet.

Please review and let me know if you have any questions or would like to submit an offer.

Best regards,
[Your Name]
Dispotree Deal Coordinator
```

## Data Quality Requirements

### Accuracy Standards
- **Address**: Must be USPS validated
- **Beds/Baths**: Must match county records
- **Square Footage**: Must be from tax records or appraisal
- **Year Built**: Must match county assessor data
- **HOA Information**: Must be verified from HOA documents

### Photo Requirements
- **Minimum**: 10 photos covering all rooms
- **Exterior**: Front, back, sides, street view
- **Interior**: All rooms, kitchen, bathrooms
- **Systems**: HVAC, water heater, electrical panel
- **Issues**: Any known defects or problem areas

### Condition Reporting
- **Be Specific**: "Minor wear" → "Worn carpet in bedrooms"
- **Include Age**: "Roof" → "Roof 10 years old, composition shingles"
- **Note Repairs**: "Updated electrical" → "Electrical panel updated 2021, 200 amp service"

## Common Fund-Specific Requirements

### Large Institutional Funds
- Often require additional fields:
  - Cap Rate
  - Cash-on-Cash Return
  - Rent Comps
  - Sales Comps
  - Market Analysis

### Regional Funds
- May require:
  - School district ratings
  - Crime statistics
  - Demographic data
  - Employment rates

### Turnkey Providers
- Focus on:
  - Rehab estimates
  - After repair value
  - Rental projections
  - Property management details

## Integration Workflow

### 1. Data Collection
- Collect all required fields from Dispotree database
- Apply business logic for calculated fields
- Validate all data for accuracy

### 2. Photo Organization
- Create dedicated folder for each property
- Ensure all photos are properly named
- Upload to sharing platform (Google Drive, Dropbox, etc.)
- Generate shareable link

### 3. Spreadsheet Generation
- Create fund-specific template
- Populate with property data
- Format according to fund requirements
- Save as CSV or Excel as requested

### 4. Email Submission
- Compose professional email
- Attach spreadsheet and photos
- Send to fund's acquisition email
- Log submission in CRM

### 5. Follow-up
- Track response time
- Log offers and questions
- Maintain communication thread
- Escalate hot leads immediately