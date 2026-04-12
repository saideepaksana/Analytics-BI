const logger = require('./logger');

/**
 * Schema Validation Module
 * Handles JSON Schema generation, validation, and constraint checking
 */

/**
 * Converts Metadata schema to JSON Schema Draft 7
 */
const generateJsonSchema = (metadata) => {
  const properties = {};
  const required = [];

  metadata.schema.forEach(column => {
    const property = {
      type: mapDataTypeToJsonType(column.dataType || column.type)
    };

    // Add constraints
    if (column.constraints) {
      if (column.constraints.min !== undefined) property.minimum = column.constraints.min;
      if (column.constraints.max !== undefined) property.maximum = column.constraints.max;
      if (column.constraints.pattern) property.pattern = column.constraints.pattern;
      if (column.constraints.enum) property.enum = column.constraints.enum;
      if (column.constraints.minLength !== undefined) property.minLength = column.constraints.minLength;
      if (column.constraints.maxLength !== undefined) property.maxLength = column.constraints.maxLength;
    }

    if (!column.nullable) {
      required.push(column.name);
    }

    properties[column.name] = property;
  });

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
};

/**
 * Maps internal data types to JSON Schema types
 */
const mapDataTypeToJsonType = (dataType) => {
  const typeMap = {
    'string': 'string',
    'number': 'number',
    'integer': 'integer',
    'boolean': 'boolean',
    'date': 'string', // ISO date string
    'object': 'object',
    'array': 'array'
  };
  return typeMap[dataType] || 'string';
};

/**
 * Validates data against JSON Schema
 */
const validateAgainstJsonSchema = (data, jsonSchema) => {
  try {
    const Ajv = require('ajv');
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(jsonSchema);
    const valid = validate(data);

    if (!valid) {
      return {
        isValid: false,
        errors: validate.errors.map(err => ({
          field: err.dataPath ? err.dataPath.substring(1) : 'root',
          message: err.message,
          keyword: err.keyword
        }))
      };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    logger.error(`JSON Schema validation error: ${error.message}`, 'SchemaValidation');
    return { isValid: false, errors: [{ field: 'system', message: 'Validation system error' }] };
  }
};

/**
 * Checks cross-column constraints (PK, FK, unique)
 */
const validateCrossColumnConstraints = async (data, metadata, mongooseConnection) => {
  const errors = [];

  for (const column of metadata.schema) {
    if (!column.constraints) continue;

    const value = data[column.name];

    // Unique constraint
    if (column.constraints.unique && value !== undefined) {
      const CleanRecord = mongooseConnection.model('CleanRecord');
      const existing = await CleanRecord.findOne({
        datasetId: metadata.datasetId,
        [`data.${column.name}`]: value
      });
      if (existing) {
        errors.push({
          field: column.name,
          message: `Value '${value}' violates unique constraint`
        });
      }
    }

    // Foreign Key constraint
    if (column.constraints.foreignKey && value !== undefined) {
      const { collection, field } = column.constraints.foreignKey;
      const ForeignModel = mongooseConnection.model(collection);
      const exists = await ForeignModel.findOne({ [field]: value });
      if (!exists) {
        errors.push({
          field: column.name,
          message: `Value '${value}' does not exist in ${collection}.${field}`
        });
      }
    }
  }

  return errors;
};

/**
 * Comprehensive validation function
 */
const validateDataRow = async (data, metadata, mongooseConnection) => {
  const report = {
    isValid: true,
    schemaErrors: [],
    constraintErrors: [],
    crossColumnErrors: []
  };

  // Generate JSON Schema and validate
  const jsonSchema = generateJsonSchema(metadata);
  const schemaResult = validateAgainstJsonSchema(data, jsonSchema);
  if (!schemaResult.isValid) {
    report.schemaErrors = schemaResult.errors;
    report.isValid = false;
  }

  // Cross-column constraints
  const crossErrors = await validateCrossColumnConstraints(data, metadata, mongooseConnection);
  if (crossErrors.length > 0) {
    report.crossColumnErrors = crossErrors;
    report.isValid = false;
  }

  return report;
};

module.exports = {
  generateJsonSchema,
  validateAgainstJsonSchema,
  validateCrossColumnConstraints,
  validateDataRow
};