# Ship deck and monthly voyage preparation

The overhead deck shows the current crew. Contributions are read from recorded activities, resource logs, saved island combat totals, and canonical upgrade purchases. Coins use the existing Supplies resource; they are not a new spendable balance. Contribution Moves are quest Moves granted by recorded activities, without reconstructing historical streak bonuses. Step totals are the member's personal recorded totals because older Health logs do not contain a crew association.

The viewing captain's timezone determines the displayed calendar month. Lifetime quests, Supplies, damage, and upgrades are scoped to this crew. Older island records preserve lifetime damage but do not date individual hits, so monthly damage includes timestamped attacks recorded since the deck feature began and the UI receives a note when older undated damage exists.

Two upgrades have levels 0–3 and cost 10, 20, then 30 shared Supplies. Windcatcher sails add 10% sailing wind efficiency per level, applied to the crew's average earned Moves for ship motion. Navigator's helm lowers the next voyage's preparation target by 10% per level, from 120 recorded quest Moves to 108, 96, or 84. Sail efficiency also multiplies those preparation Moves. These bonuses never create spendable island Moves or alter activity rewards.

The map shows actual guardian health lost and the crew's revealed land count. The next calendar month's original island is a preview. Its bar measures preparation from this month's recorded crew quest Moves; it is not a claim of distance physically sailed. The existing guardian conquest and night-resolution arrival rules remain in force.

Upgrade level, shared Supplies debit, and canonical purchase contribution are saved in one conditional Mongo document update. The caller supplies the expected level, so a duplicate tap cannot buy the next level accidentally. Canonical purchase records are projected idempotently into the append-only Log, avoiding a second debit if a log projection must be retried.
