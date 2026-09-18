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
      "name": "addAsset",
      "discriminator": [
        81,
        53,
        134,
        142,
        243,
        73,
        42,
        179
      ],
      "accounts": [
        {
          "name": "authority",
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
          "name": "asset",
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
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "fpCost",
          "type": "u32"
        },
        {
          "name": "startPriceMicros",
          "type": "u64"
        }
      ]
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
    }
  ],
  "accounts": [
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
    },
    {
      "name": "tournamentAsset",
      "discriminator": [
        52,
        102,
        230,
        140,
        17,
        232,
        148,
        75
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
    }
  ],
  "types": [
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
            "name": "picks",
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
            "name": "bump",
            "type": "u8"
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
              "Backend/admin key allowed to add assets and submit price results.",
              "This is the trust boundary: there is no free, reliable on-chain",
              "price feed for freshly-launched Solana coins, so final prices are",
              "attested by our own backend the same way SwapKings attests",
              "pump.fun founder wallets — the score math itself still happens",
              "on-chain and can't be faked once a price is submitted."
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
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tournamentAsset",
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
            "name": "fpCost",
            "docs": [
              "Fantasy-point cost, derived off-chain from the coin's age (younger =",
              "pricier, since it can swing much harder — see design notes)."
            ],
            "type": "u32"
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
          }
        ]
      }
    }
  ],
  "constants": [
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
