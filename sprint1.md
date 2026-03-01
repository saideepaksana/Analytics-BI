1. Role 1 (Ingestion UI):

    * modules/ingestion/IngestionWizard.jsx — The step-by-step upload UI.

    * modules/ingestion/FileUpload.jsx — The drag-and-drop zone logic.

2. Role 2 (Data Reviewer):

    * modules/data-review/DataGrid.jsx — The preview table for raw data.

    * modules/data-review/SchemaReview.jsx — The interface to confirm Dimension/Measure types.

3. Role 3 (File Handler):

    * api/upload/upload.controller.js — Handles the POST request.

    * api/upload/upload.routes.js — Defines the endpoint URL.

    * core/storage.js — GridFS or Multer configuration for file storage.

4. Role 4 (The Parser):

    * pipelines/parser/streamParser.js — Logic for ExcelJS and Fast-CSV.

    * pipelines/parser/quarantine.js — Logic to catch and log corrupt rows.

5. Role 5 (DTS Engine):

    * pipelines/dts/cleaner.js — Null handling and data standardization logic.

    * pipelines/dts/normalizer.js — Date conversion (ISO strings) using date-fns.

6. Role 6 (Schema Inference):

    * pipelines/schema/classifier.js — Heuristic logic for Dimensions vs. Measures.

    * models/Metadata.js — The Mongoose schema for the Schema Registry.