import { Page, Locator, expect } from '@playwright/test';

export type TrumpSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'notrump';

export class BasePage {
  constructor(protected readonly page: Page) {}
  protected tid(id: string): Locator { return this.page.getByTestId(id); }
  protected async visible(id: string): Promise<boolean> { return this.tid(id).isVisible(); }
  protected async clickTid(id: string): Promise<void> {
    await expect(this.tid(id)).toBeEnabled({ timeout: 15_000 });
    await this.tid(id).click();
  }
  protected async numberText(id: string): Promise<number> {
    const t = (await this.tid(id).innerText()).replace(/[^0-9-]/g, '');
    return parseInt(t, 10);
  }
}
