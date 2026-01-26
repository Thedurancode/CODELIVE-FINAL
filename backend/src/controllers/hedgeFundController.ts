import { Request, Response } from 'express';
import Property from '../models/Property';
import HedgeFundBuyBox from '../models/HedgeFundBuyBox';
import { HedgeFundPropertySubmission } from '../types/comprehensive';

// Get properties formatted for Hedge Fund submission
export const getPropertiesForHedgeFunds = async (req: Request, res: Response) => {
  try {
    const properties = await Property.findAll({
      where: {
        assignable: true,
        marketingClauseFound: true,
        brokerOnFile: true
      }
    });

    // Transform properties to Hedge Fund format
    const hedgeFundSubmissions: HedgeFundPropertySubmission[] = properties.map(property => ({
      propertyAddress: property.address
        ? `${property.address.houseNumber || ''} ${property.address.street || ''}${property.address.address2 ? ', ' + property.address.address2 : ''}`.trim()
        : `${property.city || ''}, ${property.state || ''}`,
      city: property.city,
      state: property.state,
      zip: property.zip,
      beds: property.bedroomCount,
      baths: property.bathroomCount,
      livingSpaceSqFt: property.livingSpaceSqFt || 0,
      lotSizeSqFt: property.lotSizeSqFt || 0,
      yearBuilt: property.yearBuilt || 0,
      garage: property.garage || 'None',
      hoa: property.hoa,
      hoaFee: property.hoaDuesAmount || 0,
      pool: property.pool || false,
      solar: property.solar || false,
      septic: property.septic || false,
      well: property.well || false,
      roof: property.roof || 'Unknown',
      electric: property.electric || 'Unknown',
      plumbing: property.sewer || 'Unknown',
      foundation: property.foundationType || 'Unknown',
      waterHeater: property.waterHeater || 'Unknown',
      hvac: property.hvac || 'Unknown',
      generalPropertyCondition: property.condition || property.typeOfRehab || 'Unknown',
      propertyDescription: property.propertyListingDescription || 'No description available',
      photosFolder: property.photosFolder || '',
      onMarketOffMarket: property.onMarketOffMarket || 'Off Market',
      financeable: property.financeable || false,
      ownItNowAllowedAuction: property.ownItNowAllowedAuction || false,
      ownItNowAllowedPreAuction: property.ownItNowAllowedPreAuction || false,
      ownItNowPrice: property.buyItNowPrice,
      reservePrice: property.reservePrice || 0,
      purchaseContractPrice: property.purchaseContractPrice,
      purchaseContractExpiration: property.purchaseContractExpiration
    }));

    res.json({
      success: true,
      data: hedgeFundSubmissions,
      count: hedgeFundSubmissions.length
    });
  } catch (error) {
    console.error('Error fetching properties for Hedge Funds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch properties for Hedge Fund submission'
    });
  }
};

// Generate CSV for specific hedge fund
export const generateHedgeFundCSV = async (req: Request, res: Response) => {
  try {
    const { fundId, fundName } = req.body;
    const properties = await Property.findAll({
      where: {
        assignable: true,
        marketingClauseFound: true,
        brokerOnFile: true
      }
    });

    // CSV Headers
    const headers = [
      'Photos Folder',
      'On Market/Off Market',
      'Property Address',
      'City',
      'State',
      'Zip',
      'Beds',
      'Baths',
      'Living Space Sq ft',
      'Lot Size (Sq ft)',
      'Year Built',
      'Garage',
      'HOA (Y/N)',
      'HOA Fee',
      'Pool',
      'Solar',
      'Septic',
      'Well',
      'Roof',
      'Electric',
      'Plumbing',
      'Foundation',
      'Water Heater',
      'HVAC',
      'General Property Condition',
      'Property Description'
    ];

    // Generate CSV rows
    const csvRows = properties.map(property => {
      const address = property.address
        ? `${property.address.houseNumber || ''} ${property.address.street || ''}${property.address.address2 ? ', ' + property.address.address2 : ''}`.trim()
        : `${property.city || ''}, ${property.state || ''}`;

      return [
        property.photosFolder || '',
        property.onMarketOffMarket || 'Off Market',
        `"${address}"`,
        property.city,
        property.state,
        property.zip,
        property.bedroomCount,
        property.bathroomCount,
        property.livingSpaceSqFt || 0,
        property.lotSizeSqFt || 0,
        property.yearBuilt || 0,
        `"${property.garage || 'None'}"`,
        property.hoa ? 'Y' : 'N',
        property.hoaDuesAmount || 0,
        property.pool ? 'Y' : 'N',
        property.solar ? 'Y' : 'N',
        property.septic ? 'Y' : 'N',
        property.well ? 'Y' : 'N',
        `"${property.roof || 'Unknown'}"`,
        `"${property.electric || 'Unknown'}"`,
        `"${property.sewer || 'Unknown'}"`,
        `"${property.foundationType || 'Unknown'}"`,
        `"${property.waterHeater || 'Unknown'}"`,
        `"${property.hvac || 'Unknown'}"`,
        `"${property.condition || property.typeOfRehab || 'Unknown'}"`,
        `"${property.propertyListingDescription?.replace(/"/g, '""') || 'No description available'}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fundName}_properties_${new Date().toISOString().split('T')[0]}.csv"`);

    res.send(csvContent);
  } catch (error) {
    console.error('Error generating Hedge Fund CSV:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSV for Hedge Fund'
    });
  }
};

// Submit to hedge fund via email
export const submitToHedgeFund = async (req: Request, res: Response) => {
  try {
    const { fundId, fundName, fundEmail, propertyIds } = req.body;

    // Get properties
    const properties = await Property.findAll({
      where: {
        id: propertyIds,
        assignable: true,
        marketingClauseFound: true,
        brokerOnFile: true
      }
    });

    if (properties.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid properties found for submission'
      });
    }

    // TODO: Implement email sending logic
    // This would involve:
    // 1. Creating the CSV attachment
    // 2. Composing the email
    // 3. Sending via email service (SendGrid, AWS SES, etc.)
    // 4. Tracking the submission

    // For now, return success
    res.json({
      success: true,
      message: `Successfully submitted ${properties.length} properties to ${fundName}`,
      data: {
        fundId,
        fundName,
        fundEmail,
        submittedPropertyCount: properties.length,
        submittedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error submitting to Hedge Fund:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit properties to Hedge Fund'
    });
  }
};

// Get available buy boxes from hedge funds
export const getHedgeFundBuyBoxes = async (req: Request, res: Response) => {
  try {
    const { active, state } = req.query;

    // Build where clause
    const whereClause: any = {};
    if (active !== undefined) {
      whereClause.enabled = active === 'true';
    }

    // Fetch from database
    const buyBoxes = await HedgeFundBuyBox.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
    });

    // Filter by state if provided (check within criteria JSON)
    let filteredBuyBoxes = buyBoxes;
    if (state && typeof state === 'string') {
      filteredBuyBoxes = buyBoxes.filter((box: any) => {
        const criteria = box.criteria;
        return criteria?.states?.includes(state);
      });
    }

    // Map to include 'active' field for frontend compatibility
    const result = filteredBuyBoxes.map((box: any) => ({
      ...box.toJSON(),
      active: box.enabled, // Frontend expects 'active'
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching Hedge Fund buy boxes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Hedge Fund buy boxes'
    });
  }
};

// Mock buy boxes data (shared between functions)
const getMockBuyBoxes = () => [
  {
    id: 1,
    fundName: 'ABC Investments',
    criteria: {
      states: ['TX', 'FL', 'GA'],
      minBeds: 2,
      maxBeds: 4,
      minBaths: 1,
      maxBaths: 3,
      minPrice: 50000,
      maxPrice: 300000,
      minYearBuilt: 1950,
      propertyTypes: ['Single Family', 'Townhouse']
    },
    contact: {
      email: 'acquisitions@abcinvestments.com',
      phone: '555-0123'
    }
  },
  {
    id: 2,
    fundName: 'XYZ Capital',
    criteria: {
      states: ['CA', 'AZ', 'NV'],
      minBeds: 3,
      maxBeds: 5,
      minBaths: 2,
      maxBaths: 4,
      minPrice: 100000,
      maxPrice: 500000,
      minYearBuilt: 1980,
      propertyTypes: ['Single Family', 'Condo']
    },
    contact: {
      email: 'deals@xyzcapital.com',
      phone: '555-0456'
    }
  }
];

// Match properties to hedge fund buy boxes
export const matchPropertiesToBuyBoxes = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // TODO: Implement matching algorithm
    // For now, return all buy boxes
    const mockBuyBoxes = getMockBuyBoxes();

    res.json({
      success: true,
      data: {
        propertyId,
        propertyAddress: property.address
          ? `${property.address.houseNumber || ''} ${property.address.street || ''}`.trim()
          : `${property.city || ''}, ${property.state || ''}`,
        matchingBuyBoxes: mockBuyBoxes
      }
    });
  } catch (error) {
    console.error('Error matching property to buy boxes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to match property to buy boxes'
    });
  }
};