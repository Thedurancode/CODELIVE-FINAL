import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'Dispotree API',
      version: '1.0.0',
      description: 'Dispotree Property Management System API Documentation',
      contact: {
        name: 'Dispotree Support',
        email: 'support@dispotree.com'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://api.dispotree.com'
          : 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production'
          ? 'Production server'
          : 'Development server'
      }
    ],
    components: {
      schemas: {
        Property: {
          type: 'object',
          required: ['houseNumber', 'street', 'city', 'state', 'zip'],
          properties: {
            id: {
              type: 'integer',
              description: 'Property ID'
            },
            houseNumber: {
              type: 'string',
              description: 'House number',
              example: '123'
            },
            street: {
              type: 'string',
              description: 'Street name',
              example: 'Main St'
            },
            city: {
              type: 'string',
              description: 'City',
              example: 'Los Angeles'
            },
            state: {
              type: 'string',
              description: 'State',
              example: 'CA'
            },
            zip: {
              type: 'string',
              description: 'ZIP code',
              example: '90210'
            },
            propertyType: {
              type: 'string',
              enum: ['Single Family', 'Multi Family', 'Condo', 'Townhouse', 'Commercial'],
              description: 'Property type'
            },
            bedroomCount: {
              type: 'integer',
              description: 'Number of bedrooms',
              example: 3
            },
            bathroomCount: {
              type: 'number',
              description: 'Number of bathrooms',
              example: 2.5
            },
            livingSpaceSqFt: {
              type: 'integer',
              description: 'Living space in square feet',
              example: 1500
            },
            lotSizeSqFt: {
              type: 'integer',
              description: 'Lot size in square feet',
              example: 5000
            },
            yearBuilt: {
              type: 'integer',
              description: 'Year built',
              example: 1985
            },
            listingPrice: {
              type: 'number',
              description: 'Listing price',
              example: 450000
            },
            arv: {
              type: 'number',
              description: 'After Repair Value',
              example: 550000
            },
            rehabCost: {
              type: 'number',
              description: 'Estimated rehabilitation cost',
              example: 50000
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Date created'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Date updated'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            message: {
              type: 'string',
              description: 'Detailed error message'
            }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'OK'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        MarketplaceUser: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique user ID'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'investor@example.com'
            },
            name: {
              type: 'string',
              example: 'John Smith'
            },
            company: {
              type: 'string',
              example: 'ABC Investments'
            },
            phone: {
              type: 'string',
              example: '(555) 123-4567'
            },
            role: {
              type: 'string',
              enum: ['buyer', 'investor', 'wholesaler', 'agent']
            },
            verified: {
              type: 'boolean'
            },
            stats: {
              type: 'object',
              properties: {
                totalDealsViewed: { type: 'integer' },
                totalLikes: { type: 'integer' },
                totalPasses: { type: 'integer' },
                totalOffers: { type: 'integer' },
                acceptedOffers: { type: 'integer' }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        UserBuyBox: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            userId: {
              type: 'string'
            },
            name: {
              type: 'string',
              example: 'Texas Single Family'
            },
            active: {
              type: 'boolean'
            },
            criteria: {
              type: 'object',
              properties: {
                states: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['TX', 'FL', 'GA']
                },
                minPrice: { type: 'number', example: 50000 },
                maxPrice: { type: 'number', example: 300000 },
                propertyTypes: {
                  type: 'array',
                  items: { type: 'string' }
                },
                minBedrooms: { type: 'number' },
                maxBedrooms: { type: 'number' },
                minSqft: { type: 'number' },
                maxSqft: { type: 'number' }
              }
            },
            priority: {
              type: 'integer',
              minimum: 1,
              maximum: 10
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        MarketplaceDeal: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            deal: {
              type: 'object',
              description: 'Normalized deal data'
            },
            matchScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Buy box match score'
            },
            matchReasons: {
              type: 'array',
              items: { type: 'string' }
            },
            isNew: {
              type: 'boolean'
            },
            isFeatured: {
              type: 'boolean'
            },
            viewCount: {
              type: 'integer'
            },
            offerCount: {
              type: 'integer'
            }
          }
        },
        DealOffer: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            userId: {
              type: 'string'
            },
            dealId: {
              type: 'string'
            },
            offerAmount: {
              type: 'number',
              example: 250000
            },
            earnestMoney: {
              type: 'number',
              example: 5000
            },
            closingDays: {
              type: 'integer',
              example: 14
            },
            contingencies: {
              type: 'array',
              items: { type: 'string' }
            },
            financeType: {
              type: 'string',
              enum: ['cash', 'hard_money', 'conventional', 'other']
            },
            status: {
              type: 'string',
              enum: ['pending', 'viewed', 'countered', 'accepted', 'rejected', 'expired', 'withdrawn']
            },
            counterOffer: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                closingDays: { type: 'integer' },
                notes: { type: 'string' }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        DealAction: {
          type: 'object',
          description: 'Tracks user actions on deals (views, likes, passes, offers)',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            dealId: { type: 'string' },
            actionType: {
              type: 'string',
              enum: ['view', 'like', 'pass', 'save', 'share', 'offer']
            },
            passReason: {
              type: 'string',
              enum: ['price_too_high', 'location_not_ideal', 'property_condition', 'not_enough_equity', 'wrong_property_type', 'too_small', 'too_large', 'bad_neighborhood', 'title_issues', 'already_have_similar', 'over_budget', 'other']
            },
            passReasonCustom: { type: 'string' },
            viewDuration: {
              type: 'integer',
              description: 'Time spent viewing in milliseconds',
              example: 25000
            },
            dealSnapshot: {
              type: 'object',
              description: 'Deal data at time of action (for ML)',
              properties: {
                price: { type: 'number' },
                arv: { type: 'number' },
                equity: { type: 'number' },
                state: { type: 'string' },
                city: { type: 'string' },
                propertyType: { type: 'string' },
                bedrooms: { type: 'integer' },
                sqft: { type: 'integer' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        UserBehaviorProfile: {
          type: 'object',
          description: 'ML-derived user behavior profile from swipe history',
          properties: {
            userId: { type: 'string' },
            implicitPreferences: {
              type: 'object',
              properties: {
                avgLikedPrice: { type: 'number', example: 225000 },
                avgPassedPrice: { type: 'number', example: 180000 },
                preferredPriceRange: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' }
                  }
                },
                likedStates: {
                  type: 'object',
                  additionalProperties: { type: 'integer' },
                  example: { TX: 5, FL: 3, GA: 2 }
                },
                likedPropertyTypes: {
                  type: 'object',
                  additionalProperties: { type: 'integer' },
                  example: { single_family: 8, townhouse: 2 }
                },
                avgViewDurationLiked: {
                  type: 'number',
                  description: 'Avg milliseconds spent on liked deals',
                  example: 25000
                },
                avgViewDurationPassed: {
                  type: 'number',
                  description: 'Avg milliseconds spent on passed deals',
                  example: 8000
                }
              }
            },
            topPassReasons: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reason: { type: 'string' },
                  count: { type: 'integer' },
                  percentage: { type: 'number' }
                }
              }
            },
            likeRate: {
              type: 'number',
              description: 'Likes / Views percentage',
              example: 35.5
            },
            offerRate: {
              type: 'number',
              description: 'Offers / Likes percentage',
              example: 12.5
            },
            predictedInterests: {
              type: 'object',
              properties: {
                priceRange: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' }
                  }
                },
                states: {
                  type: 'array',
                  items: { type: 'string' }
                },
                propertyTypes: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            lastUpdated: { type: 'string', format: 'date-time' }
          }
        },
        DealPrediction: {
          type: 'object',
          description: 'ML prediction of user interest in a deal',
          properties: {
            dealId: { type: 'string' },
            userId: { type: 'string' },
            predictedAction: {
              type: 'string',
              enum: ['like', 'pass'],
              description: 'Predicted user action'
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Confidence percentage',
              example: 78
            },
            factors: {
              type: 'array',
              description: 'Factors influencing the prediction',
              items: {
                type: 'object',
                properties: {
                  factor: {
                    type: 'string',
                    example: 'Price in preferred range'
                  },
                  impact: {
                    type: 'string',
                    enum: ['positive', 'negative']
                  },
                  weight: {
                    type: 'number',
                    example: 15
                  }
                }
              }
            }
          }
        },
        PassReason: {
          type: 'string',
          description: 'Reason for passing on a deal',
          enum: [
            'price_too_high',
            'location_not_ideal',
            'property_condition',
            'not_enough_equity',
            'wrong_property_type',
            'too_small',
            'too_large',
            'bad_neighborhood',
            'title_issues',
            'already_have_similar',
            'over_budget',
            'other'
          ]
        },
        SwipeRequest: {
          type: 'object',
          required: ['action'],
          properties: {
            action: {
              type: 'string',
              enum: ['like', 'pass']
            },
            passReason: {
              $ref: '#/components/schemas/PassReason'
            },
            passReasonCustom: {
              type: 'string',
              description: 'Custom reason if passReason is "other"'
            },
            viewDuration: {
              type: 'integer',
              description: 'Time spent viewing in milliseconds',
              example: 25000
            }
          }
        },
        FeedResponse: {
          type: 'object',
          properties: {
            deals: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/MarketplaceDeal'
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 20 },
                total: { type: 'integer', example: 150 },
                hasMore: { type: 'boolean', example: true }
              }
            },
            filters: {
              type: 'object',
              properties: {
                sortBy: {
                  type: 'string',
                  enum: ['match_score', 'newest', 'price_low', 'price_high', 'ending_soon']
                }
              }
            }
          }
        },
        DealAnalytics: {
          type: 'object',
          description: 'Engagement analytics for a deal',
          properties: {
            views: { type: 'integer', example: 150 },
            likes: { type: 'integer', example: 45 },
            passes: { type: 'integer', example: 80 },
            offers: { type: 'integer', example: 8 },
            avgViewDuration: {
              type: 'number',
              description: 'Average view time in milliseconds',
              example: 18500
            },
            likeRate: {
              type: 'number',
              description: 'Likes / Views percentage',
              example: 30
            },
            conversionRate: {
              type: 'number',
              description: 'Offers / Views percentage',
              example: 5.3
            },
            topPassReasons: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reason: { type: 'string' },
                  count: { type: 'integer' }
                }
              }
            }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/controllers/*.ts', './src/routes/*.ts', './src/index.ts'],
};

const specs = swaggerJsdoc(options);

const loadApiReference = async (): Promise<typeof import('@scalar/express-api-reference')> => {
  // Use runtime import to load the ESM-only package from a CJS build.
  const loader = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<typeof import('@scalar/express-api-reference')>;
  return loader('@scalar/express-api-reference');
};

export const setupSwagger = async (app: Express): Promise<void> => {
  const { apiReference } = await loadApiReference();

  // Scalar API Reference - modern, beautiful docs UI
  app.use(
    '/api-docs',
    apiReference({
      spec: {
        content: specs,
      },
      theme: 'kepler',
      layout: 'modern',
      defaultHttpClient: {
        targetKey: 'javascript',
        clientKey: 'fetch',
      },
      metaData: {
        title: 'Dispotree API Documentation',
      },
    }),
  );

  // JSON endpoint for programmatic access
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

export default setupSwagger;
