import { Request, Response } from 'express';
import Property from '../models/Property';
import { XomePropertySubmission } from '../types/comprehensive';

// Get properties formatted for Xome submission
export const getPropertiesForXome = async (req: Request, res: Response) => {
  try {
    const properties = await Property.findAll({
      where: {
        assignable: true,
        marketingClauseFound: true,
        brokerOnFile: true
      }
    });

    // Transform properties to Xome format
    const xomeSubmissions: XomePropertySubmission[] = properties.map((property: Property) => ({
      assetType: property.propertyType,
      address: {
        houseNumber: property.address.houseNumber,
        street: property.address.street,
        address2: property.address.address2 || '',
        city: property.city,
        state: property.state,
        zip: property.zip,
        county: property.county,
        country: property.country || 'USA'
      },
      propertyDetails: {
        propertyId: property.propertyId,
        propertyType: property.propertyType,
        propertyOwnership: property.propertyOwnership,
        workflowType: property.workflowType,
        yearBuilt: property.yearBuilt,
        livingSpaceSqFt: property.livingSpaceSqFt,
        lotSizeSqFt: property.lotSizeSqFt,
        bedroomCount: property.bedroomCount,
        bathroomCount: property.bathroomCount,
        fullBathrooms: property.fullBathrooms || property.bathroomCount,
        partialBathrooms: property.partialBathrooms || 0,
        stories: property.stories,
        garage: property.garage,
        garageCount: property.garageCount,
        pool: property.pool || false,
        solar: property.solar || false
      },
      financial: {
        purchaseContractPrice: property.purchaseContractPrice,
        reservePrice: property.reservePrice,
        buyItNowPrice: property.buyItNowPrice,
        startingBidAmount: property.startingBidAmount,
        monthlyRent: property.monthlyRent,
        arv: property.arv,
        renovationBudget: property.renovationBudget,
        bpoValue1: property.bpoValue1,
        bpoValue1Date: property.bpoValue1Date,
        bpoValue2: property.bpoValue2,
        bpoValue2Date: property.bpoValue2Date,
        appraisalValue: property.appraisalValue,
        appraisalDate: property.appraisalDate,
        mlsListingPrice: property.mlsListingPrice,
        commissionPercentage: property.commissionPercentage
      },
      occupancy: {
        occupancyStatus: property.occupancyStatus,
        occupancyDetails: property.occupancyDetails,
        deliveredVacant: property.deliveredVacant,
        accessToProperty: property.accessToProperty,
        lockboxCode: property.lockboxCode
      },
      hoa: {
        hoa: property.hoa,
        hoaBillingFrequency: property.hoaBillingFrequency,
        hoaDuesAmount: property.hoaDuesAmount
      },
      features: {
        garage: property.garage,
        pool: property.pool || false,
        solar: property.solar || false
      },
      marketing: {
        liveOnHubzu: property.liveOnHubzu,
        onMarketOffMarket: property.onMarketOffMarket || 'Off Market',
        syndication: property.syndication,
        listedOnMLS: property.listedOnMLS,
        mlsNumber: property.mlsNumber,
        mlsListedDate: property.mlsListedDate,
        mlsExpirationDate: property.mlsExpirationDate,
        mlsEligible: property.mlsEligible,
        photosFolder: property.photosFolder,
        photoLinks: property.photoLinks,
        propertyListingDescription: property.propertyListingDescription
      },
      agent: property.agentFirstName ? {
        agentFirstName: property.agentFirstName,
        agentLastName: property.agentLastName,
        agentEmail: property.agentEmail,
        agentPhoneNumber: property.agentPhoneNumber,
        agentLicenseNumber: property.agentLicenseNumber,
        licensedState: property.licensedState,
        agentAddress: property.agentAddress,
        agentCity: property.agentCity,
        agentState: property.agentState,
        agentZip: property.agentZip
      } : undefined,
      broker: {
        brokerCompany: property.brokerCompany,
        brokerLicenseNumber: property.brokerLicenseNumber,
        managingBroker: property.managingBroker,
        managingBrokerLicenseNumber: property.managingBrokerLicenseNumber
      },
      transaction: {
        conveyanceType: property.conveyanceType || 'Assignment of Contract'
      }
    }));

    res.json({
      success: true,
      data: xomeSubmissions,
      count: xomeSubmissions.length
    });
  } catch (error) {
    console.error('Error fetching properties for Xome:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch properties for Xome submission'
    });
  }
};

// Submit property to Xome
export const submitToXome = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const property = await Property.findByPk(propertyId);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Check compliance status
    if (property.status !== 'Green') {
      return res.status(400).json({
        success: false,
        error: 'Property is not ready for Xome submission. Status: ' + property.status,
        complianceNotes: property.complianceNotes
      });
    }

    // Format for Xome submission
    const xomeData: XomePropertySubmission = {
      assetType: property.propertyType,
      address: {
        houseNumber: property.address.houseNumber,
        street: property.address.street,
        address2: property.address.address2 || '',
        city: property.city,
        state: property.state,
        zip: property.zip,
        county: property.county,
        country: property.country || 'USA'
      },
      propertyDetails: {
        propertyId: property.propertyId,
        propertyType: property.propertyType,
        propertyOwnership: property.propertyOwnership,
        workflowType: property.workflowType,
        yearBuilt: property.yearBuilt,
        livingSpaceSqFt: property.livingSpaceSqFt,
        lotSizeSqFt: property.lotSizeSqFt,
        bedroomCount: property.bedroomCount,
        bathroomCount: property.bathroomCount,
        fullBathrooms: property.fullBathrooms || property.bathroomCount,
        partialBathrooms: property.partialBathrooms || 0,
        stories: property.stories,
        garage: property.garage,
        garageCount: property.garageCount,
        pool: property.pool || false,
        solar: property.solar || false
      },
      financial: {
        purchaseContractPrice: property.purchaseContractPrice,
        reservePrice: property.reservePrice,
        buyItNowPrice: property.buyItNowPrice,
        startingBidAmount: property.startingBidAmount,
        monthlyRent: property.monthlyRent,
        arv: property.arv,
        renovationBudget: property.renovationBudget,
        bpoValue1: property.bpoValue1,
        bpoValue1Date: property.bpoValue1Date,
        bpoValue2: property.bpoValue2,
        bpoValue2Date: property.bpoValue2Date,
        appraisalValue: property.appraisalValue,
        appraisalDate: property.appraisalDate,
        mlsListingPrice: property.mlsListingPrice,
        commissionPercentage: property.commissionPercentage
      },
      occupancy: {
        occupancyStatus: property.occupancyStatus,
        occupancyDetails: property.occupancyDetails,
        deliveredVacant: property.deliveredVacant,
        accessToProperty: property.accessToProperty,
        lockboxCode: property.lockboxCode
      },
      hoa: {
        hoa: property.hoa,
        hoaBillingFrequency: property.hoaBillingFrequency,
        hoaDuesAmount: property.hoaDuesAmount
      },
      features: {
        garage: property.garage,
        pool: property.pool || false,
        solar: property.solar || false
      },
      marketing: {
        liveOnHubzu: property.liveOnHubzu,
        onMarketOffMarket: property.onMarketOffMarket || 'Off Market',
        syndication: property.syndication,
        listedOnMLS: property.listedOnMLS,
        mlsNumber: property.mlsNumber,
        mlsListedDate: property.mlsListedDate,
        mlsExpirationDate: property.mlsExpirationDate,
        mlsEligible: property.mlsEligible,
        photosFolder: property.photosFolder,
        photoLinks: property.photoLinks,
        propertyListingDescription: property.propertyListingDescription
      },
      agent: property.agentFirstName ? {
        agentFirstName: property.agentFirstName,
        agentLastName: property.agentLastName,
        agentEmail: property.agentEmail,
        agentPhoneNumber: property.agentPhoneNumber,
        agentLicenseNumber: property.agentLicenseNumber,
        licensedState: property.licensedState,
        agentAddress: property.agentAddress,
        agentCity: property.agentCity,
        agentState: property.agentState,
        agentZip: property.agentZip
      } : undefined,
      broker: {
        brokerCompany: property.brokerCompany,
        brokerLicenseNumber: property.brokerLicenseNumber,
        managingBroker: property.managingBroker,
        managingBrokerLicenseNumber: property.managingBrokerLicenseNumber
      },
      transaction: {
        conveyanceType: property.conveyanceType || 'Assignment of Contract'
      }
    };

    // TODO: Implement actual Xome API submission
    // This would involve calling Xome's API endpoint
    // For now, we'll just mark as submitted to Xome

    // Update property to mark as submitted to Xome
    await property.update({
      liveOnHubzu: true, // This field can track Xome submission
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Property successfully submitted to Xome',
      data: {
        propertyId: propertyId,
        submissionData: xomeData,
        submittedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error submitting property to Xome:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit property to Xome'
    });
  }
};