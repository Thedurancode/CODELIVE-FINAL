/**
 * Broker Service
 *
 * Handles broker application, approval, assignment, and management.
 * Supports the broker-mediated compliance flow.
 */

import BrokerProfile, { BrokerStatus } from '../models/BrokerProfile';
import MarketplaceUser from '../models/MarketplaceUser';
import Contact from '../models/Contact';
import { Op } from 'sequelize';

export interface BrokerApplicationData {
  userId: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpirationDate: Date;
  brokerageCompany: string;
  brokerageAddress?: string;
  brokeragePhone?: string;
  brokerageEmail?: string;
  eoInsurancePolicy?: string;
  eoExpirationDate?: Date;
}

export interface BrokerAssignmentResult {
  success: boolean;
  brokerId?: string;
  brokerName?: string;
  message: string;
}

class BrokerService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('BrokerService initialized');
  }

  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Submit a broker application
   */
  async applyAsBroker(applicationData: BrokerApplicationData): Promise<BrokerProfile> {
    // Check if user exists
    const user = await MarketplaceUser.findByPk(applicationData.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if already has a broker profile
    const existingProfile = await BrokerProfile.findOne({
      where: { userId: applicationData.userId },
    });
    if (existingProfile) {
      throw new Error('User already has a broker profile');
    }

    // Create broker profile with pending status
    const profile = await BrokerProfile.create({
      ...applicationData,
      status: 'pending',
    });

    // Update user role to broker (still pending approval)
    await user.update({ role: 'broker' });

    // Also create a contact record for the broker
    try {
      await Contact.create({
        userId: applicationData.userId,
        type: 'broker',
        name: user.name || applicationData.brokerageCompany,
        email: applicationData.brokerageEmail || user.email || null,
        phone: applicationData.brokeragePhone || null,
        company: applicationData.brokerageCompany,
        address: applicationData.brokerageAddress || null,
        state: applicationData.licenseState,
        licenseNumber: applicationData.licenseNumber,
        licenseState: applicationData.licenseState,
        licenseExpiration: applicationData.licenseExpirationDate,
        status: 'active',
        tags: ['broker', 'pending-approval'],
        metadata: {
          brokerProfileId: profile.id,
          eoInsurancePolicy: applicationData.eoInsurancePolicy,
          eoExpirationDate: applicationData.eoExpirationDate,
        },
      });
    } catch (contactError) {
      console.error('Failed to create broker contact:', contactError);
      // Don't fail the broker application if contact creation fails
    }

    return profile;
  }

  /**
   * Get broker application by ID
   */
  async getApplication(applicationId: string): Promise<BrokerProfile | null> {
    return BrokerProfile.findByPk(applicationId, {
      include: [{ model: MarketplaceUser, as: 'user' }],
    });
  }

  /**
   * Get all pending broker applications
   */
  async getPendingApplications(): Promise<BrokerProfile[]> {
    return BrokerProfile.findAll({
      where: { status: 'pending' },
      include: [{ model: MarketplaceUser, as: 'user' }],
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Approve a broker application
   */
  async approveApplication(
    applicationId: string,
    adminUserId: string
  ): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(applicationId);
    if (!profile) {
      throw new Error('Broker application not found');
    }

    if (profile.status !== 'pending') {
      throw new Error(`Cannot approve application with status: ${profile.status}`);
    }

    await profile.update({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: adminUserId,
    });

    // Update the broker's contact record - remove pending-approval tag
    try {
      const contact = await Contact.findOne({
        where: {
          userId: profile.userId,
          type: 'broker',
        },
      });
      if (contact) {
        const updatedTags = contact.tags.filter((tag) => tag !== 'pending-approval');
        updatedTags.push('approved');
        await contact.update({ tags: updatedTags });
      }
    } catch (error) {
      console.error('Failed to update broker contact on approval:', error);
    }

    return profile;
  }

  /**
   * Reject a broker application
   */
  async rejectApplication(
    applicationId: string,
    adminUserId: string,
    reason: string
  ): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(applicationId);
    if (!profile) {
      throw new Error('Broker application not found');
    }

    if (profile.status !== 'pending') {
      throw new Error(`Cannot reject application with status: ${profile.status}`);
    }

    await profile.update({
      status: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: adminUserId,
      rejectionReason: reason,
    });

    // Revert user role
    const user = await MarketplaceUser.findByPk(profile.userId);
    if (user) {
      await user.update({ role: 'wholesaler' });
    }

    // Update the broker's contact record - mark as archived
    try {
      const contact = await Contact.findOne({
        where: {
          userId: profile.userId,
          type: 'broker',
        },
      });
      if (contact) {
        await contact.update({
          status: 'archived',
          tags: ['broker', 'rejected'],
          notes: `Application rejected: ${reason}`,
        });
      }
    } catch (error) {
      console.error('Failed to update broker contact on rejection:', error);
    }

    return profile;
  }

  /**
   * Suspend a broker
   */
  async suspendBroker(
    brokerId: string,
    adminUserId: string,
    reason: string
  ): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    if (profile.status !== 'approved') {
      throw new Error(`Cannot suspend broker with status: ${profile.status}`);
    }

    await profile.update({
      status: 'suspended',
      suspendedAt: new Date(),
      suspendedBy: adminUserId,
      suspensionReason: reason,
    });

    // Update the broker's contact record - mark as inactive
    try {
      const contact = await Contact.findOne({
        where: {
          userId: profile.userId,
          type: 'broker',
        },
      });
      if (contact) {
        const updatedTags = contact.tags.filter((tag) => tag !== 'approved');
        updatedTags.push('suspended');
        await contact.update({
          status: 'inactive',
          tags: updatedTags,
          notes: contact.notes
            ? `${contact.notes}\nSuspended: ${reason}`
            : `Suspended: ${reason}`,
        });
      }
    } catch (error) {
      console.error('Failed to update broker contact on suspension:', error);
    }

    return profile;
  }

  /**
   * Reinstate a suspended broker
   */
  async reinstateBroker(brokerId: string, adminUserId: string): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    if (profile.status !== 'suspended') {
      throw new Error(`Cannot reinstate broker with status: ${profile.status}`);
    }

    await profile.update({
      status: 'approved',
      suspendedAt: undefined,
      suspendedBy: undefined,
      suspensionReason: undefined,
      approvedAt: new Date(),
      approvedBy: adminUserId,
    });

    // Update the broker's contact record - reactivate
    try {
      const contact = await Contact.findOne({
        where: {
          userId: profile.userId,
          type: 'broker',
        },
      });
      if (contact) {
        const updatedTags = contact.tags.filter((tag) => tag !== 'suspended');
        if (!updatedTags.includes('approved')) {
          updatedTags.push('approved');
        }
        await contact.update({
          status: 'active',
          tags: updatedTags,
        });
      }
    } catch (error) {
      console.error('Failed to update broker contact on reinstatement:', error);
    }

    return profile;
  }

  /**
   * Get broker profile by user ID
   */
  async getBrokerByUserId(userId: string): Promise<BrokerProfile | null> {
    return BrokerProfile.findOne({
      where: { userId },
      include: [{ model: MarketplaceUser, as: 'user' }],
    });
  }

  /**
   * Get active brokers by state
   */
  async getBrokersByState(state: string): Promise<BrokerProfile[]> {
    return BrokerProfile.findAll({
      where: {
        licenseState: state.toUpperCase(),
        status: 'approved',
        licenseExpirationDate: { [Op.gt]: new Date() },
      },
      include: [{ model: MarketplaceUser, as: 'user' }],
      order: [
        ['activeDeals', 'ASC'], // Prefer brokers with fewer active deals
        ['totalDealsSupervised', 'DESC'], // Then by experience
      ],
    });
  }

  /**
   * Get an available broker for a deal in a specific state
   * Uses round-robin assignment based on active deals
   */
  async getAvailableBroker(state: string): Promise<BrokerAssignmentResult> {
    const brokers = await this.getBrokersByState(state);

    if (brokers.length === 0) {
      return {
        success: false,
        message: `No approved brokers available in ${state}`,
      };
    }

    // Get the broker with the fewest active deals
    const selectedBroker = brokers[0];
    const user = await MarketplaceUser.findByPk(selectedBroker.userId);

    return {
      success: true,
      brokerId: selectedBroker.id,
      brokerName: user?.name || selectedBroker.brokerageCompany,
      message: `Assigned broker: ${user?.name || selectedBroker.brokerageCompany}`,
    };
  }

  /**
   * Assign a broker to a deal and increment active deals count
   */
  async assignBrokerToDeal(brokerId: string): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    if (!profile.isActive()) {
      throw new Error('Broker is not active');
    }

    await profile.update({
      activeDeals: profile.activeDeals + 1,
      totalDealsSupervised: profile.totalDealsSupervised + 1,
    });

    return profile;
  }

  /**
   * Decrement active deals when a deal is closed or cancelled
   */
  async completeDeal(brokerId: string): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    await profile.update({
      activeDeals: Math.max(0, profile.activeDeals - 1),
    });

    return profile;
  }

  /**
   * Get all approved brokers
   */
  async getAllApprovedBrokers(): Promise<BrokerProfile[]> {
    return BrokerProfile.findAll({
      where: { status: 'approved' },
      include: [{ model: MarketplaceUser, as: 'user' }],
      order: [['brokerageCompany', 'ASC']],
    });
  }

  /**
   * Get brokers with expiring licenses (within 30 days)
   */
  async getBrokersWithExpiringLicenses(): Promise<BrokerProfile[]> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return BrokerProfile.findAll({
      where: {
        status: 'approved',
        licenseExpirationDate: {
          [Op.lte]: thirtyDaysFromNow,
          [Op.gt]: new Date(),
        },
      },
      include: [{ model: MarketplaceUser, as: 'user' }],
      order: [['licenseExpirationDate', 'ASC']],
    });
  }

  /**
   * Update broker license information
   */
  async updateLicense(
    brokerId: string,
    licenseNumber: string,
    licenseState: string,
    licenseExpirationDate: Date
  ): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    await profile.update({
      licenseNumber,
      licenseState: licenseState.toUpperCase(),
      licenseExpirationDate,
    });

    return profile;
  }

  /**
   * Update broker information (admin only)
   */
  async updateBroker(
    brokerId: string,
    updateData: Partial<{
      licenseNumber: string;
      licenseState: string;
      licensedStates: string[];
      licenseExpirationDate: string | Date;
      brokerageCompany: string;
      brokerageAddress: string;
      brokeragePhone: string;
      brokerageEmail: string;
      eoInsurancePolicy: string;
      eoExpirationDate: string | Date;
      notes: string;
    }>
  ): Promise<BrokerProfile> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    // Prepare update object
    const updates: Record<string, any> = {};

    if (updateData.licenseNumber) updates.licenseNumber = updateData.licenseNumber;
    if (updateData.licenseState) updates.licenseState = updateData.licenseState.toUpperCase();
    if (updateData.licensedStates) {
      updates.licensedStates = updateData.licensedStates.map((s) => s.toUpperCase());
    }
    if (updateData.licenseExpirationDate) {
      updates.licenseExpirationDate = new Date(updateData.licenseExpirationDate);
    }
    if (updateData.brokerageCompany) updates.brokerageCompany = updateData.brokerageCompany;
    if (updateData.brokerageAddress !== undefined) updates.brokerageAddress = updateData.brokerageAddress;
    if (updateData.brokeragePhone !== undefined) updates.brokeragePhone = updateData.brokeragePhone;
    if (updateData.brokerageEmail !== undefined) updates.brokerageEmail = updateData.brokerageEmail;
    if (updateData.eoInsurancePolicy !== undefined) updates.eoInsurancePolicy = updateData.eoInsurancePolicy;
    if (updateData.eoExpirationDate) {
      updates.eoExpirationDate = new Date(updateData.eoExpirationDate);
    }
    if (updateData.notes !== undefined) updates.notes = updateData.notes;

    await profile.update(updates);

    // Also update the associated contact if licensedStates changed
    if (updateData.licensedStates || updateData.licenseState) {
      try {
        const contact = await Contact.findOne({
          where: {
            userId: profile.userId,
            type: 'broker',
          },
        });
        if (contact) {
          const contactUpdates: Record<string, any> = {};
          if (updateData.licenseState) contactUpdates.licenseState = updateData.licenseState.toUpperCase();
          if (updateData.brokerageCompany) contactUpdates.company = updateData.brokerageCompany;
          if (updateData.brokerageAddress !== undefined) contactUpdates.address = updateData.brokerageAddress;
          if (updateData.brokeragePhone !== undefined) contactUpdates.phone = updateData.brokeragePhone;
          if (updateData.brokerageEmail !== undefined) contactUpdates.email = updateData.brokerageEmail;
          if (updateData.licenseNumber) contactUpdates.licenseNumber = updateData.licenseNumber;
          if (updateData.licenseExpirationDate) {
            contactUpdates.licenseExpiration = new Date(updateData.licenseExpirationDate);
          }
          await contact.update(contactUpdates);
        }
      } catch (error) {
        console.error('Failed to update broker contact:', error);
      }
    }

    return profile;
  }

  /**
   * Get broker statistics
   */
  async getBrokerStats(brokerId: string): Promise<{
    totalDeals: number;
    activeDeals: number;
    daysUntilLicenseExpires: number;
    status: BrokerStatus;
  }> {
    const profile = await BrokerProfile.findByPk(brokerId);
    if (!profile) {
      throw new Error('Broker profile not found');
    }

    return {
      totalDeals: profile.totalDealsSupervised,
      activeDeals: profile.activeDeals,
      daysUntilLicenseExpires: profile.daysUntilLicenseExpiration(),
      status: profile.status,
    };
  }
}

export const brokerService = new BrokerService();
export default brokerService;
