import { BasePage } from './base-page';
import { waitForPathname, waitForTestId } from '../helpers/wait';

const ROOM_RE = '^.*/room/(?!create$|join$)[A-Za-z0-9]+$';

export class LobbyPage extends BasePage {
  async createRoom(): Promise<string> {
    await this.page.goto('/room/create');
    await this.page.getByRole('button', { name: /create/i }).click();
    await waitForPathname(this.page, ROOM_RE);
    return this.page.url().split('/room/')[1];
  }
  async joinRoom(code: string): Promise<void> {
    await this.page.goto('/room/join');
    await this.page.getByPlaceholder('Room Code').fill(code);
    await this.page.getByPlaceholder('Your Name').fill('Player');
    await this.page.getByRole('button', { name: /join/i }).click();
    await waitForPathname(this.page, ROOM_RE);
  }
  async waitForPlayers(_n: number): Promise<void> {
    await waitForTestId(this.page, 'lobby-start-game');
  }
  async startGame(): Promise<void> {
    await this.clickTid('lobby-start-game');
  }
}
