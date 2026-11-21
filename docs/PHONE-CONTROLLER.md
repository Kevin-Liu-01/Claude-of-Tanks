# Phone controller — steer a tank with your phone

Lane `item/phone-controller-266`. The owner's words (2026-10-30): "build a connection/ui/smthg where u can steer tanks
with ur phone like a steering wheel with a button of buttons for scope driving ammo etc if you connect sessions with a
code or smthg through some way. explore and build!"

## Value case and pass rule (stated before building)

The phone becomes a second input device for the desktop game, held landscape in two hands: the left thumb drives a stick,
the right thumb aims and fires, and big keys in fixed zones reach every capability a keyboard player has, in every mode
(pad-controls-274; owner 2026-11-20: "no more need for gyroscope features, use joysticks buttons in specific areas, big
buttons and surface areas for all capabilities, special sections from left and right for the special abilities, so you
can play all special modes from couch/mobile controller mode"). The first build (266) steered by tilt, like a wheel; 274
removed the tilt, its `deviceorientation` reader and the motion-permission ask whole. It earns its place if it feels like
a controller, not a remote desktop.

Pass rule:

1. Steering latency (a touch event on the phone to the tank's input in a rendered desktop frame): p95 under 60 ms on a
   LAN, under 120 ms on cellular.
2. A full battle is playable from the phone alone, in every mode: drive, aim, scope, switch ammunition, fire, the
   consumables and the vehicle's systems, the drone, Air Support's binoculars, the AC-130, Watch and a destroyed player's
   killcam and spectator camera.
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
- `src/pad/padInput.ts`: the stick and aim models and the frame's turn, `src/pad/padLayout.ts`: every mode's zones and
  keys, and `src/pad/padBuzz.ts`: each cue's buzz; the phone's, pure.
- `src/pad/padDesk.ts`: the desktop's half, pure: the frame-to-action mapping, the axes and guide decoders, the pairing
  page's address. With `src/pad/padCues.ts` (which events are cues) the phone's page never imports it: a module both
  sides import rides whole to the phone, so each export lives on the side that runs it
  (`src/pad/padPhoneHalf.selftest.mjs`).
- `src/pad/padReceiver.ts` + `src/pad/padConnectCard.ts`: the desktop side, one lazy chunk that the Settings panel
  imports on demand (`src/ui/settings.ts`).
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
6. Either side's Disconnect ends the pairing for both; the desktop leaving for more than 5 minutes ends it; a pairing lives
   at most 6 hours.

Limits: the Worker rate-limits every `/pad` upgrade per client IP (`PAD_CONNECT_LIMITER`, 30 a minute, separate from the
rooms limiter); signals ≤ 8 KB and ≤ 60 a minute per side; ICE grants only once a phone has joined, ≤ 3 per side per
10 minutes, counted per side across its sockets and kept in the stored pairing (a resume or a Worker restart does not
reset it; `src/pad/padActor.ts`); at most 2 live sockets plus 1 pending per pair.

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
  type, flags (none set since the tilt left), seq, the phone's clock, the stick's x and y (int16), the aim pad's running
  totals (int32, 1/8 px; totals rather than deltas so a lost frame loses no aim), held-button bits (bit i is
  `PAD_HOLD_ACTIONS[i]`: fire, handbrake, freeLook, then reloadMagazine and sniperToggle, Watch's descend and boost).
- `ctl` (both ways, reliable, ordered, JSON): button press/release/tap by action id, `cmd` for what no input action
  names (Watch's tank picks and seat, a call-in by number and lowering the binoculars, the killcam's skip, the spectator's
  steps), pause, ping/pong for the clock and RTT, and the desktop's status (in battle, ammunition slot, counts and types,
  reload, sniper, paused, the lock, and the mode `m` with its grant mask `a`, below). No Worker change: the pairing actor
  relays `ctl` text without reading it, and a full status is about 300 characters, inside one relay payload.
- The desktop applies only the newest `axes` seq, takes aim as the difference of totals, and releases every held control
  and zeroes the stick when no frame arrives for 400 ms (a phone that sleeps never leaves the tank driving).

## Controls: five zones, two thumbs

The controller is still the tank's own control panel in the hand (owner 2026-10-30: "make it look more realistic"): its
material is the `surface-pad` tokens (`src/ui/tokens/tokens.json`), gunmetal keys, a rubber stick, the gunner's sight
under glass, amber and red lamps; every key wears the game's own glyph over its word in the UI face, and every count
sits on a mono counter. Every control moves by transform alone and shows a press at once, with no transition. Since 274
it is laid out in five fixed zones, the same in every mode, so a thumb learns where things are once
(`src/pad/padLayout.ts`):

| LEFT special column | Left thumb | Deck (centre) | Right thumb | RIGHT special column |
|---|---|---|---|---|
| survival, or the mode's holds | the stick (it floats to where the thumb lands) and its hold key | the rounds, or the call-ins | the gunner's sight to drag in, FIRE in its collar, the scope, look and zoom keys | systems, or the mode's picks |

The phone's own battle HUD (mobile-hud-274) keeps the same sides: survival on the left edge, systems on the right.

- The stick (`padInput.ts` `stickValue`): a 64 px ring, a 12 % dead zone for a resting thumb, a 1.3 power curve; the push
  keeps its direction (a diagonal stays a diagonal), forward is up. Its well comes to the thumb anywhere in the zone, and
  springs back on the lift.
- The sight: a drag aims, the gain following the finger's speed (`aimGain`): a slow drag keeps the mouse's precision
  (1×), a swipe at 0.5 px/ms turns 2.6 times as far, a flick up to 5 times (2 in the scope, so a flick never throws the
  sight off a target). A thumb on FIRE drags to aim once it has moved 10 px, so one thumb aims and shoots; held, the gun
  fires again the moment it loads. A rate ring (hold past it to keep turning) was weighed and left out: a slow drag that
  stops on a target would keep the gun turning.
- FIRE sits in its turned collar; the ring around it fills as the gun loads, and the button lights red when it is ready.
- The rounds are illuminated keys, the loaded one's lamp lit, its count on a drum that rolls one on when a round is
  spent. The consumables are guarded switches: the red cover lifts while the thumb is on the key.
- The top strip: the link's lamp and round trip, the mode's name on its plate, the speed on a counter, the status line,
  Pause and Menu.
- Menu (a native modal, two columns so it fits the short side whole): the fire hand (a left-handed mirror of all five
  zones), vibration, the portrait turn (below), the guide, the aim speed, and the game screen's own panels (the minimap's
  zoom, the shot log, the network panel).

### Modes

The desktop's status names the mode the player's input drives now (`m`) and grants the optional keys this player has in
it (`a`, a bit per `PAD_ACTS` id). The composition root reads where each mode lives (`src/main.ts` `phoneMode`: the
flight's `player.aerial`, the strike view and the killcam heard on the bus, the Watch controller's view), and the
receiver's lazy chunk turns the facts into grants (`padReceiver.ts` `padGrants`): the vehicle's own kit by the table the
HUD and the Garage read (`game/vehicleActions.ts`, the fitted kit from the Garage's light summary), the battle mode's
grants (the jump, the drone, Air Support, consumables, the Proving Ground), and Watch's and death's keys. The phone lays
that mode out and nothing else, so no key is dead; a swap ticks the hands once, and a hold whose key leaves lets go first.

| Capability (input action) | Tank | Binoculars | Drone | AC-130 | Watch | Destroyed | Couch seat |
|---|---|---|---|---|---|---|---|
| drive (forward/back/left/right) | stick | stick (the crew drives on) | stick = fly | none (it flies its orbit) | stick = move the camera | none | stick |
| aim / look | sight | sight = lay the reticle | sight = look (the drone flies where it looks) | sight = lay the guns | sight = look | none | sight |
| fire | FIRE (held = auto) | FIRE = CALL | none (the drone is the warhead) | FIRE (held = auto) | none | none | FIRE |
| handbrake | Brake (hold) | Brake | Climb (hold) | none | Climb (hold, left) | none | Brake |
| reloadMagazine | Reload* (right) | none | none | none | Descend (hold, left) | none | Reload* |
| sniperToggle | Scope (lit while in) | none: it would drop the view | none | never: it steps the zoom every frame it reads down | Boost (hold, left) | none | Scope |
| zoomIn / zoomOut | over FIRE while scoped | over FIRE | none | over FIRE | Slower / Faster | none | over FIRE |
| freeLook | Look (hold) | none | none | none | none | none | Look |
| shell1-3 | deck | none | none | deck (the guns) | none | none | deck |
| consumable1-3, smoke, selfRight | left* | none | none | none | none | none | left* |
| autoAim | right*, lit while locked | none | none | none | right (lock the camera on a tank) | none | none |
| strikeView | right* | Lower (right) | none | none | none | none | none |
| the five call-ins | none | deck | none | none | none | none | none |
| drone | right* (launch) | none | right: home | none | none | none | none |
| atgm, roofGun, specialAction, lights, hitboxOverlay | right* | none | none | none | none | none | specialAction* |
| aerialVision | none | none | right | right | none | none | none |
| supplyAmmo / supplyHeal | none | none | none | right | none | none | none |
| rangeReset / rangeMoving | right* (Proving Ground) | none | none | none | none | none | none |
| Watch: previous / next tank, ride, back to the drone, take control | none | none | none | none | right | none | none |
| Watch: leave the taken seat | right* (the seat plays as a tank) | none | none | none | none | none | none |
| killcam skip, spectator previous / next | none | none | none | none | none | right* | none |
| minimapZoom, shotLog, networkPanel | Menu | Menu | Menu | Menu | Menu | Menu | none |

\* where this vehicle or mode has it. Kept off the phone: leaveBattle (leaving stays the computer's choice, 266),
settingsMenu (Pause sends the pause message, Escape's toggle), perfHud (a developer readout) and freeCamera (its job,
hold or toggle aim and free look, is the scope and Look keys). `padLayout.selftest.mjs` holds every input action to
this: reachable in some mode, on Menu, or named as kept off with its reason.

The commands the desktop runs for `cmd` (`src/main.ts` `phoneCommand`) are its own touch bar's and binoculars' calls:
the Watch controller's `cycle`, `rideAt(0, 0)`, `drone` and `toggleSeat`; the bus's `ui:strikePick` (by
`AIR_STRIKE_KINDS`), `ui:strikeViewClose`, `spectate:cycle`, and `killcam:skip` (the killcam's Escape path,
`src/game/killcam.ts`). A couch seat has no command port, and its keys never offer one.

Every button goes through input actions, so the hold-or-toggle Accessibility setting applies to the phone as to keys.

### Haptics

Owner 2026-11-03: "it should buzz and vibrate and do everything". Every press ticks, and the battle's events reach the
hands the moment they happen:

- The desktop's receiver listens to the battle's bus (`listen`, the bus's `on`, handed over by Settings for the single
  pairing and by the couch runtime for each seat) and sends a `cue` on `ctl` for its own tank's events
  (`src/pad/padCues.ts` `padCueOf`): `shot` (its gun, harder for a heavier gun), `hit` and `deflect` (a hit it gave that
  hurt or glanced off), `hurt` (stronger for more damage) and `glance` (a hit taken), `module` (a module knocked out,
  never a repair's report), `burning`, `impact` (a crash or a ram, by the closing speed), `kill`, `dead`, and `denied`
  for a couch seat's shell pick the core's input stage refused (its event names the tank); and for the page's player
  alone, the events that name no tank: `spotted` (the sixth sense), `denied` (a consumable or a shell the battle
  refused) and `lock` / `unlock`. A paused battle or a hidden tab sends none. On the relay, where each message is
  a billed request and counts against the pairing's relay budget, a cue waits 500 ms after the last (a kill and a
  death never wait). No Worker change: the relay carries `ctl` text without reading it.
- The phone plays each one's pattern (`padBuzz.ts` `padBuzzPattern`) with `navigator.vibrate` (Android). iOS Safari has no Vibration
  API; it ticks once when a switch control toggles (iOS 18), so the page toggles a hidden switch for each tick of the
  pattern (`padBuzzTicks`: one tick per pulse, a long pulse ticks on every 50 ms, six at most).
- The phone's own buzzes: a tick per press; at the trigger, the shot's kick at once when the gun is loaded (the
  battle's cue for that one shot then adds none), a refusal while it loads; and the gun loaded (a load of 1.5 s or
  more), timed from the status's reload, never with the trigger held (the shot's own kick follows). A paused battle or a
  hidden desktop tab freezes the reload: the load waits (`padReadyBuzz.ts`, idle, loading or paused) and is announced
  once at the resume or the load's end; a link that leaves live drops it.
- A press never cuts a buzz still playing short. Options has a Vibration switch.
- Unverified on hardware: whether iOS ticks outside a touch's own handler (a cue that arrives off the link). The
  simulator has no haptics; the owner's phone settles it.

### The controls guide

Owner 2026-11-03: "a tutorial should show up on first phone pairing mode that u can skip and also disappears after like
10 seconds". The first status with thumbs after a phone's first pairing (`cot.pad.tour.v2` in its storage; the 274 layout
shows it again once; an idle panel, as in Settings, has nothing to name, so it waits for the first battle) shows a ring on each zone and its name beside it over the live panel: the stick, drag to aim and flick to
turn, tap to fire and drag to aim, the deck, and the two special columns. A ghost thumb strokes the stick and the
sight. The thumbs work through it (no pointer events but Skip's); Skip, or ten seconds with the time
running out under Skip, ends it; Options shows it again. Skip stands on the top strip, where the status line gives way to it while the guide shows. The marks are placed in the frame's own layout, so they turn
with it, and each name takes the first side with room, clear of the other controls and names.

The game screen shows the same guide at the same time (owner 2026-11-03: "the tutorial should open on game screen and
the phone"), because the big screen is where the player looks:

- With the guide the phone sends its picture of itself on `ctl` (`tour`, `PadTourLayout`): its frame, every control's
  box (as outlines: keys, round keys, the stick, the sight, the trigger), each stop's ring and where its name
  sits, in whole frame px. It travels as compact text (`encodePadTour`: base64 of 9 bytes a part and 14 a stop, about
  340 characters for a full panel), because the guide opens while a pairing may still be on the relay, whose payload
  the actor takes up to 512 characters. The first build sent it as JSON, about 700 characters: the actor dropped the
  phone's socket as invalid and the pairing ended at once (pad-e2e, 2026-11-03). `padLink` now refuses to relay any
  ctl message past that limit, so no message can end a pairing that way again.
- The receiver draws it (`src/pad/padTourScreen.ts`, in the receiver's lazy chunk): the phone in outline at the foot of
  the screen, up to 720 px wide, each name in the game screen's own language where the phone put its own (kept inside
  the drawn screen, since its words may run wider than the phone's), the same ghost strokes, and Skip with the
  phone's time left running out under it. It stands in the top layer (a manual popover, as the kit's hover tip does), so it shows
  over Settings, where a phone pairs, and over the couch lobby. It takes no input but Skip, and it stays off the
  surface stack: opened there it would replace the Settings panel or the couch lobby it stands over
  (`transientSurfaceRegistry.selftest.mjs` names it an exempt).
- Skip on either side, or the ten seconds, ends it on both (`tour` with `on: false`; an ending is never echoed). A couch
  lobby shows one at a time: a newer phone's guide replaces the one showing.
- The phone owns the guide; the game screen's copy is a bounded mirror with no clock of its own (round 8). The phone's
  `tour` with `on: true` carries the time its guide has left (`ms`), and the copy closes on the phone's `on: false`, on
  its own Skip, when its link leaves live (a closed tab or a dropped link sends no ending), or when that time runs out,
  whichever comes first (`padReceiver.ts`; `padTour.selftest.mjs`).

### The frame

The panel is always laid out landscape. Before 274 the page locked itself to the landscape it started in and turned
back against every system rotation, because a wheel turned hard tipped the phone past the system's threshold and the
re-layout moved the steering mid-turn. Without the tilt nothing reads the phone's angle, so the page follows the system:
a rotation lays it out again (a held stick or sight keeps its finger). One case still needs a turn: an iPhone with
rotation lock on keeps the page portrait while it is held sideways, so a portrait page lays the panel out turned a
quarter, the top to the left (`padInput.ts` `frameTurnFor`), and Menu's portrait turn turns it the other way. A finger's
movement reads in the frame's own axes (`frameDelta`) and the safe areas land on its own sides (`frameInsets`). On
Android, where full screen is offered, the Start tap also asks `screen.orientation.lock` for the landscape in use.

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
| Desktop tab hidden or minimised, focus lost, the laptop sleeps | hidden: the phone reads Paused and the desktop ignores it; focus lost: the input layer clears itself; asleep: the phone reads Computer away (amber lamp), and the pairing waits 5 minutes for it (`PAD_DESKTOP_GRACE_MS`, 60 s before this round) | Simulator: the desktop process stopped, the phone showed Computer away with every control released |
| Wi-Fi drops, Wi-Fi ↔ cellular | the signalling socket reconnects with the resume token (backoff to 8 s, for 60 s); a dead data channel falls back to the relay; the lamp shows Linking, Relay or Computer away | `padLink.selftest` (relay without WebRTC, resume); pad e2e (relay path) |
| A reload on either side mid-battle | phone: the tab's resume token, one Start tap; desktop: the tab keeps its token (`cot.pad.desk`) and the game's boot resumes the pairing inside its 5-minute grace, with no new code | pad e2e: a desktop reload comes back live on both sides by itself |
| A code expired, wrong or used; two phones on one code | refused alike ("That code didn't work"); a code is single-use and lives 120 s | `padActor.selftest`; Simulator: an expired code ended on that screen |
| Battle over, Garage, map change, respawn, pause menu, killcam | the desktop drives only in a battle, unpaused, tab shown; the phone dims the dial and reads the state (Start a battle, Paused, Destroyed) | pad e2e: pause from the phone opens and closes the menu |
| Low-power mode, throttled timers | presses and the stick go on their own events; the heartbeat may run late, so the desktop's stale window is four of the phone's usual gaps (a median of eight), 400 ms to 1.5 s | `padInput.selftest`: a 1 s heartbeat holds, a 100 ms one keeps 400 ms |
| Notch, Dynamic Island, home indicator | the safe areas are measured once and laid onto the locked frame's own sides | Simulator: 59 px clear of the island, 20 px over the home bar, in every rotation |
| A very long session | no allocation per frame on the phone beyond one key string per event, bounded rings (the debug trace), one heartbeat timer, ping timers cleared on each state; a pairing lives 6 h, the relay 12,000 frames | by construction; the relay budget in `padActor.selftest` |
| Android Chrome | the same page; full screen and `screen.orientation.lock` at Start | pad e2e runs Chromium with touch emulation (CDP touch points) |
| Several fingers on one control | the control holds until its last finger lifts | pad e2e: two fingers on fire, one lifts (held), the last lifts (released) |
| A disconnect while firing | the phone vanishes with the throttle and the trigger held: the desktop lets both go | pad e2e: throttle and fire held, the phone closed, both released within 700 ms |
| Several thumbs at once | every control on its own pointer | pad e2e: throttle held, a scope tap, fire held and an aim drag together; Simulator: two-finger pairs |

## Proof

- Receipts: `src/pad/padProtocol.selftest.mjs` (codes, routes, frame codec), `src/pad/padActor.selftest.mjs` (a code
  expires, is single use, a wrong code is refused, resume, limits, relay budget), `src/pad/padInput.selftest.mjs` (the
  stick, the portrait turn and the action mapping), `src/pad/padLayout.selftest.mjs` (every mode's keys real, every
  keyboard action reachable, the grants by kit, mode, couch seat, Watch and death), `src/pad/padPhoneHalf.selftest.mjs` (no desktop-only export rides to the
  phone), `src/pad/qr.selftest.mjs`, `server/rooms/localPadService.selftest.mjs` (real
  sockets), `cloudflare/rooms/test/pad.test.ts` (the Worker route and the DO).
- `tools/pad-e2e.browser.mjs`: two pages pair through the LAN helper, synthetic stick and touch events drive a tank
  in a solo battle (several thumbs at once through CDP touch points), the network log shows zero requests before
  pairing, the latency is measured on one clock, and a desktop reload resumes the pairing. It also checks the guide (it
  waits out the idle panel in Settings, then shows in the first battle on the phone and on the game screen together, a thumb works through it, it leaves both by
  itself after ten seconds (timed where each screen saw it go), Options shows it again on both, and Skip on either side ends it on both), the lock key, a shot felt once (the trigger's kick, the battle's cue for it adding none), a thumb
  on fire dragging to aim while the gun loads, and the loaded buzz.
- `src/pad/padCues.selftest.mjs`: which events are whose cues, the cue on the wire, every buzz's pattern and ticks.
- iOS Simulator for the pad page (266, the tilt build): two-finger presses against a Node desktop that logs every input
  (`desk.mjs` in that lane's evidence folder), zoom, backgrounding and the desktop vanishing; a real phone on the preview
  by the owner. 274's look: the desktop and the phone page at 844x390 and 390x844 in a browser, every mode laid out
  (`~/cot-lanes/pad-controls-274-evidence/`); the new layout on real hardware is the owner's check.
- Measured below: 266's latency runs drove the steering by tilt; `pad-e2e` now pushes the stick (one pointer event to the
  tank's steer), the same path from the link on.

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
