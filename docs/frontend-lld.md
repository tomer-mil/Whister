# Frontend Low-Level Design
## Whist Score Keeper Platform

**Version:** 1.0  
**Date:** January 2026  
**Status:** Draft  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Structure](#2-project-structure)
3. [Component Architecture](#3-component-architecture)
4. [Zustand Store Design](#4-zustand-store-design)
5. [WebSocket Integration](#5-websocket-integration)
6. [Form Validation Schemas](#6-form-validation-schemas)
7. [Responsive Design System](#7-responsive-design-system)
8. [Animation Specifications](#8-animation-specifications)
9. [Screen Specifications](#9-screen-specifications)
10. [Error Handling & Loading States](#10-error-handling--loading-states)
11. [Accessibility](#11-accessibility)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Overview

### 1.1 Purpose

This document specifies the frontend implementation details for the Whist Score Keeper platform, including component architecture, state management, real-time communication patterns, and responsive design specifications.

### 1.2 Technology Stack

```
Next.js 14+              App Router with Server Components
TypeScript 5.x           Strict mode enabled
Zustand 4.x              Client state management
Socket.IO Client 4.x     Real-time WebSocket communication
Tailwind CSS 3.x         Utility-first styling
Radix UI                 Accessible component primitives
Framer Motion 11.x       Animation library
Zod 3.x                  Runtime schema validation
React Hook Form 7.x      Form state management
```

### 1.3 Design Principles

1. **Mobile-First**: All layouts start from mobile breakpoint
2. **Optimistic Updates**: Immediate UI feedback with server reconciliation
3. **Type Safety**: Full TypeScript coverage with strict mode
4. **Accessibility**: WCAG 2.1 AA compliance
5. **Minimal Latency**: Sub-100ms perceived response times

---

## 2. Project Structure

```
whist-frontend/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # Root layout with providers
│   ├── page.tsx                   # Landing page
│   ├── globals.css                # Global styles + Tailwind
│   ├── (auth)/                    # Auth route group
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── layout.tsx             # Auth-specific layout
│   ├── room/
│   │   ├── create/page.tsx        # Create room screen
│   │   ├── join/page.tsx          # Join room screen
│   │   └── [roomCode]/            # Dynamic room routes
│   │       ├── page.tsx           # Room lobby
│   │       ├── layout.tsx         # Room layout with WebSocket
│   │       └── game/
│   │           ├── page.tsx       # Active game screen
│   │           └── scores/page.tsx # Score table
│   └── profile/
│       └── page.tsx               # User profile & stats
│
├── components/
│   ├── ui/                        # Base UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── toast.tsx
│   │   └── index.ts
│   ├── layout/                    # Layout components
│   │   ├── header.tsx
│   │   ├── mobile-nav.tsx
│   │   └── page-container.tsx
│   ├── room/                      # Room-specific components
│   │   ├── player-list.tsx
│   │   ├── player-card.tsx
│   │   ├── seating-arrangement.tsx
│   │   ├── room-code-display.tsx
│   │   └── join-room-form.tsx
│   ├── bidding/                   # Bidding phase components
│   │   ├── trump-bidding-panel.tsx
│   │   ├── contract-bidding-panel.tsx
│   │   ├── bid-counter.tsx
│   │   ├── suit-selector.tsx
│   │   ├── player-bid-status.tsx
│   │   └── frisch-indicator.tsx
│   ├── game/                      # Game play components
│   │   ├── trick-counter.tsx
│   │   ├── player-progress-ring.tsx
│   │   ├── game-header.tsx
│   │   ├── trick-claim-button.tsx
│   │   └── round-summary-modal.tsx
│   ├── scores/                    # Score table components
│   │   ├── score-table.tsx
│   │   ├── score-row.tsx
│   │   ├── cumulative-chart.tsx
│   │   ├── round-detail-row.tsx
│   │   └── score-cell.tsx
│   └── shared/                    # Shared components
│       ├── connection-status.tsx
│       ├── loading-spinner.tsx
│       ├── error-boundary.tsx
│       └── avatar.tsx
│
├── hooks/                         # Custom React hooks
│   ├── use-socket.ts              # WebSocket connection hook
│   ├── use-socket-event.ts        # Event subscription hook
│   ├── use-game-sync.ts           # Game state synchronization
│   ├── use-optimistic-update.ts   # Optimistic update pattern
│   ├── use-toast.ts               # Toast notifications
│   └── use-media-query.ts         # Responsive breakpoints
│
├── lib/                           # Utility libraries
│   ├── socket/
│   │   ├── client.ts              # Socket.IO client singleton
│   │   ├── events.ts              # Event type definitions
│   │   └── handlers.ts            # Event handler factories
│   ├── api/
│   │   ├── client.ts              # REST API client
│   │   ├── auth.ts                # Auth endpoints
│   │   ├── rooms.ts               # Room endpoints
│   │   └── games.ts               # Game endpoints
│   ├── validation/
│   │   ├── schemas.ts             # Zod schemas
│   │   └── rules.ts               # Game rule validators
│   └── utils/
│       ├── cn.ts                  # Class name utility
│       ├── score-calculator.ts    # Client-side scoring
│       └── format.ts              # Formatters
│
├── stores/                        # Zustand stores
│   ├── index.ts                   # Combined store
│   ├── slices/
│   │   ├── auth-slice.ts          # Authentication state
│   │   ├── room-slice.ts          # Room state
│   │   ├── game-slice.ts          # Game state
│   │   ├── bidding-slice.ts       # Bidding phase state
│   │   ├── scores-slice.ts        # Score table state
│   │   └── ui-slice.ts            # UI state (modals, toasts)
│   └── middleware/
│       ├── persist.ts             # Persistence middleware
│       └── devtools.ts            # DevTools middleware
│
├── types/                         # TypeScript definitions
│   ├── api.ts                     # API response types
│   ├── game.ts                    # Game domain types
│   ├── socket-events.ts           # WebSocket event types
│   └── store.ts                   # Store types
│
└── config/
    ├── constants.ts               # App constants
    ├── breakpoints.ts             # Responsive breakpoints
    └── animations.ts              # Animation variants
```

---

## 3. Component Architecture

### 3.1 Component Tree Overview

```
App Layout
├── Providers (Auth, Socket, Store, Toast)
│
├── Landing Page
│   ├── Hero Section
│   └── Action Buttons (Create/Join)
│
├── Auth Pages
│   ├── Login Form
│   └── Register Form
│
├── Room Flow
│   ├── Create Room Page
│   │   └── CreateRoomForm
│   │
│   ├── Join Room Page
│   │   └── JoinRoomForm
│   │
│   └── Room Lobby ([roomCode])
│       ├── RoomHeader
│       │   ├── RoomCodeDisplay
│       │   └── ConnectionStatus
│       ├── PlayerList
│       │   └── PlayerCard (×4)
│       ├── SeatingArrangement (Admin only)
│       └── StartGameButton (Admin only)
│
├── Game Screen
│   ├── GameHeader
│   │   ├── RoundIndicator
│   │   ├── TrumpDisplay
│   │   └── GameTypeIndicator (Over/Under)
│   │
│   ├── Bidding Phase (conditional)
│   │   ├── TrumpBiddingPanel
│   │   │   ├── CurrentHighestBid
│   │   │   ├── BidCounter
│   │   │   ├── SuitSelector
│   │   │   ├── CallButton
│   │   │   ├── PassButton
│   │   │   └── PlayerBidStatusList
│   │   │
│   │   ├── FrischIndicator (if active)
│   │   │
│   │   └── ContractBiddingPanel
│   │       ├── TrumpWinnerInfo
│   │       ├── ContractBidCounter
│   │       ├── ConfirmButton
│   │       ├── ContractStatusList
│   │       └── SumDisplay + LastBidderWarning
│   │
│   └── Playing Phase (conditional)
│       ├── TrickCounter (personal)
│       │   ├── ProgressRing
│       │   ├── TricksDisplay
│       │   └── ContractDisplay
│       ├── TrickClaimButton
│       ├── AllPlayersProgress
│       │   └── PlayerProgressCard (×4)
│       └── AdminControls
│           ├── UndoTrickButton
│           └── EndRoundButton
│
└── Score Table Screen
    ├── ScoreTableHeader
    │   ├── PlayerNames
    │   └── TotalScores
    ├── ScoreTable
    │   └── ScoreRow (×rounds)
    │       ├── RoundNumber
    │       ├── TrumpIndicator
    │       ├── GameTypeIndicator
    │       └── ScoreCell (×4)
    ├── CumulativeChart (landscape)
    └── AdminControls
        ├── NewRoundButton
        ├── EditScoreButton
        └── EndGameButton
```

### 3.2 Component Hierarchy by Screen

#### 3.2.1 Room Lobby Screen

```tsx
// app/room/[roomCode]/page.tsx

import { RoomLobby } from '@/components/room/room-lobby';

export default function RoomLobbyPage({ 
  params 
}: { 
  params: { roomCode: string } 
}) {
  return <RoomLobby roomCode={params.roomCode} />;
}
```

```
RoomLobby
├── PageContainer
│   ├── RoomHeader
│   │   ├── BackButton
│   │   ├── RoomCodeDisplay
│   │   │   ├── CodeText (large, copyable)
│   │   │   └── ShareButton
│   │   └── ConnectionStatus
│   │       └── StatusDot (green/yellow/red)
│   │
│   ├── PlayerSection
│   │   ├── SectionTitle ("Players (2/4)")
│   │   └── PlayerList
│   │       ├── PlayerCard
│   │       │   ├── Avatar
│   │       │   ├── DisplayName
│   │       │   ├── AdminBadge (if admin)
│   │       │   ├── ConnectionIndicator
│   │       │   └── SeatPosition (if assigned)
│   │       └── EmptySlot (×remaining)
│   │
│   ├── SeatingArrangement (Admin only)
│   │   ├── SectionTitle
│   │   ├── SeatingDiagram
│   │   │   └── SeatSlot (×4, draggable)
│   │   └── RandomizeButton
│   │
│   └── ActionArea
│       ├── StartGameButton (Admin, disabled until 4 players)
│       ├── LeaveRoomButton
│       └── InviteLink
```

#### 3.2.2 Bidding Screen

```
BiddingScreen
├── GameHeader
│   ├── RoundBadge ("Round 3")
│   ├── PhaseIndicator
│   └── ConnectionStatus
│
├── TrumpBiddingPanel (phase === 'trump_bidding')
│   ├── CurrentBidDisplay
│   │   ├── HighestBid (or "No bids yet")
│   │   ├── BidderName
│   │   └── SuitIcon
│   │
│   ├── FrischAlert (if frisch_count > 0)
│   │   ├── FrischNumber ("Frisch 2/3")
│   │   └── MinimumBidInfo ("Minimum bid: 6")
│   │
│   ├── BiddingControls (if isMyTurn)
│   │   ├── BidCounter
│   │   │   ├── DecrementButton
│   │   │   ├── BidValue
│   │   │   └── IncrementButton
│   │   ├── SuitSelector
│   │   │   └── SuitButton (×5: ♣, ♦, ♥, ♠, NT)
│   │   └── ActionButtons
│   │       ├── CallBidButton
│   │       └── PassButton
│   │
│   ├── WaitingMessage (if !isMyTurn)
│   │   └── CurrentBidderInfo
│   │
│   └── PlayerStatusList
│       └── PlayerBidStatus (×4)
│           ├── PlayerName
│           ├── StatusIcon (waiting/passed/bid)
│           └── BidInfo (if bid)
│
└── ContractBiddingPanel (phase === 'contract_bidding')
    ├── TrumpInfoBanner
    │   ├── TrumpSuitDisplay
    │   ├── WinnerName
    │   └── WinningBid
    │
    ├── ContractControls (if isMyTurn)
    │   ├── BidCounter (0-13)
    │   ├── ConfirmButton
    │   └── ValidationMessage
    │
    ├── WaitingMessage (if !isMyTurn)
    │
    ├── ContractStatusList
    │   └── ContractStatus (×4)
    │       ├── PlayerName
    │       ├── SeatBadge
    │       ├── ContractValue (if set)
    │       └── CurrentIndicator (if bidding)
    │
    └── SumDisplay
        ├── CurrentSum
        ├── GameTypePreview (Over/Under)
        └── LastBidderWarning (if applicable)
```

#### 3.2.3 Playing Screen

```
PlayingScreen
├── GameHeader
│   ├── RoundInfo
│   │   ├── RoundNumber
│   │   └── TrickProgress ("Trick 7/13")
│   ├── TrumpDisplay
│   │   ├── SuitIcon (large)
│   │   └── SuitName
│   └── GameTypeBadge
│       └── "OVER" or "UNDER" (styled differently)
│
├── PersonalProgress (prominent, centered)
│   ├── ProgressRing
│   │   ├── AnimatedCircle (fills as tricks won)
│   │   └── CenterContent
│   │       ├── TricksWon (large number)
│   │       └── ContractLabel ("/ 5 contract")
│   ├── StatusText
│   │   ├── "On track" / "Behind by 2" / "Ahead by 1"
│   │   └── Color-coded (green/yellow/red)
│   └── TrickClaimButton (large, prominent)
│
├── AllPlayersGrid
│   └── PlayerProgressCard (×4)
│       ├── PlayerName
│       ├── MiniProgressBar
│       ├── TricksDisplay ("3/5")
│       └── StatusIndicator
│
└── AdminControls (if isAdmin)
    ├── UndoLastTrickButton
    │   └── ConfirmDialog
    └── EndRoundEarlyButton
        └── ConfirmDialog
```

#### 3.2.4 Score Table Screen

```
ScoreTableScreen
├── ScoreHeader
│   ├── GameTitle
│   ├── RoundCount ("8 Rounds Played")
│   └── ConnectionStatus
│
├── TotalScoresBar (sticky)
│   └── PlayerTotalCard (×4)
│       ├── PlayerName
│       ├── TotalScore (large)
│       └── RankBadge (1st, 2nd, etc.)
│
├── ScoreTable (scrollable)
│   ├── TableHeader
│   │   ├── RoundColumn
│   │   ├── TrumpColumn
│   │   ├── TypeColumn
│   │   └── PlayerColumn (×4)
│   │
│   └── TableBody
│       └── ScoreRow (×rounds)
│           ├── RoundCell
│           │   └── RoundNumber
│           ├── TrumpCell
│           │   └── SuitIcon
│           ├── TypeCell
│           │   └── OverUnderBadge
│           └── ScoreCell (×4)
│               ├── Contract
│               ├── Tricks
│               ├── Score (color-coded)
│               └── CumulativeScore (subtle)
│
├── CumulativeChart (landscape only)
│   ├── LineChart
│   │   └── PlayerLine (×4, colored)
│   └── Legend
│
└── AdminControls (if isAdmin)
    ├── NewRoundButton
    ├── EditScoreModal
    │   ├── RoundSelector
    │   ├── PlayerSelector
    │   ├── TricksInput
    │   └── SaveButton
    └── EndGameButton
        └── ConfirmDialog
```

### 3.3 Base Component Specifications

#### Button Component

```tsx
// components/ui/button.tsx

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center rounded-lg font-medium transition-all ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 
          'bg-indigo-600 text-white hover:bg-indigo-700 ' +
          'focus-visible:ring-indigo-500',
        secondary: 
          'bg-gray-100 text-gray-900 hover:bg-gray-200 ' +
          'focus-visible:ring-gray-500',
        outline: 
          'border-2 border-gray-300 bg-transparent hover:bg-gray-50 ' +
          'focus-visible:ring-gray-500',
        destructive: 
          'bg-red-600 text-white hover:bg-red-700 ' +
          'focus-visible:ring-red-500',
        ghost: 
          'bg-transparent hover:bg-gray-100 ' +
          'focus-visible:ring-gray-500',
        success:
          'bg-emerald-600 text-white hover:bg-emerald-700 ' +
          'focus-visible:ring-emerald-500',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-base',
        lg: 'h-14 px-6 text-lg',
        xl: 'h-16 px-8 text-xl',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
        'icon-lg': 'h-14 w-14',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner className="mr-2 h-4 w-4" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

#### Card Component

```tsx
// components/ui/card.tsx

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const cardVariants = cva(
  'rounded-xl border bg-white transition-all',
  {
    variants: {
      variant: {
        default: 'border-gray-200 shadow-sm',
        elevated: 'border-transparent shadow-lg',
        outlined: 'border-gray-300 shadow-none',
        interactive: 
          'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 cursor-pointer',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, className }))}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
```

---

## 4. Zustand Store Design

### 4.1 Store Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ZUSTAND STORE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Auth Slice  │  │ Room Slice  │  │ Game Slice  │             │
│  │             │  │             │  │             │             │
│  │ • user      │  │ • roomCode  │  │ • gameId    │             │
│  │ • token     │  │ • players   │  │ • status    │             │
│  │ • isAuthed  │  │ • isAdmin   │  │ • round     │             │
│  │             │  │ • seating   │  │ • players   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │Bidding Slice│  │Scores Slice │  │  UI Slice   │             │
│  │             │  │             │  │             │             │
│  │ • phase     │  │ • rounds[]  │  │ • toasts    │             │
│  │ • trumpBid  │  │ • totals    │  │ • modals    │             │
│  │ • contracts │  │ • rankings  │  │ • loading   │             │
│  │ • turn      │  │             │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Type Definitions

```typescript
// types/store.ts

import type { TrumpSuit, GameType, GameStatus, RoundPhase } from './game';

// ============================================================
// Auth Slice Types
// ============================================================

export interface User {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

// ============================================================
// Room Slice Types
// ============================================================

export interface RoomPlayer {
  userId: string;
  displayName: string;
  seatPosition: number | null;
  isConnected: boolean;
  isAdmin: boolean;
}

export interface RoomState {
  roomCode: string | null;
  roomId: string | null;
  players: RoomPlayer[];
  isAdmin: boolean;
  maxPlayers: number;
  isJoining: boolean;
  isCreating: boolean;
}

export interface RoomActions {
  createRoom: () => Promise<string>;
  joinRoom: (roomCode: string) => Promise<void>;
  leaveRoom: () => void;
  updateSeating: (playerId: string, position: number) => void;
  randomizeSeating: () => void;
  setPlayers: (players: RoomPlayer[]) => void;
  addPlayer: (player: RoomPlayer) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerConnection: (playerId: string, isConnected: boolean) => void;
}

// ============================================================
// Game Slice Types
// ============================================================

export interface GamePlayer {
  userId: string;
  displayName: string;
  seatPosition: number;
  contractBid: number | null;
  tricksWon: number;
  score: number | null;
  isConnected: boolean;
}

export interface GameState {
  gameId: string | null;
  status: GameStatus;
  currentRound: number;
  totalRounds: number;
  players: GamePlayer[];
  myPlayerId: string | null;
}

export interface GameActions {
  startGame: () => Promise<void>;
  setGameState: (state: Partial<GameState>) => void;
  updatePlayer: (playerId: string, data: Partial<GamePlayer>) => void;
  resetGame: () => void;
}

// ============================================================
// Bidding Slice Types
// ============================================================

export interface TrumpBid {
  playerId: string;
  playerName: string;
  amount: number;
  suit: TrumpSuit;
  timestamp: string;
}

export interface ContractBid {
  playerId: string;
  playerName: string;
  seatPosition: number;
  amount: number;
  timestamp: string;
}

export interface BiddingState {
  phase: RoundPhase;
  currentTurnPlayerId: string | null;
  
  // Trump bidding
  trumpBids: TrumpBid[];
  highestTrumpBid: TrumpBid | null;
  minimumBid: number;
  consecutivePasses: number;
  frischCount: number;
  
  // Contract bidding
  contracts: ContractBid[];
  contractSum: number;
  trumpWinnerId: string | null;
  trumpWinningBid: number | null;
  trumpSuit: TrumpSuit | null;
  gameType: GameType | null;
  
  // UI state
  isMyTurn: boolean;
  isSubmitting: boolean;
}

export interface BiddingActions {
  placeTrumpBid: (amount: number, suit: TrumpSuit) => Promise<void>;
  passTrumpBid: () => Promise<void>;
  placeContractBid: (amount: number) => Promise<void>;
  
  setPhase: (phase: RoundPhase) => void;
  setTrumpBids: (bids: TrumpBid[]) => void;
  addTrumpBid: (bid: TrumpBid) => void;
  setTrumpResult: (winnerId: string, bid: number, suit: TrumpSuit) => void;
  setFrisch: (frischCount: number, minimumBid: number) => void;
  setContracts: (contracts: ContractBid[]) => void;
  addContract: (contract: ContractBid) => void;
  setContractsComplete: (gameType: GameType) => void;
  setCurrentTurn: (playerId: string) => void;
  resetBidding: () => void;
}

// ============================================================
// Scores Slice Types
// ============================================================

export interface RoundScore {
  roundNumber: number;
  trumpSuit: TrumpSuit;
  gameType: GameType;
  trumpWinnerId: string;
  playerScores: {
    playerId: string;
    displayName: string;
    seatPosition: number;
    contractBid: number;
    tricksWon: number;
    score: number;
    madeContract: boolean;
    cumulativeScore: number;
  }[];
  commentary: string[];
}

export interface PlayerTotal {
  playerId: string;
  displayName: string;
  totalScore: number;
  rank: number;
  roundsWon: number;
  perfectRounds: number;
}

export interface ScoresState {
  rounds: RoundScore[];
  playerTotals: PlayerTotal[];
  isLoading: boolean;
}

export interface ScoresActions {
  addRoundScore: (round: RoundScore) => void;
  setRounds: (rounds: RoundScore[]) => void;
  updateRound: (roundNumber: number, data: Partial<RoundScore>) => void;
  calculateTotals: () => void;
  fetchScores: (gameId: string) => Promise<void>;
}

// ============================================================
// UI Slice Types
// ============================================================

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

export interface UIState {
  toasts: Toast[];
  activeModal: string | null;
  modalProps: Record<string, unknown>;
  isLoading: boolean;
  loadingMessage: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
}

export interface UIActions {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  openModal: (modalId: string, props?: Record<string, unknown>) => void;
  closeModal: () => void;
  setLoading: (isLoading: boolean, message?: string) => void;
  setConnectionStatus: (status: UIState['connectionStatus']) => void;
}

// ============================================================
// Combined Store Type
// ============================================================

export type StoreState = 
  AuthState & 
  RoomState & 
  GameState & 
  BiddingState & 
  ScoresState & 
  UIState;

export type StoreActions = 
  AuthActions & 
  RoomActions & 
  GameActions & 
  BiddingActions & 
  ScoresActions & 
  UIActions;

export type Store = StoreState & StoreActions;
```

### 4.3 Slice Implementations

#### Auth Slice

```typescript
// stores/slices/auth-slice.ts

import { StateCreator } from 'zustand';
import type { Store, AuthState, AuthActions } from '@/types/store';
import { apiClient } from '@/lib/api/client';

export interface AuthSlice extends AuthState, AuthActions {}

const initialAuthState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
};

export const createAuthSlice: StateCreator<Store, [], [], AuthSlice> = (set, get) => ({
  ...initialAuthState,
  
  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, access_token, refresh_token } = response.data;
      
      set({
        user,
        accessToken: access_token,
        refreshToken: refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
      
      // Store tokens
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', refresh_token);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  register: async (email, password, displayName) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.post('/auth/register', {
        email,
        password,
        display_name: displayName,
      });
      const { user, access_token, refresh_token } = response.data;
      
      set({
        user,
        accessToken: access_token,
        refreshToken: refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });
      
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', refresh_token);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set(initialAuthState);
  },
  
  refreshAuth: async () => {
    const refreshToken = get().refreshToken || localStorage.getItem('refreshToken');
    if (!refreshToken) {
      get().logout();
      return;
    }
    
    try {
      const response = await apiClient.post('/auth/refresh', {
        refresh_token: refreshToken,
      });
      const { access_token, refresh_token: newRefreshToken } = response.data;
      
      set({
        accessToken: access_token,
        refreshToken: newRefreshToken,
      });
      
      localStorage.setItem('accessToken', access_token);
      localStorage.setItem('refreshToken', newRefreshToken);
    } catch {
      get().logout();
    }
  },
  
  setUser: (user) => set({ user, isAuthenticated: true }),
});
```

#### Room Slice

```typescript
// stores/slices/room-slice.ts

import { StateCreator } from 'zustand';
import type { Store, RoomState, RoomActions, RoomPlayer } from '@/types/store';
import { apiClient } from '@/lib/api/client';

export interface RoomSlice extends RoomState, RoomActions {}

const initialRoomState: RoomState = {
  roomCode: null,
  roomId: null,
  players: [],
  isAdmin: false,
  maxPlayers: 4,
  isJoining: false,
  isCreating: false,
};

export const createRoomSlice: StateCreator<Store, [], [], RoomSlice> = (set, get) => ({
  ...initialRoomState,
  
  createRoom: async () => {
    set({ isCreating: true });
    try {
      const response = await apiClient.post('/rooms');
      const { room_code, room_id } = response.data;
      
      set({
        roomCode: room_code,
        roomId: room_id,
        isAdmin: true,
        isCreating: false,
        players: [{
          userId: get().user!.id,
          displayName: get().user!.displayName,
          seatPosition: null,
          isConnected: true,
          isAdmin: true,
        }],
      });
      
      return room_code;
    } catch (error) {
      set({ isCreating: false });
      throw error;
    }
  },
  
  joinRoom: async (roomCode) => {
    set({ isJoining: true });
    try {
      const response = await apiClient.post(`/rooms/${roomCode}/join`);
      const { room_id, players, is_admin } = response.data;
      
      set({
        roomCode,
        roomId: room_id,
        players: players.map(mapPlayerFromApi),
        isAdmin: is_admin,
        isJoining: false,
      });
    } catch (error) {
      set({ isJoining: false });
      throw error;
    }
  },
  
  leaveRoom: () => {
    const roomCode = get().roomCode;
    if (roomCode) {
      apiClient.post(`/rooms/${roomCode}/leave`).catch(console.error);
    }
    set(initialRoomState);
  },
  
  updateSeating: (playerId, position) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === playerId ? { ...p, seatPosition: position } : p
      ),
    }));
  },
  
  randomizeSeating: () => {
    const positions = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    set((state) => ({
      players: state.players.map((p, i) => ({
        ...p,
        seatPosition: positions[i],
      })),
    }));
  },
  
  setPlayers: (players) => set({ players }),
  
  addPlayer: (player) => {
    set((state) => ({
      players: [...state.players, player],
    }));
  },
  
  removePlayer: (playerId) => {
    set((state) => ({
      players: state.players.filter((p) => p.userId !== playerId),
    }));
  },
  
  updatePlayerConnection: (playerId, isConnected) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.userId === playerId ? { ...p, isConnected } : p
      ),
    }));
  },
});

// Helper function
function mapPlayerFromApi(apiPlayer: Record<string, unknown>): RoomPlayer {
  return {
    userId: apiPlayer.user_id as string,
    displayName: apiPlayer.display_name as string,
    seatPosition: apiPlayer.seat_position as number | null,
    isConnected: apiPlayer.is_connected as boolean,
    isAdmin: apiPlayer.is_admin as boolean,
  };
}
```

#### Bidding Slice

```typescript
// stores/slices/bidding-slice.ts

import { StateCreator } from 'zustand';
import type { 
  Store, 
  BiddingState, 
  BiddingActions, 
  TrumpBid, 
  ContractBid 
} from '@/types/store';
import type { TrumpSuit, GameType, RoundPhase } from '@/types/game';
import { getSocket } from '@/lib/socket/client';

export interface BiddingSlice extends BiddingState, BiddingActions {}

const initialBiddingState: BiddingState = {
  phase: 'trump_bidding',
  currentTurnPlayerId: null,
  
  trumpBids: [],
  highestTrumpBid: null,
  minimumBid: 5,
  consecutivePasses: 0,
  frischCount: 0,
  
  contracts: [],
  contractSum: 0,
  trumpWinnerId: null,
  trumpWinningBid: null,
  trumpSuit: null,
  gameType: null,
  
  isMyTurn: false,
  isSubmitting: false,
};

export const createBiddingSlice: StateCreator<Store, [], [], BiddingSlice> = (set, get) => ({
  ...initialBiddingState,
  
  placeTrumpBid: async (amount, suit) => {
    set({ isSubmitting: true });
    const socket = getSocket();
    
    return new Promise((resolve, reject) => {
      socket.emit('bid:trump', { amount, suit }, (response: { success: boolean; error?: string }) => {
        set({ isSubmitting: false });
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to place bid'));
        }
      });
    });
  },
  
  passTrumpBid: async () => {
    set({ isSubmitting: true });
    const socket = getSocket();
    
    return new Promise((resolve, reject) => {
      socket.emit('bid:pass', {}, (response: { success: boolean; error?: string }) => {
        set({ isSubmitting: false });
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to pass'));
        }
      });
    });
  },
  
  placeContractBid: async (amount) => {
    set({ isSubmitting: true });
    const socket = getSocket();
    
    return new Promise((resolve, reject) => {
      socket.emit('bid:contract', { amount }, (response: { success: boolean; error?: string }) => {
        set({ isSubmitting: false });
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to place contract'));
        }
      });
    });
  },
  
  setPhase: (phase) => set({ phase }),
  
  setTrumpBids: (bids) => {
    const highestBid = bids.length > 0 ? bids[bids.length - 1] : null;
    set({ 
      trumpBids: bids, 
      highestTrumpBid: highestBid,
    });
  },
  
  addTrumpBid: (bid) => {
    set((state) => ({
      trumpBids: [...state.trumpBids, bid],
      highestTrumpBid: bid,
      consecutivePasses: 0,
    }));
  },
  
  setTrumpResult: (winnerId, bid, suit) => {
    set({
      trumpWinnerId: winnerId,
      trumpWinningBid: bid,
      trumpSuit: suit,
      phase: 'contract_bidding',
    });
  },
  
  setFrisch: (frischCount, minimumBid) => {
    set({
      frischCount,
      minimumBid,
      phase: 'frisch',
      trumpBids: [],
      highestTrumpBid: null,
      consecutivePasses: 0,
    });
  },
  
  setContracts: (contracts) => {
    const sum = contracts.reduce((acc, c) => acc + c.amount, 0);
    set({ contracts, contractSum: sum });
  },
  
  addContract: (contract) => {
    set((state) => ({
      contracts: [...state.contracts, contract],
      contractSum: state.contractSum + contract.amount,
    }));
  },
  
  setContractsComplete: (gameType) => {
    set({
      gameType,
      phase: 'playing',
    });
  },
  
  setCurrentTurn: (playerId) => {
    const myId = get().user?.id;
    set({
      currentTurnPlayerId: playerId,
      isMyTurn: playerId === myId,
    });
  },
  
  resetBidding: () => set(initialBiddingState),
});
```

#### UI Slice

```typescript
// stores/slices/ui-slice.ts

import { StateCreator } from 'zustand';
import type { Store, UIState, UIActions, Toast } from '@/types/store';
import { nanoid } from 'nanoid';

export interface UISlice extends UIState, UIActions {}

const initialUIState: UIState = {
  toasts: [],
  activeModal: null,
  modalProps: {},
  isLoading: false,
  loadingMessage: null,
  connectionStatus: 'disconnected',
};

export const createUISlice: StateCreator<Store, [], [], UISlice> = (set) => ({
  ...initialUIState,
  
  showToast: (toast) => {
    const id = nanoid();
    const newToast: Toast = { ...toast, id };
    
    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));
    
    // Auto-dismiss after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  
  openModal: (modalId, props = {}) => {
    set({ activeModal: modalId, modalProps: props });
  },
  
  closeModal: () => {
    set({ activeModal: null, modalProps: {} });
  },
  
  setLoading: (isLoading, message = null) => {
    set({ isLoading, loadingMessage: message });
  },
  
  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },
});
```

### 4.4 Combined Store

```typescript
// stores/index.ts

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { Store } from '@/types/store';
import { createAuthSlice } from './slices/auth-slice';
import { createRoomSlice } from './slices/room-slice';
import { createGameSlice } from './slices/game-slice';
import { createBiddingSlice } from './slices/bidding-slice';
import { createScoresSlice } from './slices/scores-slice';
import { createUISlice } from './slices/ui-slice';

export const useStore = create<Store>()(
  devtools(
    subscribeWithSelector(
      persist(
        immer((...args) => ({
          ...createAuthSlice(...args),
          ...createRoomSlice(...args),
          ...createGameSlice(...args),
          ...createBiddingSlice(...args),
          ...createScoresSlice(...args),
          ...createUISlice(...args),
        })),
        {
          name: 'whist-store',
          // Only persist auth data
          partialize: (state) => ({
            user: state.user,
            accessToken: state.accessToken,
            refreshToken: state.refreshToken,
            isAuthenticated: state.isAuthenticated,
          }),
        }
      )
    ),
    { name: 'WhistStore' }
  )
);

// ============================================================
// Selectors
// ============================================================

// Auth selectors
export const selectUser = (state: Store) => state.user;
export const selectIsAuthenticated = (state: Store) => state.isAuthenticated;

// Room selectors
export const selectRoomCode = (state: Store) => state.roomCode;
export const selectPlayers = (state: Store) => state.players;
export const selectIsAdmin = (state: Store) => state.isAdmin;
export const selectCanStartGame = (state: Store) => 
  state.isAdmin && 
  state.players.length === 4 && 
  state.players.every((p) => p.seatPosition !== null);

// Game selectors
export const selectGameStatus = (state: Store) => state.status;
export const selectCurrentRound = (state: Store) => state.currentRound;
export const selectMyPlayer = (state: Store) => 
  state.players.find((p) => p.userId === state.user?.id);

// Bidding selectors
export const selectBiddingPhase = (state: Store) => state.phase;
export const selectIsMyTurn = (state: Store) => state.isMyTurn;
export const selectHighestTrumpBid = (state: Store) => state.highestTrumpBid;
export const selectTrumpSuit = (state: Store) => state.trumpSuit;
export const selectGameType = (state: Store) => state.gameType;
export const selectContractSum = (state: Store) => state.contractSum;

// Scores selectors
export const selectRounds = (state: Store) => state.rounds;
export const selectPlayerTotals = (state: Store) => state.playerTotals;

// UI selectors
export const selectConnectionStatus = (state: Store) => state.connectionStatus;
export const selectToasts = (state: Store) => state.toasts;
export const selectActiveModal = (state: Store) => state.activeModal;
```

---

## 5. WebSocket Integration

### 5.1 Socket Client Setup

```typescript
// lib/socket/client.ts

import { io, Socket } from 'socket.io-client';
import { useStore } from '@/stores';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    throw new Error('Socket not initialized. Call initSocket first.');
  }
  return socket;
}

export function initSocket(accessToken: string): Socket {
  if (socket?.connected) {
    return socket;
  }
  
  const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';
  
  socket = io(socketUrl, {
    path: '/ws/socket.io',
    transports: ['websocket', 'polling'],
    auth: {
      token: accessToken,
    },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
  
  // Connection event handlers
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
    useStore.getState().setConnectionStatus('connected');
  });
  
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    useStore.getState().setConnectionStatus('disconnected');
  });
  
  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error);
    useStore.getState().setConnectionStatus('disconnected');
  });
  
  socket.io.on('reconnect_attempt', (attempt) => {
    console.log('[Socket] Reconnecting, attempt:', attempt);
    useStore.getState().setConnectionStatus('reconnecting');
  });
  
  socket.io.on('reconnect', () => {
    console.log('[Socket] Reconnected');
    useStore.getState().setConnectionStatus('connected');
  });
  
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

### 5.2 Event Type Definitions

```typescript
// types/socket-events.ts

import type { TrumpSuit, GameType, RoundPhase } from './game';

// ============================================================
// Client → Server Events
// ============================================================

export interface ClientToServerEvents {
  // Room events
  'room:join': (
    data: { room_code: string },
    callback: (response: SocketResponse<RoomJoinedPayload>) => void
  ) => void;
  'room:leave': (
    data: { room_code: string },
    callback: (response: SocketResponse<null>) => void
  ) => void;
  'room:update_seating': (
    data: { player_id: string; seat_position: number },
    callback: (response: SocketResponse<null>) => void
  ) => void;
  'room:start_game': (
    data: Record<string, never>,
    callback: (response: SocketResponse<GameStartedPayload>) => void
  ) => void;
  
  // Bidding events
  'bid:trump': (
    data: { amount: number; suit: TrumpSuit },
    callback: (response: SocketResponse<null>) => void
  ) => void;
  'bid:pass': (
    data: Record<string, never>,
    callback: (response: SocketResponse<null>) => void
  ) => void;
  'bid:contract': (
    data: { amount: number },
    callback: (response: SocketResponse<null>) => void
  ) => void;
  
  // Game events
  'game:claim_trick': (
    data: Record<string, never>,
    callback: (response: SocketResponse<TrickClaimedPayload>) => void
  ) => void;
  'game:undo_trick': (
    data: { player_id: string },
    callback: (response: SocketResponse<null>) => void
  ) => void;
  'game:end_round': (
    data: Record<string, never>,
    callback: (response: SocketResponse<RoundCompletePayload>) => void
  ) => void;
  
  // State sync
  'sync:request': (
    data: Record<string, never>,
    callback: (response: SocketResponse<FullStatePayload>) => void
  ) => void;
}

// ============================================================
// Server → Client Events
// ============================================================

export interface ServerToClientEvents {
  // Room events
  'room:player_joined': (payload: PlayerJoinedPayload) => void;
  'room:player_left': (payload: PlayerLeftPayload) => void;
  'room:player_connected': (payload: PlayerConnectionPayload) => void;
  'room:player_disconnected': (payload: PlayerConnectionPayload) => void;
  'room:seating_updated': (payload: SeatingUpdatedPayload) => void;
  'room:game_starting': (payload: GameStartingPayload) => void;
  
  // Bidding events
  'bid:trump_placed': (payload: TrumpBidPlacedPayload) => void;
  'bid:player_passed': (payload: PlayerPassedPayload) => void;
  'bid:frisch_started': (payload: FrischStartedPayload) => void;
  'bid:trump_set': (payload: TrumpSetPayload) => void;
  'bid:turn_changed': (payload: TurnChangedPayload) => void;
  'bid:contract_placed': (payload: ContractPlacedPayload) => void;
  'bid:contracts_complete': (payload: ContractsCompletePayload) => void;
  
  // Game events
  'game:trick_claimed': (payload: TrickClaimedPayload) => void;
  'game:trick_undone': (payload: TrickUndonePayload) => void;
  'game:round_complete': (payload: RoundCompletePayload) => void;
  'game:ended': (payload: GameEndedPayload) => void;
  
  // State sync
  'sync:full_state': (payload: FullStatePayload) => void;
  
  // Error
  'error': (payload: ErrorPayload) => void;
}

// ============================================================
// Payload Types
// ============================================================

export interface SocketResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
}

export interface PlayerJoinedPayload {
  user_id: string;
  display_name: string;
  is_connected: boolean;
}

export interface PlayerLeftPayload {
  user_id: string;
}

export interface PlayerConnectionPayload {
  user_id: string;
  is_connected: boolean;
}

export interface SeatingUpdatedPayload {
  players: Array<{
    user_id: string;
    seat_position: number | null;
  }>;
}

export interface GameStartingPayload {
  game_id: string;
  countdown_seconds: number;
}

export interface TrumpBidPlacedPayload {
  player_id: string;
  player_name: string;
  amount: number;
  suit: TrumpSuit;
  timestamp: string;
}

export interface PlayerPassedPayload {
  player_id: string;
  player_name: string;
  consecutive_passes: number;
  timestamp: string;
}

export interface FrischStartedPayload {
  frisch_number: number;
  new_minimum_bid: number;
  message: string;
}

export interface TrumpSetPayload {
  trump_suit: TrumpSuit;
  winner_id: string;
  winner_name: string;
  winning_bid: number;
  message: string;
}

export interface TurnChangedPayload {
  current_player_id: string;
  current_player_name: string;
  phase: RoundPhase;
}

export interface ContractPlacedPayload {
  player_id: string;
  player_name: string;
  seat_position: number;
  amount: number;
  timestamp: string;
}

export interface ContractsCompletePayload {
  contracts: ContractPlacedPayload[];
  total_contracts: number;
  game_type: GameType;
  message: string;
}

export interface TrickClaimedPayload {
  player_id: string;
  player_name: string;
  new_trick_count: number;
  total_tricks_played: number;
}

export interface TrickUndonePayload {
  player_id: string;
  player_name: string;
  new_trick_count: number;
  total_tricks_played: number;
  undone_by: string;
}

export interface RoundCompletePayload {
  round_number: number;
  trump_suit: TrumpSuit;
  game_type: GameType;
  players: Array<{
    user_id: string;
    display_name: string;
    seat_position: number;
    contract_bid: number;
    tricks_won: number;
    score: number;
    made_contract: boolean;
  }>;
  commentary: string[];
}

export interface GameEndedPayload {
  game_id: string;
  final_scores: Array<{
    user_id: string;
    display_name: string;
    total_score: number;
    rank: number;
  }>;
  total_rounds: number;
}

export interface FullStatePayload {
  room: {
    room_code: string;
    players: Array<{
      user_id: string;
      display_name: string;
      seat_position: number | null;
      is_connected: boolean;
      is_admin: boolean;
    }>;
  };
  game?: {
    game_id: string;
    status: string;
    current_round: number;
    phase: RoundPhase;
    trump_suit?: TrumpSuit;
    game_type?: GameType;
    current_turn_player_id?: string;
    players: Array<{
      user_id: string;
      display_name: string;
      seat_position: number;
      contract_bid: number | null;
      tricks_won: number;
    }>;
    trump_bids?: TrumpBidPlacedPayload[];
    contracts?: ContractPlacedPayload[];
  };
  rounds?: RoundCompletePayload[];
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

### 5.3 useSocket Hook

```typescript
// hooks/use-socket.ts

import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useStore } from '@/stores';
import { initSocket, disconnectSocket, getSocket } from '@/lib/socket/client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types/socket-events';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseSocketOptions {
  autoConnect?: boolean;
  roomCode?: string;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { autoConnect = true, roomCode } = options;
  const socketRef = useRef<TypedSocket | null>(null);
  
  const accessToken = useStore((state) => state.accessToken);
  const setConnectionStatus = useStore((state) => state.setConnectionStatus);
  
  // Initialize socket
  useEffect(() => {
    if (!autoConnect || !accessToken) return;
    
    socketRef.current = initSocket(accessToken) as TypedSocket;
    
    return () => {
      if (roomCode) {
        socketRef.current?.emit('room:leave', { room_code: roomCode }, () => {});
      }
    };
  }, [autoConnect, accessToken, roomCode]);
  
  // Emit with acknowledgment
  const emit = useCallback(<K extends keyof ClientToServerEvents>(
    event: K,
    data: Parameters<ClientToServerEvents[K]>[0],
  ): Promise<Parameters<Parameters<ClientToServerEvents[K]>[1]>[0]> => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      
      socket.emit(event, data as never, ((response: Parameters<Parameters<ClientToServerEvents[K]>[1]>[0]) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Socket operation failed'));
        }
      }) as never);
    });
  }, []);
  
  // Disconnect
  const disconnect = useCallback(() => {
    disconnectSocket();
    setConnectionStatus('disconnected');
  }, [setConnectionStatus]);
  
  return {
    socket: socketRef.current,
    emit,
    disconnect,
    isConnected: socketRef.current?.connected ?? false,
  };
}
```

### 5.4 useSocketEvent Hook

```typescript
// hooks/use-socket-event.ts

import { useEffect, useRef } from 'react';
import type { ServerToClientEvents } from '@/types/socket-events';
import { getSocket } from '@/lib/socket/client';

export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K],
  deps: React.DependencyList = []
) {
  const handlerRef = useRef(handler);
  
  // Update handler ref when handler changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  
  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch {
      // Socket not initialized yet
      return;
    }
    
    const eventHandler = ((...args: Parameters<ServerToClientEvents[K]>) => {
      (handlerRef.current as (...args: Parameters<ServerToClientEvents[K]>) => void)(...args);
    }) as ServerToClientEvents[K];
    
    socket.on(event, eventHandler as never);
    
    return () => {
      socket.off(event, eventHandler as never);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
```

### 5.5 useGameSync Hook

```typescript
// hooks/use-game-sync.ts

import { useEffect } from 'react';
import { useStore } from '@/stores';
import { useSocket } from './use-socket';
import { useSocketEvent } from './use-socket-event';
import type {
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerConnectionPayload,
  TrumpBidPlacedPayload,
  PlayerPassedPayload,
  FrischStartedPayload,
  TrumpSetPayload,
  TurnChangedPayload,
  ContractPlacedPayload,
  ContractsCompletePayload,
  TrickClaimedPayload,
  RoundCompletePayload,
  FullStatePayload,
} from '@/types/socket-events';

export function useGameSync(roomCode: string) {
  const { emit } = useSocket({ roomCode });
  
  // Store actions
  const addPlayer = useStore((state) => state.addPlayer);
  const removePlayer = useStore((state) => state.removePlayer);
  const updatePlayerConnection = useStore((state) => state.updatePlayerConnection);
  const addTrumpBid = useStore((state) => state.addTrumpBid);
  const setFrisch = useStore((state) => state.setFrisch);
  const setTrumpResult = useStore((state) => state.setTrumpResult);
  const setCurrentTurn = useStore((state) => state.setCurrentTurn);
  const addContract = useStore((state) => state.addContract);
  const setContractsComplete = useStore((state) => state.setContractsComplete);
  const updatePlayer = useStore((state) => state.updatePlayer);
  const addRoundScore = useStore((state) => state.addRoundScore);
  const showToast = useStore((state) => state.showToast);
  const setPhase = useStore((state) => state.setPhase);
  
  // Request full state on mount
  useEffect(() => {
    emit('sync:request', {})
      .then((response) => {
        if (response.data) {
          handleFullStateSync(response.data);
        }
      })
      .catch(console.error);
  }, [emit]);
  
  // Room events
  useSocketEvent('room:player_joined', (payload: PlayerJoinedPayload) => {
    addPlayer({
      userId: payload.user_id,
      displayName: payload.display_name,
      seatPosition: null,
      isConnected: payload.is_connected,
      isAdmin: false,
    });
    showToast({
      type: 'info',
      title: `${payload.display_name} joined the room`,
    });
  });
  
  useSocketEvent('room:player_left', (payload: PlayerLeftPayload) => {
    removePlayer(payload.user_id);
  });
  
  useSocketEvent('room:player_connected', (payload: PlayerConnectionPayload) => {
    updatePlayerConnection(payload.user_id, true);
  });
  
  useSocketEvent('room:player_disconnected', (payload: PlayerConnectionPayload) => {
    updatePlayerConnection(payload.user_id, false);
  });
  
  // Bidding events
  useSocketEvent('bid:trump_placed', (payload: TrumpBidPlacedPayload) => {
    addTrumpBid({
      playerId: payload.player_id,
      playerName: payload.player_name,
      amount: payload.amount,
      suit: payload.suit,
      timestamp: payload.timestamp,
    });
  });
  
  useSocketEvent('bid:frisch_started', (payload: FrischStartedPayload) => {
    setFrisch(payload.frisch_number, payload.new_minimum_bid);
    showToast({
      type: 'info',
      title: `Frisch ${payload.frisch_number}`,
      description: `Minimum bid is now ${payload.new_minimum_bid}`,
    });
  });
  
  useSocketEvent('bid:trump_set', (payload: TrumpSetPayload) => {
    setTrumpResult(
      payload.winner_id,
      payload.winning_bid,
      payload.trump_suit
    );
    showToast({
      type: 'success',
      title: payload.message,
    });
  });
  
  useSocketEvent('bid:turn_changed', (payload: TurnChangedPayload) => {
    setCurrentTurn(payload.current_player_id);
    setPhase(payload.phase);
  });
  
  useSocketEvent('bid:contract_placed', (payload: ContractPlacedPayload) => {
    addContract({
      playerId: payload.player_id,
      playerName: payload.player_name,
      seatPosition: payload.seat_position,
      amount: payload.amount,
      timestamp: payload.timestamp,
    });
  });
  
  useSocketEvent('bid:contracts_complete', (payload: ContractsCompletePayload) => {
    setContractsComplete(payload.game_type);
    showToast({
      type: 'info',
      title: `${payload.game_type.toUpperCase()} game!`,
      description: `Total contracts: ${payload.total_contracts}`,
    });
  });
  
  // Game events
  useSocketEvent('game:trick_claimed', (payload: TrickClaimedPayload) => {
    updatePlayer(payload.player_id, {
      tricksWon: payload.new_trick_count,
    });
  });
  
  useSocketEvent('game:round_complete', (payload: RoundCompletePayload) => {
    // Calculate cumulative scores
    const rounds = useStore.getState().rounds;
    const previousTotals = new Map<string, number>();
    
    rounds.forEach((round) => {
      round.playerScores.forEach((ps) => {
        previousTotals.set(
          ps.playerId,
          (previousTotals.get(ps.playerId) || 0) + ps.score
        );
      });
    });
    
    addRoundScore({
      roundNumber: payload.round_number,
      trumpSuit: payload.trump_suit,
      gameType: payload.game_type,
      trumpWinnerId: payload.players.find((p) => p.seat_position === 0)?.user_id || '',
      playerScores: payload.players.map((p) => ({
        playerId: p.user_id,
        displayName: p.display_name,
        seatPosition: p.seat_position,
        contractBid: p.contract_bid,
        tricksWon: p.tricks_won,
        score: p.score,
        madeContract: p.made_contract,
        cumulativeScore: (previousTotals.get(p.user_id) || 0) + p.score,
      })),
      commentary: payload.commentary,
    });
  });
  
  // Full state sync handler
  function handleFullStateSync(state: FullStatePayload) {
    // Apply full state to store
    // Implementation depends on store structure
  }
}
```

---

## 6. Form Validation Schemas

### 6.1 Zod Schema Definitions

```typescript
// lib/validation/schemas.ts

import { z } from 'zod';

// ============================================================
// Auth Schemas
// ============================================================

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const displayNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(30, 'Name must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_\- ]+$/, 'Name can only contain letters, numbers, spaces, underscores, and hyphens');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  displayName: displayNameSchema,
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;

// ============================================================
// Room Schemas
// ============================================================

export const roomCodeSchema = z
  .string()
  .length(6, 'Room code must be 6 characters')
  .regex(/^[A-Z0-9]+$/, 'Room code must be uppercase letters and numbers');

export const joinRoomSchema = z.object({
  roomCode: roomCodeSchema,
  displayName: displayNameSchema.optional(),
});

export type JoinRoomFormData = z.infer<typeof joinRoomSchema>;

// ============================================================
// Bidding Schemas
// ============================================================

export const trumpSuitSchema = z.enum([
  'clubs',
  'diamonds',
  'hearts',
  'spades',
  'no_trump',
]);

export type TrumpSuit = z.infer<typeof trumpSuitSchema>;

export const trumpBidSchema = z.object({
  amount: z
    .number()
    .int()
    .min(5, 'Minimum bid is 5')
    .max(13, 'Maximum bid is 13'),
  suit: trumpSuitSchema,
});

export const createTrumpBidSchema = (minimumBid: number, highestBid?: { amount: number; suit: TrumpSuit }) => {
  return z.object({
    amount: z
      .number()
      .int()
      .min(minimumBid, `Minimum bid is ${minimumBid}`)
      .max(13, 'Maximum bid is 13'),
    suit: trumpSuitSchema,
  }).refine((data) => {
    if (!highestBid) return true;
    
    const suitOrder: Record<TrumpSuit, number> = {
      clubs: 0,
      diamonds: 1,
      hearts: 2,
      spades: 3,
      no_trump: 4,
    };
    
    if (data.amount > highestBid.amount) return true;
    if (data.amount === highestBid.amount) {
      return suitOrder[data.suit] > suitOrder[highestBid.suit];
    }
    return false;
  }, {
    message: 'Bid must be higher than current bid',
  });
};

export type TrumpBidFormData = z.infer<typeof trumpBidSchema>;

export const contractBidSchema = z.object({
  amount: z
    .number()
    .int()
    .min(0, 'Minimum contract is 0')
    .max(13, 'Maximum contract is 13'),
});

export const createContractBidSchema = (
  currentSum: number,
  isLastBidder: boolean,
  isTrumpWinner: boolean,
  trumpWinningBid: number = 0
) => {
  return z.object({
    amount: z
      .number()
      .int()
      .min(0, 'Minimum contract is 0')
      .max(13, 'Maximum contract is 13'),
  }).refine((data) => {
    // Trump winner must bid at least their winning bid
    if (isTrumpWinner && data.amount < trumpWinningBid) {
      return false;
    }
    return true;
  }, {
    message: `Trump winner must bid at least ${trumpWinningBid}`,
  }).refine((data) => {
    // Last bidder cannot make sum equal 13
    if (isLastBidder && currentSum + data.amount === 13) {
      return false;
    }
    return true;
  }, {
    message: 'Last bidder cannot make the sum equal 13',
  });
};

export type ContractBidFormData = z.infer<typeof contractBidSchema>;

// ============================================================
// Game Schemas
// ============================================================

export const gameTypeSchema = z.enum(['over', 'under']);
export type GameType = z.infer<typeof gameTypeSchema>;

export const roundPhaseSchema = z.enum([
  'trump_bidding',
  'frisch',
  'contract_bidding',
  'playing',
  'complete',
]);
export type RoundPhase = z.infer<typeof roundPhaseSchema>;

// ============================================================
// Score Edit Schema (Admin Only)
// ============================================================

export const scoreEditSchema = z.object({
  roundNumber: z.number().int().min(1),
  playerId: z.string().uuid(),
  tricksWon: z
    .number()
    .int()
    .min(0, 'Tricks cannot be negative')
    .max(13, 'Maximum tricks is 13'),
});

export type ScoreEditFormData = z.infer<typeof scoreEditSchema>;
```

### 6.2 Custom Validation Utilities

```typescript
// lib/validation/rules.ts

import type { TrumpSuit, TrumpBid, ContractBid } from '@/types/game';

const SUIT_ORDER: Record<TrumpSuit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
  no_trump: 4,
};

/**
 * Validates if a trump bid is valid given the current state.
 */
export function isValidTrumpBid(
  newBid: { amount: number; suit: TrumpSuit },
  currentHighest: TrumpBid | null,
  minimumBid: number
): { valid: boolean; error?: string } {
  if (newBid.amount < minimumBid) {
    return { 
      valid: false, 
      error: `Bid must be at least ${minimumBid}` 
    };
  }
  
  if (newBid.amount > 13) {
    return { 
      valid: false, 
      error: 'Bid cannot exceed 13' 
    };
  }
  
  if (!currentHighest) {
    return { valid: true };
  }
  
  if (newBid.amount > currentHighest.amount) {
    return { valid: true };
  }
  
  if (newBid.amount === currentHighest.amount) {
    if (SUIT_ORDER[newBid.suit] > SUIT_ORDER[currentHighest.suit]) {
      return { valid: true };
    }
    return { 
      valid: false, 
      error: 'Must bid a higher suit or increase the bid amount' 
    };
  }
  
  return { 
    valid: false, 
    error: 'Bid must be higher than the current bid' 
  };
}

/**
 * Validates if a contract bid is valid given the current state.
 */
export function isValidContractBid(
  amount: number,
  currentSum: number,
  isLastBidder: boolean,
  isTrumpWinner: boolean = false,
  trumpWinningBid: number = 0
): { valid: boolean; error?: string } {
  if (amount < 0 || amount > 13) {
    return { 
      valid: false, 
      error: 'Contract must be between 0 and 13' 
    };
  }
  
  if (isTrumpWinner && amount < trumpWinningBid) {
    return { 
      valid: false, 
      error: `Trump winner must bid at least ${trumpWinningBid}` 
    };
  }
  
  if (isLastBidder && currentSum + amount === 13) {
    return { 
      valid: false, 
      error: 'Last bidder cannot make the sum equal 13' 
    };
  }
  
  return { valid: true };
}

/**
 * Calculates available contract bids for the last bidder.
 */
export function getAvailableContractBids(
  currentSum: number,
  isTrumpWinner: boolean,
  trumpWinningBid: number
): number[] {
  const available: number[] = [];
  const minBid = isTrumpWinner ? trumpWinningBid : 0;
  
  for (let i = minBid; i <= 13; i++) {
    // Exclude bid that would make sum = 13
    if (currentSum + i !== 13) {
      available.push(i);
    }
  }
  
  return available;
}

/**
 * Calculate score for a player.
 */
export function calculateScore(
  contractBid: number,
  tricksWon: number,
  gameType: 'over' | 'under'
): number {
  const isOver = gameType === 'over';
  
  if (contractBid === 0) {
    if (tricksWon === 0) {
      return isOver ? 25 : 50;
    } else if (tricksWon === 1) {
      return -50;
    } else {
      return -50 + (tricksWon - 1) * 10;
    }
  }
  
  if (tricksWon === contractBid) {
    return contractBid * contractBid + 10;
  } else {
    return Math.abs(tricksWon - contractBid) * -10;
  }
}

/**
 * Determine game type from contracts.
 */
export function determineGameType(contracts: number[]): 'over' | 'under' {
  const sum = contracts.reduce((a, b) => a + b, 0);
  return sum > 13 ? 'over' : 'under';
}
```

---

## 7. Responsive Design System

### 7.1 Breakpoint Configuration

```typescript
// config/breakpoints.ts

export const breakpoints = {
  xs: 320,   // Small phones
  sm: 375,   // Standard phones (iPhone SE, etc.)
  md: 428,   // Large phones (iPhone Pro Max, etc.)
  lg: 768,   // Tablets portrait
  xl: 1024,  // Tablets landscape / Small laptops
  '2xl': 1280, // Desktop
} as const;

export type Breakpoint = keyof typeof breakpoints;

// Tailwind classes mapping
export const breakpointClasses = {
  xs: '',
  sm: 'sm:',
  md: 'md:',
  lg: 'lg:',
  xl: 'xl:',
  '2xl': '2xl:',
} as const;

// Media query strings for hooks
export const mediaQueries = {
  xs: `(min-width: ${breakpoints.xs}px)`,
  sm: `(min-width: ${breakpoints.sm}px)`,
  md: `(min-width: ${breakpoints.md}px)`,
  lg: `(min-width: ${breakpoints.lg}px)`,
  xl: `(min-width: ${breakpoints.xl}px)`,
  '2xl': `(min-width: ${breakpoints['2xl']}px)`,
  // Orientation
  portrait: '(orientation: portrait)',
  landscape: '(orientation: landscape)',
  // Specific combinations
  tabletLandscape: `(min-width: ${breakpoints.lg}px) and (orientation: landscape)`,
  phoneLandscape: `(max-width: ${breakpoints.lg - 1}px) and (orientation: landscape)`,
} as const;
```

### 7.2 useMediaQuery Hook

```typescript
// hooks/use-media-query.ts

import { useState, useEffect } from 'react';
import { mediaQueries, type Breakpoint } from '@/config/breakpoints';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    // Set initial value
    setMatches(mediaQuery.matches);
    
    // Listen for changes
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    
    mediaQuery.addEventListener('change', handler);
    
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);
  
  return matches;
}

// Convenience hooks
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(mediaQueries[breakpoint]);
}

export function useIsLandscape(): boolean {
  return useMediaQuery(mediaQueries.landscape);
}

export function useIsTabletOrLarger(): boolean {
  return useMediaQuery(mediaQueries.lg);
}

export function useIsPhoneLandscape(): boolean {
  return useMediaQuery(mediaQueries.phoneLandscape);
}
```

### 7.3 Responsive Layout Specifications

#### Mobile Portrait (Default)

```
┌────────────────────────┐
│  Header (sticky)       │  56px
├────────────────────────┤
│                        │
│     Main Content       │  Flex-grow
│     (scrollable)       │
│                        │
├────────────────────────┤
│  Action Bar (sticky)   │  72px
└────────────────────────┘
```

#### Mobile Landscape (Score Table Only)

```
┌──────────────────────────────────────────────┐
│ Header                                       │ 48px
├──────────────────────────────────────────────┤
│                                              │
│              Score Table                     │ Full height
│         (Horizontal scroll)                  │
│                                              │
└──────────────────────────────────────────────┘
```

#### Tablet/Desktop

```
┌─────────────────────────────────────────────────────┐
│  Header (full width)                                │ 64px
├─────────────────────────────────────────────────────┤
│                    │                                │
│    Sidebar         │       Main Content             │
│    (if needed)     │                                │
│    256px           │                                │
│                    │                                │
└─────────────────────────────────────────────────────┘
```

### 7.4 Score Table Responsive Layout

```typescript
// components/scores/score-table.tsx

'use client';

import { useIsLandscape, useIsTabletOrLarger } from '@/hooks/use-media-query';
import { ScoreTablePortrait } from './score-table-portrait';
import { ScoreTableLandscape } from './score-table-landscape';
import { CumulativeChart } from './cumulative-chart';

export function ScoreTable() {
  const isLandscape = useIsLandscape();
  const isTabletOrLarger = useIsTabletOrLarger();
  
  // Show landscape layout for tablets in landscape or any landscape phone
  const showLandscapeLayout = isLandscape || isTabletOrLarger;
  
  return (
    <div className="flex flex-col h-full">
      {/* Total scores bar - always visible */}
      <TotalScoresBar />
      
      {/* Score table - responsive */}
      <div className="flex-1 overflow-auto">
        {showLandscapeLayout ? (
          <ScoreTableLandscape />
        ) : (
          <ScoreTablePortrait />
        )}
      </div>
      
      {/* Chart - only in landscape on tablets */}
      {isTabletOrLarger && isLandscape && (
        <div className="h-48 border-t">
          <CumulativeChart />
        </div>
      )}
    </div>
  );
}
```

### 7.5 Tailwind Configuration

```typescript
// tailwind.config.ts

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      'xs': '320px',
      'sm': '375px',
      'md': '428px',
      'lg': '768px',
      'xl': '1024px',
      '2xl': '1280px',
    },
    extend: {
      colors: {
        // Brand colors
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Suit colors
        suit: {
          clubs: '#1a1a1a',
          diamonds: '#dc2626',
          hearts: '#dc2626',
          spades: '#1a1a1a',
        },
        // Score colors
        score: {
          positive: '#16a34a',
          negative: '#dc2626',
          neutral: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        // Score display sizes
        'score-sm': ['1rem', { lineHeight: '1.25' }],
        'score-md': ['1.25rem', { lineHeight: '1.25' }],
        'score-lg': ['1.5rem', { lineHeight: '1.25' }],
        'score-xl': ['2rem', { lineHeight: '1.25' }],
      },
      spacing: {
        // Safe area insets for PWA
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      animation: {
        'pulse-score': 'pulse-score 0.6s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
      keyframes: {
        'pulse-score': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
        },
        'slide-in': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/container-queries'),
  ],
};

export default config;
```

---

## 8. Animation Specifications

### 8.1 Animation Variants

```typescript
// config/animations.ts

import { Variants, Transition } from 'framer-motion';

// ============================================================
// Transitions
// ============================================================

export const transitions = {
  fast: { duration: 0.15, ease: 'easeOut' } as Transition,
  normal: { duration: 0.25, ease: 'easeOut' } as Transition,
  slow: { duration: 0.4, ease: 'easeOut' } as Transition,
  spring: { type: 'spring', stiffness: 400, damping: 30 } as Transition,
  springBouncy: { type: 'spring', stiffness: 500, damping: 20 } as Transition,
};

// ============================================================
// Common Variants
// ============================================================

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const slideIn: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

export const scale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: transitions.springBouncy,
  },
  exit: { opacity: 0, scale: 0.8 },
};

// ============================================================
// Component-Specific Variants
// ============================================================

// Player card joining animation
export const playerCardVariants: Variants = {
  initial: { opacity: 0, scale: 0.8, y: 20 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: transitions.spring,
  },
  exit: { 
    opacity: 0, 
    scale: 0.8, 
    y: -20,
    transition: transitions.fast,
  },
};

// Bid placed animation
export const bidPlacedVariants: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 25,
    },
  },
};

// Score change animation
export const scoreChangeVariants: Variants = {
  initial: { opacity: 0, scale: 1.2 },
  animate: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
};

// Positive score animation
export const positiveScoreVariants: Variants = {
  initial: { opacity: 0, y: 20, color: '#16a34a' },
  animate: { 
    opacity: 1, 
    y: 0,
    color: '#16a34a',
    transition: transitions.spring,
  },
};

// Negative score animation
export const negativeScoreVariants: Variants = {
  initial: { opacity: 0, y: -20, color: '#dc2626' },
  animate: { 
    opacity: 1, 
    y: 0,
    color: '#dc2626',
    transition: transitions.spring,
  },
};

// Trick counter increment
export const trickIncrementVariants: Variants = {
  initial: { scale: 1 },
  animate: { 
    scale: [1, 1.3, 1],
    transition: {
      duration: 0.4,
      times: [0, 0.3, 1],
    },
  },
};

// Progress ring fill
export const progressRingVariants: Variants = {
  initial: { pathLength: 0 },
  animate: (progress: number) => ({
    pathLength: progress,
    transition: {
      duration: 0.8,
      ease: 'easeInOut',
    },
  }),
};

// Turn indicator pulse
export const turnIndicatorVariants: Variants = {
  initial: { boxShadow: '0 0 0 0 rgba(99, 102, 241, 0.4)' },
  animate: { 
    boxShadow: [
      '0 0 0 0 rgba(99, 102, 241, 0.4)',
      '0 0 0 10px rgba(99, 102, 241, 0)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};

// Toast notification
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 50, scale: 0.9 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: transitions.spring,
  },
  exit: { 
    opacity: 0, 
    y: 20, 
    scale: 0.9,
    transition: transitions.fast,
  },
};

// Modal/Dialog
export const modalOverlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContentVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: transitions.spring,
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: 10,
    transition: transitions.fast,
  },
};

// Staggered children
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

// ============================================================
// Suit Icon Animations
// ============================================================

export const suitIconVariants: Variants = {
  initial: { rotate: -180, opacity: 0 },
  animate: { 
    rotate: 0, 
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
};

// ============================================================
// Connection Status Animations
// ============================================================

export const connectionPulseVariants: Variants = {
  connected: {
    scale: [1, 1.2, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
  disconnected: {
    scale: 1,
    opacity: 0.5,
  },
  reconnecting: {
    scale: [1, 1.1, 1],
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1,
      repeat: Infinity,
      repeatType: 'loop',
    },
  },
};
```

### 8.2 Animation Components

```typescript
// components/shared/animated-number.tsx

'use client';

import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  formatFn?: (value: number) => string;
}

export function AnimatedNumber({ 
  value, 
  duration = 0.5,
  className,
  formatFn = (v) => Math.round(v).toString(),
}: AnimatedNumberProps) {
  const spring = useSpring(value, { 
    duration: duration * 1000,
    bounce: 0,
  });
  
  const display = useTransform(spring, (current) => formatFn(current));
  
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  
  return (
    <motion.span className={className}>
      {display}
    </motion.span>
  );
}
```

```typescript
// components/shared/animated-list.tsx

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { staggerContainer, staggerItem } from '@/config/animations';

interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function AnimatedList<T>({ 
  items, 
  keyExtractor, 
  renderItem,
  className,
}: AnimatedListProps<T>) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className={className}
    >
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item)}
            variants={staggerItem}
            layout
            exit={{ opacity: 0, y: -20 }}
          >
            {renderItem(item, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
```

```typescript
// components/game/progress-ring.tsx

'use client';

import { motion } from 'framer-motion';
import { progressRingVariants } from '@/config/animations';

interface ProgressRingProps {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  className,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Determine color based on progress
  const getColor = () => {
    if (progress >= 1) return '#16a34a'; // Success green
    if (progress >= 0.7) return '#eab308'; // Warning yellow
    return '#6366f1'; // Primary indigo
  };
  
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200"
        />
        
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          variants={progressRingVariants}
          initial="initial"
          animate="animate"
          custom={progress}
          style={{
            strokeDashoffset: circumference * (1 - progress),
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
```

---

## 9. Screen Specifications

### 9.1 Room Lobby Screen

```typescript
// app/room/[roomCode]/page.tsx

import { Suspense } from 'react';
import { RoomLobby } from '@/components/room/room-lobby';
import { RoomLobbySkeleton } from '@/components/room/room-lobby-skeleton';

interface RoomLobbyPageProps {
  params: { roomCode: string };
}

export default function RoomLobbyPage({ params }: RoomLobbyPageProps) {
  return (
    <Suspense fallback={<RoomLobbySkeleton />}>
      <RoomLobby roomCode={params.roomCode} />
    </Suspense>
  );
}
```

```typescript
// components/room/room-lobby.tsx

'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useStore } from '@/stores';
import { useSocket } from '@/hooks/use-socket';
import { useGameSync } from '@/hooks/use-game-sync';
import { RoomHeader } from './room-header';
import { PlayerList } from './player-list';
import { SeatingArrangement } from './seating-arrangement';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { slideUp, staggerContainer } from '@/config/animations';

interface RoomLobbyProps {
  roomCode: string;
}

export function RoomLobby({ roomCode }: RoomLobbyProps) {
  const router = useRouter();
  const { emit } = useSocket({ roomCode });
  
  // Initialize game sync (handles all WebSocket events)
  useGameSync(roomCode);
  
  // Store state
  const players = useStore((state) => state.players);
  const isAdmin = useStore((state) => state.isAdmin);
  const showToast = useStore((state) => state.showToast);
  
  // Derived state
  const canStartGame = players.length === 4 && 
    players.every((p) => p.seatPosition !== null);
  
  // Join room on mount
  useEffect(() => {
    emit('room:join', { room_code: roomCode })
      .catch((error) => {
        showToast({
          type: 'error',
          title: 'Failed to join room',
          description: error.message,
        });
        router.push('/');
      });
  }, [roomCode, emit, showToast, router]);
  
  const handleStartGame = async () => {
    try {
      await emit('room:start_game', {});
      router.push(`/room/${roomCode}/game`);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to start game',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
  
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="flex flex-col min-h-screen bg-gray-50"
    >
      {/* Header */}
      <RoomHeader roomCode={roomCode} />
      
      {/* Main content */}
      <main className="flex-1 p-4 space-y-6">
        {/* Player list */}
        <motion.div variants={slideUp}>
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold mb-4">
                Players ({players.length}/4)
              </h2>
              <PlayerList players={players} />
            </div>
          </Card>
        </motion.div>
        
        {/* Seating arrangement - admin only */}
        <AnimatePresence>
          {isAdmin && players.length === 4 && (
            <motion.div
              variants={slideUp}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <Card>
                <div className="p-4">
                  <h2 className="text-lg font-semibold mb-4">
                    Seating Arrangement
                  </h2>
                  <SeatingArrangement />
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      
      {/* Action bar */}
      <div className="sticky bottom-0 p-4 bg-white border-t safe-area-bottom">
        {isAdmin ? (
          <Button
            size="lg"
            fullWidth
            disabled={!canStartGame}
            onClick={handleStartGame}
          >
            {canStartGame ? 'Start Game' : `Waiting for ${4 - players.length} more players`}
          </Button>
        ) : (
          <p className="text-center text-gray-500">
            Waiting for host to start the game...
          </p>
        )}
      </div>
    </motion.div>
  );
}
```

### 9.2 Bidding Screen

```typescript
// components/bidding/trump-bidding-panel.tsx

'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/stores';
import { BidCounter } from './bid-counter';
import { SuitSelector } from './suit-selector';
import { PlayerBidStatus } from './player-bid-status';
import { FrischIndicator } from './frisch-indicator';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isValidTrumpBid } from '@/lib/validation/rules';
import { createTrumpBidSchema, type TrumpSuit } from '@/lib/validation/schemas';
import { bidPlacedVariants, turnIndicatorVariants } from '@/config/animations';

export function TrumpBiddingPanel() {
  const [bidAmount, setBidAmount] = useState(5);
  const [selectedSuit, setSelectedSuit] = useState<TrumpSuit>('hearts');
  
  // Store state
  const highestBid = useStore((state) => state.highestTrumpBid);
  const minimumBid = useStore((state) => state.minimumBid);
  const frischCount = useStore((state) => state.frischCount);
  const isMyTurn = useStore((state) => state.isMyTurn);
  const isSubmitting = useStore((state) => state.isSubmitting);
  const placeTrumpBid = useStore((state) => state.placeTrumpBid);
  const passTrumpBid = useStore((state) => state.passTrumpBid);
  const showToast = useStore((state) => state.showToast);
  
  // Create schema for validation
  const bidSchema = useMemo(() => 
    createTrumpBidSchema(minimumBid, highestBid || undefined),
    [minimumBid, highestBid]
  );
  
  // Validate current bid
  const validation = useMemo(() => 
    isValidTrumpBid(
      { amount: bidAmount, suit: selectedSuit },
      highestBid,
      minimumBid
    ),
    [bidAmount, selectedSuit, highestBid, minimumBid]
  );
  
  const handleBid = async () => {
    if (!validation.valid) {
      showToast({
        type: 'error',
        title: 'Invalid bid',
        description: validation.error,
      });
      return;
    }
    
    try {
      await placeTrumpBid(bidAmount, selectedSuit);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to place bid',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
  
  const handlePass = async () => {
    try {
      await passTrumpBid();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to pass',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Frisch indicator */}
      {frischCount > 0 && (
        <FrischIndicator 
          frischNumber={frischCount} 
          minimumBid={minimumBid} 
        />
      )}
      
      {/* Current highest bid */}
      <Card variant="outlined" className="text-center">
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-1">Current Highest Bid</p>
          {highestBid ? (
            <motion.div
              variants={bidPlacedVariants}
              initial="initial"
              animate="animate"
              key={`${highestBid.amount}-${highestBid.suit}`}
              className="flex items-center justify-center gap-2"
            >
              <span className="text-3xl font-bold">{highestBid.amount}</span>
              <SuitIcon suit={highestBid.suit} size="lg" />
              <span className="text-sm text-gray-500">by {highestBid.playerName}</span>
            </motion.div>
          ) : (
            <p className="text-gray-400">No bids yet</p>
          )}
        </div>
      </Card>
      
      {/* Bidding controls */}
      {isMyTurn ? (
        <motion.div
          variants={turnIndicatorVariants}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          <Card className="border-2 border-primary-500">
            <div className="p-4 space-y-4">
              <p className="text-center font-medium text-primary-600">
                Your turn to bid
              </p>
              
              {/* Bid counter */}
              <BidCounter
                value={bidAmount}
                onChange={setBidAmount}
                min={minimumBid}
                max={13}
              />
              
              {/* Suit selector */}
              <SuitSelector
                selected={selectedSuit}
                onChange={setSelectedSuit}
                disabled={isSubmitting}
              />
              
              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={!validation.valid || isSubmitting}
                  loading={isSubmitting}
                  onClick={handleBid}
                >
                  Call {bidAmount} {getSuitSymbol(selectedSuit)}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={isSubmitting}
                  onClick={handlePass}
                >
                  Pass
                </Button>
              </div>
              
              {/* Validation message */}
              {!validation.valid && (
                <p className="text-sm text-red-600 text-center">
                  {validation.error}
                </p>
              )}
            </div>
          </Card>
        </motion.div>
      ) : (
        <Card className="bg-gray-50">
          <div className="p-4 text-center">
            <p className="text-gray-500">
              Waiting for other players...
            </p>
          </div>
        </Card>
      )}
      
      {/* Player status list */}
      <PlayerBidStatus />
    </div>
  );
}

// Helper components
function SuitIcon({ suit, size = 'md' }: { suit: TrumpSuit; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };
  
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
    no_trump: 'NT',
  };
  
  const colors: Record<TrumpSuit, string> = {
    clubs: 'text-suit-clubs',
    diamonds: 'text-suit-diamonds',
    hearts: 'text-suit-hearts',
    spades: 'text-suit-spades',
    no_trump: 'text-primary-600',
  };
  
  return (
    <span className={`${sizeClasses[size]} ${colors[suit]}`}>
      {symbols[suit]}
    </span>
  );
}

function getSuitSymbol(suit: TrumpSuit): string {
  const symbols: Record<TrumpSuit, string> = {
    clubs: '♣',
    diamonds: '♦',
    hearts: '♥',
    spades: '♠',
    no_trump: 'NT',
  };
  return symbols[suit];
}
```

### 9.3 Playing Screen

```typescript
// components/game/playing-panel.tsx

'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/stores';
import { ProgressRing } from './progress-ring';
import { PlayerProgressCard } from './player-progress-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trickIncrementVariants, slideUp } from '@/config/animations';

export function PlayingPanel() {
  const myPlayer = useStore((state) => 
    state.players.find((p) => p.userId === state.user?.id)
  );
  const allPlayers = useStore((state) => state.players);
  const gameType = useStore((state) => state.gameType);
  const isAdmin = useStore((state) => state.isAdmin);
  const claimTrick = useStore((state) => state.claimTrick);
  const showToast = useStore((state) => state.showToast);
  
  if (!myPlayer) return null;
  
  const progress = myPlayer.contractBid 
    ? myPlayer.tricksWon / myPlayer.contractBid 
    : 0;
  
  const getStatusText = () => {
    if (!myPlayer.contractBid) return 'No contract';
    
    const diff = myPlayer.tricksWon - (myPlayer.contractBid || 0);
    
    if (diff === 0) {
      return myPlayer.tricksWon === myPlayer.contractBid 
        ? '✓ On track' 
        : 'In progress';
    }
    if (diff > 0) return `+${diff} ahead`;
    return `${diff} behind`;
  };
  
  const getStatusColor = () => {
    if (!myPlayer.contractBid) return 'text-gray-500';
    
    const diff = myPlayer.tricksWon - (myPlayer.contractBid || 0);
    
    if (diff === 0 && myPlayer.tricksWon > 0) return 'text-emerald-600';
    if (diff > 0) return 'text-amber-600';
    if (diff < 0) return 'text-rose-600';
    return 'text-gray-600';
  };
  
  const handleClaimTrick = async () => {
    try {
      await claimTrick();
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Failed to claim trick',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
  
  return (
    <motion.div
      variants={slideUp}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* Game type banner */}
      <div className={`text-center py-2 rounded-lg font-bold text-lg ${
        gameType === 'over' 
          ? 'bg-rose-100 text-rose-700' 
          : 'bg-blue-100 text-blue-700'
      }`}>
        {gameType?.toUpperCase()} GAME
      </div>
      
      {/* Personal progress - prominent */}
      <Card variant="elevated" className="py-8">
        <div className="flex flex-col items-center">
          <ProgressRing 
            progress={Math.min(progress, 1)} 
            size={160} 
            strokeWidth={12}
          >
            <motion.div
              variants={trickIncrementVariants}
              animate="animate"
              key={myPlayer.tricksWon}
              className="text-center"
            >
              <div className="text-4xl font-bold">{myPlayer.tricksWon}</div>
              <div className="text-sm text-gray-500">
                / {myPlayer.contractBid} contract
              </div>
            </motion.div>
          </ProgressRing>
          
          <p className={`mt-4 font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </p>
          
          {/* Claim trick button */}
          <Button
            size="xl"
            variant="success"
            className="mt-6 px-12"
            onClick={handleClaimTrick}
          >
            I Won a Trick
          </Button>
        </div>
      </Card>
      
      {/* Other players' progress */}
      <div className="grid grid-cols-2 gap-3">
        {allPlayers
          .filter((p) => p.userId !== myPlayer.userId)
          .map((player) => (
            <PlayerProgressCard
              key={player.userId}
              player={player}
              isAdmin={isAdmin}
            />
          ))}
      </div>
      
      {/* Admin controls */}
      {isAdmin && (
        <Card variant="outlined" className="bg-amber-50 border-amber-200">
          <div className="p-4">
            <p className="text-sm text-amber-700 font-medium mb-3">
              Admin Controls
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="sm">
                Undo Last Trick
              </Button>
              <Button variant="outline" size="sm">
                End Round Early
              </Button>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
```

### 9.4 Score Table Screen

```typescript
// components/scores/score-table-portrait.tsx

'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/stores';
import { ScoreCell } from './score-cell';
import { SuitIcon } from '@/components/shared/suit-icon';
import { AnimatedNumber } from '@/components/shared/animated-number';
import { staggerContainer, staggerItem } from '@/config/animations';

export function ScoreTablePortrait() {
  const rounds = useStore((state) => state.rounds);
  const playerTotals = useStore((state) => state.playerTotals);
  
  if (rounds.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No rounds played yet
      </div>
    );
  }
  
  // Get unique player order from first round
  const playerOrder = rounds[0].playerScores.map((ps) => ({
    playerId: ps.playerId,
    displayName: ps.displayName,
    seatPosition: ps.seatPosition,
  }));
  
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="overflow-x-auto"
    >
      <table className="w-full min-w-[500px]">
        {/* Header */}
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b-2 border-gray-200">
            <th className="py-3 px-2 text-left text-sm font-medium text-gray-500 w-12">
              #
            </th>
            <th className="py-3 px-2 text-center text-sm font-medium text-gray-500 w-10">
              Trump
            </th>
            <th className="py-3 px-2 text-center text-sm font-medium text-gray-500 w-12">
              Type
            </th>
            {playerOrder.map((player) => (
              <th 
                key={player.playerId}
                className="py-3 px-2 text-center text-sm font-medium text-gray-900"
              >
                <div className="truncate max-w-[80px]">
                  {player.displayName}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        
        {/* Body */}
        <tbody>
          {rounds.map((round, index) => (
            <motion.tr
              key={round.roundNumber}
              variants={staggerItem}
              className={`border-b ${
                index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}
            >
              {/* Round number */}
              <td className="py-3 px-2 text-sm text-gray-600">
                {round.roundNumber}
              </td>
              
              {/* Trump suit */}
              <td className="py-3 px-2 text-center">
                <SuitIcon suit={round.trumpSuit} size="sm" />
              </td>
              
              {/* Game type */}
              <td className="py-3 px-2 text-center">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  round.gameType === 'over'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {round.gameType === 'over' ? 'O' : 'U'}
                </span>
              </td>
              
              {/* Player scores */}
              {playerOrder.map((player) => {
                const playerScore = round.playerScores.find(
                  (ps) => ps.playerId === player.playerId
                );
                
                return (
                  <td 
                    key={player.playerId}
                    className="py-3 px-2"
                  >
                    {playerScore && (
                      <ScoreCell
                        contract={playerScore.contractBid}
                        tricks={playerScore.tricksWon}
                        score={playerScore.score}
                        cumulative={playerScore.cumulativeScore}
                        madeContract={playerScore.madeContract}
                      />
                    )}
                  </td>
                );
              })}
            </motion.tr>
          ))}
        </tbody>
        
        {/* Totals footer */}
        <tfoot className="sticky bottom-0 bg-white border-t-2 border-gray-300">
          <tr className="font-bold">
            <td colSpan={3} className="py-4 px-2 text-right text-gray-600">
              Total
            </td>
            {playerOrder.map((player) => {
              const total = playerTotals.find((pt) => pt.playerId === player.playerId);
              return (
                <td 
                  key={player.playerId}
                  className="py-4 px-2 text-center"
                >
                  <AnimatedNumber
                    value={total?.totalScore || 0}
                    className={`text-lg ${
                      (total?.totalScore || 0) >= 0 
                        ? 'text-score-positive' 
                        : 'text-score-negative'
                    }`}
                    formatFn={(v) => (v >= 0 ? `+${Math.round(v)}` : Math.round(v).toString())}
                  />
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </motion.div>
  );
}
```

---

## 10. Error Handling & Loading States

### 10.1 Error Boundary

```typescript
// components/shared/error-boundary.tsx

'use client';

import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to error tracking service
  }
  
  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };
  
  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="p-6 text-center">
              <div className="text-4xl mb-4">😵</div>
              <h2 className="text-xl font-semibold mb-2">
                Something went wrong
              </h2>
              <p className="text-gray-600 mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={this.handleReset}>
                  Try Again
                </Button>
                <Button 
                  variant="secondary"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

### 10.2 Loading States

```typescript
// components/shared/loading-spinner.tsx

'use client';

import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };
  
  return (
    <motion.div
      className={`${sizeClasses[size]} ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-25"
        />
        <path
          d="M12 2C6.477 2 2 6.477 2 12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-primary-600"
        />
      </svg>
    </motion.div>
  );
}

// Page loading skeleton
export function PageSkeleton() {
  return (
    <div className="animate-pulse p-4 space-y-4">
      <div className="h-12 bg-gray-200 rounded-lg" />
      <div className="h-48 bg-gray-200 rounded-xl" />
      <div className="h-32 bg-gray-200 rounded-xl" />
      <div className="h-32 bg-gray-200 rounded-xl" />
    </div>
  );
}
```

### 10.3 Connection Status Indicator

```typescript
// components/shared/connection-status.tsx

'use client';

import { motion } from 'framer-motion';
import { useStore } from '@/stores';
import { connectionPulseVariants } from '@/config/animations';

export function ConnectionStatus() {
  const status = useStore((state) => state.connectionStatus);
  
  const statusConfig = {
    connected: {
      color: 'bg-emerald-500',
      text: 'Connected',
    },
    connecting: {
      color: 'bg-amber-500',
      text: 'Connecting...',
    },
    disconnected: {
      color: 'bg-red-500',
      text: 'Disconnected',
    },
    reconnecting: {
      color: 'bg-amber-500',
      text: 'Reconnecting...',
    },
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center gap-2">
      <motion.div
        className={`w-2 h-2 rounded-full ${config.color}`}
        variants={connectionPulseVariants}
        animate={status}
      />
      <span className="text-xs text-gray-500">{config.text}</span>
    </div>
  );
}
```

---

## 11. Accessibility

### 11.1 Focus Management

```typescript
// hooks/use-focus-trap.ts

import { useEffect, useRef } from 'react';

export function useFocusTrap<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();
    
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  return containerRef;
}
```

### 11.2 Screen Reader Announcements

```typescript
// components/shared/sr-announcer.tsx

'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/stores';

export function ScreenReaderAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  
  // Subscribe to important game events
  const phase = useStore((state) => state.phase);
  const isMyTurn = useStore((state) => state.isMyTurn);
  const trumpSuit = useStore((state) => state.trumpSuit);
  const gameType = useStore((state) => state.gameType);
  
  useEffect(() => {
    if (isMyTurn) {
      setAnnouncement("It's your turn to bid");
    }
  }, [isMyTurn]);
  
  useEffect(() => {
    if (trumpSuit) {
      setAnnouncement(`Trump suit is ${trumpSuit}`);
    }
  }, [trumpSuit]);
  
  useEffect(() => {
    if (gameType) {
      setAnnouncement(`This is an ${gameType} game`);
    }
  }, [gameType]);
  
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
```

### 11.3 ARIA Labels and Roles

```typescript
// Example: Accessible bid counter

interface BidCounterProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}

export function BidCounter({ 
  value, 
  onChange, 
  min, 
  max, 
  disabled 
}: BidCounterProps) {
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(Math.min(max, value + 1));
  
  return (
    <div
      role="group"
      aria-label="Bid amount selector"
      className="flex items-center justify-center gap-4"
    >
      <button
        type="button"
        onClick={decrement}
        disabled={disabled || value <= min}
        aria-label={`Decrease bid to ${value - 1}`}
        aria-disabled={value <= min}
        className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center text-2xl"
      >
        −
      </button>
      
      <output
        aria-live="polite"
        aria-atomic="true"
        className="text-5xl font-bold w-20 text-center"
      >
        {value}
      </output>
      
      <button
        type="button"
        onClick={increment}
        disabled={disabled || value >= max}
        aria-label={`Increase bid to ${value + 1}`}
        aria-disabled={value >= max}
        className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center text-2xl"
      >
        +
      </button>
    </div>
  );
}
```

---

## 12. Testing Strategy

### 12.1 Component Testing

```typescript
// __tests__/components/bidding/bid-counter.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { BidCounter } from '@/components/bidding/bid-counter';

describe('BidCounter', () => {
  it('renders with initial value', () => {
    render(<BidCounter value={5} onChange={() => {}} min={5} max={13} />);
    
    expect(screen.getByRole('group')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
  
  it('calls onChange when incrementing', () => {
    const handleChange = jest.fn();
    render(<BidCounter value={5} onChange={handleChange} min={5} max={13} />);
    
    fireEvent.click(screen.getByLabelText(/increase bid/i));
    
    expect(handleChange).toHaveBeenCalledWith(6);
  });
  
  it('calls onChange when decrementing', () => {
    const handleChange = jest.fn();
    render(<BidCounter value={7} onChange={handleChange} min={5} max={13} />);
    
    fireEvent.click(screen.getByLabelText(/decrease bid/i));
    
    expect(handleChange).toHaveBeenCalledWith(6);
  });
  
  it('disables decrement at minimum', () => {
    render(<BidCounter value={5} onChange={() => {}} min={5} max={13} />);
    
    expect(screen.getByLabelText(/decrease bid/i)).toBeDisabled();
  });
  
  it('disables increment at maximum', () => {
    render(<BidCounter value={13} onChange={() => {}} min={5} max={13} />);
    
    expect(screen.getByLabelText(/increase bid/i)).toBeDisabled();
  });
});
```

### 12.2 Store Testing

```typescript
// __tests__/stores/bidding-slice.test.ts

import { act, renderHook } from '@testing-library/react';
import { useStore } from '@/stores';

describe('Bidding Slice', () => {
  beforeEach(() => {
    // Reset store before each test
    useStore.getState().resetBidding();
  });
  
  it('adds trump bid correctly', () => {
    const { result } = renderHook(() => useStore());
    
    act(() => {
      result.current.addTrumpBid({
        playerId: 'player-1',
        playerName: 'Player 1',
        amount: 5,
        suit: 'hearts',
        timestamp: new Date().toISOString(),
      });
    });
    
    expect(result.current.trumpBids).toHaveLength(1);
    expect(result.current.highestTrumpBid?.amount).toBe(5);
    expect(result.current.highestTrumpBid?.suit).toBe('hearts');
  });
  
  it('sets frisch correctly', () => {
    const { result } = renderHook(() => useStore());
    
    act(() => {
      result.current.setFrisch(1, 6);
    });
    
    expect(result.current.frischCount).toBe(1);
    expect(result.current.minimumBid).toBe(6);
    expect(result.current.phase).toBe('frisch');
    expect(result.current.trumpBids).toHaveLength(0);
  });
  
  it('calculates contract sum correctly', () => {
    const { result } = renderHook(() => useStore());
    
    act(() => {
      result.current.addContract({
        playerId: 'p1',
        playerName: 'Player 1',
        seatPosition: 0,
        amount: 5,
        timestamp: new Date().toISOString(),
      });
      result.current.addContract({
        playerId: 'p2',
        playerName: 'Player 2',
        seatPosition: 1,
        amount: 3,
        timestamp: new Date().toISOString(),
      });
    });
    
    expect(result.current.contractSum).toBe(8);
  });
});
```

### 12.3 Validation Testing

```typescript
// __tests__/lib/validation/rules.test.ts

import { 
  isValidTrumpBid, 
  isValidContractBid,
  calculateScore,
  determineGameType,
} from '@/lib/validation/rules';

describe('Trump Bid Validation', () => {
  it('accepts valid first bid', () => {
    const result = isValidTrumpBid(
      { amount: 5, suit: 'hearts' },
      null,
      5
    );
    expect(result.valid).toBe(true);
  });
  
  it('rejects bid below minimum', () => {
    const result = isValidTrumpBid(
      { amount: 4, suit: 'hearts' },
      null,
      5
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 5');
  });
  
  it('accepts higher amount bid', () => {
    const result = isValidTrumpBid(
      { amount: 6, suit: 'clubs' },
      { playerId: 'p1', playerName: 'P1', amount: 5, suit: 'spades', timestamp: '' },
      5
    );
    expect(result.valid).toBe(true);
  });
  
  it('accepts same amount with higher suit', () => {
    const result = isValidTrumpBid(
      { amount: 5, suit: 'spades' },
      { playerId: 'p1', playerName: 'P1', amount: 5, suit: 'hearts', timestamp: '' },
      5
    );
    expect(result.valid).toBe(true);
  });
  
  it('rejects same amount with lower suit', () => {
    const result = isValidTrumpBid(
      { amount: 5, suit: 'hearts' },
      { playerId: 'p1', playerName: 'P1', amount: 5, suit: 'spades', timestamp: '' },
      5
    );
    expect(result.valid).toBe(false);
  });
});

describe('Contract Bid Validation', () => {
  it('rejects last bidder making sum 13', () => {
    const result = isValidContractBid(5, 8, true, false, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot make the sum equal 13');
  });
  
  it('allows non-last bidder to make sum 13', () => {
    const result = isValidContractBid(5, 8, false, false, 0);
    expect(result.valid).toBe(true);
  });
  
  it('requires trump winner to bid at least winning amount', () => {
    const result = isValidContractBid(4, 0, false, true, 5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 5');
  });
});

describe('Score Calculation', () => {
  it('calculates made contract correctly', () => {
    expect(calculateScore(3, 3, 'over')).toBe(19); // 3² + 10
    expect(calculateScore(5, 5, 'under')).toBe(35); // 5² + 10
  });
  
  it('calculates failed contract correctly', () => {
    expect(calculateScore(5, 3, 'over')).toBe(-20); // -10 × 2
    expect(calculateScore(3, 5, 'under')).toBe(-20); // -10 × 2
  });
  
  it('calculates made zero correctly', () => {
    expect(calculateScore(0, 0, 'under')).toBe(50);
    expect(calculateScore(0, 0, 'over')).toBe(25);
  });
  
  it('calculates failed zero correctly', () => {
    expect(calculateScore(0, 1, 'over')).toBe(-50);
    expect(calculateScore(0, 3, 'over')).toBe(-30); // -50 + 10×2
  });
});

describe('Game Type Determination', () => {
  it('returns over when sum > 13', () => {
    expect(determineGameType([5, 3, 4, 3])).toBe('over'); // Sum = 15
  });
  
  it('returns under when sum < 13', () => {
    expect(determineGameType([3, 2, 4, 2])).toBe('under'); // Sum = 11
  });
});
```

---

## Summary

This Frontend LLD provides comprehensive specifications for building the Whist Score Keeper frontend application. Key aspects covered include:

1. **Component Architecture**: Detailed component trees for each screen with clear hierarchies
2. **State Management**: Zustand store with typed slices, actions, and selectors
3. **Real-time Communication**: Socket.IO integration with typed events and sync hooks
4. **Validation**: Zod schemas for forms and game rule validation
5. **Responsive Design**: Mobile-first breakpoints with landscape score table support
6. **Animations**: Framer Motion variants for smooth, consistent animations
7. **Error Handling**: Error boundaries, loading states, and connection status
8. **Accessibility**: ARIA labels, focus management, and screen reader support
9. **Testing**: Component, store, and validation test examples

The implementation follows Next.js 14 App Router patterns with full TypeScript coverage and adheres to the design principles of being slick, clean, and user-friendly.
