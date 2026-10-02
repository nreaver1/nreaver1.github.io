/**
 * Booking-platform adapters (SPEC §8). Stubs: real access needs partner agreements. Once a
 * platform signs on, its adapter imports reservations so organizers don't retype tee times.
 */
export type ExternalReservation = {
  externalRef: string;
  courseExternalId: string;
  playDate: string; // YYYY-MM-DD
  teeTimes: { startsAt: string; players: number }[];
};

export interface BookingPlatform {
  readonly name: string;
  getReservation(externalRef: string): Promise<ExternalReservation | null>;
}

class NotConnected implements BookingPlatform {
  constructor(readonly name: string) {}
  async getReservation(): Promise<ExternalReservation | null> {
    throw new Error(`${this.name} integration is not connected yet (needs a partner agreement).`);
  }
}

export class GolfNowAdapter extends NotConnected {
  constructor() {
    super('GolfNow');
  }
}

export class ChronogolfAdapter extends NotConnected {
  constructor() {
    super('Chronogolf');
  }
}
