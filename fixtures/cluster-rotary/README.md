# Synthetic cluster-rotary fixture

Synthetic layout and Scene States for Holding Site `position` (ADR-0016). Assumed generic geometry only: no real equipment, OEM geometry, kinematics or rotation model is claimed, and a site coordinate is drawing metadata, not observed transfer.

- `layout.json`: equipment layout from the `cluster-rotary-stations` Template. Each synthetic PM (`size` 120 × 120) lists `station-1` … `station-4` at local corners `(±30, ±30)`; the robot blade site has no `position` (unknown geometry).
- `scene-states.json`: two Scene States for before/after rendering. `W01` is observed at `pm-a` `station-1`, then `station-2`. The binding's `mappingHash` is a placeholder; there is no Mapping file for this fixture.
