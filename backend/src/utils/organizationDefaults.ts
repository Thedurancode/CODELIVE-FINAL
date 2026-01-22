import MarketplaceUser from '../models/MarketplaceUser';
import Organization from '../models/Organization';

type OrganizationSettings = {
  defaultCommunicationUserId?: string;
};

function extractDefaultCommunicationUserId(
  settings: Record<string, unknown> | null | undefined
): string | null {
  const value = (settings as OrganizationSettings | null | undefined)?.defaultCommunicationUserId;
  if (!value || typeof value !== 'string') return null;
  return value.trim() ? value.trim() : null;
}

export async function getDefaultOrganizationId(): Promise<string | null> {
  const organization = await Organization.findOne({
    where: { status: 'active' },
    order: [['createdAt', 'ASC']],
    attributes: ['id'],
  });

  return organization?.id || null;
}

export async function getOrganizationIdForUserId(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await MarketplaceUser.findByPk(userId, { attributes: ['organizationId'] });
  return user?.organizationId || null;
}

export async function getDefaultCommunicationUserId(
  organizationId?: string | null
): Promise<string | null> {
  let organization: Organization | null = null;

  if (organizationId) {
    organization = await Organization.findByPk(organizationId, {
      attributes: ['id', 'settings'],
    });
  }

  if (!organization) {
    organization = await Organization.findOne({
      where: { status: 'active' },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'settings'],
    });
  }

  return extractDefaultCommunicationUserId(organization?.settings);
}

export async function resolveCommunicationContext(options: {
  userId?: string | null;
  organizationId?: string | null;
}): Promise<{ userId: string | null; organizationId: string | null }> {
  let organizationId = options.organizationId ?? null;
  if (!organizationId && options.userId) {
    organizationId = await getOrganizationIdForUserId(options.userId);
  }
  if (!organizationId) {
    organizationId = await getDefaultOrganizationId();
  }

  let userId = options.userId ?? null;
  if (!userId) {
    userId = await getDefaultCommunicationUserId(organizationId);
  }

  return { userId, organizationId };
}
