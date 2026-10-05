export interface RepeatSourcePlayer {
  playerId: string;
  displayName: string;
  skillLevel?: string;
  status?: string;
  participantType?: string;
  gender?: string;
  squadRating?: number;
}

export interface RepeatPlayerInput {
  playerId: string;
  displayName: string;
  skillLevel: string;
  gender?: string;
  squadRating?: number;
}

/** Select only reusable registered players and reset all session statistics. */
export function selectRepeatPlayers(
  sourcePlayers: readonly RepeatSourcePlayer[],
  selectedPlayerIds: readonly string[],
): RepeatPlayerInput[] {
  const selected = new Set(selectedPlayerIds);
  return sourcePlayers
    .filter((player) =>
      selected.has(player.playerId) &&
      player.participantType === "registered_user" &&
      player.status !== "removed" &&
      player.status !== "left",
    )
    .map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      skillLevel: player.skillLevel || "unknown",
      ...(player.gender ? { gender: player.gender } : {}),
      ...(player.squadRating === undefined ? {} : { squadRating: player.squadRating }),
    }));
}
