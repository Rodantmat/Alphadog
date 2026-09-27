#!/usr/bin/env python3
"""
Chalkboard payout model, recovered from the owner's 2026-09-27 capture. NO credential, NO live call - this
is the pricing function derived from captured slips, which is the durable thing worth keeping. The board
itself CANNOT be scraped server-side: Firebase App Check / Apple App Attest guards /v2/* and is unforgeable
off-device (see PP_PAYOUT_FINDINGS.md section 0i for the full proof).

Captured evidence:
  - pre-validate returns per leg: odds (fair) and vigOdds (priced). Two legs measured:
      2.0025 -> 1.78  (11.1% hold)   1.9669 -> 1.75  (11.0% hold)
  - bet-slips?multiplier=3.12&probabilities[]=0.5084&probabilities[]=0.4994  -> {"2_picks":"3.12"}
      0.5084 = 1/1.967, 0.4994 = 1/2.002  (the probabilities ARE the vig'd odds inverted)
      1.78 * 1.75 = 3.115 ~= 3.12
  - a 3-pick slip -> {"3_picks": 2.26, "2_picks": 1.2}  (Shield/insured: pays on 3-of-3 AND 2-of-3)

Model:
  STRAIGHT (all-correct) multiplier = product of the per-leg vig'd odds.
  SHIELD (insured) pays a lower all-correct multiplier plus a consolation multiplier for one miss.
  Per-leg hold ~11% (vigOdds / fairOdds - 1, averaged over the two captured legs).

Use: a second market's explicit vig and payout function to compare PrizePicks' multipliers against when
the slip engine resumes. Not wired to any pipeline (no board to price).
"""
CHALKBOARD_HOLD = 0.11  # measured per-leg, both captured legs 11.0-11.1%


def straight_multiplier(vig_odds):
    """All-correct payout = product of the per-leg vig'd odds. Verified: [1.78,1.75] -> 3.12."""
    m = 1.0
    for o in vig_odds:
        m *= o
    return round(m, 2)


def fair_from_vig(vig_odds, hold=CHALKBOARD_HOLD):
    """Recover a leg's fair odds (hence fair probability) from its vig'd odds."""
    fair = vig_odds / (1 - hold)
    return fair, 1.0 / fair


if __name__ == "__main__":
    legs = [1.78, 1.75]
    print("straight 2-pick:", straight_multiplier(legs), "(captured 3.12)")
    for v in legs:
        f, p = fair_from_vig(v)
        print(f"  vig {v} -> fair {f:.3f}, fair prob {p:.3f}")
    print("shield 3-pick captured: {'3_picks': 2.26, '2_picks': 1.2}")
