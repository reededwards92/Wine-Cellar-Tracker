# Cellar - Wine Cellar Management App

## Overview
A wine cellar management mobile app built with Expo (React Native) frontend and Express backend with SQLite (better-sqlite3) database.

## Tech Stack
- **Frontend**: Expo SDK 54, React Native, Expo Router (file-based routing), React Query
- **Backend**: Express.js, TypeScript, better-sqlite3 (SQLite)
- **Styling**: React Native StyleSheet with wine-burgundy (#722F37) accent color

## Architecture
- **Frontend** runs on port 8081 (Expo dev server)
- **Backend** runs on port 5000 (Express API server)
- Client communicates with server via RESTful API
- SQLite database stored at `cellar.db` in project root

## Database Tables
- **wines**: Unique wine records (producer + name + vintage)
- **bottles**: Individual bottle instances linked to wines
- **consumption_log**: History of consumed bottles with tasting notes

## Key Features
- CellarTracker CSV import with latin-1 encoding support
- Cellar list view with stats, filtering, sorting, and search
- Add wine form with grouped sections
- Wine detail view with bottle management
- Consumption tracking with ratings and notes
- Drink window status indicators (in window/approaching/past peak)

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

## File Structure
- `app/(tabs)/` - Tab screens (index, add, import, history)
- `app/wine/[id].tsx` - Wine detail screen
- `server/db.ts` - SQLite database setup
- `server/routes.ts` - All API endpoints
- `components/` - Reusable UI components
- `lib/api.ts` - API types and helpers
- `constants/colors.ts` - Theme colors
