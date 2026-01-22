/**
 * ReminderService Unit Tests
 */

import { reminderService } from '../../services/ReminderService';
import Reminder from '../../models/Reminder';
import Task from '../../models/Task';
import Property from '../../models/Property';
import MarketplaceUser from '../../models/MarketplaceUser';

// Mock the models
jest.mock('../../models/Reminder');
jest.mock('../../models/Task');
jest.mock('../../models/Property');
jest.mock('../../models/MarketplaceUser');

const MockReminder = Reminder as jest.Mocked<typeof Reminder>;

describe('ReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CREATE REMINDER TESTS
  // ============================================================================

  describe('createReminder', () => {
    it('should create a reminder with minimal data', async () => {
      const remindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-123',
        title: 'Test Reminder',
        remindAt,
        status: 'pending',
        priority: 'normal',
        linkType: 'none',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (MockReminder.create as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.createReminder({
        title: 'Test Reminder',
        remindAt,
        userId: 'user-1',
      });

      expect(result).toEqual(mockReminder);
      expect(MockReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Reminder',
          remindAt: expect.any(Date),
          status: 'pending',
          priority: 'normal',
          userId: 'user-1',
        }),
        expect.any(Object)
      );
    });

    it('should create a reminder with all fields', async () => {
      const remindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-456',
        title: 'Complete Reminder',
        description: 'Reminder description',
        remindAt,
        status: 'pending',
        priority: 'high',
        linkType: 'deal',
        propertyId: 123,
        userId: 'user-1',
        recurrence: 'daily',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (MockReminder.create as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.createReminder({
        title: 'Complete Reminder',
        description: 'Reminder description',
        remindAt,
        priority: 'high',
        propertyId: 123,
        userId: 'user-1',
        recurrence: 'daily',
      });

      expect(result).toEqual(mockReminder);
      expect(MockReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Complete Reminder',
          description: 'Reminder description',
          priority: 'high',
          linkType: 'deal',
          propertyId: 123,
        }),
        expect.any(Object)
      );
    });

    it('should auto-set linkType to deal when propertyId is provided', async () => {
      const remindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-789',
        title: 'Deal Reminder',
        linkType: 'deal',
        propertyId: 456,
      };

      (MockReminder.create as jest.Mock).mockResolvedValue(mockReminder);

      await reminderService.createReminder({
        title: 'Deal Reminder',
        remindAt,
        propertyId: 456,
        userId: 'user-1',
      });

      expect(MockReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkType: 'deal',
          propertyId: 456,
        }),
        expect.any(Object)
      );
    });

    it('should auto-set linkType to task when taskId is provided', async () => {
      const remindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-abc',
        title: 'Task Reminder',
        linkType: 'task',
        taskId: 'task-123',
      };

      (MockReminder.create as jest.Mock).mockResolvedValue(mockReminder);

      await reminderService.createReminder({
        title: 'Task Reminder',
        remindAt,
        taskId: 'task-123',
        userId: 'user-1',
      });

      expect(MockReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkType: 'task',
          taskId: 'task-123',
        }),
        expect.any(Object)
      );
    });

    it('should auto-set linkType to buyer when buyerId is provided', async () => {
      const remindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-def',
        title: 'Buyer Reminder',
        linkType: 'buyer',
        buyerId: 'buyer-123',
      };

      (MockReminder.create as jest.Mock).mockResolvedValue(mockReminder);

      await reminderService.createReminder({
        title: 'Buyer Reminder',
        remindAt,
        buyerId: 'buyer-123',
        userId: 'user-1',
      });

      expect(MockReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkType: 'buyer',
          buyerId: 'buyer-123',
        }),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // UPDATE REMINDER TESTS
  // ============================================================================

  describe('updateReminder', () => {
    it('should update a reminder', async () => {
      const mockReminder = {
        id: 'reminder-123',
        title: 'Updated Reminder',
        status: 'pending',
        update: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };

      (MockReminder.findByPk as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.updateReminder('reminder-123', {
        title: 'Updated Reminder',
      });

      expect(result).toBeTruthy();
      expect(MockReminder.findByPk).toHaveBeenCalledWith('reminder-123');
    });

    it('should return null if reminder not found', async () => {
      (MockReminder.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await reminderService.updateReminder('nonexistent', {
        title: 'Updated',
      });

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // DELETE REMINDER TESTS
  // ============================================================================

  describe('deleteReminder', () => {
    it('should delete a reminder', async () => {
      const mockReminder = {
        id: 'reminder-123',
        destroy: jest.fn().mockResolvedValue(true),
      };

      (MockReminder.findByPk as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.deleteReminder('reminder-123');

      expect(result).toBe(true);
      expect(mockReminder.destroy).toHaveBeenCalled();
    });

    it('should return false if reminder not found', async () => {
      (MockReminder.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await reminderService.deleteReminder('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // GET REMINDERS TESTS
  // ============================================================================

  describe('getReminders', () => {
    it('should return paginated reminders', async () => {
      const mockReminders = [
        { id: 'reminder-1', title: 'Reminder 1' },
        { id: 'reminder-2', title: 'Reminder 2' },
      ];

      (MockReminder.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockReminders,
        count: 2,
      });

      const result = await reminderService.getReminders({ page: 1, limit: 10 });

      expect(result.reminders).toEqual(mockReminders);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should filter by status', async () => {
      (MockReminder.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await reminderService.getReminders({ status: 'pending' });

      expect(MockReminder.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'pending',
          }),
        })
      );
    });

    it('should filter by priority', async () => {
      (MockReminder.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await reminderService.getReminders({ priority: 'high' });

      expect(MockReminder.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: 'high',
          }),
        })
      );
    });

    it('should filter by userId', async () => {
      (MockReminder.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await reminderService.getReminders({ userId: 'user-123' });

      expect(MockReminder.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
          }),
        })
      );
    });
  });

  // ============================================================================
  // SNOOZE REMINDER TESTS
  // ============================================================================

  describe('snoozeReminder', () => {
    it('should snooze a reminder for specified duration', async () => {
      const originalRemindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-123',
        status: 'pending',
        remindAt: originalRemindAt,
        snoozeCount: 0,
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockReminder.findByPk as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.snoozeReminder('reminder-123', 30); // 30 minutes

      expect(result).toBeTruthy();
      expect(mockReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'snoozed',
          snoozeCount: 1,
        })
      );
    });

    it('should return null if reminder not found', async () => {
      (MockReminder.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await reminderService.snoozeReminder('nonexistent', 30);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // ACKNOWLEDGE REMINDER TESTS
  // ============================================================================

  describe('acknowledgeReminder', () => {
    it('should mark a reminder as acknowledged', async () => {
      const mockReminder = {
        id: 'reminder-123',
        status: 'sent',
        acknowledgedAt: null,
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockReminder.findByPk as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.acknowledgeReminder('reminder-123');

      expect(result).toBeTruthy();
      expect(mockReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'acknowledged',
        })
      );
    });

    it('should return null if reminder not found', async () => {
      (MockReminder.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await reminderService.acknowledgeReminder('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // CANCEL REMINDER TESTS
  // ============================================================================

  describe('cancelReminder', () => {
    it('should mark a reminder as cancelled', async () => {
      const mockReminder = {
        id: 'reminder-123',
        status: 'pending',
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockReminder.findByPk as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.cancelReminder('reminder-123');

      expect(result).toBeTruthy();
      expect(mockReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
        })
      );
    });
  });

  // ============================================================================
  // REMINDER STATS TESTS
  // ============================================================================

  describe('getReminderStats', () => {
    it('should return reminder statistics', async () => {
      (MockReminder.count as jest.Mock)
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(2) // sent
        .mockResolvedValueOnce(4) // acknowledged
        .mockResolvedValueOnce(0) // snoozed
        .mockResolvedValueOnce(1) // cancelled
        .mockResolvedValueOnce(2) // dueToday
        .mockResolvedValueOnce(5); // upcoming

      const result = await reminderService.getReminderStats({});

      expect(result.total).toBe(10);
      expect(result.pending).toBe(3);
      expect(result.sent).toBe(2);
      expect(result.acknowledged).toBe(4);
      expect(result.cancelled).toBe(1);
    });
  });

  // ============================================================================
  // GET REMINDERS BY DEAL TESTS
  // ============================================================================

  describe('getRemindersByDeal', () => {
    it('should return reminders for a specific deal', async () => {
      const mockReminders = [
        { id: 'reminder-1', propertyId: 123, linkType: 'deal' },
        { id: 'reminder-2', propertyId: 123, linkType: 'deal' },
      ];

      (MockReminder.findAll as jest.Mock).mockResolvedValue(mockReminders);

      const result = await reminderService.getRemindersByDeal(123);

      expect(result).toEqual(mockReminders);
      expect(MockReminder.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            propertyId: 123,
          }),
        })
      );
    });
  });

  // ============================================================================
  // GET REMINDERS BY TASK TESTS
  // ============================================================================

  describe('getRemindersByTask', () => {
    it('should return reminders for a specific task', async () => {
      const mockReminders = [
        { id: 'reminder-1', taskId: 'task-123', linkType: 'task' },
      ];

      (MockReminder.findAll as jest.Mock).mockResolvedValue(mockReminders);

      const result = await reminderService.getRemindersByTask('task-123');

      expect(result).toEqual(mockReminders);
      expect(MockReminder.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            taskId: 'task-123',
          }),
        })
      );
    });
  });

  // ============================================================================
  // GET UPCOMING REMINDERS TESTS
  // ============================================================================

  describe('getUpcomingReminders', () => {
    it('should return upcoming reminders for a user', async () => {
      const mockReminders = [
        { id: 'reminder-1', userId: 'user-1', remindAt: new Date() },
        { id: 'reminder-2', userId: 'user-1', remindAt: new Date() },
      ];

      (MockReminder.findAll as jest.Mock).mockResolvedValue(mockReminders);

      const result = await reminderService.getUpcomingReminders('user-1', 24); // Next 24 hours

      expect(result).toEqual(mockReminders);
      expect(MockReminder.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
          }),
        })
      );
    });
  });

  // ============================================================================
  // GET DUE REMINDERS TESTS
  // ============================================================================

  describe('getDueReminders', () => {
    it('should return reminders that are due', async () => {
      const mockReminders = [
        { id: 'reminder-1', status: 'pending', remindAt: new Date() },
      ];

      (MockReminder.findAll as jest.Mock).mockResolvedValue(mockReminders);

      const result = await reminderService.getDueReminders();

      expect(result).toEqual(mockReminders);
      expect(MockReminder.findAll).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // RECURRING REMINDER TESTS
  // ============================================================================

  describe('createRecurringReminder', () => {
    it('should create a reminder with recurrence pattern', async () => {
      const remindAt = new Date('2025-01-20T10:00:00Z');
      const mockReminder = {
        id: 'reminder-recurring',
        title: 'Daily Reminder',
        remindAt,
        isRecurring: true,
        recurrence: 'daily',
        recurrenceEndDate: new Date('2025-12-31'),
      };

      (MockReminder.create as jest.Mock).mockResolvedValue(mockReminder);

      const result = await reminderService.createReminder({
        title: 'Daily Reminder',
        remindAt,
        userId: 'user-1',
        isRecurring: true,
        recurrence: 'daily',
        recurrenceEndDate: new Date('2025-12-31'),
      });

      expect(result).toEqual(mockReminder);
      expect(MockReminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isRecurring: true,
          recurrence: 'daily',
        }),
        expect.any(Object)
      );
    });
  });
});
