/**
 * What the organizer controls call. Signed-in organizers use the /outings actions; organizers
 * without an account (partner bookings) use the invite page's, which know them by device.
 */
export type ActionResult = { error?: string };

export type OrganizerActions = {
  addTeeTime: () => Promise<ActionResult>;
  changeCapacity: (teeTimeId: string, delta: 1 | -1) => Promise<ActionResult>;
  deleteTeeTime: (teeTimeId: string) => Promise<ActionResult>;
  removePlayer: (slotId: string) => Promise<ActionResult>;
  setLocked: (locked: boolean) => Promise<ActionResult>;
  /** Redirects away on success. */
  deleteOuting: () => Promise<ActionResult>;
};
