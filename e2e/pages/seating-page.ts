import { BasePage } from './base-page';
import { waitForPathname, waitForTestId } from '../helpers/wait';

export class SeatingPage extends BasePage {
  async waitLoaded(): Promise<void> {
    await waitForPathname(this.page, '/game/[^/]+/seating');
    await waitForTestId(this.page, 'seating-confirm');
  }
  async confirm(): Promise<void> { await this.clickTid('seating-confirm'); }
  async getGameId(): Promise<string> {
    const m = this.page.url().match(/\/game\/([^/]+)\//);
    if (!m) throw new Error(`No gameId in URL: ${this.page.url()}`);
    return m[1];
  }
}
