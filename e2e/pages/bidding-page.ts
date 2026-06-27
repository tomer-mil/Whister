import { expect } from '@playwright/test';
import { BasePage, TrumpSuit } from './base-page';

export class BiddingPage extends BasePage {
  async isMyTurnTrump(): Promise<boolean> { return this.visible('bidding-pass'); }
  async isMyTurnContract(): Promise<boolean> { return this.visible('bidding-confirm'); }
  async placeTrumpBid(amount: number, suit: TrumpSuit): Promise<void> {
    await this.setCounter(amount);
    await this.clickTid(`bidding-suit-${suit}`);
    await this.clickTid('bidding-bid');
    await expect(this.tid('bidding-pass')).toBeHidden({ timeout: 15_000 });
  }
  async pass(): Promise<void> {
    await this.clickTid('bidding-pass');
    await expect(this.tid('bidding-pass')).toBeHidden({ timeout: 15_000 });
  }
  async setContract(n: number): Promise<void> {
    await this.setCounter(n);
    await this.clickTid('bidding-confirm');
    await expect(this.tid('bidding-confirm')).toBeHidden({ timeout: 15_000 });
  }
  async runningSum(): Promise<number> { return this.numberText('bidding-running-sum'); }
  async frischActive(): Promise<boolean> { return this.visible('frisch-indicator'); }

  private async setCounter(target: number): Promise<void> {
    // Counter starts at its minimum; press + until value === target.
    for (let i = 0; i < 20; i++) {
      const cur = await this.numberText('bidding-counter-value');
      if (cur === target) return;
      await this.clickTid(cur < target ? 'bidding-counter-plus' : 'bidding-counter-minus');
    }
    throw new Error(`Could not set counter to ${target}`);
  }
}
