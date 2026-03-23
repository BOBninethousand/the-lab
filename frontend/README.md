# The Lab Frontend

A premium AI agent operations dashboard built with React, inspired by Linear's design principles.

## Architecture Overview

### Design System

**Token-Based Theming:**
- All colors defined in Tailwind config (`tailwind.config.js`)
- Inter font with tight letter-spacing for a refined, professional feel
- Monochrome base with accent colors (indigo) used only for meaning
- No box shadows on cards—borders and careful spacing only
- 8px grid system throughout

**Key Principles:**
- Radical color restraint (almost monochrome base)
- 150ms ease transitions throughout
- Generous spacing (20px padding on cards, 24px+ margins)
- No gradients on surfaces (only on avatars as accent)
- Border-radius capped at 8px

### File Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout.jsx          # Sidebar + top bar (critical!)
│   │   ├── StatCard.jsx        # Stat display component
│   │   ├── AgentRow.jsx        # Agent list row
│   │   ├── AvatarCircle.jsx    # Agent avatar with gradients
│   │   └── ActivityList.jsx    # Real-time activity feed
│   ├── pages/
│   │   ├── Dashboard.jsx       # Main hub (stats + agents + activity)
│   │   ├── Agents.jsx          # Agent management + chat
│   │   ├── Office.jsx          # 2D office floor visualization
│   │   ├── Calendar.jsx        # Monthly calendar + scheduled jobs
│   │   ├── Memory.jsx          # Journals & memory vault
│   │   ├── Documents.jsx       # Document management table
│   │   └── Teams.jsx           # Crews & roster with wizard
│   ├── hooks/
│   │   └── useWebSocket.js     # WebSocket connection & auto-reconnect
│   ├── lib/
│   │   ├── api.js              # Fetch wrapper & API endpoints
│   │   └── time.js             # Date/time utilities
│   ├── App.jsx                 # Router setup
│   ├── main.jsx                # React entry point
│   └── index.css               # Tailwind + custom styles
├── index.html                  # HTML entry with Inter font
├── vite.config.js              # Vite config with proxy
├── tailwind.config.js          # Design tokens
├── postcss.config.js           # PostCSS plugins
└── package.json                # Dependencies
```

## Development

### Prerequisites

- Node.js 18+
- Backend running on `http://localhost:8000`

### Setup

```bash
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173` with API proxying to the backend.

### Build

```bash
npm run build
npm run preview
```

## Component Guide

### Layout (`src/components/Layout.jsx`)

The foundational container—220px fixed sidebar + top bar + main content area.

**Sidebar Features:**
- Logo + branding at top
- Navigation links with active state indication (left border)
- Hover states on nav items
- Smooth transitions

**Top Bar:**
- Page title (20px, weight 600)
- WebSocket connection status (green dot + "Connected"/"Offline")

### Pages

#### Dashboard

- **Stats Row**: 4 cards with label + number (no icons)
- **Agents Section**: Scrolling list of agents with status
- **Activity Section**: Real-time feed from WebSocket

#### Agents

- Grid of agent cards with avatar, name, role, goal, provider
- "Add Agent" button → form modal
- Click agent → slide-out chat panel (400px)
- Chat supports message history, typing, send button
- Delete agent button (hover-triggered)

#### Office

- 2D floor grid with desks (110px × 70px)
- Agent avatars positioned on desks
- Animated dots for working agents
- Click agent → popup card with status/task
- Status bar showing active count

#### Calendar

- Month view grid (shows dots for scheduled items)
- Navigation arrows
- "Scheduled Jobs" section with toggle + "Run Now" button
- "Add Job" modal with cron schedule input

#### Memory

- Tabs: "Journals" | "Memories"
- Journal: date-sorted entries, expandable
- Memories: searchable with tag filtering
- "Add Entry"/"Add Memory" modals

#### Documents

- Table layout (Title, Type, Agent, Date columns)
- Expandable rows to show content
- "Create Document" button → form modal
- Responsive (hidden on mobile)

#### Teams

- "Active Crews" grid with crew cards (agent avatars, status)
- "Agent Roster" list
- "Create Crew" button → 4-step wizard:
  1. Name + process type
  2. Select agents (checkboxes)
  3. Define tasks
  4. Review & launch

## API Integration

All API calls go through `src/lib/api.js`:

```javascript
import { getAgents, getSchedule, createAgent, api } from './lib/api'

// Fetch
const data = await getAgents()

// Create/Update
await createAgent({ name: 'Scout', role: 'Research' })
await updateSchedule(id, { enabled: true })

// Custom requests
await api('/api/custom', { method: 'POST', body: JSON.stringify(data) })
```

**Endpoints Expected:**
- `GET /api/agents` → `{ agents: [...] }`
- `GET /api/schedule` → `{ schedule: [...] }`
- `GET /api/crews` → `{ crews: [...] }`
- `GET /api/documents` → `{ documents: [...] }`
- `GET /api/memory` → `{ memories: [...] }`
- `GET /api/activity` → `{ activity: [...] }`
- `POST /api/agents` → create agent
- `DELETE /api/agents/:id` → delete agent
- `WS /ws` → WebSocket for real-time events

## WebSocket Integration

The `useWebSocket` hook manages connection, auto-reconnect, and event filtering:

```javascript
import { useWebSocket } from '../hooks/useWebSocket'

const { events, isConnected } = useWebSocket()

// events: array of last 50 non-system events
// isConnected: boolean
```

**Event Structure:**
```javascript
{
  type: 'task_started' | 'task_completed' | 'agent_update',
  message: 'Agent started task',
  timestamp: '2026-03-22T...',
  agent_id: 'agent-123'
}
```

## Styling Reference

### Typography

- **Page Title**: 20px, weight 600, letter-spacing -0.02em, `text-lab-text-primary`
- **Section Label**: 14px, weight 600, uppercase, letter-spacing 0.05em, `text-lab-text-muted`
- **Body**: 14px, weight 400, line-height 1.6, `text-lab-text-secondary`
- **Stat Numbers**: 28px, weight 700, letter-spacing -0.03em, `text-lab-text-primary`

### Colours

- `--bg: #0C0C0D` (main background)
- `--surface: #141415` (card background)
- `--elevated: #1C1C1E` (modal/elevated surfaces)
- `--border: rgba(255, 255, 255, 0.05)` (subtle borders)
- `--text-primary: #f9fafb` (main text)
- `--text-secondary: #9ca3af` (secondary text)
- `--text-muted: #6b7280` (muted text)
- `--accent: #6366f1` (interactive elements—indigo)
- `--success: #22c55e` (status indicators)
- `--error: #ef4444` (alerts)

### Component Classes

- `.card`: bg-surface, border 1px, rounded-md, padding 20px
- `.card-elevated`: elevated bg, shadow for modals
- `.text-page-title`: Page heading style
- `.text-section-label`: Section header (UPPERCASE)
- `.text-stat`: Large number display
- `.transition-subtle`: 150ms ease on all properties
- `.animate-pulse-subtle`: 3s opacity pulse for idle states
- `.animate-dot-blink`: Dot animation for working status

## Deployment

### Production Build

```bash
npm run build
```

Outputs to `dist/` folder. Serve with your backend or static host.

### Environment Variables

Update `vite.config.js` proxy if backend is on different host:

```javascript
proxy: {
  '/api': 'https://your-backend.com',
  '/ws': {
    target: 'wss://your-backend.com',
    ws: true
  }
}
```

## Performance Notes

- WebSocket events are capped at 50 to prevent memory bloat
- Images/avatars use CSS gradients (no external assets)
- Tailwind is purged in build (only used classes included)
- Code splitting by route (React Router)
- Lazy loading not implemented (small bundle, add if needed)

## Browser Support

- Modern browsers with ES2020+ support
- Chrome, Firefox, Safari, Edge (latest)

## Known Limitations

- Office view doesn't parse actual cron schedules (demo shows random agent positions)
- Chat doesn't persist across page reloads (demo only)
- Some modals don't validate API responses (add error handling as needed)
- No offline mode (real-time updates require WebSocket)
