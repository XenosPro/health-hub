# Tally — Budget & Expense Tracker

A full-stack personal finance application for tracking income, expenses, budgets and savings goals.

## Features

- User authentication with Supabase
- Dashboard with income, spending, remaining balance and savings progress
- Transaction creation, editing, deletion and search
- Monthly budget tracking with progress and overspending warnings
- Savings goals
- CSV transaction import
- Receipt upload with AI-assisted extraction of merchant, amount, date, category and notes
- Admin overview tools
- Responsive React interface with charts and financial insights

## Tech stack

- React + TypeScript
- TanStack Router
- Supabase
- Recharts
- Lovable AI gateway / Gemini-powered receipt extraction
- Vite

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Create your own local environment file and add the required Supabase / application credentials. Environment files are intentionally excluded from Git.

## Security

Never commit API keys or production credentials. Use local environment variables and deployment-platform secrets instead.

## Status

Active portfolio project. The repository name is currently `health-hub`; the application itself is branded **Tally**.
