# Whist Score Keeper Frontend

A Next.js 14+ frontend for the Whist Score Keeper platform with real-time score tracking and WebSocket integration.

## Quick Start

### Prerequisites

- Node.js 18+ (LTS)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
```

### Development

```bash
# Start the development server
npm run dev

# Open in browser
# http://localhost:3000
```

### Build & Production

```bash
# Type check
npm run type-check

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
frontend-app/
├── app/                 # Next.js App Router
│   ├── layout.tsx       # Root layout with providers
│   ├── page.tsx         # Landing page
│   ├── globals.css      # Global styles
│   └── ...              # Other routes
├── components/          # React components
│   ├── ui/              # Base UI components
│   ├── layout/          # Layout components
│   ├── room/            # Room features
│   ├── bidding/         # Bidding phase
│   ├── game/            # Game play
│   ├── scores/          # Score table
│   └── shared/          # Shared components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions
│   ├── socket/          # WebSocket client
│   ├── api/             # API client
│   ├── validation/      # Zod schemas
│   └── utils/           # Helper utilities
├── stores/              # Zustand state management
├── types/               # TypeScript definitions
├── config/              # Configuration
├── .env.local.example   # Environment template
└── tailwind.config.ts   # Tailwind CSS config
```

## Technology Stack

- **Next.js 14+** - React framework with SSR/SSG
- **TypeScript 5+** - Type-safe development
- **Tailwind CSS 3+** - Utility-first styling
- **Zustand 4+** - State management
- **Socket.IO Client 4+** - Real-time communication
- **Radix UI** - Accessible components
- **Framer Motion 11+** - Animation library
- **Zod 3+** - Schema validation
- **React Hook Form 7+** - Form management

## Configuration

### Environment Variables

See `.env.local.example` for all available variables:

```bash
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_URL=http://localhost:8000

# Feature flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_PWA=true
```

## TypeScript

Strict mode is enabled. Run type checking:

```bash
npm run type-check
```

### Path Aliases

- `@/components/*` - Components
- `@/hooks/*` - Hooks
- `@/lib/*` - Utilities and API
- `@/stores/*` - Zustand stores
- `@/types/*` - Type definitions
- `@/config/*` - Configuration

## Responsive Design

Mobile-first approach with breakpoints:

- `xs`: 320px (small phones)
- `sm`: 375px (standard phones)
- `md`: 428px (large phones)
- `lg`: 768px (tablets)
- `xl`: 1024px (small laptops)
- `2xl`: 1280px (desktop)

## Documentation

- [Frontend LLD](../docs/frontend-lld.md) - Detailed design specifications
- [Database Schema](../docs/database-schema-lld.md) - Backend data model

## Development Guidelines

1. **Component Structure** - Follow the folder organization
2. **Type Safety** - Enable strict mode, use Zod for validation
3. **Performance** - Use React.memo, optimize imports with path aliases
4. **Accessibility** - Use Radix UI primitives, test with screen readers
5. **Testing** - Unit tests with vitest (to be configured)

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Start dev server
npm run dev
```

### Module Import Errors

```bash
# Clear build cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
npm install
```

### TypeScript Errors

```bash
# Type check
npm run type-check

# Check tsconfig.json paths
```

## Contributing

Follow the conventions in the LLD documents and maintain TypeScript strict mode.

## License

See LICENSE file in the root directory.
