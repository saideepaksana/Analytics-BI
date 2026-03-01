# Analytics BI Platform

## System Architecture

This project utilizes a **Monorepo Architecture** to manage both the frontend client and backend server within a single repository. This allows for seamless sharing of types and UI components while keeping domains strictly isolated. 

Our structure is designed to support the immediate MERN-stack data ingestion pipeline while reserving specific modules and pipelines for future Artificial Intelligence (AI) and Machine Learning features.

### Directory Structure

```text
analytics-bi/
├── packages/                  # Shared internal libraries
│   ├── shared-types/          # Shared TypeScript interfaces (e.g., Schema, User, AiChatResponse)
│   └── ui-components/         # Reusable Tailwind/Lucide UI components
├── apps/
│   ├── client/                # FRONTEND (React.js, Tailwind, Socket.io-client)
│   │   ├── src/
│   │   │   ├── core/          # Core layout, routing, and context
│   │   │   ├── modules/       # Domain-driven feature modules
│   │   │   │   ├── ingestion/ # Data upload and wizard UI
│   │   │   │   ├── data-review/# Schema review and quarantine UI
│   │   │   │   ├── builder/   # Query Builder UI 
│   │   │   │   ├── dashboard/ # Dashboards & Visualizations
│   │   │   │   │   └── components/AiSummaryCard.tsx  # Future AI Feature
│   │   │   │   ├── sql-editor/# SQL Query Interface
│   │   │   │   │   └── components/AiAssistant.tsx    # Future AI Feature
│   │   │   │   └── chatbot/   # Future AI NLP Chatbot
│   │   │   └── services/      # API clients (Axios) and Socket listeners
│   │   └── package.json
│   │
│   └── server/                # BACKEND (Node.js, Express, MongoDB)
│       ├── src/
│       │   ├── api/           # Express routes & controllers
│       │   │   ├── upload/    # File reception and storage routes
│       │   │   ├── query/     # Data querying routes
│       │   │   └── ai/        # Future: Routes for NLP and Forecasting
│       │   ├── core/          # DB connection, Server setup, Socket.io init
│       │   ├── models/        # Mongoose Schemas (Raw Data, Metadata, DLQ)
│       │   ├── services/      # External integrations
│       │   │   └── llm/       # Future: Prompts, LangChain, Model configs
│       │   └── pipelines/     # Data Processing Engine
│       │       ├── parser/    # Stream-based parsing logic
│       │       ├── dts/       # Data Transformation Services (Cleaning)
│       │       └── schema/    # Schema inference and relationship mapping
│       └── package.json
└── package.json
