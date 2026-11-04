# Motorway / Control

A mobile motorway control simulation with no build dependencies. Start with `npm start`, test with `npm test`, and run `npm run build:preview` after edits to regenerate the self-contained `play.html`.

Tap an individual overhead sign to control that lane, or tap its side label for all three lanes. The compact control strip is attached to the road; tap elsewhere or press Escape to dismiss it. Limits apply downstream to the next gantry, with anticipatory braking before lower limits. Traffic keeps running while editing.

Police and ambulances arrive automatically with flashing blue lights, clear-road target speeds of 110 mph (police) and 100 mph (ambulance), and safe-gap priority overtaking. Drivers move left to yield when safe. Emergency vehicles still obey collision separation, obstacles and lane closures.

Breakdowns always affect lane 1 and require recovery. A truck is automatically dispatched after 5–10 simulated seconds; no manual dispatch is needed. It travels along the hard shoulder, stops alongside the incident, loads for 18–30 simulated seconds (6–10 real seconds at 1×), then tows the vehicle away. Incidents do not disappear before recovery. Debris lasts 240–360 and collisions 420–540 simulated seconds. The operator must reopen any closed signals after clearance.

The 20 km network has fourteen gantries. Each driver has independent following gaps, desired speed, acceleration and restart reaction time. HGVs are slower and normally avoid lane 3; they may use it temporarily when a local closure or obstruction reduces the usable lanes. Lane changes follow an eased steering curve over about 4.5 simulated seconds for cars and 5.5 for HGVs, turning into the manoeuvre and straightening at completion. A manoeuvre finishes before another can start. They predict moving gaps and reserve both occupied lanes before any vehicles advance, and separation constraints maintain a physical bumper gap around traffic and obstructions. The full 20 km and fourteen gantries are shown together in a larger single-road view by default, with no road slider. A compact mobile dashboard keeps the network in a larger, wider network view with modest page scrolling. Vehicle bodies remain physically separated in the traffic model. The full 20 km overview uses brighter, wider vehicle marks whose length follows one fixed road scale; Detail uses larger car, HGV, ambulance, police and recovery icons. Every vehicle is drawn, including in dense queues; icons never shrink to fit a gap. Every icon stays on its actual lane centre or steering path. Road shape, gantries, slip roads, incident locations, tap targets and map height are fixed independently of traffic. Vehicle symbols never resize to fit gaps or move sideways for queue spacing. Only an explicit camera action or viewport resize changes the map. Detail uses the normal close-up camera. Every vehicle remains active in the model. Optional Detail shows the selected gantry at 400 m scale, and Show all restores the network; it is schematic, not a scale drawing or a validated engineering model.

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

Three slip roads join at J1 (1.2 km), J2 (5.9 km) and J3 (9.0 km). Each defaults to Open, with only an emergency Closed setting. Vehicles follow a physical 1,100 m approach into a 600 m acceleration lane. This has its own traffic corridor: drivers match speed and can choose a safe moving gap along the lane, rather than wait at its entrance or reserve motorway lane 1 while still alongside it. The last 200 m form the pavement taper. Their speed is retained when joining; a clear gap does not force a stop. A motorway lane closure or merge arrow does not close the slip road: drivers finish the lane 1 joining taper, then follow the motorway controls towards an open lane. Physical traffic gaps and obstructions still take priority, and the slip road’s own Closed control holds arrivals. Arrivals also wait when every onward motorway lane is closed. The slip-road pavement is one lane wide, with curved edges that join the motorway tangentially and an opening in the main carriageway edge at the merge. Vehicles follow the same curve. Both slip roads use long, gradual tapers, remain aligned with the motorway, and share its world projection. Outer ends fade into the local network rather than turning across the map. The same vehicle artwork is used throughout; no timed traffic-light metering. Roadwork cones form a 250 m diagonal taper across the closed lanes, followed by the work-area boundary. The whole taper is checked clear before deployment.

Demand automatically cycles through normal traffic, morning rush, easing traffic and stadium departures. Both upstream arrivals and junction demand change; the current phase is visible above the map.

Roadworks are announced in advance. Use the suggested protection button or set the lane closures manually. Crews only enter after the protected zone is empty. Removing protection withdraws the workers and pauses the work timer; cones remain. Completed works clear automatically, but operators reopen their own signals. Later work plans can close two lanes.

A scheduled police rolling hold uses three moving police vehicles at about 20 mph to create an empty gap for a debris team. The convoy waits upstream until clearance completes, then releases and accelerates away. Ordinary vehicle collision rules still apply.

**Optional shift goals** track serving 100 vehicles, getting an ambulance through, clearing a queue of at least five stopped vehicles, and completing protected roadworks. Goals never fail or stop the simulation; completed badges remain earned. There is no game-over state.

The controls remain usable without opening the collapsible panels: tap signs for lane control and J1–J3 for slip-road closures. The model's systemsEnabled switch isolates scheduled operations in focused traffic tests; dedicated systems tests cover combined operation safety.


## Smooth mobile rendering

Frozen lane indexes avoid repeated whole-network leader searches while preserving the traffic model's following and merge decisions. Incident bodies are cached only during an immutable simulation phase, and the collision correction still enforces physical bumper gaps. Cached vehicle artwork and fixed road scenery reduce canvas work, the backing canvas is capped at 2× pixel density, and dashboard text updates five times per second. Fixed 0.1 s physics steps have a per-frame work budget: under heavy load the simulation clock may advance more slowly rather than block the controls with catch-up work.

A seeded congested-traffic benchmark reduced model step times from about 2.23 to 0.55 ms at 300 vehicles and 6.80 to 1.26 ms at 600 vehicles on the development machine. These are comparison measurements, not an iPhone frame-rate guarantee. Regression checks compare indexed leader queries with direct scans; the optimized model also matched the previous model's exact seeded vehicle, incident and exit states.


Roadworks announcements above the network include their kilometre point, gantry section and affected lanes, including while awaiting protection or paused. The notice reserves space so changing text does not move the map.

Merge arrows are advisory within their own downstream section. Drivers continue in the current open lane until an arrow applies, then move when a safe usable gap exists. A future arrow does not send them into a currently closed lane, and arrows pointing at closed lanes or at each other do not cause repeated lane changes. Red Xs and physical obstructions still trigger advance evacuation; staged transitions remain committed through the section boundary.


At reduced speed limits, drivers consider following pressure and usable space in the next lane as well as speed difference. They overtake on the right only through safe gaps, avoid returning into a crowded left lane, and keep left when space allows. Heavier demand therefore uses all three lanes while keeping ordinary HGVs out of lane 3 on a clear, unrestricted motorway.

Slip-road arrivals estimate acceleration and braking time and keep aiming for the same reachable moving gap. Where useful, one motorway driver can move right safely or make a small temporary speed adjustment to help create room; a driver moving aside stays clear until passing the junction. Existing priority and physical gap checks still apply. Joining headway opens progressively from the short merge gap to the driver's normal following distance, preventing sudden braking immediately after admission.


Congested junction entries take turns through checked moving gaps: one rear driver can ease off gently to help a joining vehicle, then let a mainline vehicle pass. There is no virtual junction stop line on an open motorway. Faster traffic retains moving-gap priority. This remains active when motorway lane 1 is closed but the junction is open. Physical gap, all-lane closure and incident checks still apply. Smooth exit branches leave upstream of each incoming feeder; a subset of settled lane 1 traffic follows them and is counted on exit. The motorway geometry and overview remain fixed while traffic evolves. Continuous advance speed-limit braking removes the former 400 m target discontinuity; natural congestion can still form at closures and heavy demand.

The top boundary is a free exit. Generated incidents stay at or below 19.5 km, keeping the final 500 m and clipped upper edge clear. Traffic is removed and counted when it leaves the 20 km network; there is no downstream queue or artificial exit stop line. Player-set limits and visible queues still apply.

Queue release follows the moving leader after a short driver reaction, rather than waiting for an eight-metre gap. Speed-limit-only gantries do not stop or meter vehicles; actual closures, incidents and physical following gaps still constrain flow.


## Acceleration, exits and cooperative merging

Each exit precedes its entry. Exiting drivers first move into a separate deceleration lane and then reduce speed for the ramp; their braking does not create a phantom leader in the motorway lane. Acceleration and deceleration lanes have dashed boundaries, hatched gores and directional markings. Gantry ALL buttons sit on the right so they cannot cover the slip roads on the left. The compact J1 exit begins at the displayed entry boundary and ends at 340 m, before its on ramp. The original gantry and junction joining positions are retained within the extended motorway.

At a closure or incident, courtesy requests are coordinated per merge location. One waiting driver receives help from the nearest suitable rear neighbour; after that merge, the motorway driver gets a turn. Cars already alongside continue normally. Requests no longer ask a whole adjacent stream to yield or ratchet a driver's target down every simulation step. An incident alone has no adjacent-lane speed penalty. Real lane loss, occupied gaps and stopped traffic can still reduce capacity: cars never overlap or teleport to force a merge.

An exiting vehicle releases motorway lane 1 once its body is laterally clear, before its full departure curve is complete. Closed-lane queues and motorway red-X stop lines therefore cannot hold a vehicle already committed to the clear exit lane. The exit retains its own following gaps and deceleration target.

A committed junction merge uses a 4.5-second steering manoeuvre (5.5 seconds for HGVs), independent of longitudinal progress. Once its body clears the acceleration lane, that lane is released; once steering finishes, normal motorway lane choice resumes even if the car has slowed before the junction endpoint. This prevents a joined vehicle from remaining stuck in junction mode behind a queue.

All six junctions keep one mainline helper assigned until a real gap is secured and the merge is committed, including when an arrival has stopped near the end of its acceleration lane. Faster cars already alongside pass normally; a suitably placed rear driver can move aside or make a comfortable speed adjustment to create the gap. At creeping speeds, checked merge gaps use the physical bumper minimum rather than high-speed joining headways. Arrow-controlled lanes remain usable when their arrows lead onward into an open lane without sending a driver back to its source lane. Contradictory arrows and red Xs still apply.

When a driver is actively waiting to follow a merge arrow or avoid a closure, it matches the posted speed and nearby flow of the target lane before reaching the red X. This uses comfortable approach braking rather than retaining a faster source-lane speed until the queue head. After a checked cooperative lane change, the merging driver initially keeps the accepted short front gap, then restores its individual following headway over 300 m. Base driver headways and physical bumper separation are unchanged. This removes the stop-and-restart penalty at staged closures; a genuine two-lane closure still reduces the road to one lane.

Closure merges also retain the same suitable gap-making driver until the merge is committed. The helper can slow to a genuine creep for a stopped merger; it no longer changes from one passing driver to another or remains just above the low-speed safe-gap threshold. Drivers already alongside continue through the merge location.

Off ramps register a vehicle crossing the start of their deceleration lane even when a simulation step carries it beyond the former 5 m trigger. Each junction has its own cohort of one quarter of eligible settled lane-1 traffic, so vehicles which pass one exit can use a later one. J1 has a compact visible exit from 0–340 m, before its existing acceleration lane; the motorway length, gantries and junction join positions stay fixed while traffic evolves. Exits remain physically separate once the vehicle has cleared lane 1 and are counted once per junction.

An ordinary driver does not move right solely because an overtaking vehicle has returned ahead at a short gap. Passing requires a slower leader relative to the driver's target speed which is not pulling away; a faster vehicle pulling away is followed normally. Mandatory closure merges, emergency yielding and junction courtesy still take priority.

The extended network has 14 gantries and six junctions across 20 km. The original gantries G01–G07 and junctions J1–J3 retain their distances, with G08–G14 and J4–J6 added downstream. The road curve repeats smoothly after 10 km. Roadworks cycle through 4.2, 7.2, 14.2 and 17.2 km; random incidents cover both halves while the final 500 m remains clear. The taller overview keeps the previous road scale and touch spacing; Detail remains a 400 m view with upstream/downstream navigation.
