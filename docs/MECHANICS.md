# Deterministic mechanics

The simulation runs at 60 ticks per second. A held cardinal input tries to move one grid cell every six ticks. Events are ordered by `(tick, sequence)`. A same-tick release is applied in that order; the last changed held direction wins, with Up, Right, Down, Left as the fallback order.

Pause is outside the step loop. The UI releases every locally held action when pause begins and accepts later keyup events, so a lost browser keyup cannot leave a stuck movement. A committed echo releases all inputs when its tape ends and holds its final cell until the room ends.

Doors test occupancy and timers before movement. A player already in a door cell is not ejected if a door closes. Timers are valid while `remaining > 0`; device evaluation happens before the one-tick decrement. Guard movement is deterministic: a patrol tries its next authored cell on cadence, waits when an echo occupies that target, and never searches for an alternate path. Guard/player contact, including a direct swap across cells, is a collision. Terminal order is collision, hazard, exit success, then budget failure.

Player keys reset on every attempt. Echoes can activate devices and block guards but cannot collect keys, carry key state, open the exit, or complete a room. Room 5's baton is therefore the player carrying the key while the echo carries plate duty.
