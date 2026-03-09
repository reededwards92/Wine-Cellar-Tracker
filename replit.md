# Vin - Wine Cellar Management App

## Overview
A wine cellar management mobile app built with Expo (React Native) frontend and Express backend with SQLite (better-sqlite3) database. Includes an AI-powered sommelier chat assistant (Claude Sonnet 4.6 via Replit AI Integrations) that can query and modify the wine database through natural language.

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, Expo Router (file-based routing), React Query
- **Backend**: Express.js, TypeScript, better-sqlite3 (SQLite)
- **AI**: Claude Sonnet 4.6 (Anthropic via Replit AI Integrations) with tool-calling for database operations
- **Styling**: React Native StyleSheet with wine-burgundy (#722F37) accent color
- **Typography**: Outfit (sans-serif, weights 300-700) as primary font; Libre Baskerville (serif) for wine names and main headings

## Architecture
- **Frontend** runs on port 8081 (Expo dev server)
- **Backend** runs on port 5000 (Express API server)
- Client communicates with server via RESTful API
- SQLite database stored at `cellar.db` in project root
- AI chat uses SSE streaming with `expo/fetch` for cross-platform support
- AI calls use raw `http.request` (not Anthropic SDK) to avoid SDK hanging issues; `localhost` replaced with `127.0.0.1` for IPv4 compatibility
- SSE disconnect detection uses `res.on("close")` (NOT `req.on("close")` which fires prematurely)

## Database Tables
- **wines**: Unique wine records (producer + name + vintage)
- **bottles**: Individual bottle instances linked to wines
- **consumption_log**: History of consumed bottles with tasting notes

## Key Features
- AI Sommelier chat: natural language cellar management, recommendations, consumption tracking, wine bottle photo recognition (vision)
- Add Wine tab: auto-launches camera, AI analyzes wine label, auto-populates form for review before adding
- CellarTracker CSV import with latin-1 encoding support
- Cellar list view with stats, filtering, sorting, and search
- Add wine form with grouped sections
- Wine detail view with bottle management
- Consumption tracking with ratings and notes
- Drink window status indicators (in window/approaching/past peak)

## AI Tools (server/ai-tools.ts)
The sommelier can execute these database operations via tool-calling:
- `search_wines` - Search cellar by any criteria
- `get_wine_details` - Full wine + bottle details
- `add_wine` - Add new wine with bottles
- `add_bottles` - Add bottles to existing wine
- `update_wine` / `update_bottle` - Update records
- `consume_bottle` - Record consumption with rating/notes
- `get_cellar_stats` - Cellar summary statistics
- `get_recommendations` - Wine recommendations by criteria

## API Routes
- `GET /api/wines` - List wines with filters/sorting
- `GET /api/wines/:id` - Wine detail with bottles
- `POST /api/wines` - Create wine + bottles
- `PUT /api/wines/:id` - Update wine
- `POST /api/wines/:id/bottles` - Add bottles to wine
- `PUT /api/bottles/:id` - Update bottle
- `PATCH /api/bottles/:id/consume` - Mark bottle consumed
- `POST /api/import` - CSV import (multipart form)
- `GET /api/stats` - Dashboard statistics
- `GET /api/filters` - Available filter options
- `GET /api/consumption` - Consumption history
- `POST /api/chat` - AI sommelier chat (SSE streaming)

## File Structure
- `app/(tabs)/` - Tab screens (index, add, sommelier, history)
- `app/wine/[id].tsx` - Wine detail screen
- `server/db.ts` - SQLite database setup
- `server/routes.ts` - All API endpoints + chat endpoint
- `server/ai-tools.ts` - AI tool definitions and executors
- `components/` - Reusable UI components
- `lib/api.ts` - API types and helpers
- `constants/colors.ts` - Theme colors
