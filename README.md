# AI Code Reviewer

A multi-agent AI system that learns your team's coding standards and provides educational PR reviews. Built with LangGraph and powered by Google Gemini.

## Overview

This tool acts as an AI-powered code reviewer that:

1. **Learns** your team's conventions from your codebase, ADRs, past PR reviews, and incident reports
2. **Reviews** pull requests against those learned conventions
3. **Teaches** developers by explaining *why* something is an issue and *how* to fix it

Unlike generic linters, this system understands your team's specific patterns and provides contextual, educational feedback.

## Architecture

The system uses a multi-agent architecture built on [LangGraph](https://github.com/langchain-ai/langgraph):

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                              │
│  Routes requests and coordinates the agent workflow              │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│    LEARNER    │      │   REVIEWER    │      │    TUTOR      │
│               │      │               │      │               │
│ Extracts      │      │ Analyzes code │      │ Explains      │
│ conventions   │      │ for violations│      │ violations    │
│ from sources  │      │               │      │ educationally │
└───────────────┘      └───────────────┘      └───────────────┘
        │                       │                       │
        │              ┌────────┴────────┐              │
        │              ▼                 ▼              │
        │      ┌─────────────┐  ┌─────────────┐        │
        │      │   Naming    │  │  Structure  │        │
        │      │  Reviewer   │  │  Reviewer   │        │
        │      └─────────────┘  └─────────────┘        │
        │      ┌─────────────┐  ┌─────────────┐        │
        │      │  Pattern    │  │   Testing   │        │
        │      │  Reviewer   │  │  Reviewer   │        │
        │      └─────────────┘  └─────────────┘        │
        │                                               │
        └──────────────────┬───────────────────────────┘
                           ▼
                ┌───────────────────┐
                │    FEEDBACK       │
                │   CONTROLLER      │
                │                   │
                │ Formats & delivers│
                │ review comments   │
                └───────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          GitHub       Console        IDE
```

### Agents

| Agent | Purpose |
|-------|---------|
| **Learner** | Scans codebase, ADRs, PR history, and incidents to extract team conventions |
| **Reviewer** | Orchestrates sub-reviewers to analyze code for violations |
| **Sub-Reviewers** | Specialized reviewers for naming, structure, patterns, and testing |
| **Tutor** | Transforms violations into educational feedback with examples |
| **Feedback Controller** | Formats and delivers feedback to GitHub, console, or IDE |

## Project Structure

```
src/
├── agents/                    # Multi-agent system
│   ├── graph.ts              # LangGraph state annotations
│   ├── learner/              # Convention learning agent
│   │   └── index.ts
│   ├── reviewer/             # Code review orchestrator
│   │   ├── index.ts
│   │   └── sub-reviewers/    # Specialized reviewers
│   │       ├── naming-reviewer.ts
│   │       ├── structure-reviewer.ts
│   │       ├── pattern-reviewer.ts
│   │       ├── testing-reviewer.ts
│   │       └── index.ts
│   ├── tutor/                # Educational explanation agent
│   │   └── index.ts
│   └── feedback-controller/  # Output formatting agent
│       └── index.ts
│
├── orchestrator/             # Main workflow orchestrator
│   └── index.ts
│
├── knowledge/                # Convention storage
│   └── store.ts              # In-memory + file-based store
│
├── integrations/             # External service integrations
│   └── github.ts             # GitHub API client
│
├── cli/                      # Command-line interface
│   └── index.ts
│
├── web/                      # Web server & webhook handler
│   ├── index.ts
│   └── server.ts
│
├── config/                   # Configuration management
│   └── index.ts
│
├── utils/                    # Shared utilities
│   └── llm.ts                # LLM client factory
│
├── types/                    # TypeScript type definitions
│   └── index.ts
│
└── index.ts                  # Main entry point
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Google AI API key (for Gemini)
- GitHub token (optional, for PR reviews)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd ai-code-reviewer

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env and add your API keys
```

### Configuration

Edit `.env` with your settings:

```env
# Required: AI Provider
GOOGLE_API_KEY=your_google_api_key_here

# Optional: GitHub Integration
GITHUB_TOKEN=your_github_token_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# Optional: Model Configuration (defaults shown)
LEARNER_MODEL=gemini-2.0-flash
REVIEWER_MODEL=gemini-2.0-flash
TUTOR_MODEL=gemini-2.0-flash
FEEDBACK_MODEL=gemini-2.0-flash

# Optional: Storage & Server
KNOWLEDGE_STORE_PATH=./data/knowledge
PORT=3000
HOST=localhost
```

### Build

```bash
npm run build
```

## Usage

### CLI Commands

```bash
# Start interactive mode
npm run start:cli interactive

# Review a GitHub PR
npm run start:cli review --pr 123 --repo owner/repo

# Review local files
npm run start:cli review --files src/component.ts src/utils.ts

# Review a diff file
npm run start:cli review --diff changes.patch

# Learn conventions from your codebase
npm run start:cli learn --codebase ./src

# Learn from ADRs
npm run start:cli learn --adrs ./docs/adr

# Ask questions about conventions
npm run start:cli ask "What's our error handling pattern?"

# Check knowledge store status
npm run start:cli status
```

### Web Server

```bash
# Start the server
npm run start:web

# Or in development mode with hot reload
npm run dev:web
```

#### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/stats` | Knowledge store statistics |
| GET | `/api/conventions` | List all learned conventions |
| GET | `/api/conventions/search?q=...` | Search conventions |
| POST | `/api/ask` | Ask a question about conventions |
| POST | `/api/review` | Trigger a manual PR review |
| POST | `/webhook/github` | GitHub webhook endpoint |

### GitHub Integration

1. Create a GitHub webhook pointing to `https://your-server/webhook/github`
2. Set the webhook secret in your `.env` file
3. Select "Pull requests" events
4. The bot will automatically review new and updated PRs

## Development

```bash
# Run in development mode with hot reload
npm run dev:cli    # CLI
npm run dev:web    # Web server

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## How It Works

### 1. Learning Phase

The Learner agent extracts conventions from multiple sources:

- **Codebase**: Analyzes code patterns, naming conventions, structure
- **ADRs**: Extracts architectural decisions and their rationale
- **PR Reviews**: Learns from past feedback patterns
- **Incidents**: Identifies practices adopted after incidents

Conventions are stored in the Knowledge Store with confidence scores.

### 2. Review Phase

When reviewing code:

1. **Reviewer** loads relevant conventions from the Knowledge Store
2. **Sub-reviewers** analyze code in parallel:
   - Naming conventions
   - Code structure
   - Pattern usage
   - Testing practices
3. Violations are collected and deduplicated

### 3. Teaching Phase

The **Tutor** agent transforms raw violations into educational feedback:

- Explains *why* the issue matters to the team
- Shows *what* the team expects instead
- Provides code examples from the team's codebase
- References related incidents or decisions

### 4. Delivery Phase

The **Feedback Controller** formats output for the target:

- **GitHub**: Posts review comments on the PR
- **Console**: Pretty-printed terminal output
- **IDE**: Structured JSON for IDE integration

## Extending the System

### Adding a New Sub-Reviewer

1. Create a new file in `src/agents/reviewer/sub-reviewers/`
2. Implement the review function following the existing pattern
3. Export it from `sub-reviewers/index.ts`
4. Add it to the parallel review in `reviewer/index.ts`

### Adding a New Delivery Target

1. Add the target to `FeedbackControllerState.deliveryTarget` type
2. Create a formatter function in `feedback-controller/index.ts`
3. Export and use it in the orchestrator

## License

MIT
