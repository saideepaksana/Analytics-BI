const crypto = require('crypto');

/**
 * Schema Formatting and Serialization Utilities
 */

/**
 * Serializes schema to compact string format
 * @param {Array} schema - Array of column schema objects
 * @returns {string} Compact schema string like "col1:string;col2:number;col3:date"
 */
const serializeSchema = (schema) => {
  if (!Array.isArray(schema)) return '';

  return schema
    .map(column => {
      const name = column.name;
      const type = column.dataType || column.type || 'string';
      return `${name}:${type}`;
    })
    .join(';');
};

/**
 * Deserializes compact schema string back to schema array
 * @param {string} compactSchema - Compact schema string
 * @returns {Array} Array of column schema objects
 */
const deserializeSchema = (compactSchema) => {
  if (!compactSchema || typeof compactSchema !== 'string') return [];

  return compactSchema
    .split(';')
    .filter(part => part.trim())
    .map(part => {
      const [name, type] = part.split(':');
      return {
        name: name?.trim(),
        type: type?.trim() || 'string',
        dataType: type?.trim() || 'string'
      };
    });
};

/**
 * Generates a hash fingerprint of the schema for change detection
 * @param {Array} schema - Schema array
 * @returns {string} SHA-256 hash of the schema
 */
const generateSchemaFingerprint = (schema) => {
  const compact = serializeSchema(schema);
  return crypto.createHash('sha256').update(compact).digest('hex');
};

/**
 * Compares two schemas for equality using fingerprints
 * @param {Array} schemaA
 * @param {Array} schemaB
 * @returns {boolean} True if schemas are identical
 */
const schemasEqual = (schemaA, schemaB) => {
  return generateSchemaFingerprint(schemaA) === generateSchemaFingerprint(schemaB);
};

/**
 * Formats schema for human-readable display
 * @param {Array} schema
 * @returns {string} Formatted schema description
 */
const formatSchemaForDisplay = (schema) => {
  if (!Array.isArray(schema)) return 'No schema available';

  const lines = schema.map(column => {
    const type = column.dataType || column.type || 'string';
    const nullable = column.nullable === false ? ' (required)' : '';
    const role = column.role ? ` [${column.role}]` : '';
    return `  ${column.name}: ${type}${nullable}${role}`;
  });

  return `Schema (${schema.length} columns):\n${lines.join('\n')}`;
};

module.exports = {
  serializeSchema,
  deserializeSchema,
  generateSchemaFingerprint,
  schemasEqual,
  formatSchemaForDisplay
};