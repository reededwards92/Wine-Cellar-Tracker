# Vin - Wine Cellar Management App

## Overview
A wine cellar management mobile app built with Expo (React Native) frontend and Express backend with SQLite (better-sqlite3) database. Includes an AI-powered sommelier chat assistant (Claude Sonnet 4.6 via Replit AI Integrations) that can query and modify the wine database through natural language. Multi-user authentication with JWT tokens.

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, Expo Router (file-based routing), React Query
- **Backend**: Express.js, TypeScript, better-sqlite3 (SQLite)
- **AI**: Claude Sonnet 4.6 (Anthropic via Replit AI Integrations) with tool-calling for database operations
- **Auth**: JWT tokens (30d expiry, SESSION_SECRET env var), bcryptjs for password hashing, expo-secure-store for token storage, expo-local-authentication for Face ID/fingerprint biometric login
- **Styling**: React Native StyleSheet with wine-burgundy (#722F37) accent color
- **Typography**: Outfit (sans-serif, weights 300-700) as primary font; Libre Baskerville (serif) for wine names and main headings
- **Camera**: expo-camera (CameraView) for in-app wine label scanning with overlay guide frame
- **Import/Export**: AI-powered CSV import (any format), Excel export via exceljs

## Architecture
- **Frontend** runs on port 8081 (Expo dev server)
- **Backend** runs on port 5000 (Express API server)
- Client communicates with server via RESTful API with Bearer token auth
- SQLite database stored at `cellar.db` in project root
- AI chat uses SSE streaming with `expo/fetch` for cross-platform support
- AI calls use raw `http.request` (not Anthropic SDK) to avoid SDK hanging issues; `localhost` replaced with `127.0.0.1` for IPv4 compatibility
- SSE disconnect detection uses `res.on("close")` (NOT `req.on("close")` which fires prematurely)

## Authentication
- JWT-based auth with tokens stored in expo-secure-store (web: localStorage)
- Auth token injected into all API requests via `lib/auth-token.ts` module
- Auth gating uses Expo Router `<Redirect>` pattern in `_layout.tsx` (NOT conditional Stack.Screen rendering)
- Biometric login (Face ID / fingerprint) via expo-local-authentication: toggle in Settings, biometric challenge on app launch when enabled, fails closed if hardware unavailable
- All data routes protected by `requireAuth` middleware and scoped by `user_id`
- Auth routes: POST /api/auth/register, POST /api/auth/login, POST /api/auth/google, GET /api/auth/me, POST /api/auth/logout, PATCH /api/auth/profile, POST /api/auth/change-password, DELETE /api/auth/account
- Seeded accounts: `reededwards92@gmail.com` / `winefan1992` (Reed), `apple@review.com` / `AppleReview2025!` (Apple Reviewer with 5 sample wines)

## Database Tables
- **users**: User accounts (email, password_hash, display_name, google_id)
- **wines**: Unique wine records (producer + name + vintage), scoped by user_id
- **bottles**: Individual bottle instances linked to wines, scoped by user_id
- **consumption_log**: History of consumed bottles with tasting notes, scoped by user_id

## Key Features
- Multi-user authentication (email/password + Google SSO ready)
- AI Sommelier chat: natural language cellar management, recommendations, consumption tracking, wine bottle photo recognition (vision)
- Scan tab (center): in-app camera with label guide frame overlay, "Enter Manually" button; AI label analysis; results card with 3 actions (Get Info, View in Cellar, Add to Cellar)
- 5-tab layout: Sommelier | Cellar | Scan (raised camera button) | History | Settings
- AI-powered CSV import: auto-detects CellarTracker format (fast path) or uses Claude AI to map columns from any wine app CSV
- Excel export: full cellar data with Wines and Bottles sheets via exceljs
- Cellar list view with stats, filtering, sorting, and search
- Add wine form with grouped sections
- Wine detail view with bottle management
- Customizable storage locations (Rack, Fridge, Cabinet, Closet, Cellar, Wine Bar, Garage, Off-site, Other with custom names)
- Consumption tracking with ratings and notes
- Drink window status indicators (in window/approaching/past peak)
- Support page at /support, Privacy policy at /privacy, Terms of Service at /terms for Apple App Store
- Legal links (Privacy Policy, Terms of Service, Support) in Settings > Legal section
- Legal consent text with tappable links on registration page
- Landing page footer with Privacy Policy, Terms of Service, Support links

## AI Tools (server/ai-tools.ts)
The sommelier can execute these database operations via tool-calling (all scoped by user_id):
- `search_wines` - Search cellar by any criteria
- `get_wine_details` - Full wine + bottle details
- `add_wine` - Add new wine with bottles
- `add_bottles` - Add bottles to existing wine
- `update_wine` / `update_bottle` - Update records
- `consume_bottle` - Record consumption with rating/notes
- `get_cellar_stats` - Cellar summary statistics
- `get_recommendations` - Wine recommendations by criteria
- `get_weather` - Weather-based wine pairing suggestions

## API Routes
All data routes require `Authorization: Bearer <token>` header:
- `GET /api/wines` - List wines with filters/sorting
- `GET /api/wines/:id` - Wine detail with bottles
- `POST /api/wines` - Create wine + bottles
- `PUT /api/wines/:id` - Update wine
- `POST /api/wines/:id/bottles` - Add bottles to wine
- `PUT /api/bottles/:id` - Update bottle
- `PATCH /api/bottles/:id/consume` - Mark bottle consumed
- `POST /api/import` - CSV import (multipart form, AI-powered column mapping)
- `GET /api/export` - Excel export (.xlsx)
- `GET /api/stats` - Dashboard statistics
- `GET /api/filters` - Available filter options
- `GET /api/storage-locations` - User's configured storage locations
- `PUT /api/storage-locations` - Update storage locations (with rename migration)
- `GET /api/consumption` - Consumption history
- `GET /api/consumption/stats` - Consumption analytics (totals, color breakdown, monthly trend)
- `DELETE /api/consumption` - Bulk delete consumption records (body: {ids: number[]})
- `POST /api/consumption/undo` - Undo a bottle consumption (restores bottle to cellar)
- `POST /api/chat` - AI sommelier chat (SSE streaming, sends consumption_completed events with undo support)
- `POST /api/analyze-wine-image` - Wine label analysis

## File Structure
- `app/(auth)/` - Auth screens (login, register)
- `app/(tabs)/` - Tab screens (index, add/scan, sommelier, history, settings)
- `app/wine/[id].tsx` - Wine detail screen
- `app/account.tsx` - Account management (profile, password, delete)
- `app/import-guide.tsx` - Import guide with CellarTracker/Vivino step-by-step instructions
- `app/storage-locations.tsx` - Storage location management (add/remove/rename locations)
- `contexts/AuthContext.tsx` - Auth state management
- `lib/auth-token.ts` - Shared auth token module (breaks circular dep)
- `lib/biometrics.ts` - Biometric authentication utilities (Face ID/fingerprint)
- `lib/query-client.ts` - React Query client with auth headers
- `server/auth.ts` - Auth middleware and routes
- `server/db.ts` - SQLite database setup with user seeding
- `server/routes.ts` - All API endpoints + chat endpoint
- `server/ai-tools.ts` - AI tool definitions and executors
- `server/templates/` - Landing page, support page, and privacy policy HTML
- `components/` - Reusable UI components
- `lib/api.ts` - API types and helpers
- `constants/colors.ts` - Theme colors
