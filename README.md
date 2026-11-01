# Motorway / Control

A mobile motorway control simulation with no build dependencies. Start with `npm start`, test with `npm test`, and run `npm run build:preview` after edits to regenerate the self-contained `play.html`.

Tap an individual overhead sign to control that lane, or tap its side label for all three lanes. The compact control strip is attached to the road; tap elsewhere or press Escape to dismiss it. Limits apply downstream to the next gantry, with anticipatory braking before lower limits. Traffic keeps running while editing.

Police and ambulances arrive automatically with flashing blue lights, clear-road target speeds of 110 mph (police) and 100 mph (ambulance), and safe-gap priority overtaking. Drivers move left to yield when safe. Emergency vehicles still obey collision separation, obstacles and lane closures. Tap **Sound off** to enable synthesized sirens; mobile browsers require that explicit gesture. Audio mutes while paused or the tab is hidden.

Breakdowns always affect lane 1 and require recovery. A truck is automatically dispatched after 5–10 simulated seconds; no manual dispatch is needed. It travels along the hard shoulder, stops alongside the incident, loads for 18–30 simulated seconds (6–10 real seconds at 1×), then tows the vehicle away. Incidents do not disappear before recovery. Debris lasts 240–360 and collisions 420–540 simulated seconds. The operator must reopen any closed signals after clearance.

The 10 km network has seven gantries. Each driver has independent following gaps, desired speed, acceleration and restart reaction time. HGVs are slower and cannot use lane 3. Lane changes predict moving gaps and reserve both occupied lanes before any vehicles advance, and separation constraints maintain a physical bumper gap around traffic and obstructions. The full 10 km and seven gantries are shown together in a larger single-road view by default, with no road slider. A compact mobile dashboard keeps the network in a larger, wider network view with modest page scrolling. Fixed-size vehicle symbols never resize or overlap. Every vehicle is drawn, including in dense queues. Overview vehicle lengths use a single uniform road scale; they never change to fit a gap. Detail uses larger fixed symbols. Every vehicle remains active in the model. Optional Detail shows the selected gantry at 400 m scale, and Show all restores the network; it is schematic, not a scale drawing or a validated engineering model.

Simulation runs at three simulated seconds per real second at 1×. Flow counts exits over the rolling simulated minute. Queued demand is retained, and there is no fail state. Optional Google fonts fall back to local fonts.

Arrow and closure compliance uses shorter safe gaps with cooperative yielding from adjacent traffic. Drivers begin merging upstream of restrictions, and HGVs may use lane 3 temporarily when required to avoid a closed lane.

Incidents are distributed across shuffled motorway sections, at least 350 m from a gantry and 600 m from other active incidents. Incidents use outlined markers and labelled leader lines drawn above gantry graphics. Numbered queue bands have been removed.

Normal traffic, emergency vehicles and recovery trucks enter at the upstream boundary. The map projects entry and exit just beyond the canvas so symbols flow into and out of view naturally. Entry safety includes both lanes occupied during a merge. Automatic breakdowns and collisions convert settled, existing vehicles rather than spawning new vehicles mid-road.

Random shed loads and multi-vehicle pile-ups block two adjacent lanes. Scene bodies are independent physical obstacles; existing vehicles are converted for pile-ups, and shed loads are placed only in clear gaps. All scene lanes clear together after 5–7 or 8–10 simulated minutes respectively. Middle-lane signs now offer explicit left and right arrows. Emergency vehicles accelerate faster, request yielding from 600 m away, and can pass on either side when safe. The footer displays a live responder speed, distinct from the network mean. These are game parameters, not emergency-driving guidance.

Closure evacuation plans a route to an open lane, taking one adjacent lane at a time. Vehicles can reposition laterally while stopped at a closure and traverse an intermediate restricted lane to reach the available lane. They begin responding 650 m upstream, retain collision separation and do not proceed when every lane is closed.

Drivers commit to a chosen evacuation lane until they reach it, and avoid returning toward an incident until they have passed it. Routine overtaking and return-left use separated thresholds and a longer cooldown to prevent weaving. An open lane slows for a nearby driver only when that driver has requested a merge into it and needs a rear gap; incidents in other lanes have no rubbernecking speed penalty.

The motorway follows a narrower, gently curving ribbon. Road markings, gantry touch targets, vehicles and incident markers share one world-to-screen projection; vehicle headings follow the bends. Initial vehicles retain the same spacing distribution and arrival rates, so extending the road increases vehicle count without changing density per kilometre.

The scenario menu has been replaced by live traffic advice. The desk locates the largest slow queue or an active incident, suggests a suitable upstream gantry, and offers an optional tap to apply stepped limits (40/50 or 50/60 mph) to open lanes only. These limits act through the normal following and merge model; there is no artificial throughput bonus. Stopped vehicles and hard-braking episodes (deceleration below 2.5 m/s²) show the effect alongside measured exit flow. Low limits can reduce throughput on clear roads.

Detail now arms a location picker: tap a gantry or road point to choose the close-up, then navigate upstream/downstream or return with Show all. It no longer silently picks the last-used/default gantry.

Courtesy yielding is assigned only to the nearest suitable rear neighbour of a waiting merger. Cars already alongside continue, and no gap request is made when the target lane has no space ahead. A transitioning vehicle stops reserving its original lane when its body has cleared the lane boundary, rather than waiting until the whole animation has settled.

## Network operations and optional shift goals

Three slip roads join at J1 (1.2 km), J2 (5.9 km) and J3 (9.0 km). Each defaults to Open, with only an emergency Closed setting. Vehicles follow a physical 700 m approach and gradual 120 m join into lane 1, yielding to mainline traffic. The same vehicle symbols are used throughout; no timed traffic-light metering. Roadwork cones form a 250 m diagonal taper across the closed lanes, followed by the work-area boundary. The whole taper is checked clear before deployment.

Demand automatically cycles through normal traffic, morning rush, easing traffic and stadium departures. Both upstream arrivals and junction demand change; the current phase is visible above the map.

Roadworks are announced in advance. Use the suggested protection button or set the lane closures manually. Crews only enter after the protected zone is empty. Removing protection withdraws the workers and pauses the work timer; cones remain. Completed works clear automatically, but operators reopen their own signals. Later work plans can close two lanes.

A scheduled police rolling hold uses three moving police vehicles at about 20 mph to create an empty gap for a debris team. The convoy waits upstream until clearance completes, then releases and accelerates away. Ordinary vehicle collision rules still apply.

**Optional shift goals** track serving 100 vehicles, getting an ambulance through, clearing a queue of at least five stopped vehicles, and completing protected roadworks. Goals never fail or stop the simulation; completed badges remain earned. There is no game-over state.

The controls remain usable without opening the collapsible panels: tap signs for lane control and J1–J3 for slip-road closures. The model's systemsEnabled switch isolates scheduled operations in focused traffic tests; dedicated systems tests cover combined operation safety.
