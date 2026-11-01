# Motorway / Control

A mobile motorway control simulation with no build dependencies. Start with `npm start`, test with `npm test`, and run `npm run build:preview` after edits to regenerate the self-contained `play.html`.

Tap an individual overhead sign to control that lane, or tap its side label for all three lanes. The compact control strip is attached to the road; tap elsewhere or press Escape to dismiss it. Limits apply downstream to the next gantry, with anticipatory braking before lower limits. Traffic keeps running while editing.

Police and ambulances arrive automatically with flashing blue lights, clear-road target speeds of 95 mph (police) and 90 mph (ambulance), and safe-gap priority overtaking. Drivers move left to yield when safe. Emergency vehicles still obey collision separation, obstacles and lane closures. Tap **Sound off** to enable synthesized sirens; mobile browsers require that explicit gesture. Audio mutes while paused or the tab is hidden.

Breakdowns always affect lane 1 and require recovery. A truck is automatically dispatched after 5–10 simulated seconds; no manual dispatch is needed. It travels along the hard shoulder, stops alongside the incident, loads for 18–30 simulated seconds (6–10 real seconds at 1×), then tows the vehicle away. Incidents do not disappear before recovery. Debris lasts 240–360 and collisions 420–540 simulated seconds. The operator must reopen any closed signals after clearance.

The 6 km network has five gantries. Each driver has independent following gaps, desired speed, acceleration and restart reaction time. HGVs are slower and cannot use lane 3. Lane changes predict moving gaps and reserve both occupied lanes before any vehicles advance, and separation constraints maintain a physical bumper gap around traffic and obstructions. The overview enlarges vehicle symbols and spaces crowded queues when first shown; established symbols then move forward only, while visible lane changes wait for a gap; it is schematic, not a scale drawing or a validated engineering model.

Simulation runs at three simulated seconds per real second at 1×. Flow counts exits over the rolling simulated minute. Queued demand is retained, and there is no fail state. Optional Google fonts fall back to local fonts.
