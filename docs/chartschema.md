# Chart Configuration Schema

This document provides a detailed breakdown of the MongoDB schema used to persist chart configurations in the Analytics-BI platform. This schema is designed for flexibility, allowing a lossless "round-trip" between the UI's Exploration state and the database.

## 1. High-Level Overview

The `Chart` model (defined in `apps/server/src/models/Chart.js`) is the primary entity for storing visualizations. It maps UI selections (dimensions, measures, filters) into a format that the backend can dynamically translate into MongoDB aggregation pipelines.

---

## 2. Field-by-Field Breakdown

### A. Identification & Identification
| Field | Type | Description |
|:--- |:--- |:--- |
| `chartId` | String | **Primary Key**. Unique UUID/String ID for the chart. Indexed for fast lookup. |
| `name` | String | The human-readable title of the chart (e.g., "Sales by Region"). |

### B. Data Source (`dataSource`)
Defines where the chart's data originates.
| Field | Type | Description |
|:--- |:--- |:--- |
| `datasetId` | String | Reference to the parent `Metadata` model/collection. |
| `table` | String | (Internal) Hint for the table name, typically defaults to `cleaned_records`. |

### C. Query Configuration (`query`)
This block is the "brain" of the chart, storing the logic for data retrieval.
| Field | Type | Description |
|:--- |:--- |:--- |
| `dimensions` | Array<Object> | Categories to group by. Contains `field`, `type` (categorical/continuous), and `label`. |
| `measures` | Array<Object> | Metrics to calculate. Contains `field`, `aggregation` (SUM/AVG/COUNT), and `label`. |
| `filters` | Array<Object> | Runtime filters applied to the raw data before aggregation. Includes `field`, `operator`, and `value`. |
| `groupBy` | Array<String> | Flat list of fields used in the MongoDB `$group` stage. |
| `orderBy` | Array<Object> | Sort configuration, e.g., `{ field: "Total Revenue", direction: "desc" }`. |

### D. Visualization Settings (`visualization`)
Maps the aggregated results to specific UI components.
| Field | Type | Description |
|:--- |:--- |:--- |
| `type` | String | The chart type: `bar`, `line`, `area`, `pie`, `scatter`, etc. |
| `xAxis` | String | The field mapped to the X-axis (independent variable). |
| `yAxis` | String | The field mapped to the Y-axis (dependent variable). |
| `series` | Mixed | Additional UI settings such as `stack: true` or `grouped: true`. |

### E. Styling & Aesthetics (`style`)
| Field | Type | Description |
|:--- |:--- |:--- |
| `colorPalette` | Array<String> | Hex codes for the chart's color series. |
| `showLegend` | Boolean | Visibility toggle for the legend. |
| `showGrid` | Boolean | Visibility toggle for background grid lines. |

---

## 3. Example JSON Payload

```json
{
  "chartId": "chart-1712750000000",
  "name": "Revenue by Region",
  "dataSource": {
    "datasetId": "dataset-507f1f77bcf86cd799439011"
  },
  "query": {
    "dimensions": [{ "field": "region", "type": "categorical", "label": "Region" }],
    "measures": [{ "field": "revenue", "aggregation": "SUM", "label": "Total Revenue" }],
    "filters": [{ "field": "status", "operator": "==", "value": "shipped" }]
  },
  "visualization": {
    "type": "bar",
    "xAxis": "Region",
    "yAxis": "Total Revenue"
  },
  "style": {
    "colorPalette": ["#6366f1", "#10b981", "#f59e0b"],
    "showLegend": true
  }
}
```

---

## 4. Indexing Strategy

To ensure high performance across thousands of charts, the following indexes are applied:
- **Unique Lookup**: `chartId` is unique and indexed.
- **Relational Lookup**: Compounded index on `dataSource.datasetId` and `updatedAt`.
- **Searchable**: Full-text index on the `name` field for quick filtering in the Chart Gallery.
