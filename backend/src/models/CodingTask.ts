/**
 * CodingTask Model
 *
 * Tracks AI-powered coding tasks that use Claude to implement
 * code changes, run tests, and create pull requests.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

type CodingTaskStatus =
  | 'created'
  | 'cloning'
  | 'branching'
  | 'coding'
  | 'testing'
  | 'linting'
  | 'committing'
  | 'creating_pr'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface CodingTaskConfig {
  baseBranch?: string;
  branchPrefix?: 'feature' | 'bugfix' | 'refactor';
  allowedPaths?: string[];
  forbiddenPaths?: string[];
  maxFilesChanged?: number;
  runTests?: boolean;
  testCommand?: string;
  lintCommand?: string;
  testTimeout?: number;
  autoCreatePR?: boolean;
  prReviewers?: string[];
  prLabels?: string[];
  maxDuration?: number;
}

interface CodingTaskAttributes {
  id: string;
  projectId: string;
  title: string;
  instructions: string;

  // State
  status: CodingTaskStatus;

  // Git info
  repoUrl: string;
  baseBranch: string;
  featureBranch: string;
  workspacePath: string | null;

  // Results
  prUrl: string | null;
  prNumber: number | null;
  commitSha: string | null;
  testsPassed: boolean | null;
  lintPassed: boolean | null;

  // Metadata
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  testOutput: string | null;
  lintOutput: string | null;
  errorMessage: string | null;
  progressLog: string[]; // JSON array of status updates

  // Config
  config: CodingTaskConfig;

  // Audit
  createdById: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;

  createdAt: Date;
  updatedAt: Date;
}

interface CodingTaskCreationAttributes
  extends Optional<
    CodingTaskAttributes,
    | 'id'
    | 'status'
    | 'workspacePath'
    | 'prUrl'
    | 'prNumber'
    | 'commitSha'
    | 'testsPassed'
    | 'lintPassed'
    | 'filesChanged'
    | 'linesAdded'
    | 'linesRemoved'
    | 'testOutput'
    | 'lintOutput'
    | 'errorMessage'
    | 'progressLog'
    | 'startedAt'
    | 'completedAt'
    | 'durationMs'
    | 'createdAt'
    | 'updatedAt'
  > {}

class CodingTask
  extends Model<CodingTaskAttributes, CodingTaskCreationAttributes>
  implements CodingTaskAttributes
{
  declare id: string;
  declare projectId: string;
  declare title: string;
  declare instructions: string;
  declare status: CodingTaskStatus;
  declare repoUrl: string;
  declare baseBranch: string;
  declare featureBranch: string;
  declare workspacePath: string | null;
  declare prUrl: string | null;
  declare prNumber: number | null;
  declare commitSha: string | null;
  declare testsPassed: boolean | null;
  declare lintPassed: boolean | null;
  declare filesChanged: number;
  declare linesAdded: number;
  declare linesRemoved: number;
  declare testOutput: string | null;
  declare lintOutput: string | null;
  declare errorMessage: string | null;
  declare progressLog: string[];
  declare config: CodingTaskConfig;
  declare createdById: string;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare durationMs: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Virtual fields populated by associations
  declare project?: {
    id: string;
    title: string;
    githubUrl: string;
  };
  declare createdBy?: {
    id: string;
    name: string;
    email: string;
  };

  /**
   * Add a progress log entry
   */
  async addProgressLog(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const log = [...(this.progressLog || []), `[${timestamp}] ${message}`];
    await this.update({ progressLog: log });
  }

  /**
   * Check if task is in a terminal state
   */
  isTerminal(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Check if task can be cancelled
   */
  canCancel(): boolean {
    return !this.isTerminal();
  }
}

CodingTask.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    projectId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'project_id',
      references: {
        model: 'projects',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        'created',
        'cloning',
        'branching',
        'coding',
        'testing',
        'linting',
        'committing',
        'creating_pr',
        'completed',
        'failed',
        'cancelled'
      ),
      allowNull: false,
      defaultValue: 'created',
    },
    repoUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'repo_url',
    },
    baseBranch: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'main',
      field: 'base_branch',
    },
    featureBranch: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'feature_branch',
    },
    workspacePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'workspace_path',
    },
    prUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'pr_url',
    },
    prNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'pr_number',
    },
    commitSha: {
      type: DataTypes.STRING(40),
      allowNull: true,
      field: 'commit_sha',
    },
    testsPassed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'tests_passed',
    },
    lintPassed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'lint_passed',
    },
    filesChanged: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'files_changed',
    },
    linesAdded: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'lines_added',
    },
    linesRemoved: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'lines_removed',
    },
    testOutput: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'test_output',
    },
    lintOutput: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'lint_output',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    progressLog: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: 'progress_log',
    },
    config: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'created_by_id',
      references: {
        model: 'marketplace_users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'duration_ms',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'coding_tasks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['created_by_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['feature_branch'] },
    ],
  }
);

export default CodingTask;
export { CodingTaskAttributes, CodingTaskCreationAttributes, CodingTaskStatus, CodingTaskConfig };
