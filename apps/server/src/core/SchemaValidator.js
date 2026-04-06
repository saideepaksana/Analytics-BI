const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const addErrors = require("ajv-errors");

class SchemaValidator {
    constructor() {
        // Initialize AJV instance
        this.ajv = new Ajv({
            allErrors: true,       // Check all rules collecting all errors
            useDefaults: true,     // Inject default values if present
            coerceTypes: false,    // Do not coerce types, require strict matches except via manual cleaning
        });
        
        // Add formats (date-time, email, etc.) and custom error messages plugin
        addFormats(this.ajv);
        addErrors(this.ajv);
    }

    /**
     * Compile a JSON schema and return a validation function
     * @param {Object} jsonSchema - A valid JSON draft-07 schema
     * @returns {Function} A validation function that will return true or array of errors
     */
    compile(jsonSchema) {
        const validate = this.ajv.compile(jsonSchema);
        
        return (data) => {
            const isValid = validate(data);
            if (isValid) return { valid: true, errors: [] };
            
            // Format errors cleanly
            const errors = validate.errors.map(err => {
                return {
                    field: err.instancePath.replace(/^\//, ''),
                    message: err.message,
                    keyword: err.keyword,
                    params: err.params
                };
            });
            return { valid: false, errors };
        };
    }

    /**
     * Convenience method to validate a single item against a schema inline
     */
    validate(jsonSchema, data) {
        const validator = this.compile(jsonSchema);
        return validator(data);
    }
}

module.exports = new SchemaValidator();
