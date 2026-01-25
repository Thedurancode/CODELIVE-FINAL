// Property (Deal)
export interface PropertyAddress {
  houseNumber: string;
  street: string;
  address2?: string;
}

// Property (Deal)
export interface Property {
  id: string;
  propertyId?: string;
  address: PropertyAddress;
  city: string;
  state: string;
  zip: string;
  county?: string;
  propertyType?: string;
  propertyOwnership?: string;
  askingPrice?: number;
  arv?: number;
  repairEstimate?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  fullBathrooms?: number;
  partialBathrooms?: number;
  livingSpaceSqFt?: number;
  lotSizeSqFt?: number;
  yearBuilt?: number;
  occupancyStatus?: 'vacant' | 'occupied' | 'tenant' | 'unknown';
  deliveredVacant?: boolean;
  photos?: string[];
  description?: string;
  status?: 'new' | 'enriched' | 'scored' | 'submitted' | 'accepted' | 'rejected';
  approvalStatus?: 'draft' | 'pending_broker_approval' | 'approved' | 'rejected' | 'live';
  wholesalerName?: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;
  zestimate?: number;
  rentZestimate?: number;
  createdAt?: string;
  updatedAt?: string;
  // Additional fields
  liveOnHubzu?: boolean;
  stories?: number;
  garage?: string;
  garageCount?: number;
  pool?: boolean;
  solar?: boolean;
  septic?: boolean;
  well?: boolean;
  occupancyDetails?: string;
  monthlyRent?: number;
  accessToProperty?: string;
  lockboxCode?: string;
  reservePrice?: number;
  buyItNowPrice?: number;
  startingBidAmount?: number;
  purchaseContractPrice?: number;
  renovationBudget?: number;
  rehabCost?: number;
  bpoValue1?: number;
  bpoValue1Date?: string;
  bpoValue2?: number;
  bpoValue2Date?: string;
  appraisalValue?: number;
  appraisalDate?: string;
  commissionPercentage?: number;
  syndication?: string[];
  listedOnMLS?: boolean;
  mlsListingPrice?: number;
  mlsNumber?: string;
  mlsListedDate?: string;
  mlsExpirationDate?: string;
  mlsEligible?: boolean;
  onMarketOffMarket?: string;
  photosFolder?: string;
  propertyListingDescription?: string;
  hoa?: boolean;
  hoaBillingFrequency?: string;
  hoaDuesAmount?: number;
  condition?: string;
  roof?: string;
  sewer?: string;
  electric?: string;
  water?: string;
  foundationType?: string;
  typeOfRehab?: string;
  waterHeater?: string;
  hvac?: string;
  knownMaterialDefects?: string;
  propertyContracts?: string;
  wholesalerLlcName?: string;
  llcOwnerName?: string;
  llcBusinessAddress?: string;
  llcOwnerEmail?: string;
  purchaseContractExpiration?: string;
  agentFirstName?: string;
  agentLastName?: string;
  agentEmail?: string;
  agentPhoneNumber?: string;
  agentLicenseNumber?: string;
  licensedState?: string;
  agentAddress?: string;
  agentCity?: string;
  agentState?: string;
  agentZip?: string;
  brokerCompany?: string;
  brokerLicenseNumber?: string;
  managingBroker?: string;
  managingBrokerLicenseNumber?: string;
  assignable?: boolean;
  marketingClauseFound?: boolean;
  brokerOnFile?: boolean;
  conveyanceType?: string;
  complianceStatus?: 'Green' | 'Yellow' | 'Red';
  complianceNotes?: string[];
  financeable?: boolean;
  ownItNowAllowedAuction?: boolean;
  ownItNowAllowedPreAuction?: boolean;
  listingHistory?: Array<{
    siteId: string;
    siteName: string;
    submittedAt: string;
    confirmationNumber?: string;
    status: 'pending' | 'active' | 'expired' | 'removed';
    listingUrl?: string;
    expiresAt?: string;
  }>;
  currentListings?: string[];
  lastSubmittedAt?: string;
  lastSubmittedTo?: string;
  ownerHistory?: Array<{
    ownerName: string;
    ownerEmail?: string;
    ownerCompany?: string;
    startDate: string;
    endDate?: string;
    source: string;
  }>;
  tags?: string[];
  externalId?: string;
  zpid?: string;
  zestimateRangeLow?: number;
  zestimateRangeHigh?: number;
  lastSoldPrice?: number;
  lastSoldDate?: string;
  taxAssessedValue?: number;
  ownerName?: string;
  ownerPhones?: string[];
  ownerEmails?: string[];
  ownerMailingAddress?: string;
  comparablesCount?: number;
  comparablesAvgPrice?: number;
  marketDataEnrichment?: object;
  enrichedAt?: string;
  enrichmentSource?: string;
  imageEmbedding?: number[];
  imageAnalysis?: {
    overallCondition: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    features: string[];
    concerns: string[];
    description: string;
    qualityScore: number;
  };
  imageAnalyzedAt?: string;
  documentStatus?: Record<string, object>;
  photoLinks?: string[];
  // Processing state fields (matches backend DealProcessingState enum - lowercase values)
  processingState?: 'created' | 'compliance_pending' | 'compliance_passed' | 'compliance_failed' | 'scoring' | 'scored' | 'approval_pending' | 'active' | 'rejected' | 'blocked';
  processingStateUpdatedAt?: string;
  pricePerSqft?: number;
  neighborhoodMedianPrice?: number;
  cityMedianPrice?: number;
  // Computed fields from API (aggregated data)
  _offerCount?: number;
  _hasUnreadMessages?: boolean;
  _unreadMessageCount?: number;
}

// Buy Box
export interface HedgeFundBuyBox {
  id: string;
  name: string;
  fundName: string;
  fundType?: string;
  contactEmail?: string;
  contactPhone?: string;
  enabled: boolean;
  priority: number;
  autoSubmit: boolean;
  autoSubmitThreshold: number;
  criteria: BuyBoxCriteria;
  scoringWeights?: ScoringWeights;
  marketContacts?: MarketContact[];
  createdAt: string;
  updatedAt: string;
}

export interface BuyBoxCriteria {
  states?: string[];
  counties?: string[];
  cities?: string[];
  zipCodes?: string[];
  minPrice?: number;
  maxPrice?: number;
  minARV?: number;
  maxARV?: number;
  minGrossYield?: number;
  propertyTypes?: string[];
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minSqft?: number;
  maxSqft?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;
  minGarages?: number;
  allowPool?: boolean;
  allowSeptic?: boolean;
  allowFloodZone?: boolean;
  allowMainRoad?: boolean;
  allowFoundationIssues?: boolean;
  allowFireDamage?: boolean;
  allowHoa?: boolean;
  allowWell?: boolean;
  allowSolarPanels?: boolean;
  allowCodeViolations?: boolean;
  investmentStrategies?: string[];
  conditions?: string[];
  hardNos?: string;
  marketPrices?: Record<string, { maxPrice?: number; grossYield?: number }>;
}

export interface ScoringWeights {
  geographic?: number;
  price?: number;
  propertyType?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  yearBuilt?: number;
  occupancy?: number;
  hoa?: number;
  photos?: number;
}

export interface MarketContact {
  name: string;
  email: string;
  phone?: string;
  markets: string[];
}

// Scoring
export interface ScoringResult {
  buyBoxId: string;
  buyBoxName: string;
  fundName: string;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  matchType: 'strong' | 'moderate' | 'weak' | 'no_match';
  passedHardRequirements: boolean;
  failedHardRequirements: string[];
  breakdown: ScoreBreakdown[];
  recommendation: string;
  autoSubmitEligible: boolean;
  marketContact?: MarketContact;
}

export interface ScoreBreakdown {
  criterion: string;
  weight: number;
  maxPoints: number;
  earnedPoints: number;
  passed: boolean;
  details: string;
}

// Pipeline stages (must match backend PIPELINE_STAGES)
export type PipelineStage =
  | 'new'
  | 'analyzing'
  | 'due_diligence'
  | 'offered'
  | 'negotiating'
  | 'under_contract'
  | 'closed_won'
  | 'closed_lost';

export interface DealPipeline {
  id: string;
  propertyId: string;
  userId: string;
  stage: PipelineStage;
  notes?: string;
  property?: Property;
  bestScore?: number;
  daysInStage?: number;
  targetFund?: string;
  createdAt: string;
  updatedAt: string;
}

// Chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
  result?: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Analytics
export interface DealAnalytics {
  total: number;
  byStatus: Record<string, number>;
  byState: Record<string, number>;
  byMonth: { month: string; count: number }[];
  avgPrice: number;
  avgScore: number;
  // Additional fields
  byPropertyType?: Record<string, number>;
  byPriceRange?: Record<string, number>;
  topMarkets?: { market: string; count: number; avgPrice: number }[];
}

// API Response
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filters
export interface PropertyFilters {
  search?: string;
  state?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  maxBaths?: number;
  propertyType?: string;
  status?: string;
  approvalStatus?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

// Contact (CRM)
export type ContactType = 'broker' | 'buyer' | 'seller' | 'wholesaler' | 'attorney' | 're_agent' | 'team_member' | 'other';
export type ContactStatus = 'active' | 'inactive' | 'archived';

export interface Contact {
  id: string;
  organizationId: string; // Team/organization that owns this contact
  createdById?: string | null; // User who created this contact (nullable)
  type: ContactType;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  tags: string[];
  status: ContactStatus;
  // License info for brokers/agents
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiration?: Date | string;
  // Link to MarketplaceUser if this contact is a platform user
  linkedUserId?: string;
  metadata?: Record<string, unknown>;
  // Populated by backend when fetching contacts
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactFilters {
  search?: string;
  type?: ContactType;
  status?: ContactStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

// Property Contact (Deal-Contact Assignment)
export type ContactRole = 'agent' | 'broker' | 'seller' | 'wholesaler' | 'attorney' | 're_agent' | 'buyer' | 'team_member' | 'other';

export interface PropertyContactProperty {
  id: string;
  address: PropertyAddress;
  city: string;
  state: string;
  zip: string;
  county?: string;
  purchaseContractPrice?: number;
  arv?: number;
  propertyType?: string;
  bedroomCount?: number;
  bathroomCount?: number;
  livingSpaceSqFt?: number;
  status?: string;
  photoLinks?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PropertyContact {
  id: string;
  propertyId: string;
  contactId: string;
  role: ContactRole;
  isPrimary: boolean;
  notes?: string;
  contact?: Contact;
  property?: PropertyContactProperty;
  createdAt: string;
  updatedAt: string;
}

// Buyer (Cash Buyer for Property Matching)
export type BuyerStatus = 'active' | 'inactive' | 'archived';

export interface BuyerPhoneEntry {
  number: string;
  type?: string;
  lastReported?: string;
}

export interface BuyerContact {
  id: string;
  buyerId: string;
  personIndex: number;
  firstName?: string;
  lastName?: string;
  phones: BuyerPhoneEntry[];
  emails: string[];
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Buyer {
  id: string;
  name: string;
  company?: string;
  // Buyer's mailing address
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  // Counties where buyer purchases properties
  buyingCounties: string[];
  buyingState: string;
  purchases6Month: number;
  status: BuyerStatus;
  notes?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  isHot?: boolean;
  isHotPotential?: boolean;
  contacts?: BuyerContact[];
  createdAt: string;
  updatedAt: string;
}

export interface MatchedBuyer {
  id: string;
  name: string;
  buyingCounties: string[];
  buyingState: string;
  zip?: string;
  purchases6Month: number;
  matchType: 'zipcode' | 'county';
  isHotPotential: boolean;
  priority: number;
  contacts: BuyerContact[];
}

export interface BuyerFilters {
  search?: string;
  county?: string;
  state?: string;
  zip?: string;
  status?: BuyerStatus;
  hotOnly?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface BuyerStats {
  total: number;
  hotBuyers: number;
  regularBuyers: number;
  countiesCovered: number;
  topCounties: string[];
}

// Property Inquiry (Buyer-Seller Communication)
export type InquiryStatus = 'pending' | 'answered' | 'expired' | 'cancelled';
export type InquiryPriority = 'low' | 'normal' | 'high' | 'urgent';
export type InquiryCategory =
  | 'seller_motivation'
  | 'property_condition'
  | 'property_history'
  | 'closing_terms'
  | 'inclusions'
  | 'pricing'
  | 'other';

export interface PropertyInquiry {
  id: number;
  propertyId: number;
  buyerId: string;
  sessionId: string;
  question: string;
  category: InquiryCategory;
  context?: Record<string, unknown>;
  priority: InquiryPriority;
  status: InquiryStatus;
  sellerResponse?: string;
  answeredAt?: string;
  answeredBy?: string;
  answeredByRole?: 'seller' | 'admin' | 'broker';
  notifiedBuyer: boolean;
  notifiedAt?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // Populated relations
  property?: Property;
  buyer?: { id: string; email?: string; name?: string };
}

export interface InquiryFilters {
  status?: InquiryStatus;
  propertyId?: number;
  buyerId?: string;
  category?: InquiryCategory;
  priority?: InquiryPriority;
  page?: number;
  limit?: number;
}

export interface InquiryStats {
  total: number;
  pending: number;
  answered: number;
  expired: number;
  avgResponseTime: number;
  byCategory: Record<InquiryCategory, number>;
}

// Team Chat (Unified Communication)
export type TeamSenderType = 'team' | 'buyer' | 'guest' | 'system';
export type TeamMessageSource = 'platform' | 'sms' | 'email';
export type TeamDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

export interface TeamConversationPropertyPreview {
  id: number;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  propertyType?: string;
  askingPrice?: number;
  arv?: number;
  bedroomCount?: number;
  bathroomCount?: number;
  livingSpaceSqFt?: number;
  yearBuilt?: number;
  status?: string;
  photoLinks?: string[];
}

export interface TeamConversation {
  id: string;
  propertyId: number | null;
  propertyAddress: string | null;
  propertyImage?: string | null;
  propertyPreview?: TeamConversationPropertyPreview | null;
  title: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  lastMessageSource?: TeamMessageSource;
  participantIds: string[];
  unreadCounts: Record<string, number>;
  isArchived: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // Computed
  unreadCount?: number;
  // Relations
  property?: Property;
}

export interface TeamMessageAttachment {
  filename: string;
  contentType: string;
  size: number;
  url?: string;
}

export interface TeamMessageReadReceipt {
  userId: string;
  readAt: string;
}

export interface TeamMessageDeliveryReceipt {
  userId: string;
  deliveredAt: string;
}

export interface TeamMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderType: TeamSenderType;
  senderName: string;
  senderAvatar?: string | null;
  senderPhone: string | null;
  senderEmail: string | null;
  source: TeamMessageSource;
  content: string;
  contentHtml: string | null;
  attachments: TeamMessageAttachment[];
  mentions: string[];
  isEdited: boolean;
  editedAt: string | null;
  readBy: TeamMessageReadReceipt[];
  deliveredTo?: TeamMessageDeliveryReceipt[];
  deliveryStatus: TeamDeliveryStatus;
  externalMessageId: string | null;
  replyToMessageId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // Relations
  sender?: MarketplaceUser;
}

export interface TeamChatFilters {
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface TeamMessageFilters {
  before?: string;
  after?: string;
  limit?: number;
  offset?: number;
}

export interface TeamChatStats {
  totalConversations: number;
  totalMessages: number;
  messagesBySource: Record<TeamMessageSource, number>;
}

// Team Chat WebSocket Events
export interface TeamChatWebSocketEvent {
  type: 'team_message' | 'typing_start' | 'typing_stop' | 'message_read' | 'conversation_created' | 'unread_count';
  conversationId?: string;
  message?: TeamMessage;
  userId?: string;
  userName?: string;
  count?: number;
  totalCount?: number;
  conversation?: TeamConversation;
}

// Marketplace User (for team chat mentions)
export interface MarketplaceUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company?: string;
  phone?: string;
  avatar?: string;
}

// Task Management Types
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskLinkType = 'deal' | 'buyer' | 'compliance' | 'project' | 'none';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  assignedTo: string | null;
  assignedBy: string | null;
  organizationId: string | null;
  linkType: TaskLinkType;
  propertyId: number | null;
  buyerId: string | null;
  complianceCheckId: number | null;
  projectId: string | null;
  dependsOn: string[];
  blockedBy: string[];
  isRecurring: boolean;
  recurrencePattern: string | null;
  parentTaskId: string | null;
  createdBy: string | null;
  completedBy: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Computed fields
  isOverdue?: boolean;
  daysUntilDue?: number | null;
  // Populated relations
  assignee?: { id: string; email: string; name: string };
  creator?: { id: string; email: string; name: string };
  property?: { id: string; propertyId?: string; address?: PropertyAddress; city?: string; state?: string; zip?: string };
  buyer?: { id: string; name: string; buyingState?: string };
}

export interface TaskFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assignedTo?: string;
  createdBy?: string;
  linkType?: TaskLinkType;
  propertyId?: number;
  buyerId?: string;
  complianceCheckId?: number;
  projectId?: string;
  dueBefore?: string;
  dueAfter?: string;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  includeOverdue?: boolean;
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  cancelled: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  byPriority: Record<TaskPriority, number>;
  byLinkType: Record<TaskLinkType, number>;
}

// Project Management Types
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived' | 'cancelled';

export interface Project {
  id: string;
  title: string;
  description: string | null;
  logoUrl: string | null;
  githubUrl: string | null;
  deploymentUrl: string | null;
  status: ProjectStatus;
  organizationId: string;
  createdById: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  actualEndDate: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Computed fields
  isOverdue?: boolean;
  daysUntilDue?: number | null;
  noteCount?: number;
  // Populated relations
  createdBy?: { id: string; name?: string; email?: string };
  contacts?: ProjectContact[];
  tasks?: Task[];
}

export type GitHubInviteStatus = 'none' | 'pending' | 'accepted' | 'declined' | 'failed';

export interface ProjectContact {
  id: number;
  projectId: string;
  contactId: string;
  role: string | null;
  isPrimary: boolean;
  addedById: string | null;
  notes: string | null;
  githubInviteStatus: GitHubInviteStatus;
  githubInviteId: number | null;
  githubInvitedAt: string | null;
  githubInviteError: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated relations
  contact?: Contact;
  project?: Project;
  addedBy?: { id: string; name?: string; email?: string };
}

export interface ProjectNote {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  content: string;
  subject?: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
  // Alias for author to support different naming conventions
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
}

export interface ProjectFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus | ProjectStatus[];
  tags?: string[];
  createdById?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ProjectStats {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  recentlyActive: number;
  overdue: number;
  withTasks: number;
  withContacts: number;
}

// Team Member Types (Organization members for selection)
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  role?: string;
  isOnline?: boolean;
  onlineStatus?: string;
}

// Project Member Types (Team members assigned to a project)
export type ProjectRole = 'owner' | 'lead' | 'developer' | 'designer' | 'manager' | 'contributor' | 'viewer';

export interface ProjectMember {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  projectRole: ProjectRole;
  assignedAt: string;
  assignedBy?: string;
  isActive: boolean;
  githubUsername?: string;
  githubInvited: boolean;
  githubInvitedAt?: string;
  notifyOnTask: boolean;
  notifyOnNote: boolean;
  notifyOnStatusChange: boolean;
  notifyOnMention: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  user?: TeamMember;
  project?: Project;
  assigner?: { id: string; name?: string };
}

// Reminder Types
export type ReminderStatus = 'pending' | 'sent' | 'acknowledged' | 'snoozed' | 'cancelled';
export type ReminderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ReminderLinkType = 'deal' | 'task' | 'buyer' | 'contract' | 'compliance' | 'general';
export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Reminder {
  id: string;
  title: string;
  description: string | null;
  reminderTime: string;
  recurrence: ReminderRecurrence;
  recurrencePattern: string | null;
  timezone: string;
  status: ReminderStatus;
  priority: ReminderPriority;
  snoozedUntil: string | null;
  snoozeCount: number;
  userId: string;
  organizationId: string | null;
  linkType: ReminderLinkType;
  propertyId: number | null;
  taskId: string | null;
  buyerId: string | null;
  contractId: string | null;
  complianceCheckId: number | null;
  notificationSent: boolean;
  notificationSentAt: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  parentReminderId: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed fields
  isOverdue?: boolean;
  isDue?: boolean;
  isSnoozed?: boolean;
  minutesUntilDue?: number | null;
  // Populated relations
  user?: { id: string; email: string; name: string };
  property?: { id: string; propertyId?: string; address?: PropertyAddress; city?: string; state?: string; zip?: string };
  task?: { id: string; title: string; status?: string; dueDate?: string };
  buyer?: { id: string; name: string; buyingState?: string };
}

export interface ReminderFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ReminderStatus | ReminderStatus[];
  priority?: ReminderPriority | ReminderPriority[];
  linkType?: ReminderLinkType;
  propertyId?: number;
  taskId?: string;
  buyerId?: string;
  reminderBefore?: string;
  reminderAfter?: string;
  tags?: string[];
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  includeOverdue?: boolean;
}

export interface ReminderStats {
  total: number;
  pending: number;
  sent: number;
  acknowledged: number;
  snoozed: number;
  cancelled: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  byPriority: Record<ReminderPriority, number>;
  byLinkType: Record<ReminderLinkType, number>;
}
