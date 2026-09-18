import { TournamentListScreen } from "../components/TournamentListScreen";

// Leaderboard + portfolio-compare inside a live tournament is the next
// increment — this list is the entry point into it (tap a card). For now
// tapping opens Draft, which already shows your own entry/score in
// read-only mode once you're in; the full standings view comes next.
export function LiveScreen() {
  return <TournamentListScreen phase="live" emptyText="No tournament in progress right now." />;
}
