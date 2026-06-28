import { Page, Locator } from '@playwright/test';

export type TrumpSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'notrump';

export class BasePage {
  constructor(protected readonly page: Page) {}
  protected tid(id: string): Locator { return this.page.getByTestId(id); }
  protected async visible(id: string): Promise<boolean> { return this.tid(id).isVisible(); }
  protected async clickTid(id: string): Promise<void> {
    // Locator.click auto-waits for visibility and enabled state while inheriting
    // the page default timeout (which slow-network tests may extend).
    await this.tid(id).click();
  }
  protected async numberText(id: string): Promise<number> {
    const t = (await this.tid(id).innerText()).replace(/[^0-9-]/g, '');
    return parseInt(t, 10);
  }
}
