import { BasePage } from './base-page';
import { waitForTestId } from '../helpers/wait';

export class ScoresPage extends BasePage {
  async waitLoaded(): Promise<void> { await waitForTestId(this.page, 'scores-new-round'); }
  async roundScore(round: number, seat: number): Promise<number> {
    return this.numberText(`scores-cell-r${round}-p${seat}`);
  }
  async total(seat: number): Promise<number> { return this.numberText(`scores-total-p${seat}`); }
  async winnerSeat(): Promise<number | null> {
    if (!(await this.visible('scores-winner'))) return null;
    const attr = await this.tid('scores-winner').getAttribute('data-seat');
    return attr ? parseInt(attr, 10) : null;
  }
  async newRound(): Promise<void> { await this.clickTid('scores-new-round'); }
  async continueSummary(): Promise<void> { await this.clickTid('scores-continue'); }
}
