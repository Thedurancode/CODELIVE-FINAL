/**
 * Property Validator
 *
 * Joi validation schemas for property operations.
 */

import Joi from 'joi';

// Address schema
const addressSchema = Joi.object({
  houseNumber: Joi.string().allow('', null),
  street: Joi.string().allow('', null),
  address2: Joi.string().allow('', null),
});

// Single property schema
export const propertySchema = Joi.object({
  propertyId: Joi.string().allow('', null),
  propertyType: Joi.string().allow('', null),
  propertyOwnership: Joi.string().allow('', null),
  address: addressSchema.allow(null),
  city: Joi.string().allow('', null),
  state: Joi.string().max(2).allow('', null),
  zip: Joi.string().allow('', null),
  county: Joi.string().allow('', null),
  country: Joi.string().allow('', null),
  bedroomCount: Joi.number().integer().min(0).allow(null),
  bathroomCount: Joi.number().min(0).allow(null),
  fullBathrooms: Joi.number().integer().min(0).allow(null),
  partialBathrooms: Joi.number().integer().min(0).allow(null),
  livingSpaceSqFt: Joi.number().min(0).allow(null),
  lotSizeSqFt: Joi.number().min(0).allow(null),
  yearBuilt: Joi.number().integer().min(1800).max(2100).allow(null),
  stories: Joi.number().min(0).allow(null),
  garage: Joi.boolean().allow(null),
  garageCount: Joi.number().integer().min(0).allow(null),
  pool: Joi.boolean().allow(null),
  solar: Joi.boolean().allow(null),
  septic: Joi.boolean().allow(null),
  well: Joi.boolean().allow(null),
  purchaseContractPrice: Joi.number().min(0).allow(null),
  reservePrice: Joi.number().min(0).allow(null),
  buyItNowPrice: Joi.number().min(0).allow(null),
  arv: Joi.number().min(0).allow(null),
  renovationBudget: Joi.number().min(0).allow(null),
  rehabCost: Joi.number().min(0).allow(null),
  mlsListingPrice: Joi.number().min(0).allow(null),
  occupancyStatus: Joi.string().allow('', null),
  deliveredVacant: Joi.boolean().allow(null),
  monthlyRent: Joi.number().min(0).allow(null),
  condition: Joi.string().allow('', null),
  wholesalerLlcName: Joi.string().allow('', null),
  llcOwnerName: Joi.string().allow('', null),
  llcOwnerEmail: Joi.string().email().allow('', null),
}).unknown(true); // Allow additional fields

// Bulk create options
const bulkOptionsSchema = Joi.object({
  skipDuplicates: Joi.boolean().default(false),
  emitEvents: Joi.boolean().default(true),
  useTransaction: Joi.boolean().default(false),
});

// Bulk create request schema
export const bulkCreateSchema = Joi.object({
  properties: Joi.array()
    .items(propertySchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.max': 'Maximum 100 properties per batch',
      'array.min': 'At least 1 property required',
    }),
  options: bulkOptionsSchema.default({}),
});

// Bulk update item schema
const updateItemSchema = Joi.object({
  id: Joi.number().integer().required(),
  data: propertySchema.required(),
});

// Bulk update request schema
export const bulkUpdateSchema = Joi.object({
  updates: Joi.array()
    .items(updateItemSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.max': 'Maximum 100 updates per batch',
      'array.min': 'At least 1 update required',
    }),
  options: Joi.object({
    useTransaction: Joi.boolean().default(false),
  }).default({}),
});

// Bulk delete request schema
export const bulkDeleteSchema = Joi.object({
  ids: Joi.array()
    .items(Joi.number().integer())
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.max': 'Maximum 100 deletions per batch',
      'array.min': 'At least 1 ID required',
    }),
  options: Joi.object({
    useTransaction: Joi.boolean().default(false),
  }).default({}),
});

// Bulk score request schema
export const bulkScoreSchema = Joi.object({
  propertyIds: Joi.array()
    .items(Joi.number().integer())
    .min(1)
    .max(100)
    .required(),
  buyBoxIds: Joi.array().items(Joi.string()).optional(),
});

/**
 * Validate bulk create request
 */
export function validateBulkCreate(data: any): { error?: Joi.ValidationError; value: any } {
  return bulkCreateSchema.validate(data, { abortEarly: false });
}

/**
 * Validate bulk update request
 */
export function validateBulkUpdate(data: any): { error?: Joi.ValidationError; value: any } {
  return bulkUpdateSchema.validate(data, { abortEarly: false });
}

/**
 * Validate bulk delete request
 */
export function validateBulkDelete(data: any): { error?: Joi.ValidationError; value: any } {
  return bulkDeleteSchema.validate(data, { abortEarly: false });
}

/**
 * Validate bulk score request
 */
export function validateBulkScore(data: any): { error?: Joi.ValidationError; value: any } {
  return bulkScoreSchema.validate(data, { abortEarly: false });
}
