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

    pub fn register_asset_price(
        ctx: Context<RegisterAssetPrice>,
        mint: Pubkey,
        start_price_micros: u64,
    ) -> Result<()> {
        instructions::register_asset_price::handle_register_asset_price(ctx, mint, start_price_micros)
    }

    pub fn enter_tournament<'info>(
        ctx: Context<'info, EnterTournament<'info>>,
        entry_index: u16,
        picks: [Pubkey; PICKS_PER_ENTRY],
        fp_costs: [u32; PICKS_PER_ENTRY],
        attestation_expiry: i64,
    ) -> Result<()> {
        instructions::enter_tournament::handle_enter_tournament(
            ctx,
            entry_index,
            picks,
            fp_costs,
            attestation_expiry,
        )
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
        fee_bps: u16,
    ) -> Result<()> {
        instructions::finalize_tournament::handle_finalize_tournament(
            ctx,
            winners_count,
            threshold_score_bps,
            fee_bps,
        )
    }

    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        instructions::claim_prize::handle_claim_prize(ctx)
    }

    pub fn cancel_tournament(ctx: Context<CancelTournament>) -> Result<()> {
        instructions::cancel_tournament::handle_cancel_tournament(ctx)
    }

    pub fn refund_entry(ctx: Context<RefundEntry>) -> Result<()> {
        instructions::refund_entry::handle_refund_entry(ctx)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, creator_lamports: u64) -> Result<()> {
        instructions::withdraw_fees::handle_withdraw_fees(ctx, creator_lamports)
    }

    pub fn close_entry(ctx: Context<CloseEntry>) -> Result<()> {
        instructions::close_entry::handle_close_entry(ctx)
    }

    pub fn close_asset_price(ctx: Context<CloseAssetPrice>) -> Result<()> {
        instructions::close_asset_price::handle_close_asset_price(ctx)
    }

    pub fn close_tournament(ctx: Context<CloseTournament>) -> Result<()> {
        instructions::close_tournament::handle_close_tournament(ctx)
    }
}
