import { Browser, BrowserContext, Page } from '@playwright/test';
import { players, loadToken } from '../config/players';
import {
  LobbyPage, SeatingPage, BiddingPage, PlayingPage, ScoresPage, TrumpSuit,
} from '../pages';
import { firstPageWith } from '../helpers/wait';
import { BackendClient, ScoreTable } from './backend-client';

export interface RoundSpec {
  trump: TrumpSuit;
  trumpWinner: number;
  contracts: [number, number, number, number];
  tricks: [number, number, number, number];
}

export class GameDriver {
  contexts: BrowserContext[] = [];
  pages: Page[] = [];
  readonly backend = new BackendClient();

  constructor(private readonly browser: Browser) {}

  async setup(): Promise<void> {
    this.contexts = await Promise.all(
      players.map((p) => this.browser.newContext({ storageState: p.storageStatePath })),
    );
    this.pages = await Promise.all(this.contexts.map((c) => c.newPage()));
  }

  lobby(i: number): LobbyPage { return new LobbyPage(this.pages[i]); }
  seating(i: number): SeatingPage { return new SeatingPage(this.pages[i]); }
  bidding(i: number): BiddingPage { return new BiddingPage(this.pages[i]); }
  playing(i: number): PlayingPage { return new PlayingPage(this.pages[i]); }
  scores(i = 0): ScoresPage { return new ScoresPage(this.pages[i]); }

  async createGame(): Promise<{ roomCode: string; gameId: string }> {
    const roomCode = await this.lobby(0).createRoom();
    for (let i = 1; i < 4; i++) await this.lobby(i).joinRoom(roomCode);
    await this.lobby(0).waitForPlayers(4);
    await this.lobby(0).startGame();
    const seatingPage = new SeatingPage(this.pages[0]);
    await seatingPage.waitLoaded();
    const gameId = await seatingPage.getGameId();
    return { roomCode, gameId };
  }

  async confirmSeating(): Promise<void> {
    const seatingPage = new SeatingPage(this.pages[0]);
    await seatingPage.waitLoaded();
    await seatingPage.confirm();
    await firstPageWith(this.pages, 'bidding-pass'); // trump bidding has started
  }

  async playRound(spec: RoundSpec): Promise<void> {
    await this.runTrumpAuction(spec.trump, spec.trumpWinner);
    await this.runContractBidding(spec.contracts);
    await this.claimAllTricks(spec.tricks);
    await this.scores(0).continueSummary(); // dismiss round-summary modal → navigates to scores page
    await this.scores(0).waitLoaded();
  }

  private async runTrumpAuction(trump: TrumpSuit, winner: number): Promise<void> {
    // Designated winner bids minimum on their turn; everyone else passes.
    for (let guard = 0; guard < 12; guard++) {
      const active = await firstPageWith(this.pages, 'bidding-pass', 20_000).catch(() => -1);
      if (active === -1) break;
      if (active === winner && !(await this.trumpAlreadyWon())) {
        await this.bidding(active).placeTrumpBid(5, trump);
      } else {
        await this.bidding(active).pass();
      }
      if (await this.trumpAlreadyWon()) break;
    }
  }

  private async trumpAlreadyWon(): Promise<boolean> {
    // Contract phase reached when any page shows the contract confirm control.
    for (const p of this.pages) {
      if (await p.getByTestId('bidding-confirm').isVisible()) return true;
    }
    return false;
  }

  private async runContractBidding(contracts: [number, number, number, number]): Promise<void> {
    for (let guard = 0; guard < 8; guard++) {
      const active = await firstPageWith(this.pages, 'bidding-confirm', 20_000).catch(() => -1);
      if (active === -1) break;
      await this.bidding(active).setContract(contracts[active]);
      // Playing phase begins when claim-trick appears.
      let started = false;
      for (const p of this.pages) {
        if (await p.getByTestId('playing-claim-trick').isVisible()) { started = true; break; }
      }
      if (started) break;
    }
  }

  /**
   * Claim tricks for each player.
   * RECON: "Claim Trick" button is visible/enabled for ALL 4 players simultaneously.
   * ANY player can claim at any time — attribution is by who clicks.
   * So simply: for each seat, click their "Claim Trick" button N times (N = tricks[seat]).
   */
  private async claimAllTricks(tricks: [number, number, number, number]): Promise<void> {
    for (let seat = 0; seat < 4; seat++) {
      for (let t = 0; t < tricks[seat]; t++) {
        await this.playing(seat).claimTrick();
      }
    }
  }

  async nextRound(): Promise<void> {
    await this.scores(0).newRound();
    await firstPageWith(this.pages, 'bidding-pass', 20_000);
  }

  /**
   * Get the access token for the specified player from their on-disk token file
   * (written by globalSetup). Throws if the file does not exist.
   */
  async getToken(playerIdx = 0): Promise<string> {
    return loadToken(players[playerIdx]);
  }

  async backendScores(gameId: string, token?: string): Promise<ScoreTable> {
    const t = token ?? loadToken(players[0]);
    return this.backend.scoreTable(gameId, t);
  }

  async close(): Promise<void> {
    await Promise.all(this.contexts.map((c) => c.close()));
  }
}
