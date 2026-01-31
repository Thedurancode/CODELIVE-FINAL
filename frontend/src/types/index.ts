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

// Contact (CRM)
export type ContactType = 'broker' | 'buyer' | 'seller' | 'wholesaler' | 'attorney' | 're_agent' | 'team_member' | 'other';
export type ContactStatus = 'active' | 'inactive' | 'archived';

export interface Contact {
  id: string;
  organizationId: string;
  createdById?: string | null;
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
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiration?: Date | string;
  linkedUserId?: string;
  metadata?: Record<string, unknown>;
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

// Team Chat (Unified Communication)
export type TeamSenderType = 'team' | 'buyer' | 'guest' | 'system';
export type TeamMessageSource = 'platform' | 'sms' | 'email';
export type TeamDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

export interface TeamConversation {
  id: string;
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
  unreadCount?: number;
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
export type TaskLinkType = 'project' | 'none';

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
  isOverdue?: boolean;
  daysUntilDue?: number | null;
  assignee?: { id: string; email: string; name: string };
  creator?: { id: string; email: string; name: string };
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
export type ProjectStatus = 'in_talks' | 'now_coding' | 'needs_review' | 'completed' | 'cancelled';

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
  isOverdue?: boolean;
  daysUntilDue?: number | null;
  noteCount?: number;
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
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
}

export type TranscriptionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProjectAudioNote {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  audioUrl: string;
  audioStoragePath: string;
  duration: number | null;
  transcript: string | null;
  transcriptionStatus: TranscriptionStatus;
  transcriptionError: string | null;
  transcriptionLanguage?: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
}

export interface ProjectEnvVariable {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name?: string;
    email?: string;
  };
  // Note: value is intentionally NOT included for security
}

// Brand Asset types
export type BrandAssetType = 'logo' | 'icon' | 'banner' | 'favicon' | 'watermark' | 'background' | 'other';
export type BrandAssetVariant = 'default' | 'light' | 'dark' | 'monochrome' | 'colored' | 'transparent';

export interface ProjectBrandAsset {
  id: number;
  projectId: string;
  userId: string;
  organizationId: string;
  name: string;
  description: string | null;
  assetType: BrandAssetType;
  variant: BrandAssetVariant;
  storageUrl: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  author?: {
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
export type ReminderLinkType = 'task' | 'general';
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
  taskId: string | null;
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
  isOverdue?: boolean;
  isDue?: boolean;
  isSnoozed?: boolean;
  minutesUntilDue?: number | null;
  user?: { id: string; email: string; name: string };
  task?: { id: string; title: string; status?: string; dueDate?: string };
}

export interface ReminderFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: ReminderStatus | ReminderStatus[];
  priority?: ReminderPriority | ReminderPriority[];
  linkType?: ReminderLinkType;
  taskId?: string;
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

// Meeting Types
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type MeetingType = 'video' | 'in_person' | 'phone' | 'external_link';
export type RecurrencePattern = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type ParticipantRole = 'host' | 'co_host' | 'presenter' | 'attendee';
export type RsvpStatus = 'pending' | 'accepted' | 'declined' | 'tentative' | 'no_response';
export type AttendanceStatus = 'not_joined' | 'joined' | 'left' | 'no_show';
export type RoomStatus = 'pending' | 'active' | 'ended' | 'failed';

export interface Meeting {
  id: string;
  organizationId: string;
  createdById: string;
  projectId: string | null;
  title: string;
  description: string | null;
  meetingType: MeetingType;
  status: MeetingStatus;
  scheduledAt: string;
  duration: number;
  timezone: string;
  endedAt: string | null;
  location: string | null;
  externalLink: string | null;
  videoRoomId: string | null;
  recurrence: RecurrencePattern;
  recurrenceRule: string | null;
  recurrenceEndDate: string | null;
  parentMeetingId: string | null;
  reminderSent: boolean;
  reminderMinutesBefore: number;
  notes: string | null;
  agenda: string | null;
  recordingUrl: string | null;
  transcriptUrl: string | null;
  calendarEventId: string | null;
  calendarProvider: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; name?: string; email?: string };
  project?: { id: string; title: string };
  participants?: MeetingParticipant[];
  room?: MeetingRoom;
}

export interface MeetingParticipant {
  id: number;
  meetingId: string;
  organizationId: string;
  userId: string | null;
  contactId: string | null;
  email: string;
  name: string;
  phone: string | null;
  role: ParticipantRole;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  invitedAt: string;
  respondedAt: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  emailInviteSent: boolean;
  emailReminderSent: boolean;
  canShareScreen: boolean;
  canUnmute: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name?: string; email?: string; avatar?: string };
  contact?: { id: string; name: string; email?: string; phone?: string };
}

export interface MeetingRoom {
  id: string;
  meetingId: string;
  organizationId: string;
  roomName: string;
  roomSid: string | null;
  status: RoomStatus;
  startedAt: string | null;
  endedAt: string | null;
  maxParticipants: number;
  currentParticipants: number;
  totalParticipantsJoined: number;
  recordingEnabled: boolean;
  recordingStartedAt: string | null;
  recordingUrl: string | null;
  recordingDuration: number | null;
  backgroundUrl: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
  waitingRoomEnabled: boolean;
  chatEnabled: boolean;
  screenShareEnabled: boolean;
  participantVideoEnabled: boolean;
  participantAudioEnabled: boolean;
  provider: string;
  providerMetadata: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: MeetingStatus | MeetingStatus[];
  meetingType?: MeetingType | MeetingType[];
  projectId?: string;
  upcoming?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  meetingType?: MeetingType;
  scheduledAt: string;
  duration?: number;
  timezone?: string;
  projectId?: string;
  location?: string;
  externalLink?: string;
  recurrence?: RecurrencePattern;
  recurrenceRule?: string;
  recurrenceEndDate?: string;
  reminderMinutesBefore?: number;
  agenda?: string;
  tags?: string[];
  participants?: Array<{
    email: string;
    name: string;
    userId?: string;
    contactId?: string;
    role?: ParticipantRole;
    phone?: string;
  }>;
  roomSettings?: {
    recordingEnabled?: boolean;
    waitingRoomEnabled?: boolean;
    maxParticipants?: number;
    backgroundUrl?: string;
    logoUrl?: string;
    welcomeMessage?: string;
  };
}

export interface UpdateMeetingInput {
  title?: string;
  description?: string;
  meetingType?: MeetingType;
  status?: MeetingStatus;
  scheduledAt?: string;
  duration?: number;
  timezone?: string;
  projectId?: string | null;
  location?: string;
  externalLink?: string;
  recurrence?: RecurrencePattern;
  recurrenceRule?: string;
  recurrenceEndDate?: string;
  reminderMinutesBefore?: number;
  agenda?: string;
  notes?: string;
  tags?: string[];
}

export interface MeetingRoomToken {
  token: string;
  roomName: string;
  roomUrl: string;
  participantName: string;
  participantId: string;
}
