/**
 * Bidding Validation Rules
 * Client-side bid validation for Trump and Contract bidding
 */

/**
 * Validates a Trump bid
 * @param bid - The bid amount (5-13)
 * @param currentHighest - The current highest bid
 * @param minBid - Minimum allowed bid for this round
 * @returns true if the bid is valid
 */
export function isValidTrumpBid(
  bid: number,
  currentHighest: number,
  minBid: number
): boolean {
  // Bid must be within valid range
  if (bid < 5 || bid > 13) {
    return false;
  }

  // Bid must meet minimum requirement
  if (bid < minBid) {
    return false;
  }

  // Bid must be higher than current highest
  if (bid <= currentHighest) {
    return false;
  }

  return true;
}

/**
 * Validates a Contract bid
 * @param amount - The contract bid amount (0-13)
 * @param currentSum - Current sum of all contract bids in the round
 * @param isLastBidder - Whether this is the last bidder
 * @param targetSum - Target sum for all contracts (usually 13)
 * @returns true if the bid is valid
 */
export function isValidContractBid(
  amount: number,
  currentSum: number,
  isLastBidder: boolean,
  targetSum: number = 13
): boolean {
  // Amount must be within valid range
  if (amount < 0 || amount > 13) {
    return false;
  }

  const newSum = currentSum + amount;

  // Last bidder cannot bid an amount that makes the sum equal to target
  if (isLastBidder && newSum === targetSum) {
    return false;
  }

  // Sum cannot exceed target for non-last bidders
  if (!isLastBidder && newSum > targetSum) {
    return false;
  }

  return true;
}

/**
 * Gets a human-readable error message for an invalid bid
 */
export function getBidErrorMessage(
  bid: number,
  currentHighest: number,
  minBid: number
): string {
  if (bid < 5 || bid > 13) {
    return 'Bid must be between 5 and 13';
  }

  if (bid < minBid) {
    return `Bid must be at least ${minBid}`;
  }

  if (bid <= currentHighest) {
    return `Bid must be higher than ${currentHighest}`;
  }

  return 'Invalid bid';
}

/**
 * Gets a human-readable error message for an invalid contract bid
 */
export function getContractBidErrorMessage(
  amount: number,
  currentSum: number,
  isLastBidder: boolean,
  targetSum: number = 13
): string {
  if (amount < 0 || amount > 13) {
    return 'Contract bid must be between 0 and 13';
  }

  const newSum = currentSum + amount;

  if (isLastBidder && newSum === targetSum) {
    return `Cannot bid ${amount} - contracts would sum to ${targetSum}`;
  }

  if (!isLastBidder && newSum > targetSum) {
    return `Cannot bid ${amount} - contracts would exceed ${targetSum}`;
  }

  return 'Invalid contract bid';
}
