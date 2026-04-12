/**
 * System Prompts for LLM Integration
 * Contains templates and examples for various AI-powered features
 */

// Schema Inference Prompt
const SCHEMA_INFERENCE_PROMPT = `You are an expert data analyst tasked with inferring the schema of a dataset from sample data.

Given the following sample rows from a CSV/Excel file, analyze the data and suggest:
1. Column names and their data types
2. Whether each column is a dimension (categorical) or measure (numeric)
3. Suggested aggregations for measure columns
4. Any constraints or patterns you notice

Sample Data:
{rows}

Please respond in JSON format:
{
  "columns": [
    {
      "name": "column_name",
      "type": "string|number|date|boolean",
      "role": "dimension|measure",
      "suggestedAggregation": "sum|avg|count|min|max|null",
      "nullable": true|false,
      "constraints": {}
    }
  ],
  "confidence": 0.0-1.0
}`;

// Parse Text Prompt
const PARSE_TEXT_PROMPT = `You are an AI assistant that extracts structured data schemas from natural language descriptions.

Given the following text description, identify the data entities, their properties, and relationships.

Text: {text}

Respond with a JSON schema suggestion:
{
  "entities": [
    {
      "name": "EntityName",
      "columns": [
        {
          "name": "property_name",
          "type": "string|number|date|boolean",
          "description": "what this represents"
        }
      ]
    }
  ],
  "relationships": [],
  "confidence": 0.0-1.0
}`;

// Dimension/Measure Classification Prompt
const CLASSIFICATION_PROMPT = `Classify the following columns as either dimensions or measures based on their names and sample values.

Columns: {columns}

For each column, determine:
- Role: dimension (categorical, grouping) or measure (numeric, aggregatable)
- Type: string, number, date, boolean
- Aggregation: for measures, suggest sum, avg, count, min, max

Respond in JSON format.`;

const NULL_HANDLING_PROMPT = `Analyze the following data sample for null value patterns and suggest handling strategies.

Sample: {sample}

Consider:
- Which columns have nulls
- Patterns in null occurrence
- Suggested default values or imputation strategies
- Whether nulls indicate optional vs missing data

Provide recommendations in JSON format.`;

// Provider configurations
const LLM_PROVIDERS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4'
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com',
    models: ['claude-3-opus', 'claude-3-sonnet'],
    defaultModel: 'claude-3-sonnet'
  },
  local: {
    baseURL: process.env.LOCAL_LLM_URL || 'http://localhost:11434',
    models: ['llama2', 'codellama'],
    defaultModel: 'llama2'
  }
};

/**
 * Get prompt template by type
 */
const getPrompt = (type, variables = {}) => {
  let template = '';

  switch (type) {
    case 'schema_inference':
      template = SCHEMA_INFERENCE_PROMPT;
      break;
    case 'parse_text':
      template = PARSE_TEXT_PROMPT;
      break;
    case 'classification':
      template = CLASSIFICATION_PROMPT;
      break;
    case 'null_handling':
      template = NULL_HANDLING_PROMPT;
      break;
    default:
      throw new Error(`Unknown prompt type: ${type}`);
  }

  // Replace variables
  Object.keys(variables).forEach(key => {
    template = template.replace(new RegExp(`{${key}}`, 'g'), variables[key]);
  });

  return template;
};

/**
 * Get provider configuration
 */
const getProviderConfig = (provider = 'openai') => {
  return LLM_PROVIDERS[provider] || LLM_PROVIDERS.openai;
};

module.exports = {
  getPrompt,
  getProviderConfig,
  LLM_PROVIDERS,
  // Export templates for reference
  SCHEMA_INFERENCE_PROMPT,
  PARSE_TEXT_PROMPT,
  CLASSIFICATION_PROMPT,
  NULL_HANDLING_PROMPT
};