// FieldMappingValue type was previously imported from StateDocumentTemplate (now removed).
// Inline the type definition for backward compatibility.
type FieldMappingValue = string | { source: string; field: string; transform?: string };

/**
 * Apply a transform to a value
 */
function applyTransform(value: any, transform: string): any {
  if (value === undefined || value === null) return value;

  switch (transform) {
    case 'currency':
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(num);
      }
      return value;

    case 'date':
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return value;

    case 'date_short':
      const shortDate = new Date(value);
      if (!isNaN(shortDate.getTime())) {
        return shortDate.toLocaleDateString('en-US');
      }
      return value;

    case 'uppercase':
      return typeof value === 'string' ? value.toUpperCase() : value;

    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;

    case 'phone':
      const cleaned = String(value).replace(/\D/g, '');
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
      return value;

    default:
      return value;
  }
}

interface PropertyAddress {
  houseNumber?: string;
  street?: string;
  address2?: string;
}

interface PropertyLike {
  address?: PropertyAddress;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  propertyType?: string;
  bedroomCount?: number;
  bathroomCount?: number;
  livingSpaceSqFt?: number;
  lotSizeSqFt?: number;
  yearBuilt?: number;
  purchaseContractPrice?: number;
  reservePrice?: number;
  startingBidAmount?: number;
  arv?: number;
  rehabCost?: number;
  renovationBudget?: number;
  wholesalerLlcName?: string;
  llcOwnerEmail?: string;
  llcOwnerName?: string;
  llcBusinessAddress?: string;
  agentFirstName?: string;
  agentLastName?: string;
  agentEmail?: string;
  agentPhoneNumber?: string;
  agentLicenseNumber?: string;
  brokerCompany?: string;
  brokerLicenseNumber?: string;
  managingBroker?: string;
  purchaseContractExpiration?: Date;
  condition?: string;
  occupancyStatus?: string;
  hoa?: boolean;
  hoaDuesAmount?: number;
  hoaBillingFrequency?: string;
  mlsNumber?: string;
  mlsListingPrice?: number;
}

/**
 * Build all fields from property data using field mappings.
 * Supports both simple string mappings and complex FieldMappingValue objects.
 */
export function buildPropertyFields(
  property: PropertyLike,
  fieldMappings?: Record<string, FieldMappingValue>,
  additionalFields?: Record<string, any>
): Record<string, any> {
  const fields: Record<string, any> = {};

  const defaultMappings: Record<string, string> = {
    // Address
    property_address: '_full_address',
    street_address: 'address.street',
    house_number: 'address.houseNumber',
    address_line_2: 'address.address2',
    city: 'city',
    state: 'state',
    zip: 'zip',
    zip_code: 'zip',
    county: 'county',
    full_address: '_full_address',

    // Property Details
    property_type: 'propertyType',
    bedrooms: 'bedroomCount',
    bedroom_count: 'bedroomCount',
    bathrooms: 'bathroomCount',
    bathroom_count: 'bathroomCount',
    sqft: 'livingSpaceSqFt',
    square_feet: 'livingSpaceSqFt',
    living_space: 'livingSpaceSqFt',
    lot_size: 'lotSizeSqFt',
    year_built: 'yearBuilt',

    // Financial
    purchase_price: 'purchaseContractPrice',
    asking_price: 'reservePrice',
    reserve_price: 'reservePrice',
    starting_bid: 'startingBidAmount',
    arv: 'arv',
    after_repair_value: 'arv',
    repair_cost: 'rehabCost',
    rehab_cost: 'rehabCost',
    renovation_budget: 'renovationBudget',

    // Seller/Wholesaler
    seller_name: 'wholesalerLlcName',
    seller_company: 'wholesalerLlcName',
    wholesaler_name: 'wholesalerLlcName',
    llc_name: 'wholesalerLlcName',
    seller_email: 'llcOwnerEmail',
    llc_email: 'llcOwnerEmail',
    llc_owner: 'llcOwnerName',
    llc_address: 'llcBusinessAddress',

    // Agent
    agent_name: '_agent_full_name',
    agent_first_name: 'agentFirstName',
    agent_last_name: 'agentLastName',
    agent_email: 'agentEmail',
    agent_phone: 'agentPhoneNumber',
    agent_license: 'agentLicenseNumber',

    // Broker
    broker_company: 'brokerCompany',
    broker_license: 'brokerLicenseNumber',
    managing_broker: 'managingBroker',

    // Contract
    contract_expiration: 'purchaseContractExpiration',
    closing_date: 'purchaseContractExpiration',

    // Property Condition
    condition: 'condition',
    property_condition: 'condition',
    occupancy: 'occupancyStatus',
    occupancy_status: 'occupancyStatus',

    // HOA
    hoa: 'hoa',
    hoa_dues: 'hoaDuesAmount',
    hoa_frequency: 'hoaBillingFrequency',

    // MLS
    mls_number: 'mlsNumber',
    mls_price: 'mlsListingPrice',
  };

  const allMappings = { ...defaultMappings, ...fieldMappings };

  const getValue = (obj: any, path: string): any => {
    if (path === '_full_address') {
      const addr = obj.address || {};
      return `${addr.houseNumber || ''} ${addr.street || ''}, ${obj.city || ''}, ${obj.state || ''} ${obj.zip || ''}`.trim();
    }
    if (path === '_agent_full_name') {
      return `${obj.agentFirstName || ''} ${obj.agentLastName || ''}`.trim();
    }

    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }
    return value;
  };

  for (const [docuSealField, mapping] of Object.entries(allMappings)) {
    // Handle both string and complex object mappings
    let propertyPath: string;
    let transform: string | undefined;

    if (typeof mapping === 'string') {
      propertyPath = mapping;
    } else if (mapping && typeof mapping === 'object') {
      // Complex mapping with source/field/transform
      propertyPath = mapping.field;
      transform = mapping.transform;
    } else {
      continue;
    }

    let value = getValue(property, propertyPath);

    if (value !== null && value !== undefined && value !== '') {
      // Apply transform if specified
      if (transform) {
        value = applyTransform(value, transform);
      }

      if (typeof value === 'number') {
        fields[docuSealField] = value.toLocaleString();
      } else if (value instanceof Date) {
        fields[docuSealField] = value.toISOString().split('T')[0];
      } else if (typeof value === 'boolean') {
        fields[docuSealField] = value ? 'Yes' : 'No';
      } else {
        fields[docuSealField] = String(value);
      }
    }
  }

  if (additionalFields) {
    Object.assign(fields, additionalFields);
  }

  fields['date'] = new Date().toISOString().split('T')[0];
  fields['today'] = new Date().toLocaleDateString();

  return fields;
}
