# Global Multi-Court Grouping Design

## Goal

Improve multi-court generation so the first court does not greedily take the best relationship group and leave later courts with weak leftovers.

## Approved Behavior

- Apply the improvement when two or more courts are generated in the same fill.
- Leave single-court refills unchanged.
- Keep sit-out selection unchanged.
- Keep the existing team-split penalty model unchanged.
- Keep the algorithm deterministic.
- Avoid a large optimizer. For ordinary two- and three-court fills, evaluate the whole grouping. For larger fills, fall back to the existing greedy path.

## Architecture

After sit-outs are selected, choose the set of foursomes globally for the courts being filled. The engine will enumerate deterministic partitions of the playing pool into groups of four, score each partition by total `foursomePenalty`, and pick the lowest-total partition.

The selected foursomes are then assigned to the rotated court list in stable order and split into teams with the existing `bestTeamSplit` function. This preserves the current partner/opponent/skill weights while making the court set better as a whole.

## Constraints

- Use the global partitioner only when `courtsToUse.length > 1` and `playing.length <= 12`.
- Preserve the existing greedy picker as the fallback for single-court and larger fills.
- Do not add new dependencies.
- Keep `packages/match-engine` pure.

## Testing

Add a regression test where the old greedy choice can produce one clean court and one bad leftover court, but global selection finds a lower total penalty across both courts.
