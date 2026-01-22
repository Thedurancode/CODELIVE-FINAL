import { Request, Response } from 'express';
import PublicDealLink from '../models/PublicDealLink';
import Property from '../models/Property';
import MarketplaceUser from '../models/MarketplaceUser';
import PropertyDocument from '../models/PropertyDocument';
import DealAction from '../models/DealAction';
import DealOffer from '../models/DealOffer';
import Contact from '../models/Contact';
import ComplianceCheck from '../models/ComplianceCheck';

/**
 * Get public deal by ID and token
 */
export const getPublicDeal = async (req: Request, res: Response) => {
  try {
    const { id, token } = req.params;
    console.log('[PublicDeal] Fetching link for property:', id, 'token:', token);

    // Find the public deal link
    const link = await PublicDealLink.findOne({
      where: { propertyId: id, token },
      include: [
        {
          model: Property,
          as: 'property',
          include: [
            {
              model: PropertyDocument,
              as: 'documents',
              required: false,
            },
          ],
        },
      ],
    });

    console.log('[PublicDeal] Link found:', !!link);

    if (!link) {
      console.log('[PublicDeal] No link found in database');
      return res.status(404).json({
        success: false,
        error: 'Deal not found or link has expired',
      });
    }

    console.log('[PublicDeal] Link details:', {
      id: link.id,
      propertyId: link.propertyId,
      isActive: link.isActive,
      expiresAt: link.expiresAt,
      isValid: link.isValid()
    });

    // Check if link is valid
    if (!link.isValid()) {
      console.log('[PublicDeal] Link is not valid');
      return res.status(403).json({
        success: false,
        error: 'This link has expired or been deactivated',
      });
    }

    // Increment view count
    await link.incrementViewCount();

    const property = link.property;

    // Build response based on settings
    const responseData: any = {
      property: {},
      settings: link.settings,
    };

    // Basic property info (always included)
    responseData.property = {
      id: property.id,
      propertyAddress: property.propertyAddress,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
    };

    // Conditionally include data based on settings
    if (link.settings.showPhotos) {
      responseData.property.photoLinks = property.photoLinks;
    }

    if (link.settings.showFinancials) {
      responseData.property.arv = property.arv;
      responseData.property.askingPrice = property.askingPrice;
      responseData.property.purchaseContractPrice = property.purchaseContractPrice;
      responseData.property.rehabCost = property.rehabCost;
      responseData.property.zestimate = property.zestimate;
      responseData.property.rentZestimate = property.rentZestimate;
    }

    if (link.settings.showPropertyDetails) {
      responseData.property.propertyType = property.propertyType;
      responseData.property.bedroomCount = property.bedroomCount;
      responseData.property.bathroomCount = property.bathroomCount;
      responseData.property.livingSpaceSqFt = property.livingSpaceSqFt;
      responseData.property.yearBuilt = property.yearBuilt;
    }

    if (link.settings.showOccupancy) {
      responseData.property.occupancyStatus = property.occupancyStatus;
      responseData.property.deliveredVacant = property.deliveredVacant;
    }

    if (link.settings.showFeatures) {
      responseData.property.pool = property.pool;
      responseData.property.solarPanels = property.solarPanels;
      responseData.property.septic = property.septic;
      responseData.property.wellWater = property.wellWater;
      responseData.property.hoa = property.hoa;
    }

    if (link.settings.showCompliance) {
      responseData.property.assignableContract = property.assignableContract;
      responseData.property.marketingClause = property.marketingClause;
      responseData.property.brokerOnFile = property.brokerOnFile;
      responseData.property.financeable = property.financeable;

      // Get latest compliance check
      const complianceCheck = await ComplianceCheck.findOne({
        where: { propertyId: property.id },
        order: [['createdAt', 'DESC']],
      });
      if (complianceCheck) {
        responseData.property.complianceStatus = complianceCheck.status;
      }
    }

    if (link.settings.showDocuments) {
      responseData.property.documents = property.documents;
    }

    if (link.settings.showSkipTrace) {
      responseData.property.skipTraceDetails = property.skipTraceDetails;
    }

    if (link.settings.showViewers) {
      // Get users who viewed this deal
      const viewers = await DealAction.findAll({
        where: { propertyId: property.id, action: 'view' },
        include: [
          {
            model: MarketplaceUser,
            as: 'user',
            attributes: ['id', 'name', 'role'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit: 10,
      });
      responseData.viewers = viewers.map((v) => ({
        user: v.user,
        viewedAt: v.createdAt,
      }));
    }

    if (link.settings.showOffers) {
      // Get offers for this deal
      const offers = await DealOffer.findAll({
        where: { propertyId: property.id },
        include: [
          {
            model: MarketplaceUser,
            as: 'buyer',
            attributes: ['id', 'name'],
          },
        ],
        order: [['createdAt', 'DESC']],
      });
      responseData.offers = offers;
    }

    if (link.settings.showContacts) {
      // Get assigned contacts
      const contacts = await Contact.findAll({
        where: { propertyId: property.id },
        attributes: ['id', 'name', 'email', 'phone', 'role', 'company'],
      });
      responseData.contacts = contacts;
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('Error fetching public deal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load deal',
    });
  }
};

/**
 * Create a public deal link
 */
export const createPublicDealLink = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { settings, expiresAt } = req.body;
    const userId = req.user!.id;

    // Check if property exists
    const property = await Property.findByPk(id);
    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found',
      });
    }

    // Generate unique token
    const token = PublicDealLink.generateToken();

    // Create the link
    const link = await PublicDealLink.create({
      propertyId: parseInt(id),
      token,
      settings: settings || undefined, // Will use default from model if not provided
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: userId,
    });

    res.json({
      success: true,
      data: {
        link,
        url: `/public/deal/${id}/${token}`,
      },
    });
  } catch (error) {
    console.error('Error creating public deal link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create public link',
    });
  }
};

/**
 * Get all public links for a property
 */
export const getPropertyPublicLinks = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const links = await PublicDealLink.findAll({
      where: { propertyId: id },
      include: [
        {
          model: MarketplaceUser,
          as: 'creator',
          attributes: ['id', 'name'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      data: links,
    });
  } catch (error) {
    console.error('Error fetching public links:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load public links',
    });
  }
};

/**
 * Update a public deal link
 */
export const updatePublicDealLink = async (req: Request, res: Response) => {
  try {
    const { linkId } = req.params;
    const { settings, expiresAt, isActive } = req.body;

    const link = await PublicDealLink.findByPk(linkId);
    if (!link) {
      return res.status(404).json({
        success: false,
        error: 'Link not found',
      });
    }

    // Update fields
    if (settings !== undefined) link.settings = settings;
    if (expiresAt !== undefined) link.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (isActive !== undefined) link.isActive = isActive;

    await link.save();

    res.json({
      success: true,
      data: link,
    });
  } catch (error) {
    console.error('Error updating public link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update public link',
    });
  }
};

/**
 * Delete a public deal link
 */
export const deletePublicDealLink = async (req: Request, res: Response) => {
  try {
    const { linkId } = req.params;

    const link = await PublicDealLink.findByPk(linkId);
    if (!link) {
      return res.status(404).json({
        success: false,
        error: 'Link not found',
      });
    }

    await link.destroy();

    res.json({
      success: true,
      message: 'Link deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting public link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete public link',
    });
  }
};

/**
 * Join public discussion for a deal
 */
export const joinPublicDiscussion = async (req: Request, res: Response) => {
  try {
    const { id, token } = req.params;
    const { phoneNumber, name } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
      });
    }

    // Verify the link is valid
    const link = await PublicDealLink.findOne({
      where: { propertyId: id, token },
    });

    if (!link || !link.isValid()) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired link',
      });
    }

    // Check if discussion is enabled
    if (!link.settings.showDiscussion) {
      return res.status(403).json({
        success: false,
        error: 'Discussion is not enabled for this deal',
      });
    }

    // Import GuestSession and TeamConversation dynamically to avoid circular dependencies
    const { default: GuestSession } = await import('../models/GuestSession');
    const { default: TeamConversation } = await import('../models/TeamConversation');

    // Find or create guest session
    const [guestSession, created] = await GuestSession.findOrCreateByPhone(phoneNumber);

    // Update name if provided
    if (name && !guestSession.name) {
      guestSession.name = name;
      await guestSession.save();
    }

    // Grant access to the property
    await guestSession.grantPropertyAccess(parseInt(id));

    // Generate magic link token for passwordless login
    const magicToken = await guestSession.generateMagicLinkToken();

    // Get or create team conversation for this property
    const [conversation] = await TeamConversation.findOrCreateForProperty(
      parseInt(id),
      `Property ${id} Discussion`
    );

    // Add guest to conversation participants if not already added
    if (!conversation.participantIds.includes(guestSession.id)) {
      await conversation.update({
        participantIds: [...conversation.participantIds, guestSession.id],
      });
    }

    // Generate magic link URL
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const magicLink = `${baseUrl}/public/chat/verify?token=${magicToken}`;

    res.json({
      success: true,
      message: 'Successfully joined discussion',
      data: {
        guestSessionId: guestSession.id,
        magicLink,
        conversationId: conversation.id,
        // In production, send this link via SMS instead of returning it
        // For now, return it for testing purposes
      },
    });
  } catch (error) {
    console.error('Error joining discussion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join discussion',
    });
  }
};
