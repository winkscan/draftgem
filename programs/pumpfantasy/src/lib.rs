pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu");

#[program]
pub mod pumpfantasy {
    use super::*;

    pub fn create_tournament(
        ctx: Context<CreateTournament>,
        id: u64,
        entry_fee_lamports: u64,
        start_ts: i64,
        end_ts: i64,
        entry_mode: EntryMode,
        guaranteed_amount_lamports: u64,
    ) -> Result<()> {
        instructions::create_tournament::handle_create_tournament(
            ctx,
            id,
            entry_fee_lamports,
            start_ts,
            end_ts,
            entry_mode,
            guaranteed_amount_lamports,
        )
    }

    pub fn add_asset(
        ctx: Context<AddAsset>,
        mint: Pubkey,
        fp_cost: u32,
        start_price_micros: u64,
    ) -> Result<()> {
        instructions::add_asset::handle_add_asset(ctx, mint, fp_cost, start_price_micros)
    }

    pub fn enter_tournament(ctx: Context<EnterTournament>, entry_index: u16) -> Result<()> {
        instructions::enter_tournament::handle_enter_tournament(ctx, entry_index)
    }

    pub fn submit_result(ctx: Context<SubmitResult>, end_price_micros: u64) -> Result<()> {
        instructions::submit_result::handle_submit_result(ctx, end_price_micros)
    }

    pub fn settle_entry(ctx: Context<SettleEntry>) -> Result<()> {
        instructions::settle_entry::handle_settle_entry(ctx)
    }

    pub fn finalize_tournament(
        ctx: Context<FinalizeTournament>,
        winners_count: u32,
        threshold_score_bps: i32,
    ) -> Result<()> {
        instructions::finalize_tournament::handle_finalize_tournament(
            ctx,
            winners_count,
            threshold_score_bps,
        )
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        instructions::claim_prize::handle_claim_prize(ctx)
    }
}
