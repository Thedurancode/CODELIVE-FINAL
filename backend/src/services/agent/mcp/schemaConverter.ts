/**
 * JSON Schema to Zod Schema Converter
 *
 * Converts MCP tool input schemas (JSON Schema format) to Zod schemas
 * for use with LangChain tools.
 */

import { z, ZodTypeAny } from 'zod';

/**
 * Convert a JSON Schema definition to a Zod schema
 *
 * @param jsonSchema - JSON Schema object
 * @returns Equivalent Zod schema
 */
export function jsonSchemaToZod(jsonSchema: any): ZodTypeAny {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.unknown();
  }

  // Handle nullable types
  if (jsonSchema.nullable) {
    const baseSchema = jsonSchemaToZod({ ...jsonSchema, nullable: undefined });
    return baseSchema.nullable();
  }

  // Handle type-specific conversions
  switch (jsonSchema.type) {
    case 'string':
      return convertStringSchema(jsonSchema);

    case 'number':
      return convertNumberSchema(jsonSchema, false);

    case 'integer':
      return convertNumberSchema(jsonSchema, true);

    case 'boolean':
      return convertBooleanSchema(jsonSchema);

    case 'array':
      return convertArraySchema(jsonSchema);

    case 'object':
      return convertObjectSchema(jsonSchema);

    case 'null':
      return z.null();

    default:
      // Handle union types (oneOf, anyOf)
      if (jsonSchema.oneOf || jsonSchema.anyOf) {
        return convertUnionSchema(jsonSchema);
      }

      // Handle allOf (intersection)
      if (jsonSchema.allOf) {
        return convertIntersectionSchema(jsonSchema);
      }

      // Handle const values
      if (jsonSchema.const !== undefined) {
        return z.literal(jsonSchema.const);
      }

      // Handle enum without explicit type
      if (jsonSchema.enum) {
        return z.enum(jsonSchema.enum as [string, ...string[]]);
      }

      // Fallback for unknown schemas
      return z.unknown();
  }
}

/**
 * Convert string JSON Schema to Zod
 */
function convertStringSchema(schema: any): ZodTypeAny {
  // Handle enum strings
  if (schema.enum) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  // Handle const value
  if (schema.const !== undefined) {
    return z.literal(schema.const);
  }

  // Handle format-specific strings
  if (schema.format) {
    switch (schema.format) {
      case 'email':
        return applyStringConstraints(z.string().email(), schema);
      case 'uri':
      case 'url':
        return applyStringConstraints(z.string().url(), schema);
      case 'uuid':
        return applyStringConstraints(z.string().uuid(), schema);
      case 'date':
        return applyStringConstraints(z.string().date(), schema);
      case 'date-time':
        return applyStringConstraints(z.string().datetime(), schema);
      // Fall through for unknown formats
    }
  }

  let stringSchema = z.string();
  return applyStringConstraints(stringSchema, schema);
}

/**
 * Apply string-specific constraints
 */
function applyStringConstraints(schema: z.ZodString, jsonSchema: any): ZodTypeAny {
  let result: z.ZodString = schema;

  if (jsonSchema.minLength !== undefined) {
    result = result.min(jsonSchema.minLength);
  }

  if (jsonSchema.maxLength !== undefined) {
    result = result.max(jsonSchema.maxLength);
  }

  if (jsonSchema.pattern) {
    result = result.regex(new RegExp(jsonSchema.pattern));
  }

  if (jsonSchema.description) {
    return result.describe(jsonSchema.description);
  }

  return result;
}

/**
 * Convert number/integer JSON Schema to Zod
 */
function convertNumberSchema(schema: any, isInteger: boolean): ZodTypeAny {
  // Handle enum numbers
  if (schema.enum) {
    const literals = schema.enum.map((v: number) => z.literal(v));
    if (literals.length === 1) {
      return literals[0];
    }
    return z.union(literals as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  }

  // Handle const value
  if (schema.const !== undefined) {
    return z.literal(schema.const);
  }

  let numSchema = isInteger ? z.number().int() : z.number();

  if (schema.minimum !== undefined) {
    numSchema = numSchema.min(schema.minimum);
  }

  if (schema.maximum !== undefined) {
    numSchema = numSchema.max(schema.maximum);
  }

  if (schema.exclusiveMinimum !== undefined) {
    numSchema = numSchema.gt(schema.exclusiveMinimum);
  }

  if (schema.exclusiveMaximum !== undefined) {
    numSchema = numSchema.lt(schema.exclusiveMaximum);
  }

  if (schema.multipleOf !== undefined) {
    numSchema = numSchema.multipleOf(schema.multipleOf);
  }

  if (schema.description) {
    return numSchema.describe(schema.description);
  }

  return numSchema;
}

/**
 * Convert boolean JSON Schema to Zod
 */
function convertBooleanSchema(schema: any): ZodTypeAny {
  // Handle const value
  if (schema.const !== undefined) {
    return z.literal(schema.const);
  }

  let boolSchema = z.boolean();

  if (schema.description) {
    return boolSchema.describe(schema.description);
  }

  return boolSchema;
}

/**
 * Convert array JSON Schema to Zod
 */
function convertArraySchema(schema: any): ZodTypeAny {
  // Determine item schema
  let itemSchema: ZodTypeAny;

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      // Tuple type
      const tupleSchemas = schema.items.map(jsonSchemaToZod);
      if (tupleSchemas.length >= 1) {
        return z.tuple(tupleSchemas as [ZodTypeAny, ...ZodTypeAny[]]);
      }
      itemSchema = z.unknown();
    } else {
      itemSchema = jsonSchemaToZod(schema.items);
    }
  } else {
    itemSchema = z.unknown();
  }

  let arraySchema = z.array(itemSchema);

  if (schema.minItems !== undefined) {
    arraySchema = arraySchema.min(schema.minItems);
  }

  if (schema.maxItems !== undefined) {
    arraySchema = arraySchema.max(schema.maxItems);
  }

  if (schema.description) {
    return arraySchema.describe(schema.description);
  }

  return arraySchema;
}

/**
 * Convert object JSON Schema to Zod
 */
function convertObjectSchema(schema: any): ZodTypeAny {
  // Handle additionalProperties only (no properties defined)
  if (!schema.properties && schema.additionalProperties) {
    if (schema.additionalProperties === true) {
      return z.record(z.unknown());
    }
    return z.record(jsonSchemaToZod(schema.additionalProperties));
  }

  // No properties defined - accept any object
  if (!schema.properties) {
    return z.object({}).passthrough();
  }

  const shape: Record<string, ZodTypeAny> = {};
  const required = new Set(schema.required || []);

  for (const [key, propSchema] of Object.entries(schema.properties || {})) {
    let fieldSchema = jsonSchemaToZod(propSchema as any);

    // Make optional if not required
    if (!required.has(key)) {
      fieldSchema = fieldSchema.optional();
    }

    // Apply default value if present
    const propDef = propSchema as any;
    if (propDef.default !== undefined && !required.has(key)) {
      fieldSchema = fieldSchema.default(propDef.default);
    }

    shape[key] = fieldSchema;
  }

  let objSchema = z.object(shape);

  // Handle additional properties
  if (schema.additionalProperties === true) {
    objSchema = objSchema.passthrough();
  } else if (schema.additionalProperties === false) {
    objSchema = objSchema.strict();
  }

  if (schema.description) {
    return objSchema.describe(schema.description);
  }

  return objSchema;
}

/**
 * Convert oneOf/anyOf to Zod union
 */
function convertUnionSchema(schema: any): ZodTypeAny {
  const variants = (schema.oneOf || schema.anyOf || []).map(jsonSchemaToZod);

  if (variants.length === 0) {
    return z.unknown();
  }

  if (variants.length === 1) {
    return variants[0];
  }

  return z.union([variants[0], variants[1], ...variants.slice(2)]);
}

/**
 * Convert allOf to Zod intersection
 */
function convertIntersectionSchema(schema: any): ZodTypeAny {
  const parts = (schema.allOf || []).map(jsonSchemaToZod);

  if (parts.length === 0) {
    return z.unknown();
  }

  if (parts.length === 1) {
    return parts[0];
  }

  // Zod intersection only supports 2 schemas, so we chain them
  let result = parts[0];
  for (let i = 1; i < parts.length; i++) {
    result = z.intersection(result, parts[i]);
  }

  return result;
}

/**
 * Convert an MCP tool's input schema to a Zod object schema
 * Ensures the result is always a ZodObject for LangChain compatibility
 */
export function mcpToolSchemaToZod(inputSchema: any): z.ZodObject<any> {
  if (!inputSchema || inputSchema.type !== 'object') {
    // Return empty object schema if no valid schema
    return z.object({});
  }

  const converted = jsonSchemaToZod(inputSchema);

  // Ensure we return a ZodObject
  if (converted instanceof z.ZodObject) {
    return converted;
  }

  // Wrap non-object result
  return z.object({ input: converted });
}
