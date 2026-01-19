# High-Level Design Document
## Whist Score Keeper Platform

**Version:** 1.0  
**Date:** January 2026  
**Author:** Product & Tech Lead  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Architecture](#3-architecture)
4. [Core Components](#4-core-components)
5. [Data Models](#5-data-models)
6. [User Flows](#6-user-flows)
7. [API Design](#7-api-design)
8. [Real-Time Communication](#8-real-time-communication)
9. [Analytics System](#9-analytics-system)
10. [Technology Stack](#10-technology-stack)
11. [Security Considerations](#11-security-considerations)
12. [Scalability & Performance](#12-scalability--performance)
13. [Future Considerations](#13-future-considerations)

---

## 1. Executive Summary

### 1.1 Purpose
A mobile-first web platform designed for Israeli Whist players to:
- Track game scores in real-time across multiple devices
- Maintain player statistics and history
- Provide engaging analytics and commentary between rounds
- Create and manage player groups for recurring games

### 1.2 Design Principles
- **Slick & Clean:** Minimalist UI with intuitive interactions
- **User-Friendly:** Zero learning curve for card players
- **Simple:** Focus on core functionality without feature bloat
- **Real-Time:** Instant synchronization across all player devices

### 1.3 Key Features
- Room-based multiplayer sessions
- Real-time score synchronization
- Bidding phase management with Frisch support
- Trick counting per player
- Persistent user profiles and statistics
- Group management and analytics
- Game history and replay data

---

## 2. System Overview

### 2.1 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WHIST PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│    │ Player 1 │  │ Player 2 │  │ Player 3 │  │ Player 4 │                  │
│    │ (Admin)  │  │          │  │          │  │          │                  │
│    └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│         │             │             │             │                         │
│         └─────────────┴──────┬──────┴─────────────┘                         │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────┐                                      │
│                    │   WebSocket     │                                      │
│                    │   Gateway       │                                      │
│                    └────────┬────────┘                                      │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                          │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │    Game     │    │    User     │    │  Analytics  │                     │
│  │   Service   │    │   Service   │    │   Service   │                     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                     │
│         │                  │                  │                            │
│         └──────────────────┴──────────────────┘                            │
│                            │                                               │
│                            ▼                                               │
│                    ┌─────────────────┐                                     │
│                    │    Database     │                                     │
│                    │   (PostgreSQL)  │                                     │
│                    └─────────────────┘                                     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 System Actors

| Actor | Role | Capabilities |
|-------|------|--------------|
| **Admin (Room Creator)** | Primary game controller | Create room, organize seating, start game, control game flow, access score table controls |
| **Player** | Game participant | Join room, place bids, record tricks, view scores |
| **System** | Automated processes | Validate bids, calculate scores, enforce rules, generate analytics |

---

## 3. Architecture

### 3.1 Architecture Style
**Event-Driven Microservices** with real-time WebSocket communication

### 3.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Progressive Web App (PWA)                         │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │    │
│  │  │   Room    │  │  Bidding  │  │   Round   │  │   Score   │        │    │
│  │  │   View    │  │   View    │  │   View    │  │   View    │        │    │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘        │    │
│  │                                                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │              State Management (Redux/Zustand)                │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │              WebSocket Client + REST Client                  │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Load Balancer                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                    │                              │                          │
│                    ▼                              ▼                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐           │
│  │     REST API Gateway        │  │    WebSocket Gateway         │           │
│  │     (Authentication,        │  │    (Real-time events,        │           │
│  │      Rate Limiting)         │  │     Room management)         │           │
│  └─────────────────────────────┘  └─────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                       │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │    User      │  │    Room      │  │    Game      │  │  Analytics   │    │
│  │   Service    │  │   Service    │  │   Service    │  │   Service    │    │
│  │              │  │              │  │              │  │              │    │
│  │ • Auth       │  │ • Create     │  │ • Bidding    │  │ • Player     │    │
│  │ • Profile    │  │ • Join       │  │ • Scoring    │  │ • Game       │    │
│  │ • Groups     │  │ • Seating    │  │ • Rounds     │  │ • Group      │    │
│  │ • History    │  │ • State      │  │ • Rules      │  │ • Insights   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
│         └─────────────────┴────────┬────────┴─────────────────┘            │
│                                    │                                       │
│                                    ▼                                       │
│                    ┌───────────────────────────────┐                       │
│                    │       Message Queue           │                       │
│                    │        (Redis Pub/Sub)        │                       │
│                    └───────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                         │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌─────────────────┐   │
│  │     PostgreSQL       │  │       Redis          │  │   File Storage  │   │
│  │   (Primary Data)     │  │   (Cache + Pub/Sub)  │  │   (Backups)     │   │
│  │                      │  │                      │  │                 │   │
│  │ • Users              │  │ • Session Data       │  │ • Analytics     │   │
│  │ • Games              │  │ • Room State         │  │   Reports       │   │
│  │ • Rounds             │  │ • Real-time Events   │  │                 │   │
│  │ • Groups             │  │                      │  │                 │   │
│  └──────────────────────┘  └──────────────────────┘  └─────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **PWA (Progressive Web App)** | Mobile-first, no app store deployment, works offline for local calculations |
| **WebSocket for real-time** | Low latency synchronization critical for multi-device gameplay |
| **PostgreSQL** | ACID compliance for game data integrity, complex queries for analytics |
| **Redis** | Fast session management, pub/sub for real-time events, room state caching |
| **FastAPI + python-socketio** | Async Python stack, familiar to team, excellent for data/analytics work |
| **Stateless Services** | Horizontal scalability, easier deployment |

---

## 4. Core Components

### 4.1 Client Components

#### 4.1.1 Room Management Component
```
┌─────────────────────────────────────┐
│         ROOM MANAGEMENT             │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │      Home Screen            │   │
│  │  ┌─────────┐ ┌───────────┐  │   │
│  │  │ Create  │ │   Join    │  │   │
│  │  │  Room   │ │   Room    │  │   │
│  │  └─────────┘ └───────────┘  │   │
│  └─────────────────────────────┘   │
│               │                     │
│               ▼                     │
│  ┌─────────────────────────────┐   │
│  │      Lobby Screen           │   │
│  │                             │   │
│  │  Players:    Seating:       │   │
│  │  ○ Player 1  [↑] [↓]       │   │
│  │  ○ Player 2  [↑] [↓]       │   │
│  │  ○ Player 3  [↑] [↓]       │   │
│  │  ○ Player 4  [↑] [↓]       │   │
│  │                             │   │
│  │     [ Start Game ]          │   │
│  │     (Admin Only)            │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 4.1.2 Bidding Component
```
┌─────────────────────────────────────┐
│         BIDDING SCREEN              │
├─────────────────────────────────────┤
│                                     │
│       Current Highest Bid:          │
│          [ 5 ♥ ] by Player 2        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │        Bid Counter          │   │
│  │                             │   │
│  │    [ - ]    7    [ + ]      │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │        Suit Selection       │   │
│  │                             │   │
│  │   ♣    ♦    ♥    ♠    NT    │   │
│  │   [ ]  [ ]  [●]  [ ]  [ ]   │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │   [ CALL ]      [ PASS ]    │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  Players Status:                    │
│  ✓ P1: Passed  ○ P2: 5♥            │
│  ◐ P3: Waiting  ○ P4: Passed       │
│                                     │
└─────────────────────────────────────┘
```

#### 4.1.3 Contract Bidding Component (After Trump Set)
```
┌─────────────────────────────────────┐
│      CONTRACT BIDDING SCREEN        │
├─────────────────────────────────────┤
│                                     │
│        Trump: ♥ Hearts              │
│        Won by: Player 2             │
│                                     │
│  ┌─────────────────────────────┐   │
│  │      Your Contract Bid      │   │
│  │                             │   │
│  │    [ - ]    5    [ + ]      │   │
│  │                             │   │
│  │       [ CONFIRM ]           │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  Contracts So Far:                  │
│  ✓ P2 (Trump Winner): 5            │
│  ✓ P3: 3                           │
│  ◐ P4: Bidding...                  │
│  ○ P1: Waiting                     │
│                                     │
│  Current Sum: 8                     │
│  (Last bidder cannot bid 5)         │
│                                     │
└─────────────────────────────────────┘
```

#### 4.1.4 Round Play Component
```
┌─────────────────────────────────────┐
│         ROUND PLAY SCREEN           │
├─────────────────────────────────────┤
│                                     │
│   Round 3 of 13  │  Trump: ♥        │
│                                     │
│   ┌─────────────────────────────┐   │
│   │   Your Tricks    Contract   │   │
│   │                             │   │
│   │       2     /     5        │   │
│   │                             │   │
│   └─────────────────────────────┘   │
│                                     │
│   ┌─────────────────────────────┐   │
│   │                             │   │
│   │         ╔═══════╗           │   │
│   │         ║       ║           │   │
│   │         ║ TRICK ║           │   │
│   │         ║       ║           │   │
│   │         ╚═══════╝           │   │
│   │                             │   │
│   │   Tap when you win a trick  │   │
│   │                             │   │
│   └─────────────────────────────┘   │
│                                     │
│   All Players:                      │
│   P1: 2/5  P2: 1/3  P3: 0/0  P4: 0/2│
│                                     │
│   Total Tricks: 3 / 13              │
│                                     │
└─────────────────────────────────────┘
```

#### 4.1.5 Score Table Component (Landscape)
```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              SCORE TABLE                                        │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ Round │ Trump │  Player 1  │  Player 2  │  Player 3  │  Player 4  │      │  │
│  ├───────┼───────┼────────────┼────────────┼────────────┼────────────┤      │  │
│  │   1   │  ♥    │  19 (3/3)  │  14 (2/2)  │  -20 (2/4) │  26 (4/4)  │      │  │
│  │   2   │  NT   │  -10 (1/2) │  50 (0/0)  │  35 (5/5)  │  -20 (3/5) │      │  │
│  │   3   │  ♠    │  26 (4/4)  │  -20 (0/2) │  19 (3/3)  │  11 (1/1)  │      │  │
│  │  ...  │  ...  │    ...     │    ...     │    ...     │    ...     │      │  │
│  ├───────┴───────┼────────────┼────────────┼────────────┼────────────┤      │  │
│  │    TOTAL      │     35     │     44     │     34     │     17     │      │  │
│  └───────────────┴────────────┴────────────┴────────────┴────────────┘      │  │
│                                                                                │
│                                                                                │
│             ┌─────────────────┐           ┌─────────────────┐                  │
│             │   NEW ROUND     │           │    END GAME     │                  │
│             └─────────────────┘           └─────────────────┘                  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Server Components

#### 4.2.1 User Service
**Responsibilities:**
- User registration and authentication
- Profile management
- User preferences
- Session management

#### 4.2.2 Room Service
**Responsibilities:**
- Room creation with unique codes
- Player joining/leaving
- Seating arrangement
- Room state management
- Room cleanup (inactive rooms)

#### 4.2.3 Game Service
**Responsibilities:**
- Game state machine management
- Bidding logic validation
- Frisch round handling
- Contract validation (sum ≠ 13 for last bidder)
- Trick counting
- Score calculation
- Round progression

#### 4.2.4 Analytics Service
**Responsibilities:**
- Player statistics aggregation
- Game history storage
- Group analytics computation
- Insights generation
- Leaderboards

---

## 5. Data Models

> **Implementation Note:** The models below are shown in TypeScript-like pseudocode for clarity. 
> The Python backend implements these using **SQLAlchemy 2.0** for database models and **Pydantic v2** 
> for API request/response schemas.

### 5.1 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      USER       │       │      GROUP      │       │   GROUP_MEMBER  │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)         │
│ username        │       │ name            │       │ group_id (FK)   │
│ display_name    │◄──────│ created_by (FK) │       │ user_id (FK)    │
│ email           │       │ created_at      │       │ joined_at       │
│ password_hash   │       │ updated_at      │       │ role            │
│ avatar_url      │       └────────┬────────┘       └─────────────────┘
│ created_at      │                │                         │
│ last_active     │                │                         │
└────────┬────────┘                └─────────────────────────┘
         │
         │
         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      GAME       │       │     ROUND       │       │  ROUND_PLAYER   │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)         │
│ room_code       │◄──────│ game_id (FK)    │◄──────│ round_id (FK)   │
│ group_id (FK)   │       │ round_number    │       │ player_id (FK)  │
│ admin_id (FK)   │       │ trump_suit      │       │ seat_position   │
│ status          │       │ is_over         │       │ contract_bid    │
│ created_at      │       │ frisch_count    │       │ tricks_won      │
│ ended_at        │       │ created_at      │       │ score           │
│ winner_id (FK)  │       └─────────────────┘       │ made_contract   │
└────────┬────────┘                                 └─────────────────┘
         │
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│  GAME_PLAYER    │       │  PLAYER_STATS   │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ game_id (FK)    │       │ user_id (FK)    │
│ user_id (FK)    │       │ total_games     │
│ seat_position   │       │ total_wins      │
│ final_score     │       │ total_rounds    │
│ is_winner       │       │ avg_score       │
│ joined_at       │       │ contracts_made  │
│                 │       │ zeros_made      │
└─────────────────┘       │ updated_at      │
                          └─────────────────┘
```

### 5.2 Core Data Models

#### 5.2.1 User
```typescript
interface User {
  id: string;                  // UUID
  username: string;            // Unique, for login
  displayName: string;         // Shown in games
  email: string;               // Optional, for recovery
  passwordHash: string;        // Bcrypt hashed
  avatarUrl?: string;          // Profile picture
  createdAt: DateTime;
  lastActive: DateTime;
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  language: 'en' | 'he';
}
```

#### 5.2.2 Group
```typescript
interface Group {
  id: string;
  name: string;
  createdBy: string;           // User ID
  members: GroupMember[];
  createdAt: DateTime;
  updatedAt: DateTime;
  stats: GroupStats;
}

interface GroupMember {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: DateTime;
}

interface GroupStats {
  totalGames: number;
  totalRounds: number;
  lastPlayedAt: DateTime;
}
```

#### 5.2.3 Game
```typescript
interface Game {
  id: string;
  roomCode: string;            // 6-char code for joining
  groupId?: string;            // Optional group association
  adminId: string;             // Room creator
  players: GamePlayer[];
  status: GameStatus;
  currentRound?: Round;
  rounds: Round[];
  createdAt: DateTime;
  endedAt?: DateTime;
}

type GameStatus = 
  | 'waiting'        // In lobby
  | 'bidding_trump'  // Trump selection
  | 'bidding_contract' // Contract bids
  | 'playing'        // Round in progress
  | 'round_complete' // Viewing scores
  | 'finished';      // Game ended

interface GamePlayer {
  userId: string;
  displayName: string;
  seatPosition: number;        // 0-3, clockwise
  isAdmin: boolean;
  isConnected: boolean;
  finalScore?: number;
}
```

#### 5.2.4 Round
```typescript
interface Round {
  id: string;
  gameId: string;
  roundNumber: number;
  trumpSuit: TrumpSuit | null;
  trumpWinnerId: string | null;
  isOver: boolean;             // Sum of bids > or < 13
  frischCount: number;         // 0-3
  players: RoundPlayer[];
  currentPhase: RoundPhase;
  biddingState: BiddingState;
  createdAt: DateTime;
}

type TrumpSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no_trump';

type RoundPhase = 
  | 'trump_bidding'
  | 'frisch'
  | 'contract_bidding'
  | 'playing'
  | 'complete';

interface BiddingState {
  currentBidderIndex: number;
  highestBid?: Bid;
  consecutivePasses: number;
  bids: Bid[];
  minimumBid: number;          // 5, 6, 7, or 8 after frisch
}

interface Bid {
  playerId: string;
  amount: number;
  suit: TrumpSuit;
  timestamp: DateTime;
}

interface RoundPlayer {
  userId: string;
  seatPosition: number;
  contractBid: number | null;
  tricksWon: number;
  score: number;
  madeContract: boolean;
}
```

### 5.3 Redis Data Structures

#### Active Room State (Hash)
```
room:{roomCode}
├── gameId: string
├── adminId: string
├── status: GameStatus
├── phase: RoundPhase
├── players: JSON (GamePlayer[])
├── currentRound: JSON (Round)
├── lastActivity: timestamp
└── wsConnections: JSON (socketId -> playerId)
```

#### Player Session (Hash)
```
session:{sessionId}
├── userId: string
├── displayName: string
├── roomCode: string
├── socketId: string
└── lastPing: timestamp
```

---

## 6. User Flows

### 6.1 Game Creation Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Player    │     │   Client    │     │   Server    │     │  Database   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │  Open App         │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │  Click "Create    │                   │                   │
       │  Room"            │                   │                   │
       │──────────────────>│                   │                   │
       │                   │                   │                   │
       │                   │  POST /rooms      │                   │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │                   │                   │  Create Game      │
       │                   │                   │──────────────────>│
       │                   │                   │                   │
       │                   │                   │  Generate Code    │
       │                   │                   │<──────────────────│
       │                   │                   │                   │
       │                   │  Room Code: ABC123│                   │
       │                   │<──────────────────│                   │
       │                   │                   │                   │
       │                   │  Connect WebSocket│                   │
       │                   │──────────────────>│                   │
       │                   │                   │                   │
       │  Show Lobby +     │                   │                   │
       │  Room Code        │                   │                   │
       │<──────────────────│                   │                   │
       │                   │                   │                   │
```

### 6.2 Trump Bidding Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                          TRUMP BIDDING STATE MACHINE                           │
└───────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   Start Round   │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Player 1 Turn  │◄──────────────────┐
                              │  (Left of      │                    │
                              │   Dealer)       │                    │
                              └────────┬────────┘                    │
                                       │                             │
                         ┌─────────────┴─────────────┐               │
                         │                           │               │
                         ▼                           ▼               │
                  ┌─────────────┐           ┌─────────────┐          │
                  │    PASS     │           │    BID      │          │
                  │             │           │  (≥ min,    │          │
                  │             │           │  > current) │          │
                  └──────┬──────┘           └──────┬──────┘          │
                         │                         │                 │
                         │                         │                 │
                         ▼                         ▼                 │
                  ┌─────────────┐           ┌─────────────┐          │
                  │consecutivePa│           │Reset passes │          │
                  │sses++       │           │Set new high │          │
                  └──────┬──────┘           └──────┬──────┘          │
                         │                         │                 │
                         │                         │                 │
                         ▼                         ▼                 │
            ┌────────────────────────┐    ┌─────────────────┐        │
            │consecutivePasses == 4? │    │  Next Player    │────────┘
            └────────────┬───────────┘    └─────────────────┘
                         │
           ┌─────────────┴─────────────┐
           │ YES                   NO  │
           ▼                           ▼
    ┌─────────────┐           ┌─────────────────┐
    │   FRISCH    │           │consecutivePasses│
    │   ROUND     │           │    == 3?        │
    │(if < 3 done)│           └────────┬────────┘
    └──────┬──────┘                    │
           │                 ┌─────────┴─────────┐
           │                 │ YES           NO  │
           ▼                 ▼                   ▼
    ┌─────────────┐   ┌─────────────┐    ┌─────────────┐
    │ Exchange    │   │ TRUMP SET   │    │ Next Player │
    │ 3 Cards     │   │ Winner bids │    └──────┬──────┘
    │ min_bid++   │   │ first for   │           │
    └──────┬──────┘   │ contract    │           │
           │          └─────────────┘           │
           │                                    │
           └────────────────────────────────────┘
```

### 6.3 Contract Bidding Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                        CONTRACT BIDDING STATE MACHINE                          │
└───────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  Trump Winner   │
                              │  Bids First     │
                              │  (≥ trump bid)  │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Next Player    │◄───────────────┐
                              │  (Clockwise)    │                │
                              └────────┬────────┘                │
                                       │                         │
                                       ▼                         │
                              ┌─────────────────┐                │
                              │  Is Last        │                │
                              │  Bidder?        │                │
                              └────────┬────────┘                │
                                       │                         │
                         ┌─────────────┴─────────────┐           │
                         │ YES                   NO  │           │
                         ▼                           ▼           │
                  ┌─────────────┐           ┌─────────────┐      │
                  │ Cannot bid  │           │ Bid 0-13    │      │
                  │ value that  │           │ (any valid  │      │
                  │ makes sum   │           │  number)    │──────┘
                  │ equal 13    │           └─────────────┘
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ Determine   │
                  │ Over/Under  │
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ Start Round │
                  │ Play Phase  │
                  └─────────────┘
```

### 6.4 Round Play Flow

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                            ROUND PLAY STATE MACHINE                            │
└───────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  Round Start    │
                              │  (Trump winner  │
                              │   plays first)  │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Waiting for    │◄───────────────┐
                              │  Trick Winner   │                │
                              │  Input          │                │
                              └────────┬────────┘                │
                                       │                         │
                                       ▼                         │
                              ┌─────────────────┐                │
                              │  Player Claims  │                │
                              │  Trick          │                │
                              └────────┬────────┘                │
                                       │                         │
                                       ▼                         │
                              ┌─────────────────┐                │
                              │  Increment      │                │
                              │  Tricks Won     │                │
                              └────────┬────────┘                │
                                       │                         │
                                       ▼                         │
                              ┌─────────────────┐                │
                              │  Total Tricks   │                │
                              │  == 13?         │                │
                              └────────┬────────┘                │
                                       │                         │
                         ┌─────────────┴─────────────┐           │
                         │ YES                   NO  │           │
                         ▼                           └───────────┘
                  ┌─────────────┐
                  │ Calculate   │
                  │ Scores      │
                  └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ Show Score  │
                  │ Table       │
                  │ (Admin)     │
                  └─────────────┘
```

---

## 7. API Design

### 7.1 REST API Endpoints

#### Authentication
```
POST   /api/auth/register         # Create new user
POST   /api/auth/login            # Login, receive JWT
POST   /api/auth/logout           # Invalidate session
POST   /api/auth/refresh          # Refresh JWT token
GET    /api/auth/me               # Get current user
```

#### Users
```
GET    /api/users/:id             # Get user profile
PUT    /api/users/:id             # Update profile
GET    /api/users/:id/stats       # Get player statistics
GET    /api/users/:id/history     # Get game history
```

#### Groups
```
POST   /api/groups                # Create group
GET    /api/groups                # List user's groups
GET    /api/groups/:id            # Get group details
PUT    /api/groups/:id            # Update group
DELETE /api/groups/:id            # Delete group
POST   /api/groups/:id/members    # Add member
DELETE /api/groups/:id/members/:uid  # Remove member
GET    /api/groups/:id/stats      # Get group analytics
GET    /api/groups/:id/games      # Get group game history
```

#### Rooms
```
POST   /api/rooms                 # Create room
GET    /api/rooms/:code           # Get room state
POST   /api/rooms/:code/join      # Join room
POST   /api/rooms/:code/leave     # Leave room
PUT    /api/rooms/:code/seating   # Update seating (admin)
POST   /api/rooms/:code/start     # Start game (admin)
```

#### Games
```
GET    /api/games/:id             # Get full game state
GET    /api/games/:id/rounds      # Get all rounds
GET    /api/games/:id/scores      # Get final scores
```

### 7.2 WebSocket Events

#### Client → Server Events
```typescript
// Room Events
'room:join'        { roomCode: string, displayName: string }
'room:leave'       { roomCode: string }
'room:seating'     { roomCode: string, positions: number[] }  // Admin only
'room:start'       { roomCode: string }                       // Admin only

// Bidding Events
'bid:trump'        { suit: TrumpSuit, amount: number }
'bid:pass'         {}
'bid:contract'     { amount: number }

// Round Events
'round:trick'      {}  // Claim trick won
'round:undo'       {}  // Undo last trick (admin)

// Game Events
'game:newRound'    {}  // Start new round (admin)
'game:end'         {}  // End game (admin)
```

#### Server → Client Events
```typescript
// Room Events
'room:updated'     { room: RoomState }
'room:playerJoined' { player: GamePlayer }
'room:playerLeft'  { playerId: string }

// Game Events  
'game:started'     { game: Game }
'game:phaseChanged' { phase: RoundPhase }
'game:ended'       { finalScores: Score[] }

// Bidding Events
'bid:placed'       { bid: Bid }
'bid:passed'       { playerId: string }
'bid:trumpSet'     { suit: TrumpSuit, winnerId: string }
'bid:frisch'       { frischNumber: number }
'bid:contractSet'  { contracts: Contract[] }
'bid:yourTurn'     { validBids: ValidBid[] }

// Round Events
'round:trickWon'   { playerId: string, newTotal: number }
'round:complete'   { roundResult: RoundResult }
'round:scoreTable' { scores: Score[] }  // Admin only

// Error Events
'error:invalidBid' { message: string }
'error:notYourTurn' { currentPlayerId: string }
```

### 7.3 API Request/Response Examples

#### Create Room
```http
POST /api/rooms
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "groupId": "optional-group-id"
}

Response 201:
{
  "roomCode": "ABC123",
  "gameId": "game-uuid",
  "adminId": "user-uuid",
  "status": "waiting",
  "wsEndpoint": "wss://api.whist.app/ws?room=ABC123"
}
```

#### Place Trump Bid (WebSocket)
```typescript
// Client sends
socket.emit('bid:trump', { 
  suit: 'hearts', 
  amount: 6 
});

// Server broadcasts to room
socket.on('bid:placed', {
  bid: {
    playerId: 'user-uuid',
    playerName: 'David',
    suit: 'hearts',
    amount: 6,
    timestamp: '2026-01-15T10:30:00Z'
  },
  highestBid: {
    playerId: 'user-uuid',
    suit: 'hearts',
    amount: 6
  },
  nextPlayerId: 'next-user-uuid',
  consecutivePasses: 0
});
```

---

## 8. Real-Time Communication

### 8.1 WebSocket Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WEBSOCKET ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

     Player 1         Player 2         Player 3         Player 4
         │                │                │                │
         │                │                │                │
         ▼                ▼                ▼                ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    Load Balancer                             │
    │                  (Sticky Sessions)                           │
    └──────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌───────────┐        ┌───────────┐        ┌───────────┐
    │  WS Node  │        │  WS Node  │        │  WS Node  │
    │     1     │        │     2     │        │     3     │
    └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
                    ┌───────────────────┐
                    │    Redis Pub/Sub  │
                    │                   │
                    │  Channels:        │
                    │  • room:{code}    │
                    │  • user:{id}      │
                    └───────────────────┘
```

### 8.2 Room-Based Broadcasting

```python
# Server-side room management (FastAPI + python-socketio)
import socketio
from redis.asyncio import Redis

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
redis = Redis.from_url("redis://localhost:6379")

class RoomManager:
    def __init__(self, sio: socketio.AsyncServer, redis: Redis):
        self.sio = sio
        self.redis = redis
    
    async def join_room(self, sid: str, room_code: str, user_id: str):
        """Player joins a room"""
        # Add to Socket.IO room
        self.sio.enter_room(sid, f"room:{room_code}")
        
        # Store connection mapping
        await self.redis.hset(
            f"room:{room_code}:connections",
            sid,
            user_id
        )
        
        # Broadcast to room
        player = await self.get_player(user_id)
        await self.broadcast_to_room(
            room_code, 
            "room:playerJoined", 
            {"player": player}
        )
    
    async def broadcast_to_room(self, room_code: str, event: str, data: dict):
        """Broadcast event to all players in a room"""
        await self.sio.emit(event, data, room=f"room:{room_code}")
        
        # Cross-node broadcast via Redis Pub/Sub (for scaling)
        await self.redis.publish(
            f"room:{room_code}",
            json.dumps({"event": event, "data": data})
        )
```

### 8.3 Reconnection Handling

```python
# Handle disconnection and reconnection
@sio.event
async def disconnect(sid: str):
    session = await sio.get_session(sid)
    user_id = session.get("user_id")
    room_code = session.get("room_code")
    
    if not user_id or not room_code:
        return
    
    # Mark player as disconnected but don't remove
    player_data = await redis.hget(f"room:{room_code}:players", user_id)
    if player_data:
        player = json.loads(player_data)
        player["is_connected"] = False
        await redis.hset(
            f"room:{room_code}:players",
            user_id,
            json.dumps(player)
        )
    
    # Start reconnection grace period (60 seconds)
    await redis.setex(f"reconnect:{user_id}", 60, room_code)
    
    # Notify other players
    await room_manager.broadcast_to_room(
        room_code,
        "room:playerDisconnected",
        {"player_id": user_id, "grace_period": 60}
    )

@sio.event
async def reconnect_attempt(sid: str, data: dict):
    user_id = data.get("user_id")
    room_code = data.get("room_code")
    
    saved_room = await redis.get(f"reconnect:{user_id}")
    
    if saved_room and saved_room.decode() == room_code:
        # Restore player session
        await room_manager.restore_player_session(sid, user_id, room_code)
        
        # Send current game state
        game_state = await room_manager.get_game_state(room_code)
        await sio.emit("game:stateSync", game_state, to=sid)
```

---

## 9. Analytics System

### 9.1 Player Analytics

```python
from pydantic import BaseModel
from typing import Literal

TrumpSuit = Literal["clubs", "diamonds", "hearts", "spades", "no_trump"]

class PlayerAnalytics(BaseModel):
    # Basic Stats
    total_games: int
    total_rounds: int
    total_wins: int
    win_rate: float
    
    # Scoring Stats
    average_score: float
    highest_score: int
    lowest_score: int
    total_points: int
    
    # Contract Stats
    contracts_made: int
    contracts_failed: int
    contract_success_rate: float
    average_contract_bid: float
    
    # Zero Bids
    zeros_made: int
    zeros_failed: int
    zero_success_rate: float
    
    # Trump Stats
    trump_wins: int
    favorite_suit: TrumpSuit | None
    suit_win_rates: dict[TrumpSuit, float]
    
    # Trends
    recent_form: list[Literal["W", "L"]]  # Last 10 games
    score_trend: list[int]                 # Last 20 game scores
    best_streak: int
    current_streak: int
```

### 9.2 Game Analytics

```python
class PlayerGamePerformance(BaseModel):
    player_id: str
    final_score: int
    contracts_attempted: int
    contracts_made: int
    zero_bids_attempted: int
    zero_bids_made: int
    trump_wins: int
    best_round: dict  # {"round_number": int, "score": int}
    worst_round: dict  # {"round_number": int, "score": int}

class GameHighlight(BaseModel):
    type: Literal["comeback", "blowout", "close_finish", "perfect_zeros", "frisch_storm"]
    description: str
    round_number: int | None = None
    player_id: str | None = None

class GameAnalytics(BaseModel):
    # Game Summary
    game_id: str
    duration: int           # In minutes
    total_rounds: int
    winner_id: str
    
    # Round Details
    average_round_duration: float
    frisch_count: int
    over_rounds: int
    under_rounds: int
    
    # Player Performance
    players: list[PlayerGamePerformance]
    
    # Interesting Moments
    highlights: list[GameHighlight]
```

### 9.3 Group Analytics

```python
class LeaderboardEntry(BaseModel):
    player_id: str
    wins: int
    win_rate: float
    avg_score: float

class HeadToHeadRecord(BaseModel):
    wins: int
    losses: int
    avg_point_diff: float

class GroupRecords(BaseModel):
    highest_single_round: dict  # {"player_id": str, "score": int, "game_id": str}
    longest_game: dict          # {"game_id": str, "rounds": int}
    biggest_comeback: dict      # {"player_id": str, "game_id": str, "deficit": int}

class GroupAnalytics(BaseModel):
    group_id: str
    
    # Basic Stats
    total_games: int
    total_rounds: int
    total_play_time: float      # In hours
    
    # Leaderboard
    all_time_leader: str        # User ID
    leaderboard: list[LeaderboardEntry]
    
    # Head-to-Head Records
    # Nested dict: player_id -> opponent_id -> HeadToHeadRecord
    head_to_head: dict[str, dict[str, HeadToHeadRecord]]
    
    # Trends
    most_active_day: str        # Day of week
    average_game_duration: float
    games_per_month: list[int]
    
    # Fun Stats
    nemesis: dict[str, str]              # player_id -> rival_id
    best_partnership: tuple[str, str]    # Best teammate combo
    most_dramatic_games: list[dict]      # Game summaries
    records: GroupRecords
```

### 9.4 Fun Commentary System

```python
from abc import ABC, abstractmethod
from datetime import datetime

class Achievement(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    unlocked_at: datetime | None = None

ACHIEVEMENTS = [
    Achievement(id="first_win", name="First Blood", description="Win your first game", icon="🏆"),
    Achievement(id="zero_master", name="Zero Hero", description="Successfully bid zero 10 times", icon="🎯"),
    Achievement(id="perfect_game", name="Perfectionist", description="Make every contract in a game", icon="⭐"),
    Achievement(id="comeback_kid", name="Comeback Kid", description="Win after trailing by 50+ points", icon="🔄"),
    Achievement(id="frisch_survivor", name="Frisch Survivor", description="Win after 3 Frisch rounds", icon="🌪️"),
]

class CommentaryEngine:
    """Generate fun comments and highlights during gameplay."""
    
    def generate_round_comments(self, round_result: "RoundResult") -> list[str]:
        """Generate comments after a round ends."""
        comments = []
        
        for player in round_result.players:
            if player.made_contract and player.contract_bid >= 5:
                comments.append(
                    f"🎯 {player.name} nailed their {player.contract_bid} bid perfectly! "
                    "Surgeon-level precision."
                )
            
            if player.contract_bid == 0 and player.tricks_won == 0:
                if round_result.is_over:
                    comments.append(
                        f"💀 {player.name} bid zero in an over game... and made it! Bold move!"
                    )
        
        if round_result.frisch_count >= 2:
            comments.append(
                f"📉 {round_result.frisch_count} Frisch rounds - everyone's cards are terrible today!"
            )
        
        return comments
    
    def generate_game_highlights(self, game_result: "GameResult") -> list[GameHighlight]:
        """Generate highlights at end of game."""
        highlights = []
        
        # Check for close finish
        scores = sorted([p.final_score for p in game_result.players], reverse=True)
        if scores[0] - scores[1] <= 10:
            highlights.append(GameHighlight(
                type="close_finish",
                description=f"Nail-biter! Only {scores[0] - scores[1]} points separated 1st and 2nd!"
            ))
        
        return highlights
    
    def check_achievements(
        self, 
        player_id: str, 
        game_result: "GameResult"
    ) -> list[Achievement]:
        """Check if player unlocked any achievements."""
        unlocked = []
        # Implementation checks various conditions...
        return unlocked

# Example generated comments:
EXAMPLE_COMMENTS = [
    "🎯 David nailed his 5 bid perfectly! Surgeon-level precision.",
    "💀 Sarah bid zero in an over game... and made it! Bold move!",
    "📉 Third Frisch in a row - everyone's cards are terrible today!",
    "🔥 Mike is on a 3-game winning streak!",
    "🎰 The scores are separated by only 5 points. Nail-biter!",
    "👑 New group record! Rachel scored 50 points in a single round!"
]
```

---

## 10. Technology Stack

### 10.1 Recommended Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TECHNOLOGY STACK                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Framework:        Next.js 14+ (App Router)                                 │
│  Language:         TypeScript                                               │
│  State:            Zustand (lightweight, perfect for real-time)             │
│  Styling:          Tailwind CSS + Radix UI (clean, accessible)              │
│  Real-time:        Socket.IO Client                                         │
│  Forms:            React Hook Form + Zod                                    │
│  PWA:              next-pwa                                                 │
│  Animations:       Framer Motion (subtle, smooth)                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND                                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Runtime:          Python 3.11+                                             │
│  Framework:        FastAPI (modern, async, automatic OpenAPI docs)          │
│  WebSocket:        python-socketio (Socket.IO server implementation)        │
│  Validation:       Pydantic v2 (built into FastAPI)                         │
│  ORM:              SQLAlchemy 2.0 (async support) + Alembic (migrations)    │
│  Auth:             python-jose (JWT) + passlib (password hashing)           │
│  Task Queue:       (optional) Celery or ARQ for background analytics        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Primary DB:       PostgreSQL 15+ (ACID, complex queries)                   │
│  Cache/Pub-Sub:    Redis 7+ (sessions, real-time state)                     │
│  Search:           PostgreSQL Full-Text (if needed)                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Hosting:          Vercel (Frontend) + Railway/Render/Fly.io (Backend)      │
│                    OR AWS/GCP for more control                              │
│  CDN:              Vercel Edge / Cloudflare                                 │
│  Database:         Neon (PostgreSQL) / Supabase                             │
│  Cache:            Upstash Redis (serverless) / Redis Cloud                 │
│  Monitoring:       Sentry (errors) + Axiom (logs)                           │
│  Analytics:        PostHog (product analytics)                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Alternative: Simpler Stack

For faster MVP development:

```
Frontend:     React + Vite + Tailwind + Socket.IO Client
Backend:      FastAPI + python-socketio + SQLModel (SQLAlchemy wrapper)
Database:     Supabase (PostgreSQL + Auth)
Hosting:      Vercel (Frontend) + Render (Backend)
```

### 10.3 Key Libraries

```
# Frontend (package.json)
next: 14.x
react: 18.x
typescript: 5.x
zustand: 4.x
socket.io-client: 4.x
tailwindcss: 3.x
@radix-ui/react-*: latest
framer-motion: 11.x
zod: 3.x

# Backend (requirements.txt / pyproject.toml)
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
python-socketio>=5.11.0
sqlalchemy[asyncio]>=2.0.25
asyncpg>=0.29.0              # Async PostgreSQL driver
alembic>=1.13.0              # Database migrations
pydantic>=2.6.0
pydantic-settings>=2.1.0     # Environment/config management
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
redis>=5.0.0                 # Async Redis client
httpx>=0.26.0                # Async HTTP client (for testing)
python-multipart>=0.0.6      # Form data parsing
```

---

## 11. Security Considerations

### 11.1 Authentication & Authorization

```python
from pydantic import BaseModel
from datetime import datetime

# JWT Token Structure
class JWTPayload(BaseModel):
    sub: str          # User ID
    email: str
    iat: datetime     # Issued at
    exp: datetime     # Expiration

# Access Control
PERMISSIONS = {
    "room:create": ["authenticated"],
    "room:join": ["authenticated"],
    "room:seating": ["room:admin"],
    "room:start": ["room:admin"],
    "game:newRound": ["room:admin"],
    "game:end": ["room:admin"],
    "bid:trump": ["room:player"],
    "bid:pass": ["room:player"],
    "bid:contract": ["room:player"],
    "round:trick": ["room:player"],
    "round:undo": ["room:admin"],
}

# FastAPI dependency for JWT verification
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials, 
            SECRET_KEY, 
            algorithms=[ALGORITHM]
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user
```

### 11.2 Input Validation

```python
# Bid Validation with Pydantic models
from pydantic import BaseModel, field_validator
from typing import Literal
from dataclasses import dataclass

TrumpSuit = Literal["clubs", "diamonds", "hearts", "spades", "no_trump"]

class TrumpBidRequest(BaseModel):
    suit: TrumpSuit
    amount: int
    
    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: int) -> int:
        if not 5 <= v <= 13:
            raise ValueError("Bid amount must be between 5 and 13")
        return v

class ContractBidRequest(BaseModel):
    amount: int
    
    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: int) -> int:
        if not 0 <= v <= 13:
            raise ValueError("Contract must be between 0 and 13")
        return v

@dataclass
class ValidationResult:
    valid: bool
    error: str | None = None

class BidValidator:
    def validate_trump_bid(
        self, 
        bid: TrumpBidRequest, 
        player_id: str,
        game_state: "GameState"
    ) -> ValidationResult:
        # Check it's player's turn
        if game_state.current_bidder != player_id:
            return ValidationResult(valid=False, error="NOT_YOUR_TURN")
        
        # Check bid is higher than minimum
        if bid.amount < game_state.minimum_bid:
            return ValidationResult(valid=False, error="BID_TOO_LOW")
        
        # Check bid is higher than current highest
        if game_state.highest_bid:
            if not self._is_higher_bid(bid, game_state.highest_bid):
                return ValidationResult(valid=False, error="MUST_BID_HIGHER")
        
        return ValidationResult(valid=True)
    
    def validate_contract_bid(
        self,
        bid: ContractBidRequest,
        player_id: str,
        game_state: "GameState"
    ) -> ValidationResult:
        # Check last bidder rule (sum cannot equal 13)
        if game_state.is_last_bidder:
            sum_with_bid = game_state.contract_sum + bid.amount
            if sum_with_bid == 13:
                return ValidationResult(
                    valid=False, 
                    error="CANNOT_MAKE_SUM_13"
                )
        
        return ValidationResult(valid=True)
    
    def _is_higher_bid(self, new: TrumpBidRequest, current: "Bid") -> bool:
        suit_order = ["clubs", "diamonds", "hearts", "spades", "no_trump"]
        if new.amount > current.amount:
            return True
        if new.amount == current.amount:
            return suit_order.index(new.suit) > suit_order.index(current.suit)
        return False
```

### 11.3 Rate Limiting

```typescript
// Rate limits
const rateLimits = {
  'api:general': { window: '1m', max: 100 },
  'api:auth': { window: '15m', max: 5 },      // Login attempts
  'ws:messages': { window: '1s', max: 10 },   // WebSocket messages
  'room:create': { window: '1h', max: 10 },   // Room creation
};
```

### 11.4 Data Privacy

- Passwords hashed with bcrypt (12 rounds)
- JWT tokens expire after 7 days
- Room codes are short-lived (24h inactive = deleted)
- User data deletion on request (GDPR compliance)
- No sensitive data in WebSocket messages

---

## 12. Scalability & Performance

### 12.1 Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCALING ARCHITECTURE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: MVP (0-1000 concurrent users)
─────────────────────────────────────────
• Single server with Socket.IO
• Single PostgreSQL instance
• Redis for sessions only
• Vercel + Railway

Phase 2: Growth (1000-10000 concurrent users)  
─────────────────────────────────────────
• Multiple WebSocket nodes behind LB
• Redis Pub/Sub for cross-node messaging
• PostgreSQL read replicas
• Database connection pooling

Phase 3: Scale (10000+ concurrent users)
─────────────────────────────────────────
• Kubernetes for container orchestration
• Redis Cluster for high availability
• PostgreSQL with sharding
• Regional deployments for latency
• CDN for static assets
```

### 12.2 Performance Optimizations

```python
# Caching Strategy
CACHE_CONFIG = {
    # Hot data in Redis
    "room:state": {"ttl": 0, "type": "persistent"},      # Always in memory
    "user:session": {"ttl": 86400, "type": "session"},   # 24 hours
    "game:state": {"ttl": 3600, "type": "game"},         # 1 hour after end
    
    # Cold data in DB
    "user:profile": "postgresql",
    "game:history": "postgresql",
    "analytics:*": "postgresql",
}

# Database Optimizations - SQLAlchemy indexes
from sqlalchemy import Index

# Define indexes on models
class Game(Base):
    __tablename__ = "games"
    # ... columns ...
    
    __table_args__ = (
        Index("ix_games_room_code", "room_code"),
        Index("ix_games_group_created", "group_id", "created_at"),
    )

class Round(Base):
    __tablename__ = "rounds"
    # ... columns ...
    
    __table_args__ = (
        Index("ix_rounds_game_number", "game_id", "round_number"),
    )

class RoundPlayer(Base):
    __tablename__ = "round_players"
    # ... columns ...
    
    __table_args__ = (
        Index("ix_round_players_round_user", "round_id", "user_id"),
    )

# Connection pool settings (asyncpg)
DATABASE_CONFIG = {
    "pool_size": 10,
    "max_overflow": 20,
    "pool_timeout": 30,
    "pool_recycle": 1800,  # Recycle connections after 30 min
}
```

### 12.3 Real-Time Performance

```python
# python-socketio configuration
import socketio

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    
    # Compression for larger payloads
    compression_threshold=1024,  # Only compress if > 1KB
    
    # Heartbeat to detect dead connections
    ping_interval=25,
    ping_timeout=5,
    
    # Max payload to prevent abuse
    max_http_buffer_size=16384,  # 16KB
    
    # Allow upgrades from polling to websocket
    allow_upgrades=True,
)

# Application with Socket.IO
from fastapi import FastAPI

app = FastAPI()
socket_app = socketio.ASGIApp(sio, app)

# Message batching can be implemented at application level
# by collecting events and flushing every 50ms
```

---

## 13. Future Considerations

### 13.1 Phase 1 MVP (Weeks 1-4)
- [ ] Basic room creation and joining
- [ ] Trump bidding with Frisch support
- [ ] Contract bidding with sum validation
- [ ] Trick counting and score calculation
- [ ] Simple score table display
- [ ] Basic user authentication

### 13.2 Phase 2 Enhancement (Weeks 5-8)
- [ ] User profiles and statistics
- [ ] Game history
- [ ] Group creation and management
- [ ] Basic analytics dashboard
- [ ] PWA support (installable)
- [ ] Reconnection handling

### 13.3 Phase 3 Polish (Weeks 9-12)
- [ ] Fun commentary between rounds
- [ ] Achievements system
- [ ] Advanced group analytics
- [ ] Head-to-head records
- [ ] Sound effects and haptics
- [ ] Dark mode

### 13.4 Future Features (Backlog)
- [ ] Tournament mode
- [ ] Spectator mode
- [ ] Game replay
- [ ] Social features (friends, challenges)
- [ ] Push notifications
- [ ] Multi-language support (Hebrew)
- [ ] Voice announcements
- [ ] AI opponent for practice

### 13.5 Technical Debt Considerations
- Comprehensive test coverage (unit + integration)
- API documentation (OpenAPI/Swagger)
- Monitoring and alerting setup
- Database backup strategy
- CI/CD pipeline
- Error tracking and logging

---

## Appendix A: Scoring Algorithm

```python
from dataclasses import dataclass

@dataclass
class RoundPlayer:
    user_id: str
    seat_position: int
    contract_bid: int
    tricks_won: int
    score: int = 0
    made_contract: bool = False

def calculate_round_score(player: RoundPlayer, is_over_game: bool) -> int:
    """
    Calculate score for a player based on their contract and tricks won.
    
    Scoring rules:
    - Made contract (non-zero): bid² + 10
    - Failed contract (non-zero): -10 per deviation
    - Made zero (under game): 50 points
    - Made zero (over game): 25 points
    - Failed zero (1 trick): -50 points
    - Failed zero (2+ tricks): -50 + 10 per extra trick
    """
    contract = player.contract_bid
    tricks = player.tricks_won
    
    # Zero bid handling
    if contract == 0:
        if tricks == 0:
            # Made zero: 50 in under, 25 in over
            return 25 if is_over_game else 50
        elif tricks == 1:
            # Failed zero with 1 trick: -50
            return -50
        else:
            # Failed zero with 2+ tricks: -50 + 10 per extra trick
            return -50 + (tricks - 1) * 10
    
    # Regular bid handling
    if tricks == contract:
        # Made contract: bid² + 10
        return (contract * contract) + 10
    else:
        # Failed contract: -10 per deviation
        deviation = abs(tricks - contract)
        return deviation * -10

def determine_over_under(contracts: list[int]) -> str:
    """Determine if the game is 'over' (sum > 13) or 'under' (sum < 13)."""
    total = sum(contracts)
    return "over" if total > 13 else "under"

def calculate_round_scores(players: list[RoundPlayer]) -> list[RoundPlayer]:
    """Calculate scores for all players in a round."""
    contracts = [p.contract_bid for p in players]
    is_over = determine_over_under(contracts) == "over"
    
    for player in players:
        player.score = calculate_round_score(player, is_over)
        player.made_contract = player.tricks_won == player.contract_bid
    
    return players
```

---

## Appendix B: Room Code Generation

```python
import secrets
from redis.asyncio import Redis

# Characters that are easy to read (no O/0, I/1, L confusion)
ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"
ROOM_CODE_LENGTH = 6

def generate_room_code() -> str:
    """Generate a 6-character room code using unambiguous characters."""
    return "".join(
        secrets.choice(ROOM_CODE_CHARS) 
        for _ in range(ROOM_CODE_LENGTH)
    )

async def get_unique_room_code(redis: Redis, max_attempts: int = 10) -> str:
    """
    Generate a unique room code that doesn't already exist.
    
    Raises:
        RuntimeError: If unable to generate unique code after max attempts
    """
    for _ in range(max_attempts):
        code = generate_room_code()
        exists = await redis.exists(f"room:{code}")
        if not exists:
            return code
    
    raise RuntimeError("Could not generate unique room code")

# Usage in FastAPI endpoint
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter()

@router.post("/rooms")
async def create_room(
    redis: Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user)
):
    try:
        room_code = await get_unique_room_code(redis)
    except RuntimeError:
        raise HTTPException(
            status_code=503, 
            detail="Unable to create room, please try again"
        )
    
    # Initialize room in Redis
    room_data = {
        "admin_id": current_user.id,
        "status": "waiting",
        "players": [],
        "created_at": datetime.utcnow().isoformat()
    }
    await redis.hset(f"room:{room_code}", mapping=room_data)
    await redis.expire(f"room:{room_code}", 86400)  # 24 hour TTL
    
    return {"room_code": room_code, "admin_id": current_user.id}
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Product Lead | Initial HLD |

---

*This document serves as the foundation for the Whist Score Keeper platform. All implementation details should be validated with the development team before proceeding.*
