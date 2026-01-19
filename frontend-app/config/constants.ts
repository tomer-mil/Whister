/**
 * Application Constants
 * Central configuration for API endpoints, game rules, and system limits
 */

// ============================================================
// API Configuration
// ============================================================

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';

// ============================================================
// Game Rules & Constraints
// ============================================================

export const GAME_RULES = {
  // Player limits
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 4,

  // Round and trick configuration
  TOTAL_TRICKS: 13,
  MIN_TRICKS_BID: 0,
  MAX_TRICKS_BID: 13,

  // Contract sum constraints
  MIN_CONTRACT_SUM: 7,  // Under game minimum
  MAX_CONTRACT_SUM: 19, // Over game maximum
  TARGET_CONTRACT_SUM: 13,

  // Bid timing constraints
  MAX_TRUMP_BID_ATTEMPTS: 2,
  TRUMP_BID_TIMEOUT_MS: 30000,
  CONTRACT_BID_TIMEOUT_MS: 45000,

  // Game states
  GAME_STATUS: {
    WAITING: 'waiting',
    BIDDING_TRUMP: 'bidding_trump',
    FRISCH: 'frisch',
    BIDDING_CONTRACT: 'bidding_contract',
    PLAYING: 'playing',
    ROUND_COMPLETE: 'round_complete',
    FINISHED: 'finished',
  } as const,

  // Suit definitions
  SUITS: {
    CLUBS: 'clubs',
    DIAMONDS: 'diamonds',
    HEARTS: 'hearts',
    SPADES: 'spades',
    NO_TRUMP: 'no_trump',
  } as const,

  // Game types
  GAME_TYPES: {
    OVER: 'over',
    UNDER: 'under',
  } as const,

  // Scoring
  POINTS_PER_TRICK_MADE: 10,
  FRISCH_BONUS: 0,
  FAILED_CONTRACT_PENALTY: -10,
} as const;

// ============================================================
// UI Configuration
// ============================================================

export const UI_CONFIG = {
  // Toast notifications
  TOAST_DURATION_MS: 3000,
  TOAST_MAX_COUNT: 3,

  // Modal animations
  MODAL_ANIMATION_DURATION_MS: 200,

  // Loading states
  LOADING_DEBOUNCE_MS: 300,

  // Real-time sync
  RECONNECT_DELAY_MS: 3000,
  RECONNECT_MAX_ATTEMPTS: 5,

  // Optimistic updates
  OPTIMISTIC_UPDATE_TIMEOUT_MS: 10000,
} as const;

// ============================================================
// Feature Flags
// ============================================================

export const FEATURES = {
  ENABLE_ANALYTICS: true,
  ENABLE_OFFLINE_MODE: false,
  ENABLE_SOUND: true,
  ENABLE_HAPTICS: true,
  ENABLE_PWA: true,
  ENABLE_GROUP_MANAGEMENT: true,
} as const;

// ============================================================
// Socket.IO Events
// ============================================================

export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',

  // Room events
  ROOM_CREATED: 'room:created',
  ROOM_JOINED: 'room:joined',
  ROOM_PLAYER_JOINED: 'room:player_joined',
  ROOM_PLAYER_LEFT: 'room:player_left',
  ROOM_DISBANDED: 'room:disbanded',

  // Game events
  GAME_STARTED: 'game:started',
  GAME_STATE_UPDATED: 'game:state_updated',

  // Bidding phase
  TRUMP_BID_PLACED: 'bidding:trump_bid_placed',
  CONTRACT_BID_PLACED: 'bidding:contract_bid_placed',
  BIDDING_COMPLETE: 'bidding:complete',

  // Playing phase
  TRICK_CLAIMED: 'game:trick_claimed',
  TRICK_COMPLETED: 'game:trick_completed',
  ROUND_COMPLETE: 'game:round_complete',

  // Game completion
  GAME_FINISHED: 'game:finished',

  // Errors
  ERROR: 'error',
  VALIDATION_ERROR: 'error:validation',
} as const;

// ============================================================
// Validation Rules
// ============================================================

export const VALIDATION_RULES = {
  // Username
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  USERNAME_PATTERN: /^[a-zA-Z0-9_-]+$/,

  // Email
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Display name
  DISPLAY_NAME_MIN_LENGTH: 2,
  DISPLAY_NAME_MAX_LENGTH: 64,

  // Room code
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_PATTERN: /^[A-Z0-9]{6}$/,

  // Password
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
} as const;

// ============================================================
// Animation Timings
// ============================================================

export const ANIMATION_TIMINGS = {
  // Duration in milliseconds
  FAST: 150,
  NORMAL: 250,
  SLOW: 400,
  SPRING: { duration: 300, type: 'spring' },

  // Delays
  STAGGER: 100,
  MODAL_DELAY: 200,
} as const;

// ============================================================
// Responsive Breakpoints
// ============================================================

export const BREAKPOINTS = {
  XS: 320,
  SM: 375,
  MD: 428,
  LG: 768,
  XL: 1024,
  '2XL': 1280,
} as const;

// ============================================================
// Layout Dimensions
// ============================================================

export const LAYOUT = {
  // Header heights
  HEADER_HEIGHT_MOBILE: 56,
  HEADER_HEIGHT_DESKTOP: 64,

  // Action bar (mobile only)
  ACTION_BAR_HEIGHT: 72,

  // Sidebar
  SIDEBAR_WIDTH_DESKTOP: 256,

  // Score table
  SCORE_TABLE_CELL_WIDTH: 60,
  SCORE_TABLE_ROW_HEIGHT: 44,

  // Safe area insets (for notch/safe zone)
  SAFE_AREA_INSET_TOP: 'var(--safe-top)',
  SAFE_AREA_INSET_BOTTOM: 'var(--safe-bottom)',
} as const;

// ============================================================
// Network & Performance
// ============================================================

export const NETWORK = {
  // Request timeouts
  REQUEST_TIMEOUT_MS: 30000,
  SOCKET_TIMEOUT_MS: 60000,

  // Polling intervals
  HEALTH_CHECK_INTERVAL_MS: 30000,
  SYNC_INTERVAL_MS: 5000,

  // Batch operations
  BATCH_SIZE: 50,
  BATCH_TIMEOUT_MS: 1000,
} as const;

// ============================================================
// Error Messages
// ============================================================

export const ERROR_MESSAGES = {
  // Network
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT: 'Request timed out. Please try again.',
  CONNECTION_LOST: 'Connection lost. Attempting to reconnect...',

  // Auth
  AUTH_FAILED: 'Authentication failed.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  USER_NOT_FOUND: 'User not found.',
  EMAIL_IN_USE: 'Email is already in use.',
  USERNAME_IN_USE: 'Username is already taken.',

  // Room
  ROOM_NOT_FOUND: 'Room not found.',
  ROOM_FULL: 'Room is full.',
  INVALID_ROOM_CODE: 'Invalid room code.',

  // Game
  GAME_NOT_FOUND: 'Game not found.',
  INVALID_GAME_STATE: 'Invalid game state for this operation.',
  PLAYER_NOT_IN_GAME: 'You are not in this game.',

  // Bidding
  INVALID_BID: 'Invalid bid.',
  OUT_OF_TURN: 'It is not your turn to bid.',
  BID_EXCEEDS_MAXIMUM: 'Bid exceeds maximum allowed.',

  // Generic
  UNKNOWN_ERROR: 'An unknown error occurred.',
  VALIDATION_ERROR: 'Validation error.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
} as const;

// ============================================================
// Success Messages
// ============================================================

export const SUCCESS_MESSAGES = {
  ROOM_CREATED: 'Room created successfully.',
  ROOM_JOINED: 'Joined room successfully.',
  GAME_STARTED: 'Game started!',
  BID_PLACED: 'Bid placed successfully.',
  TRICK_CLAIMED: 'Trick claimed successfully.',
  ROUND_COMPLETE: 'Round complete!',
  GAME_FINISHED: 'Game finished!',
  PROFILE_UPDATED: 'Profile updated successfully.',
  PASSWORD_CHANGED: 'Password changed successfully.',
} as const;
