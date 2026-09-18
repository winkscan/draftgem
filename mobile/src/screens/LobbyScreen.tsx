import { TournamentListScreen } from "../components/TournamentListScreen";

export function LobbyScreen() {
  return (
    <TournamentListScreen
      phase="upcoming"
      emptyText="No open tournaments right now — check back soon, a new one is created regularly."
    />
  );
}
