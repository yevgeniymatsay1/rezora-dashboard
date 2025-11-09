# Rezora - AI Voice Agent Platform

Rezora is an AI-powered voice agent platform designed for real estate professionals. Users can create, customize, and deploy voice agents to call leads automatically, with built-in campaign management, call analytics, and feedback loops.

## Tech Stack

### Frontend
- **React** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** + **shadcn/ui** for styling
- **TanStack Query** for data fetching
- **React Hook Form** + **Zod** for form handling

### Backend
- **Supabase** (PostgreSQL database + Edge Functions)
- **AWS Bedrock** (LLM inference + RAG knowledge base)
- **Retell API** (Voice call execution)
- **Stripe** (Payment processing)

### Infrastructure
- **AWS Amplify** (Frontend hosting)
- **Supabase** (Backend hosting)
- **AWS S3** (Pattern storage for RAG)

## Quick Start for Developer Review


### Prerequisites
- Node.js 18+ and npm
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/yevgeniymatsay1/rezora-dashboard.git
cd rezora-dashboard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev
```



## Core Features

### 1. Agent Management
- Create voice agents from reusable templates
- Customize prompts, voice, and conversation flow
- Deploy agents to Retell API
- Test agents with one-click test calls

### 2. Campaign Management
- Create campaigns with contact lists
- Schedule calls with timezone support
- Monitor campaign progress in real-time
- View call results and analytics


### 3. Billing & Credits
- Credit-based payment system (Stripe integration)
- Auto-reload functionality
- Phone number purchase and management
- Usage tracking and billing alerts

## Key Concepts

### Agent Templates vs User Agents
- **Agent Templates**: Reusable blueprints created by admins (stored in `agent_templates` table)
- **User Agents**: Configured instances of templates owned by users (stored in `user_agents` table)

### Placeholder System
Two-phase resolution system:
- **Config-time**: Single braces `{InvestorName}` - resolved during agent configuration
- **Runtime**: Double braces `{{first_name}}` - resolved per contact during campaign execution



## License

Private repository - All rights reserved.
