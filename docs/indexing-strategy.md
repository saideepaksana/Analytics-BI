# Indexing Strategy

This document outlines the indexing strategy for the Analytics BI application.

## Overview
MongoDB indexes are essential for ensuring high-performance database operations, especially over large analytical datasets containing hundreds of thousands of rows. Our strategy combines general lookup indices with domain-specific text and compound indices.

## Core Models & their Indices

### `Metadata`
- `datasetId` (1): Primary lookup index for datasets. `unique`.
- `createdAt` (-1) / `updatedAt` (-1): Used for sorting dataset list.
- `fileName` ("text"): **Text Index** to quickly search for datasets by name.

### `CleanRecord` / `DLQRecord` / `RawRecord`
- `{ datasetId: 1, rowNumber: 1 }`: Multi-key index to quickly pinpoint anomalies (`DLQRecord`) or records by row. It's `unique` to ensure deduplication.
- `{ datasetId: 1, createdAt: -1 }`: Frequently accessed by query API returning the most recent payload rows.

### `Dashboard` & `Chart`
- **Text Indices**: `Dashboard` has a text index on `title` and `description`. `Chart` has a text index on `name`.
- **References**: `Chart` also indexes `{ dataSource.datasetId: 1 }` to quickly identify all charts that depend on a dataset when the dataset requires teardown or changes.

### `Idempotency`
- `key` (1): Unique identifier for idempotent API requests.
- `expiresAt` (1): TTL Index that automatically expires the idempotent tracking records from the DB after 24 hours.

## Index Maintenance

- **Adding New Indexes**: Developer can add indices to the `.js` files in `apps/server/src/models/`.
- **Applying Indexes**: Run `node apps/server/scripts/initIndexes.js` to synchronize the Mongoose schemas with the connected MongoDB cluster asynchronously. This does not block normal query execution but takes DB CPU resources during rebuilds.
- **Compound Indexes for Query API**: If query payloads feature heavy `$match` operations targeting particular data fields, consider creating conditional or multi-key indexes on `data.<column_name>` for the `CleanRecord` model instead of global ones, which can inflate storage.
