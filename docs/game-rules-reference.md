# Israeli Whist: Rules Reference

> Quick reference for implementation. Add to Claude Project for context.

## Overview
- 4 players, standard 52-card deck (no jokers)
- Each player receives 13 cards
- Dealer rotates clockwise each round

## Card Rankings
- **By number (high→low):** A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2
- **By suit (high→low):** NT (No Trump) > ♠ > ♥ > ♦ > ♣

---

## Game Flow

### Phase 1: Trump Bidding
1. Player left of dealer bids first
2. Options: **Bid** (number + suit) or **Pass**
3. Minimum bid: 5 (increases after Frisch)
4. To outbid: higher number OR same number + higher suit
5. Bidding ends when: 3 consecutive passes after a bid
6. Winner of bid sets the trump suit

### Phase 2: Frisch (if all 4 pass)
- Each player passes 3 cards to player on their left
- Cards placed face-down; pick up only after passing yours
- Minimum bid increases: 5 → 6 → 7 → 8
- Maximum 3 Frisch rounds; if still no bid, reshuffle and redeal

### Phase 3: Contract Bidding
1. **Trump winner bids first** (must bid ≥ their trump bid amount)
2. Continue clockwise; each player bids 0-13
3. **Last bidder rule:** Cannot bid a number that makes sum = 13
4. Determines "over" (sum > 13) or "under" (sum < 13) game

### Phase 4: Play
1. Trump winner leads first trick
2. Players must follow suit if possible
3. If can't follow suit: may play any card (including trump to "cut")
4. Trick winner: highest trump, or highest of led suit if no trump
5. Trick winner leads next trick
6. Continue until all 13 tricks played

---

## Scoring

| Outcome | Points |
|---------|--------|
| **Made contract (bid ≥ 1)** | bid² + 10 |
| **Failed contract (bid ≥ 1)** | -10 × \|tricks - bid\| |
| **Made zero (under game)** | +50 |
| **Made zero (over game)** | +25 |
| **Failed zero (won 1 trick)** | -50 |
| **Failed zero (won 2+ tricks)** | -50 + 10×(tricks - 1) |

### Examples
- Bid 3, won 3 → 3² + 10 = **+19**
- Bid 5, won 3 → -10 × 2 = **-20**
- Bid 0, won 0 (under) → **+50**
- Bid 0, won 0 (over) → **+25**
- Bid 0, won 1 → **-50**
- Bid 0, won 3 → -50 + 10×2 = **-30**

---

## Key Implementation Rules

### Trump Bid Validation
```python
def is_valid_trump_bid(new_bid, current_highest, minimum_bid):
    if new_bid.amount < minimum_bid:
        return False
    if current_highest is None:
        return True
    if new_bid.amount > current_highest.amount:
        return True
    if new_bid.amount == current_highest.amount:
        return SUIT_ORDER[new_bid.suit] > SUIT_ORDER[current_highest.suit]
    return False

SUIT_ORDER = {"clubs": 0, "diamonds": 1, "hearts": 2, "spades": 3, "no_trump": 4}
```

### Contract Bid Validation
```python
def is_valid_contract_bid(bid_amount, current_sum, is_last_bidder):
    if not 0 <= bid_amount <= 13:
        return False
    if is_last_bidder and (current_sum + bid_amount == 13):
        return False  # Cannot make sum equal 13
    return True
```

### Over/Under Determination
```python
def get_game_type(contracts: list[int]) -> str:
    total = sum(contracts)
    # Note: total can never equal 13 due to last bidder rule
    return "over" if total > 13 else "under"
```

---

## State Machine Summary

```
WAITING → TRUMP_BIDDING → [FRISCH]* → CONTRACT_BIDDING → PLAYING → ROUND_COMPLETE
                ↑______________|
                (if all pass, max 3 times)
```

## Edge Cases to Handle
1. All 4 players pass 3 times → reshuffle, restart round
2. Player disconnects mid-game → grace period for reconnect
3. Undo trick (admin only) → decrement trick count
4. Player tries to bid making sum = 13 → reject bid
5. Trump winner must bid ≥ their trump bid amount in contract phase
