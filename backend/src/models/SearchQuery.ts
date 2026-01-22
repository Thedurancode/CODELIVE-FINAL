/**
 * SearchQuery Model
 * Tracks user search queries for analytics and improving search relevance
 */

import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../config/database';

interface SearchQueryAttributes {
  id: string;
  userId: string;
  query: string;
  filters?: Record<string, any>;
  resultsCount: number;
  clickedResultId?: string;
  clickedResultPosition?: number;
  searchDuration?: number; // ms to perform search
  source: 'marketplace' | 'deals' | 'buyers' | 'contacts' | 'global';
  createdAt?: Date;
}

interface SearchQueryCreationAttributes extends Optional<SearchQueryAttributes, 'id' | 'filters' | 'clickedResultId' | 'clickedResultPosition' | 'searchDuration' | 'createdAt'> {}

class SearchQuery extends Model<SearchQueryAttributes, SearchQueryCreationAttributes> implements SearchQueryAttributes {
  public id!: string;
  public userId!: string;
  public query!: string;
  public filters?: Record<string, any>;
  public resultsCount!: number;
  public clickedResultId?: string;
  public clickedResultPosition?: number;
  public searchDuration?: number;
  public source!: 'marketplace' | 'deals' | 'buyers' | 'contacts' | 'global';
  public readonly createdAt!: Date;

  /**
   * Get popular search terms
   */
  static async getPopularSearches(options: {
    limit?: number;
    source?: string;
    days?: number;
  } = {}): Promise<{ query: string; count: number; avgResults: number }[]> {
    const { limit = 20, source, days = 30 } = options;

    const where: any = {
      createdAt: {
        [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    };

    if (source) {
      where.source = source;
    }

    const results = await SearchQuery.findAll({
      attributes: [
        'query',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('resultsCount')), 'avgResults'],
      ],
      where,
      group: ['query'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit,
      raw: true,
    });

    return results as any;
  }

  /**
   * Get zero-result searches (queries that returned no results)
   */
  static async getZeroResultSearches(options: {
    limit?: number;
    days?: number;
  } = {}): Promise<{ query: string; count: number; lastSearched: Date }[]> {
    const { limit = 20, days = 30 } = options;

    const results = await SearchQuery.findAll({
      attributes: [
        'query',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastSearched'],
      ],
      where: {
        resultsCount: 0,
        createdAt: {
          [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
      group: ['query'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit,
      raw: true,
    });

    return results as any;
  }

  /**
   * Get search analytics for a user
   */
  static async getUserSearchHistory(userId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{ searches: SearchQuery[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    const { rows, count } = await SearchQuery.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return { searches: rows, total: count };
  }

  /**
   * Get search analytics summary
   */
  static async getAnalytics(days: number = 30): Promise<{
    totalSearches: number;
    uniqueUsers: number;
    avgResultsPerSearch: number;
    zeroResultRate: number;
    avgSearchDuration: number;
    searchesBySource: Record<string, number>;
    searchesByDay: { date: string; count: number }[];
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Total searches
    const totalSearches = await SearchQuery.count({
      where: { createdAt: { [Op.gte]: since } },
    });

    // Unique users
    const uniqueUsersResult = await SearchQuery.findAll({
      attributes: [[sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('userId'))), 'count']],
      where: { createdAt: { [Op.gte]: since } },
      raw: true,
    });
    const uniqueUsers = (uniqueUsersResult[0] as any)?.count || 0;

    // Average results
    const avgResultsResult = await SearchQuery.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.col('resultsCount')), 'avg']],
      where: { createdAt: { [Op.gte]: since } },
      raw: true,
    });
    const avgResultsPerSearch = parseFloat((avgResultsResult[0] as any)?.avg) || 0;

    // Zero result rate
    const zeroResults = await SearchQuery.count({
      where: {
        resultsCount: 0,
        createdAt: { [Op.gte]: since },
      },
    });
    const zeroResultRate = totalSearches > 0 ? (zeroResults / totalSearches) * 100 : 0;

    // Average search duration
    const avgDurationResult = await SearchQuery.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.col('searchDuration')), 'avg']],
      where: {
        searchDuration: { [Op.not]: null },
        createdAt: { [Op.gte]: since },
      },
      raw: true,
    });
    const avgSearchDuration = parseFloat((avgDurationResult[0] as any)?.avg) || 0;

    // Searches by source
    const bySourceResult = await SearchQuery.findAll({
      attributes: [
        'source',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { createdAt: { [Op.gte]: since } },
      group: ['source'],
      raw: true,
    });
    const searchesBySource: Record<string, number> = {};
    (bySourceResult as any[]).forEach((row) => {
      searchesBySource[row.source] = parseInt(row.count, 10);
    });

    // Searches by day
    const byDayResult = await SearchQuery.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { createdAt: { [Op.gte]: since } },
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
      raw: true,
    });
    const searchesByDay = (byDayResult as any[]).map((row) => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));

    return {
      totalSearches,
      uniqueUsers: parseInt(uniqueUsers, 10),
      avgResultsPerSearch: Math.round(avgResultsPerSearch * 10) / 10,
      zeroResultRate: Math.round(zeroResultRate * 10) / 10,
      avgSearchDuration: Math.round(avgSearchDuration),
      searchesBySource,
      searchesByDay,
    };
  }
}

SearchQuery.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    query: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    resultsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'results_count',
    },
    clickedResultId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clicked_result_id',
    },
    clickedResultPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'clicked_result_position',
    },
    searchDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'search_duration',
    },
    source: {
      type: DataTypes.ENUM('marketplace', 'deals', 'buyers', 'contacts', 'global'),
      allowNull: false,
      defaultValue: 'marketplace',
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize,
    tableName: 'search_queries',
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['query'] },
      { fields: ['source'] },
      { fields: ['created_at'] },
      { fields: ['results_count'] },
    ],
  }
);

export default SearchQuery;
