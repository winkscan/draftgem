use anchor_lang::prelude::*;

#[error_code]
pub enum PumpFantasyError {
    #[msg("Only the tournament authority can perform this action")]
    Unauthorized,
    #[msg("Tournament entries are closed")]
    EntriesClosed,
    #[msg("Tournament has not started yet")]
    NotStarted,
    #[msg("Tournament has not ended yet")]
    NotEnded,
    #[msg("Picks must be 5 distinct assets")]
    DuplicatePick,
    #[msg("Portfolio exceeds the fantasy-point budget")]
    BudgetExceeded,
    #[msg("Supplied asset account does not belong to this tournament")]
    AssetMismatch,
    #[msg("Supplied asset does not match this entry's picks")]
    AssetNotInEntry,
    #[msg("Asset result has not been submitted yet")]
    AssetNotResolved,
    #[msg("Entry has already been settled")]
    AlreadySettled,
    #[msg("Entry has not been settled yet")]
    NotSettled,
    #[msg("Not every entry has been settled yet")]
    EntriesStillSettling,
    #[msg("Tournament has already been finalized")]
    AlreadyFinalized,
    #[msg("Tournament has not been finalized yet")]
    NotFinalized,
    #[msg("Prize has already been claimed")]
    AlreadyClaimed,
    #[msg("This entry's score did not qualify for a prize")]
    NotAWinner,
    #[msg("Winners count must be greater than zero")]
    InvalidWinnersCount,
    #[msg("This tournament only allows a single entry per wallet")]
    SingleEntryOnly,
    #[msg("Missing or invalid fp_cost attestation for this entry's picks")]
    MissingAttestation,
    #[msg("Attestation has expired — request a fresh one and retry")]
    AttestationExpired,
    #[msg("Asset prices can only be registered once the entry window has closed")]
    TooEarlyToRegisterPrice,
    #[msg("A tournament can only be cancelled a while after it ended")]
    TooEarlyToCancel,
    #[msg("Every entry is already settled - finalize instead of cancelling")]
    NothingToCancel,
    #[msg("Tournament has not been cancelled")]
    NotCancelled,
}
