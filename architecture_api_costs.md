# Codebase Architecture & API Cost Analysis

This document provides a high-level overview of the StayEase codebase architecture and breaks down the specific components where external APIs (and their associated costs) are utilized.

## 1. High-Level Architecture

The system is a full-stack application centered around an AI-powered customer service agent. It consists of the following layers:
- **Frontend**: Web interfaces (likely React/Vite based on standard patterns) located in `frontend/` and `admin-frontend/`.
- **Backend API**: A FastAPI application (`api/main.py`) that serves REST endpoints and WebSockets.
- **AI Agent**: A LangGraph-based state machine (`agent/graph.py`) that controls the flow of conversations, tool execution, and state management.
- **Knowledge Base (RAG)**: A local ChromaDB instance (`agent/rag.py`) used for semantic search.
- **Relational Database**: A PostgreSQL database (accessed via `agent/db.py`) used to store conversation states, collected lead information, and authentication codes.

---

## 2. Component-by-Component API Cost Breakdown

The following sections detail exactly how and where external APIs are called within the codebase, which drives the operational cost.

### A. Text Conversation System (LangGraph)
- **Files**: `agent/nodes.py`, `agent/graph.py`
- **How it works**: The text-based chat uses a state graph. When a user sends a message, it is processed by the `call_model_node` using a tool-bound LLM. If the LLM uses a tool (like searching the knowledge base), the result is passed to `format_response_node`, which uses a second "plain" LLM call to format a friendly reply.
- **API Used**: Google Gemini Text API (`ChatGoogleGenerativeAI`).
- **Config Variable**: `GEMINI_MODEL` (Defaults to `gemini-1.5-flash`).
- **Cost Drivers**:
  - **Input Tokens**: System prompts, conversation history, and user messages.
  - **Output Tokens**: The AI's responses and tool-call JSON structures.
  - **Call Frequency**: A single user interaction can trigger **two** LLM calls if a tool is used (one for reasoning/tool-selection, one for formatting the tool's result).

### B. Knowledge Base & RAG System
- **Files**: `agent/rag.py`, `agent/tools.py`
- **How it works**: Documents (like FAQs and policies) are converted into vector embeddings and stored in ChromaDB. When a user asks a question, the agent uses the `search_knowledge_base` tool to embed the query and fetch relevant documents.
- **API Used**: Google Gemini Embeddings API (`GoogleGenerativeAIEmbeddings`).
- **Model Used**: `models/gemini-embedding-001`.
- **Cost Drivers**:
  - **Document Ingestion**: Billed per token for the text of every document added to the system via `add_document()`.
  - **Querying**: Billed per token for every search query performed during a conversation via `search_documents()`.

### C. Voice Streaming System
- **Files**: `api/routers/voice_stream.py`, `agent/live_tools.py`
- **How it works**: The system opens a WebSocket connection from the frontend and proxies raw audio directly to Google's Multimodal Live API. The AI acts as a voice receptionist, speaking Bengali and executing live tools (like `write_to_chat` or `save_collected_information`).
- **API Used**: Google Gemini Multimodal Live API (`BidiGenerateContent`).
- **Config Variable**: `GEMINI_LIVE_MODEL` (Defaults to `gemini-3.1-flash-live-preview`).
- **Cost Drivers**:
  - **Audio Input/Output**: This is the primary cost for voice. It is billed per second of audio (or per audio token). 
  - **Text Input**: The large system instruction, persona prompt, and tool schemas sent at the start of the connection.
  - **Text Output**: When the model triggers a tool call during the voice session.

### D. Email Delivery Service
- **Files**: `agent/tools.py` (`send_verification_email`), `agent/config.py`
- **How it works**: When a user needs to verify their identity, the system generates a random 6-character code and emails it to them.
- **API Used**: Resend API.
- **Config Variable**: `RESEND_API_KEY`.
- **Cost Drivers**: 
  - Billed per email sent, subject to Resend's pricing tiers (e.g., first 3,000 emails/month free, then a fixed rate per additional email).

---

## 3. Database & Hosting Infrastructure

While not direct API costs, the underlying infrastructure is necessary to run the application:
- **PostgreSQL (`psycopg2-binary`)**: Used for persistent storage. Cost depends on the cloud provider (e.g., AWS RDS, GCP Cloud SQL, Supabase).
- **ChromaDB**: Runs locally and persists to the `chroma_db/` folder. It uses disk space and RAM, impacting the required size of the host server.
- **Compute (Backend & Frontend)**: Running the FastAPI Uvicorn server and serving the React frontend requires a VPS, container service (like Cloud Run or ECS), or PaaS (like Heroku or Render). Cost scales with CPU, Memory, and bandwidth usage.
