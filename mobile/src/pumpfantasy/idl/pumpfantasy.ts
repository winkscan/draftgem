/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pumpfantasy.json`.
 */
export type Pumpfantasy = {
  "address": "4sLvdTFMxJbewJS7gNF6KeqDdkRd12syav8veM4AuYRu",
  "metadata": {
    "name": "pumpfantasy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelTournament",
      "discriminator": [
        249,
        227,
        133,
        5,
        9,
        142,
        29,
        122
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimPrize",
      "discriminator": [
        157,
        233,
        139,
        121,
        246,
        62,
        234,
        235
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Permissionless caller — anyone can trigger the payout, but the",
            "destination is locked to `entry.player` below, so it can only ever",
            "pay the actual winner."
          ],
          "signer": true
        },
        {
          "name": "tournament",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true
        },
        {
          "name": "player",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeAssetPrice",
      "discriminator": [
        118,
        156,
        47,
        26,
        189,
        189,
        198,
        129
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Permissionless: anyone can tidy up, the rent can only go to whoever paid it."
          ],
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeEntry",
      "discriminator": [
        132,
        26,
        202,
        145,
        190,
        37,
        114,
        67
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Permissionless: anyone can tidy up, the rent can only go to the player."
          ],
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true
        },
        {
          "name": "player",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeTournament",
      "discriminator": [
        14,
        80,
        54,
        9,
        221,
        239,
        201,
        35
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Signs, and gets back the rent it paid to create the tournament (plus whatever",
            "dust is left in the vault)."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createTournament",
      "discriminator": [
        158,
        137,
        233,
        231,
        73,
        132,
        191,
        68
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "PDA-owned SOL vault holding entry fees. Never given a withdraw",
            "instruction of its own — the only way lamports leave it is via",
            "`claim_prize`, signed by the program using these same seeds."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u64"
        },
        {
          "name": "entryFeeLamports",
          "type": "u64"
        },
        {
          "name": "startTs",
          "type": "i64"
        },
        {
          "name": "endTs",
          "type": "i64"
        },
        {
          "name": "entryMode",
          "type": {
            "defined": {
              "name": "entryMode"
            }
          }
        },
        {
          "name": "guaranteedAmountLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "enterTournament",
      "discriminator": [
        19,
        21,
        109,
        109,
        227,
        108,
        232,
        25
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "entryIndex"
              }
            ]
          }
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "ed25519_program attestation instruction — pinned to the real",
            "Instructions sysvar address, never any other account."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "entryIndex",
          "type": "u16"
        },
        {
          "name": "picks",
          "type": {
            "array": [
              "pubkey",
              5
            ]
          }
        },
        {
          "name": "fpCosts",
          "type": {
            "array": [
              "u32",
              5
            ]
          }
        },
        {
          "name": "attestationExpiry",
          "type": "i64"
        }
      ]
    },
    {
      "name": "finalizeTournament",
      "discriminator": [
        205,
        30,
        149,
        11,
        108,
        122,
        120,
        11
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "winnersCount",
          "type": "u32"
        },
        {
          "name": "thresholdScoreBps",
          "type": "i32"
        },
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "finishPrizes",
      "discriminator": [
        39,
        242,
        54,
        9,
        187,
        64,
        153,
        93
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "refundEntry",
      "discriminator": [
        214,
        5,
        136,
        23,
        253,
        7,
        230,
        81
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Permissionless, like `claim_prize`: anyone can trigger the refund, but",
            "the destination is locked to `entry.player` below."
          ],
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true
        },
        {
          "name": "player",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "registerAssetPrice",
      "discriminator": [
        43,
        245,
        161,
        178,
        99,
        48,
        249,
        125
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "Created (and its rent paid) by the first player to pick this coin, inside",
            "`enter_tournament`; here the authority only records the start price on it."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              },
              {
                "kind": "arg",
                "path": "mint"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "startPriceMicros",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPrize",
      "discriminator": [
        35,
        194,
        101,
        36,
        7,
        240,
        153,
        200
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "prizeLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleEntry",
      "discriminator": [
        22,
        208,
        102,
        127,
        180,
        201,
        120,
        68
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Permissionless crank — anyone can settle any entry once every pick",
            "has a submitted result. Payout math is locked to `entry.player`",
            "elsewhere, so there's nothing to gain by settling someone else's."
          ],
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "submitResult",
      "discriminator": [
        240,
        42,
        89,
        180,
        10,
        239,
        9,
        214
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "endPriceMicros",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawFees",
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Signs, and receives the platform's share."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "tournament"
          ]
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114,
                  110,
                  97,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament.id",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "creator",
          "docs": [
            "Receives the creator's share (the tournament's creator; may be the same",
            "account as `authority` when `creator_lamports` is 0)."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "creatorLamports",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "assetPrice",
      "discriminator": [
        197,
        106,
        216,
        207,
        155,
        172,
        40,
        245
      ]
    },
    {
      "name": "entry",
      "discriminator": [
        63,
        18,
        152,
        113,
        215,
        246,
        221,
        250
      ]
    },
    {
      "name": "tournament",
      "discriminator": [
        175,
        139,
        119,
        242,
        115,
        194,
        57,
        92
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the tournament authority can perform this action"
    },
    {
      "code": 6001,
      "name": "entriesClosed",
      "msg": "Tournament entries are closed"
    },
    {
      "code": 6002,
      "name": "notStarted",
      "msg": "Tournament has not started yet"
    },
    {
      "code": 6003,
      "name": "notEnded",
      "msg": "Tournament has not ended yet"
    },
    {
      "code": 6004,
      "name": "duplicatePick",
      "msg": "Picks must be 5 distinct assets"
    },
    {
      "code": 6005,
      "name": "budgetExceeded",
      "msg": "Portfolio exceeds the fantasy-point budget"
    },
    {
      "code": 6006,
      "name": "assetMismatch",
      "msg": "Supplied asset account does not belong to this tournament"
    },
    {
      "code": 6007,
      "name": "assetNotInEntry",
      "msg": "Supplied asset does not match this entry's picks"
    },
    {
      "code": 6008,
      "name": "assetNotResolved",
      "msg": "Asset result has not been submitted yet"
    },
    {
      "code": 6009,
      "name": "alreadySettled",
      "msg": "Entry has already been settled"
    },
    {
      "code": 6010,
      "name": "notSettled",
      "msg": "Entry has not been settled yet"
    },
    {
      "code": 6011,
      "name": "entriesStillSettling",
      "msg": "Not every entry has been settled yet"
    },
    {
      "code": 6012,
      "name": "alreadyFinalized",
      "msg": "Tournament has already been finalized"
    },
    {
      "code": 6013,
      "name": "notFinalized",
      "msg": "Tournament has not been finalized yet"
    },
    {
      "code": 6014,
      "name": "alreadyClaimed",
      "msg": "Prize has already been claimed"
    },
    {
      "code": 6015,
      "name": "notAWinner",
      "msg": "This entry's score did not qualify for a prize"
    },
    {
      "code": 6016,
      "name": "invalidWinnersCount",
      "msg": "Winners count must be greater than zero"
    },
    {
      "code": 6017,
      "name": "singleEntryOnly",
      "msg": "This tournament only allows a single entry per wallet"
    },
    {
      "code": 6018,
      "name": "missingAttestation",
      "msg": "Missing or invalid fp_cost attestation for this entry's picks"
    },
    {
      "code": 6019,
      "name": "attestationExpired",
      "msg": "Attestation has expired — request a fresh one and retry"
    },
    {
      "code": 6020,
      "name": "tooEarlyToRegisterPrice",
      "msg": "Asset prices can only be registered once the entry window has closed"
    },
    {
      "code": 6021,
      "name": "tooEarlyToCancel",
      "msg": "A tournament can only be cancelled a while after it ended"
    },
    {
      "code": 6022,
      "name": "nothingToCancel",
      "msg": "Every entry is already settled - finalize instead of cancelling"
    },
    {
      "code": 6023,
      "name": "notCancelled",
      "msg": "Tournament has not been cancelled"
    },
    {
      "code": 6024,
      "name": "invalidFee",
      "msg": "Fee must be the platform rake, or the rake plus the creator cut"
    },
    {
      "code": 6025,
      "name": "nothingToWithdraw",
      "msg": "There are no fees to withdraw (yet, or any more)"
    },
    {
      "code": 6026,
      "name": "creatorShareTooLarge",
      "msg": "The creator share is larger than this tournament's creator cut"
    },
    {
      "code": 6027,
      "name": "assetAlreadyRegistered",
      "msg": "This asset already has its start price"
    },
    {
      "code": 6028,
      "name": "notClosable",
      "msg": "Accounts can only be closed once the tournament is finalized or cancelled"
    },
    {
      "code": 6029,
      "name": "entryNotClosable",
      "msg": "This entry cannot be closed yet (unclaimed prize or not settled)"
    },
    {
      "code": 6030,
      "name": "tournamentNotClosable",
      "msg": "Entries or asset accounts are still open, or funds are still in the vault"
    },
    {
      "code": 6031,
      "name": "prizesNotFinalized",
      "msg": "The prize plan isn't finished yet — finish_prizes hasn't been called"
    },
    {
      "code": 6032,
      "name": "prizesAlreadyFinalized",
      "msg": "The prize plan is already locked in — set_prize can no longer change it"
    },
    {
      "code": 6033,
      "name": "prizeBudgetExceeded",
      "msg": "This would assign more than the tournament's distributable pool"
    }
  ],
  "types": [
    {
      "name": "assetPrice",
      "docs": [
        "One shared start/end price per (tournament, mint) — deliberately NOT",
        "per-entry. Every player who picked this mint, whenever during the entry",
        "window they actually clicked \"enter\", scores from the exact same",
        "reference price, captured once at (or after) `start_ts`. Registered",
        "lazily by `register_asset_price`, not pre-created for every candidate a",
        "player might browse — see that instruction's comment for why."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tournament",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "startPriceMicros",
            "type": "u64"
          },
          {
            "name": "endPriceMicros",
            "type": "u64"
          },
          {
            "name": "resolved",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "payer",
            "docs": [
              "Who paid this account's rent — the first player to pick the coin (created inside",
              "`enter_tournament`). `close_asset_price` gives it back to them after the tournament."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "entry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tournament",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "entryIndex",
            "docs": [
              "Which of this player's entries in this tournament this is — 0 for",
              "every Single-mode entry (there's only ever one), 0..N for Multiple",
              "mode. Part of this account's own PDA seeds, also stored here so",
              "clients can display/sort a player's entries without re-deriving it."
            ],
            "type": "u16"
          },
          {
            "name": "picks",
            "docs": [
              "Raw mint addresses the player picked — NOT references to a",
              "pre-registered on-chain asset account (there isn't one at pick",
              "time; see `enter_tournament`'s Ed25519-attestation comment for why",
              "that's no longer needed)."
            ],
            "type": {
              "array": [
                "pubkey",
                5
              ]
            }
          },
          {
            "name": "fpSpent",
            "type": "u32"
          },
          {
            "name": "scoreBps",
            "type": "i32"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix timestamp this entry was created — the tiebreaker when two",
              "entries land on the exact same score_bps: the earlier `created_at`",
              "ranks higher, since drafting first (with less information about",
              "what everyone else is doing) is the harder feat. Purely a ranking",
              "input; doesn't affect anyone's score itself."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "prizeLamports",
            "docs": [
              "What this entry is owed, set by `set_prize` once the tournament is finalized and the",
              "off-chain ranking/tie-grouping is done — 0 if it didn't place. `claim_prize` pays out",
              "exactly this (no more on-chain arithmetic): a flat equal share for a 50%/PvP structure,",
              "a tiered amount for Top 1/Top 3/30%. See settlement.ts's `computePrizes`."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "entryMode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "single"
          },
          {
            "name": "multiple"
          }
        ]
      }
    },
    {
      "name": "tournament",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Backend/admin key allowed to register post-start asset prices and",
              "finalize the tournament. This is the trust boundary: there is no",
              "free, reliable on-chain price feed for freshly-launched Solana",
              "coins, so prices are attested by our own backend the same way",
              "SwapKings attests pump.fun founder wallets — the score math itself",
              "still happens on-chain and can't be faked once a price is submitted."
            ],
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "entryFeeLamports",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "assetCount",
            "docs": [
              "Number of distinct picked mints that have had a start price",
              "registered via `register_asset_price` — set lazily, after",
              "`start_ts`, only for mints someone actually picked (see that",
              "instruction's own comment), not a pre-registered catalog."
            ],
            "type": "u16"
          },
          {
            "name": "entryCount",
            "type": "u32"
          },
          {
            "name": "settledCount",
            "type": "u32"
          },
          {
            "name": "prizePoolLamports",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "tournamentStatus"
              }
            }
          },
          {
            "name": "winnersCount",
            "docs": [
              "Set by `finalize_tournament`."
            ],
            "type": "u32"
          },
          {
            "name": "thresholdScoreBps",
            "type": "i32"
          },
          {
            "name": "distributedPoolLamports",
            "type": "u64"
          },
          {
            "name": "entryMode",
            "docs": [
              "Single: one entry per wallet, enforced on-chain (see",
              "`enter_tournament`'s explicit check — PDA uniqueness alone only",
              "blocks a *second* entry at the same index, not a first entry at a",
              "non-zero index). Multiple: a wallet may hold any number of entries,",
              "each its own portfolio, competing independently (including against",
              "its own other entries)."
            ],
            "type": {
              "defined": {
                "name": "entryMode"
              }
            }
          },
          {
            "name": "guaranteedAmountLamports",
            "docs": [
              "0 = not a guaranteed-prize tournament. Nonzero = the house has",
              "committed to a payout pool of at least this many lamports regardless",
              "of how many entries actually land — just the flag/amount for now,",
              "display-only (the \"G\" badge); the actual house top-up instruction",
              "(fund the vault up to this floor before finalize) isn't built yet."
            ],
            "type": "u64"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "prizesAssignedLamports",
            "docs": [
              "Running total of every `set_prize` call so far — never allowed to exceed",
              "`distributed_pool_lamports` (see `set_prize`'s own comment)."
            ],
            "type": "u64"
          },
          {
            "name": "prizesFinalized",
            "docs": [
              "Set once by `finish_prizes`, after every winning entry has its `prize_lamports`",
              "locked in. `claim_prize` and `close_entry` both require this — it is the line",
              "between \"the authority is still writing the prize plan\" and \"money can move\"."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "tournamentStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "finalized"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "creatorFeeBps",
      "docs": [
        "Extra cut, ON TOP of RAKE_BPS, that goes to the player who created the tournament",
        "(tournaments made from the app's \"+\" screen). Winners then share 90% of the pool."
      ],
      "type": "u16",
      "value": "500"
    },
    {
      "name": "maxBudgetFp",
      "docs": [
        "Total fantasy-point budget a player can spend across their 5 picks.",
        "Matches the \"4,000 FP available\" budget shown in the reference UI."
      ],
      "type": "u32",
      "value": "4000"
    },
    {
      "name": "priceScale",
      "docs": [
        "Fixed-point scale used for on-chain prices (price * 1e6)."
      ],
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "rakeBps",
      "docs": [
        "Platform rake taken out of the prize pool before it's split among winners."
      ],
      "type": "u16",
      "value": "500"
    },
    {
      "name": "scoreFloorBps",
      "docs": [
        "A single pick can never drag the entry's score below -100%, even if the",
        "coin goes to zero — nobody is wiped out worse than fully on one slot."
      ],
      "type": "i64",
      "value": "-10000"
    }
  ]
};
