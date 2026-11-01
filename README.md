# Motorway / Control

A mobile motorway control simulation with no build dependencies. Start with `npm start`, test with `npm test`, and run `npm run build:preview` after edits to regenerate the self-contained `play.html`.

Tap an individual overhead sign to control that lane, or tap its side label for all three lanes. The compact control strip is attached to the road; tap elsewhere or press Escape to dismiss it. Limits apply downstream to the next gantry, with anticipatory braking before lower limits. Traffic keeps running while editing.

Police and ambulances arrive automatically with flashing blue lights, clear-road target speeds of 110 mph (police) and 100 mph (ambulance), and safe-gap priority overtaking. Drivers move left to yield when safe. Emergency vehicles still obey collision separation, obstacles and lane closures. Tap **Sound off** to enable synthesized sirens; mobile browsers require that explicit gesture. Audio mutes while paused or the tab is hidden.

Breakdowns always affect lane 1 and require recovery. A truck is automatically dispatched after 5–10 simulated seconds; no manual dispatch is needed. It travels along the hard shoulder, stops alongside the incident, loads for 18–30 simulated seconds (6–10 real seconds at 1×), then tows the vehicle away. Incidents do not disappear before recovery. Debris lasts 240–360 and collisions 420–540 simulated seconds. The operator must reopen any closed signals after clearance.

The 6 km network has five gantries. Each driver has independent following gaps, desired speed, acceleration and restart reaction time. HGVs are slower and cannot use lane 3. Lane changes predict moving gaps and reserve both occupied lanes before any vehicles advance, and separation constraints maintain a physical bumper gap around traffic and obstructions. The full 6 km and five gantries are shown together in a larger single-road view by default, with no road slider. A compact mobile dashboard keeps the network in a larger, wider network view with modest page scrolling. Fixed-size vehicle symbols never resize or overlap. In dense traffic the overview prioritizes incidents, emergency vehicles and HGVs; every vehicle is drawn, including in dense queues. Overview vehicle lengths use a single uniform road scale; they never change to fit a gap. Detail uses larger fixed symbols. Every vehicle remains active in the model. Optional Detail shows the selected gantry at 400 m scale, and Show all restores the network; it is schematic, not a scale drawing or a validated engineering model.

Simulation runs at three simulated seconds per real second at 1×. Flow counts exits over the rolling simulated minute. Queued demand is retained, and there is no fail state. Optional Google fonts fall back to local fonts.

Arrow and closure compliance uses shorter safe gaps with cooperative yielding from adjacent traffic. Drivers begin merging upstream of restrictions, and HGVs may use lane 3 temporarily when required to avoid a closed lane.

Incidents are distributed across shuffled motorway sections, at least 350 m from a gantry and 600 m from other active incidents. Incidents use outlined markers and labelled leader lines drawn above gantry graphics. Numbered queue bands have been removed.

Normal traffic, emergency vehicles and recovery trucks enter at the upstream boundary. The map projects entry and exit just beyond the canvas so symbols flow into and out of view naturally. Entry safety includes both lanes occupied during a merge. Automatic breakdowns and collisions convert settled, existing vehicles rather than spawning new vehicles mid-road.

Random shed loads and multi-vehicle pile-ups block two adjacent lanes. Scene bodies are independent physical obstacles; existing vehicles are converted for pile-ups, and shed loads are placed only in clear gaps. All scene lanes clear together after 5–7 or 8–10 simulated minutes respectively. Middle-lane signs now offer explicit left and right arrows. Emergency vehicles accelerate faster, request yielding from 600 m away, and can pass on either side when safe. The footer displays a live responder speed, distinct from the network mean. These are game parameters, not emergency-driving guidance.

Closure evacuation plans a route to an open lane, taking one adjacent lane at a time. Vehicles can reposition laterally while stopped at a closure and traverse an intermediate restricted lane to reach the available lane. They begin responding 650 m upstream, retain collision separation and do not proceed when every lane is closed.
