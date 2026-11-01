# Motorway / Control

A mobile browser motorway control simulation. No install or build dependencies.

Run `npm start` from this directory, then open port 3000 in your development environment. Run `npm test` for the traffic model checks.

Select a gantry to adjust individual lane speed limits, merge arrows and closures. Traffic travels north through a 3.6 km section; signals apply downstream until the next gantry. Use upstream warnings before closures. Scenarios change arrival demand, wet-weather headways or driver compliance. Incidents arrive automatically and can be cleared; there is no fail state.

The model uses individual vehicles with desired speeds, acceleration and braking, speed-dependent following gaps, safe-gap lane changes, HGVs and varying speed compliance. Flow measures exits in a rolling simulated minute (initial readings warm up). Simulation runs at three simulated seconds per real second at 1×. Queued entry demand is retained. This is an illustrative simulation, not a validated traffic engineering tool.

The application uses Canvas and native HTML controls, and requires a modern browser. Optional Google fonts fall back to local sans-serif fonts if unavailable.

Traffic keeps left and overtakes on the right. HGVs have separate cab/trailer symbols, lower desired speeds, slower acceleration and do not use lane 3. Drivers have individual following gaps and restart reaction times, allowing queue tails to build and discharge gradually. Automatic events begin after 35–65 simulated seconds, followed by random intervals. Breakdowns always occur in lane 1; collisions and debris may affect other lanes. Clear incidents from the traffic desk after managing the queue.
