import { BasePage } from './base-page';

export class PlayingPage extends BasePage {
  async canClaim(): Promise<boolean> {
    return (await this.visible('playing-claim-trick'))
      && (await this.tid('playing-claim-trick').isEnabled());
  }
  async claimTrick(): Promise<void> { await this.clickTid('playing-claim-trick'); }
  async trickCount(seat: number): Promise<number> {
    return this.numberText(`playing-trick-count-${seat}`);
  }
}
