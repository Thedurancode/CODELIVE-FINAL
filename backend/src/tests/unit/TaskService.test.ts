/**
 * TaskService Unit Tests
 */

import { taskService } from '../../services/TaskService';
import Task from '../../models/Task';
import Property from '../../models/Property';
import Buyer from '../../models/Buyer';
import MarketplaceUser from '../../models/MarketplaceUser';

// Mock the models
jest.mock('../../models/Task');
jest.mock('../../models/Property');
jest.mock('../../models/Buyer');
jest.mock('../../models/MarketplaceUser');

const MockTask = Task as jest.Mocked<typeof Task>;

describe('TaskService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CREATE TASK TESTS
  // ============================================================================

  describe('createTask', () => {
    it('should create a task with minimal data', async () => {
      const mockTask = {
        id: 'task-123',
        title: 'Test Task',
        status: 'pending',
        priority: 'normal',
        linkType: 'none',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (MockTask.create as jest.Mock).mockResolvedValue(mockTask);
      (MockTask.count as jest.Mock).mockResolvedValue(0);

      const result = await taskService.createTask({
        title: 'Test Task',
      });

      expect(result).toEqual(mockTask);
      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Task',
          status: 'pending',
          priority: 'normal',
        }),
        expect.any(Object)
      );
    });

    it('should create a task with all fields', async () => {
      const dueDate = new Date('2025-01-20');
      const mockTask = {
        id: 'task-456',
        title: 'Complete Task',
        description: 'Task description',
        status: 'in_progress',
        priority: 'high',
        dueDate,
        linkType: 'deal',
        propertyId: 123,
        createdBy: 'user-1',
        tags: ['urgent', 'review'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (MockTask.create as jest.Mock).mockResolvedValue(mockTask);
      (MockTask.count as jest.Mock).mockResolvedValue(0);

      const result = await taskService.createTask({
        title: 'Complete Task',
        description: 'Task description',
        status: 'in_progress',
        priority: 'high',
        dueDate,
        propertyId: 123,
        createdBy: 'user-1',
        tags: ['urgent', 'review'],
      });

      expect(result).toEqual(mockTask);
      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Complete Task',
          description: 'Task description',
          status: 'in_progress',
          priority: 'high',
          linkType: 'deal',
          propertyId: 123,
        }),
        expect.any(Object)
      );
    });

    it('should auto-set linkType to deal when propertyId is provided', async () => {
      const mockTask = {
        id: 'task-789',
        title: 'Deal Task',
        linkType: 'deal',
        propertyId: 456,
      };

      (MockTask.create as jest.Mock).mockResolvedValue(mockTask);
      (MockTask.count as jest.Mock).mockResolvedValue(0);

      await taskService.createTask({
        title: 'Deal Task',
        propertyId: 456,
      });

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkType: 'deal',
          propertyId: 456,
        }),
        expect.any(Object)
      );
    });

    it('should auto-set linkType to buyer when buyerId is provided', async () => {
      const mockTask = {
        id: 'task-abc',
        title: 'Buyer Task',
        linkType: 'buyer',
        buyerId: 'buyer-123',
      };

      (MockTask.create as jest.Mock).mockResolvedValue(mockTask);
      (MockTask.count as jest.Mock).mockResolvedValue(0);

      await taskService.createTask({
        title: 'Buyer Task',
        buyerId: 'buyer-123',
      });

      expect(MockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkType: 'buyer',
          buyerId: 'buyer-123',
        }),
        expect.any(Object)
      );
    });

    it('should validate dependent tasks exist', async () => {
      (MockTask.count as jest.Mock).mockResolvedValue(1); // Only 1 of 2 tasks exists

      await expect(
        taskService.createTask({
          title: 'Dependent Task',
          dependsOn: ['task-1', 'task-2'],
        })
      ).rejects.toThrow('Some dependent tasks do not exist');
    });
  });

  // ============================================================================
  // UPDATE TASK TESTS
  // ============================================================================

  describe('updateTask', () => {
    it('should update a task', async () => {
      const mockTask = {
        id: 'task-123',
        title: 'Updated Task',
        status: 'completed',
        update: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };

      (MockTask.findByPk as jest.Mock).mockResolvedValue(mockTask);

      const result = await taskService.updateTask('task-123', {
        title: 'Updated Task',
        status: 'completed',
      });

      expect(result).toBeTruthy();
      expect(MockTask.findByPk).toHaveBeenCalledWith('task-123');
    });

    it('should return null if task not found', async () => {
      (MockTask.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await taskService.updateTask('nonexistent', {
        title: 'Updated',
      });

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // DELETE TASK TESTS
  // ============================================================================

  describe('deleteTask', () => {
    it('should delete a task', async () => {
      const mockTask = {
        id: 'task-123',
        destroy: jest.fn().mockResolvedValue(true),
      };

      (MockTask.findByPk as jest.Mock).mockResolvedValue(mockTask);

      const result = await taskService.deleteTask('task-123');

      expect(result).toBe(true);
      expect(mockTask.destroy).toHaveBeenCalled();
    });

    it('should return false if task not found', async () => {
      (MockTask.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await taskService.deleteTask('nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // GET TASKS TESTS
  // ============================================================================

  describe('getTasks', () => {
    it('should return paginated tasks', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Task 1' },
        { id: 'task-2', title: 'Task 2' },
      ];

      (MockTask.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockTasks,
        count: 2,
      });

      const result = await taskService.getTasks({ page: 1, limit: 10 });

      expect(result.tasks).toEqual(mockTasks);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should filter by status', async () => {
      (MockTask.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await taskService.getTasks({ status: 'pending' });

      expect(MockTask.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'pending',
          }),
        })
      );
    });

    it('should filter by priority', async () => {
      (MockTask.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await taskService.getTasks({ priority: 'high' });

      expect(MockTask.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: 'high',
          }),
        })
      );
    });

    it('should filter by multiple statuses', async () => {
      (MockTask.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: [],
        count: 0,
      });

      await taskService.getTasks({ status: ['pending', 'in_progress'] });

      expect(MockTask.findAndCountAll).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // COMPLETE TASK TESTS
  // ============================================================================

  describe('completeTask', () => {
    it('should mark a task as completed', async () => {
      const mockTask = {
        id: 'task-123',
        status: 'pending',
        completedAt: null,
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockTask.findByPk as jest.Mock).mockResolvedValue(mockTask);

      const result = await taskService.completeTask('task-123', 'user-1');

      expect(result).toBeTruthy();
      expect(mockTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completedBy: 'user-1',
        })
      );
    });

    it('should return null if task not found', async () => {
      (MockTask.findByPk as jest.Mock).mockResolvedValue(null);

      const result = await taskService.completeTask('nonexistent', 'user-1');

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // CANCEL TASK TESTS
  // ============================================================================

  describe('cancelTask', () => {
    it('should mark a task as cancelled', async () => {
      const mockTask = {
        id: 'task-123',
        status: 'pending',
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockTask.findByPk as jest.Mock).mockResolvedValue(mockTask);

      const result = await taskService.cancelTask('task-123', 'user-1');

      expect(result).toBeTruthy();
      expect(mockTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancelledBy: 'user-1',
        })
      );
    });
  });

  // ============================================================================
  // TASK STATS TESTS
  // ============================================================================

  describe('getTaskStats', () => {
    it('should return task statistics', async () => {
      (MockTask.count as jest.Mock)
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(2) // in_progress
        .mockResolvedValueOnce(4) // completed
        .mockResolvedValueOnce(0) // blocked
        .mockResolvedValueOnce(1) // cancelled
        .mockResolvedValueOnce(1) // overdue
        .mockResolvedValueOnce(2) // dueToday
        .mockResolvedValueOnce(3); // dueSoon

      const result = await taskService.getTaskStats({});

      expect(result.total).toBe(10);
      expect(result.pending).toBe(3);
      expect(result.inProgress).toBe(2);
      expect(result.completed).toBe(4);
      expect(result.cancelled).toBe(1);
    });
  });

  // ============================================================================
  // GET TASKS BY DEAL TESTS
  // ============================================================================

  describe('getTasksByDeal', () => {
    it('should return tasks for a specific deal', async () => {
      const mockTasks = [
        { id: 'task-1', propertyId: 123, linkType: 'deal' },
        { id: 'task-2', propertyId: 123, linkType: 'deal' },
      ];

      (MockTask.findAll as jest.Mock).mockResolvedValue(mockTasks);

      const result = await taskService.getTasksByDeal(123);

      expect(result).toEqual(mockTasks);
      expect(MockTask.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            propertyId: 123,
          }),
        })
      );
    });
  });

  // ============================================================================
  // GET TASKS BY BUYER TESTS
  // ============================================================================

  describe('getTasksByBuyer', () => {
    it('should return tasks for a specific buyer', async () => {
      const mockTasks = [
        { id: 'task-1', buyerId: 'buyer-123', linkType: 'buyer' },
      ];

      (MockTask.findAll as jest.Mock).mockResolvedValue(mockTasks);

      const result = await taskService.getTasksByBuyer('buyer-123');

      expect(result).toEqual(mockTasks);
      expect(MockTask.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            buyerId: 'buyer-123',
          }),
        })
      );
    });
  });

  // ============================================================================
  // ASSIGN TASK TESTS
  // ============================================================================

  describe('assignTask', () => {
    it('should assign a task to a user', async () => {
      const mockTask = {
        id: 'task-123',
        assignedTo: null,
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockTask.findByPk as jest.Mock).mockResolvedValue(mockTask);

      const result = await taskService.assignTask('task-123', 'user-456', 'user-1');

      expect(result).toBeTruthy();
      expect(mockTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedTo: 'user-456',
          assignedBy: 'user-1',
        })
      );
    });

    it('should unassign a task when userId is null', async () => {
      const mockTask = {
        id: 'task-123',
        assignedTo: 'user-456',
        update: jest.fn().mockImplementation(function (this: any, data: any) {
          Object.assign(this, data);
          return this;
        }),
      };

      (MockTask.findByPk as jest.Mock).mockResolvedValue(mockTask);

      const result = await taskService.assignTask('task-123', null, 'user-1');

      expect(result).toBeTruthy();
      expect(mockTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedTo: null,
        })
      );
    });
  });
});
