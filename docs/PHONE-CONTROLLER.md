# Phone controller — steer a tank with your phone

Lane `item/phone-controller-266`. The owner's words (2026-10-30): "build a connection/ui/smthg where u can steer tanks
with ur phone like a steering wheel with a button of buttons for scope driving ammo etc if you connect sessions with a
code or smthg through some way. explore and build!"

## Value case and pass rule (stated before building)

The phone becomes a second input device for the desktop game: held landscape like a wheel, tilt steers, the thumbs work
the throttle, the aim pad and the buttons. It earns its place if it feels like a controller, not a remote desktop.

Pass rule:

1. Steering latency (phone sensor or touch event to the tank's input in a rendered desktop frame): p95 under 60 ms on a
   LAN, under 120 ms on cellular.
2. A full battle is drivable from the phone alone: drive, aim, scope, switch ammunition, fire.
3. Zero network requests while no phone is paired, and no new boot request on the game, Gallery or /cn pages.

## Hard rules it keeps

- The phone is an input device only. Its events enter the game's input-action layer (`src/game/input.ts`) through the
  same virtual-control methods the touch HUD uses (`setVirtualMove`, `addVirtualAim`, `pressVirtual`/`releaseVirtual`/
  `tapVirtual`). The sim, authority, prediction and snapshots are untouched. In a multiplayer battle the phone drives the
  local seat through the normal client input path, because that path samples the same layer.
- A solo or bots game never becomes a multiplayer session. Pairing is its own small channel (`/pad/*` on the rooms
  Worker, its own Durable Object class `PadPair`), separate from match rooms: no rooms, seats, MP strip or reports.
  `src/pad` imports nothing from `src/mp`.
- Free tiers only. No email or personal data in any request; the pairing code travels in the URL fragment on the phone
  (never sent to a server by the browser), tokens are random and stored hashed.
- The receiver loads lazily, only when the player presses Connect phone. The phone page is its own small entry, `/pad`.

## Architecture

```
 phone  /pad  ──ws──►  cot-rooms Worker  /pad/join/<CODE>  ─►  PadPair DO (one per code)  ◄─ws──  desktop game
   │                   (rate limit, origin)                      pairing, signaling, ICE grant         (Settings ›
   │                                                             relay fallback (capped)                Controls ›
   └──────────── WebRTC data channels (direct, or TURN) ──────────────────────────────────────────►    Connect phone)
                 axes: unreliable+unordered, 60 Hz     ctl: reliable+ordered (buttons, status, pings)
```

- `src/pad/padProtocol.ts`: codes, routes, envelopes, limits and the binary axes frame, shared by every side.
- `src/pad/padActor.ts`: the pairing actor, runtime-neutral (the `RoomActor` pattern): the Durable Object
  (`cloudflare/rooms/src/padPair.ts`) and the LAN helper (`server/rooms/localPadService.ts`, mounted by
  `server/rooms/serve.ts`) host the same code, so receipts run it in Node.
- `src/pad/padLink.ts`: the transport both pages use: the signaling socket, the RTC peer, the relay fallback.
- `src/pad/padInput.ts`: the steering model (phone) and the frame-to-action mapping (desktop), pure.
- `src/pad/padReceiver.ts` + `src/pad/padConnectCard.ts`: the desktop side, one lazy chunk behind `src/pad/padAccess.ts`.
- `site/pad.html` + `src/pad/padPage.ts` + `src/pad/pad.css`: the phone page.
- `src/pad/qr.ts`: a small QR encoder (byte mode, level M), drawn as SVG.

## Pairing

1. The desktop opens `wss://<rooms>/pad/new`. The Worker draws a code and hands the socket to `PadPair` for that code; a
   code already in use answers 409 and the Worker draws again (three tries).
2. Codes are 6 characters from a 31-symbol alphabet without look-alikes (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, ~30 bits),
   shown as `K7Q 4MZ`. A code lives 120 s; the desktop shows its countdown and draws a fresh one on request.
3. The desktop shows the code, a QR of `https://cot.kevinliu.studio/pad#K7Q4MZ` and the short address. The phone page
   speaks the phone's own language (its stored choice, else the device's). The phone's camera app opens the link (no camera permission on the page), or the player types the code.
4. The phone opens `/pad/join/<CODE>`. A waiting, unexpired, unused code pairs; anything else (unknown, expired, used,
   a second phone) is the same refusal, `pad_unknown`, so a guess learns nothing. Single use: the code joins once.
5. Both sides receive a resume token (128 random bits, stored as a SHA-256 hash). A phone that locks its screen or
   changes network reconnects with `/pad/resume/<CODE>` and its token in the first message; the old phone socket is
   replaced (one phone per player seat). The desktop can resume the same way after a blip.
6. Either side's Disconnect ends the pairing for both; the desktop leaving for more than 60 s ends it; a pairing lives
   at most 6 hours.

Limits: the Worker rate-limits every `/pad` upgrade per client IP (`PAD_CONNECT_LIMITER`, 30 a minute, separate from the
rooms limiter); signals ≤ 8 KB and ≤ 60 a minute per side; ICE grants ≤ 3 per side per 10 minutes; at most 2 live
sockets plus 1 pending per pair.

## Transport: measured, then picked

| | WebRTC data channel | WebSocket relay through `PadPair` |
|---|---|---|
| Path | phone ↔ desktop directly (LAN, or STUN hole-punch), TURN when configured | phone → edge → DO → edge → desktop |
| Cost on Workers Free | signaling only: ~10-20 handled messages per pairing | every incoming message is billed (20:1): 60 Hz is ~10,800 requests an hour per phone, a tenth of the 100k daily pool |
| Loss behaviour | `axes` unreliable+unordered: a late frame is skipped, never queued | TCP head-of-line: one lost packet delays every frame behind it |
| Latency | see Measured | see Measured |

Decision: WebRTC carries the input. The relay exists for two jobs only: it carries input from the moment of pairing until
the data channel opens (so the tank answers at once), and it is the last resort when ICE fails (both sides behind
symmetric NATs with no TURN). In relay mode the phone sends at most 15 frames a second, changed frames only, and each
pairing has a budget of 12,000 incoming relay frames (≈ 600 billed requests, ≈ 13 minutes of continuous driving); past
it the phone says the relay is spent and asks for the same Wi-Fi. TURN, when the rooms Worker holds the relay secrets,
comes from the same issuer as the matches (`server/relayCredentials.ts`); Cloudflare TURN shares the Realtime free
allowance (1,000 GB a month), and a controller uses well under 50 MB an hour.

## Wire

- `axes` (phone → desktop, unreliable, unordered, 24 bytes, every frame while anything moves, 10 Hz idle heartbeat):
  type, flags, seq, the phone's clock, steer and throttle (int16), the aim pad's running totals (int32, 1/8 px; totals
  rather than deltas so a lost frame loses no aim), held-button bits.
- `ctl` (both ways, reliable, ordered, JSON): button press/release/tap by action id, pause, ping/pong for the clock and
  RTT, and the desktop's status (in battle, ammunition slot, counts and types, reload, consumables, sniper, paused).
- The desktop applies only the newest `axes` seq, takes aim as the difference of totals, and releases every held control
  and zeroes the stick when no frame arrives for 400 ms (a phone that sleeps never leaves the tank driving).

## Controls: a tank's control panel in the hand

Underneath its features the controller is the tank's own control panel, held in two hands like a yoke (owner
2026-10-30: "make it look more realistic"). Its material is the `surface-pad` tokens (`src/ui/tokens/tokens.json`):
brushed gunmetal, rubber grips, turned bezels over glass, amber and red lamps. Every control moves by transform alone
and shows a press at once, with no transition.

- The ammunition selector: three illuminated keys, the loaded shell's lamp lit, its rounds on a counter drum that rolls
  one on when a round is spent.
- Consumables: guarded switches. A press lifts the red cover on its hinge and throws the switch under it.
- Throttle: a rubber T-handle in a gate over a scale, neutral at the notch, spring-loaded back to it. With no tilt (a
  refusal, no sensor, tilt off) the gate becomes a cross and the handle a stick that steers too. The brake is a rubber
  pad under it.
- The repeater: the tank on the field (its plan view, `/icons/<spec>_top.webp`) under glass, its hull turning as the
  phone turns, so the dial is the steering's readout, and the gun's bearing as a pointer on the rim. A tap re-centres the
  wheel. Beside it, the speedometer: a needle over a 240° sweep to the tank's top speed, and the km/h on a counter.
- The gun: the gunner's sight under the right thumb, a dark optic with a stadia reticle that leans toward the drag. The
  fire button sits in a turned collar; the ring around it fills as the gun loads (two half rings turned by transform),
  and the button lights red when the gun is ready. Scope is a latching key that lights while the sight is engaged, zoom
  a rocker beside it while scoped, Look a held key.
- Steering: tilt like a wheel. The phone's up vector from `deviceorientation` (β, γ) is taken in the locked frame (below),
  and the wheel angle is its angle in the screen plane, so how far the phone leans back does not matter. A 3° dead zone,
  a 1.6 power curve, full lock at 35° (25 to 60 in options). Level is the centre.
- Options (a native modal, two columns so it fits the short side whole): tilt on or off, the fire hand (a left-handed
  mirror), steering lock and aim speed.
- Screen Wake Lock keeps the phone awake. Each press ticks a haptic: `navigator.vibrate` where it exists, and on iOS 18
  Safari a hidden switch control toggled under the thumb (unverified on hardware: the simulator has no haptics).

Every button goes through input actions, so the hold-or-toggle Accessibility setting applies to the phone as to keys.

### Locked landscape

iOS Safari has no orientation lock (`screen.orientation.lock` is unsupported and the manifest's orientation is ignored),
and a phone turned hard as a wheel tips past the system's threshold, so before 266's round the page re-laid out mid-turn
and the steering read the new screen angle: a 20° turn read as −70°, full left lock. Now the page locks itself
(`src/pad/padPage.ts`, the pure maths in `src/pad/padInput.ts`):

- At the Start tap the controller is laid out once, in the landscape the phone is in (or the quarter turn from portrait,
  the top to the left, until the system first shows a landscape). That is the frame's lock angle.
- When the system turns the page, the frame turns back by the same angle (`frameTurn`) and scales to fit, a transform
  and nothing else. A resize that is no rotation (the keyboard leaving, Safari's bars) lays it out again.
- The wheel angle reads β and γ against the lock angle, never the screen's, so the system's rotation never reaches the
  steering. Touch movements are turned into the frame's axes (`frameDelta`), and the safe areas onto its own sides
  (`frameInsets`). The options modal sits in the top layer and turns with the frame's variables.
- On Android, where full screen is offered, the Start tap also asks `screen.orientation.lock` for the landscape in use.
- Proof, iOS Simulator with rotation lock off (`sim/after/` in the evidence folder): at 90°, 0°, 270° and 180° the panel
  stays where it was on the phone, and a fixed 20° wheel pose read 0.36 steer at every one. In Safari's portrait the panel
  shrinks to fit between Safari's own bars (scale 0.82 on an iPhone 16); from the Home Screen it does not.
- One gap is WebKit's: a flip from one landscape straight to the other that passes through upside-down portrait (the
  simulator's 270 → 180 → 90) reports no event and leaves `screen.orientation.angle` stale, so the panel shows upside down
  until the next reported rotation (any turn through portrait) puts it back. The steering is unaffected.

### Presses (what "the buttons don't work" was)

Measured on the Simulator with two fingers against the build before this round (`sim/desk-before-buttons.log`):

- Every tap control (scope, the ammunition keys, consumables, zoom, pause, options) acted on `click`, and iOS sends no
  click for a touch while another finger is down. The throttle thumb is always down, so with a thumb on the throttle a
  scope tap and an ammunition tap did nothing. Fire, brake and look already worked (pointer events).
- A tap that slid a few pixels or lasted long lost its click.

Now every control acts on its own finger's `pointerdown`, with the pointer captured: a hold lasts until its last finger
lifts (two fingers on one control count once), sliding off keeps a hold and presses nothing else, and a lost capture or a
cancelled pointer lets go. After the fix, on the Simulator: throttle plus scope, throttle plus an ammunition key, throttle
plus a guarded switch, aim drag plus fire held, a slide from fire across the sight onto a key (fire held to the lift, the
key untouched), fast double taps (two press-release pairs), and a long press on the dial (no callout). Every target is
48 px or more.

### Nothing zooms

Owner 2026-10-30: "when u click in sessions like it zooms in". The viewport is `width=device-width, initial-scale=1,
maximum-scale=1, user-scalable=no, viewport-fit=cover`; `touch-action: none` on the whole page; the controller cancels
`touchstart` (outside the options modal), `contextmenu`, iOS's `gesturestart`/`gesturechange`/`gestureend`, `dblclick`
and a double tap's second `touchend`; no selection, callout or tap highlight; the one input is 28 px (iOS zooms in on
focus below 16 px). Simulator: `visualViewport.scale` stayed 1 through focusing the code field, double taps, rapid taps
on every control and two-finger pinches on the join screen and the panel.

## Desktop side

Settings › Controls opens with a Phone controller card: Connect phone loads the receiver and shows the QR, the code, the
address and the countdown; once paired the card shows the phone's state and round trip and Disconnect. Keyboard, mouse and pad keep
working at the same time (the stick yields to the keyboard when centred, as the touch HUD's does). The card's state is
one datum (`phone-link`, `src/ui/surfaceRegistry.ts`).

## Edge cases

Owner 2026-10-30: "fix a lot more edge cases". The rule under every row: an input never outlives its finger or its link.
The phone lets every control go when the link leaves live or the page is hidden, blurred or left (`releaseControls`);
the desktop lets go on away, on ended and when no frame arrives inside the stale window, and ignores the phone outside
a battle, while paused and while its tab is hidden (the pause button still works, to close the menu it opened).

| Case | Handling | Tested |
|---|---|---|
| Phone locked, app backgrounded, an incoming call | the page hides: every control lets go, the desktop's stale window stops the tank; on return the link reconnects with its resume token (and a link that gave up while hidden resumes by itself when shown) | Simulator: Home mid-drive, the desktop logged `move 0 0`; back in Safari the link was live again (round trip 1 ms) |
| A notification banner over the pad | no hide; a touch the system takes is a `pointercancel`, which lets go | by construction (`pointercancel` and `lostpointercapture` release) |
| Desktop tab hidden or minimised, focus lost, the laptop sleeps | hidden: the phone reads Paused and the desktop ignores it; focus lost: the input layer clears itself; asleep: the phone reads Computer away (amber lamp), and the pairing waits 60 s for it | Simulator: the desktop process stopped, the phone showed Computer away with every control released |
| Wi-Fi drops, Wi-Fi ↔ cellular | the signalling socket reconnects with the resume token (backoff to 8 s, for 60 s); a dead data channel falls back to the relay; the lamp shows Linking, Relay or Computer away | `padLink.selftest` (relay without WebRTC, resume); pad e2e (relay path) |
| A reload on either side mid-battle | phone: the tab's resume token, one Start tap; desktop: the tab keeps its token (`cot.pad.desk`) and the game's boot resumes the pairing inside its grace, with no new code | pad e2e: a desktop reload comes back live on both sides by itself |
| A code expired, wrong or used; two phones on one code | refused alike ("That code didn't work"); a code is single-use and lives 120 s | `padActor.selftest`; Simulator: an expired code ended on that screen |
| Motion access refused, or no sensor | the throttle becomes a stick that steers (a cross gate) and the dial dims | Simulator: before motion access was allowed the gate showed as the stick; `padInput.selftest` maps the stick to steering |
| Battle over, Garage, map change, respawn, pause menu, killcam | the desktop drives only in a battle, unpaused, tab shown; the phone dims the dial and reads the state (Start a battle, Paused, Destroyed) | pad e2e: pause from the phone opens and closes the menu |
| Low-power mode, throttled timers | presses and tilt go on their own events; the heartbeat may run late, so the desktop's stale window is four of the phone's usual gaps (a median of eight), 400 ms to 1.5 s | `padInput.selftest`: a 1 s heartbeat holds, a 100 ms one keeps 400 ms |
| Notch, Dynamic Island, home indicator | the safe areas are measured once and laid onto the locked frame's own sides | Simulator: 59 px clear of the island, 20 px over the home bar, in every rotation |
| A very long session | no allocation per frame on the phone beyond one key string per event, bounded rings (the debug trace), one heartbeat timer, ping timers cleared on each state; a pairing lives 6 h, the relay 12,000 frames | by construction; the relay budget in `padActor.selftest` |
| Android Chrome | the same page; full screen and `screen.orientation.lock` at Start | pad e2e runs Chromium with touch emulation (CDP touch points) |
| Several fingers on one control | the control holds until its last finger lifts | pad e2e: two fingers on fire, one lifts (held), the last lifts (released) |
| A disconnect while firing | the phone vanishes with the throttle and the trigger held: the desktop lets both go | pad e2e: throttle and fire held, the phone closed, both released within 700 ms |
| Several thumbs at once | every control on its own pointer | pad e2e: throttle held, a scope tap, fire held and an aim drag together; Simulator: two-finger pairs |

## Proof

- Receipts: `src/pad/padProtocol.selftest.mjs` (codes, routes, frame codec), `src/pad/padActor.selftest.mjs` (a code
  expires, is single use, a wrong code is refused, resume, limits, relay budget), `src/pad/padInput.selftest.mjs` (the
  steering model and the action mapping), `src/pad/qr.selftest.mjs`, `server/rooms/localPadService.selftest.mjs` (real
  sockets), `cloudflare/rooms/test/pad.test.ts` (the Worker route and the DO).
- `tools/pad-e2e.browser.mjs`: two pages pair through the LAN helper, synthetic orientation and touch events drive a tank
  in a solo battle (several thumbs at once through CDP touch points), the network log shows zero requests before
  pairing, the latency is measured on one clock, and a desktop reload resumes the pairing.
- iOS Simulator for the pad page: the locked frame at every rotation, two-finger presses against a Node desktop that logs
  every input (`desk.mjs` in the evidence folder, which also replays a fixed tilt and reports the screen angle, the
  viewport and its scale), zoom, backgrounding and the desktop vanishing; a real phone on the preview by the owner.

## Measured

2026-10-30, this lane's Mac (busy: load 95 to 400 throughout), labelled by path. Network numbers are one-way, frame sent to
frame received, on one clock.

| Path | How | p50 | p95 | n |
|---|---|---|---|---|
| Relay through the real Worker (cot-rooms-preview, Cloudflare) | two real `padLink`s in Node on this Mac, both ends behind the home connection; Node has no WebRTC so the link takes the relay (`cf/relay-latency.mjs` in the evidence folder) | 23.7 ms / 20.9 ms | 93.6 ms / 79.0 ms | 40 / 60 |
| Edge round trip | TCP connect to cot-rooms from this Mac | ~16 to 21 ms typical | 86 to 134 ms spikes under load | 5 |
| WebRTC data channel, phone event to the desktop frame that carries it | `tools/pad-e2e.browser.mjs` run 8 (PASS), two headless browsers, loopback, load 65 to 90 | 49 ms | 73 ms | 40 |
| — the phone's send (event to frame stamp) | same | 0 ms | 1 ms | 40 |
| — the link (stamp to receipt; mostly the busy desktop's main-thread wait) | same | 23 ms | 37 ms | 40 |
| — the desktop (receipt to the frame that carries it), at a 25 ms (40 fps) frame | same | 26 ms | 36 ms | 40 |
| Relay over the LAN helper, phone event to the desktop frame | run 8, a phone page without WebRTC (15 Hz cap, trailing edge) | 37 ms | 45 ms | 20 |
| WebRTC end to end after the panel and edge-case round | run 10, load 99 to 119 (desktop frame 25 ms) | 50 ms | 69 ms | 40 |
| — the phone's send / the link | same | 0 / 22 ms | 1 / 34 ms | 40 |
| Run 9, same harness at load 133 to 301 (desktop frame 42 ms) | WebRTC end to end; the controller's share went past 60 ms p95 on the desktop's main thread | 77 ms | 125 ms | 39 |
| Run 6, same harness at load ~250 (30 fps desktop) | WebRTC end to end | 54 ms | 90 ms | 40 |

Reading it against the pass rule (`pad-e2e` holds the controller's share, send plus link, to 60 ms p95; the end-to-end
figure needs a player's desktop):
- In the headless harness the desktop renders the battle at 30 to 40 fps on a shared Mac, and that, not the controller,
  sets the end-to-end figure (p95 73 ms at 40 fps, 90 ms at 30 fps): the phone's send is under a millisecond, and the
  link's share is mostly the desktop's main thread finishing its frame. At 60 fps both desktop shares shrink to about
  a frame each (an inference, p95 about 40 to 45 ms); the owner's real machines settle it.
- The relay's p95 fell from 480 ms (run 6) to 45 ms once a change capped by its rate went on the trailing edge instead
  of being dropped.
- Run 5 (before the phone sent on each event) was p50 72 / p95 131 ms; sending at once removed the phone's frame wait.
- The relay through Cloudflare already meets the cellular bar (p95 under 120 ms) with both ends on one home connection; a
  phone on cellular adds its radio's one-way time (typically 15 to 40 ms on 4G/5G). It is the fallback, not the path.
- A WebRTC data channel on a LAN skips the edge entirely: its share is the Wi-Fi hop (a few ms) plus the desktop's
  sample-to-frame wait (at most one 60 Hz frame); the e2e measures the browser pipeline end to end.
- The real phone: the pad's link chip shows the round trip live, and `?padDebug` exposes `__COT_PAD_PHONE` (round trip
  and the desktop's receipt-to-frame time). The owner's check on the preview gives the LAN and cellular numbers on a
  real radio; the simulator proved the WebKit page (pairing, touch, options, resume) but not its sensors or a radio.
