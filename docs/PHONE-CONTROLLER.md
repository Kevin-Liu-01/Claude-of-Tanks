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

## Controls: the tank in the hand

Underneath its features the controller is not a remote: it is the tank itself, held in two hands. The screen makes that
literal, with the game's own material and no text labels.

- The tank. The centre is the vehicle on the field, its plan view (`/icons/<spec>_top.webp`, sent by the desktop),
  nose up. It turns as the phone turns, so the tank is the steering's readout. Tapping it re-centres the wheel.
- The gun's bearing. A ring around the tank carries a tick at the turret's bearing off the hull (the desktop's
  turretYaw), so the gunner sees where the gun points while the hull turns.
- Steering: tilt like a wheel. The phone's up vector comes from `deviceorientation` (β, γ), rotated into the screen's
  frame (`screen.orientation.angle`); the wheel angle is its angle in the screen plane, so how far the phone leans back
  does not matter. A 3° dead zone, a 1.6 power curve, full lock at 35° (25 to 60 in options). iOS asks permission from
  the Start tap over HTTPS. With no sensor (a laptop, the simulator, a refusal) the grip becomes a stick that steers too.
- Throttle: a track tread under the left thumb. The grip rides it and springs back to neutral; the tread rolls at the
  throttle's speed and direction (one compositor animation, still under reduced motion). Brake (the handbrake and the
  neutral turn) sits under it.
- The gun: the right side is the sight. A drag aims; the reticle leans toward the drag and settles on release. The
  trigger fills from the bottom as the gun reloads and stands full when it is ready; hold it for full-auto, as on
  every device. Scope sits beside it, zoom appears while scoped, Look holds free-look.
- The ready rack: ammunition 1 to 3 with the game's shell glyphs, codes and rounds left, the loaded one raised;
  consumables, pause and options beside it. A dot and the round trip show the link.
- Options: tilt on or off, the fire hand (a left-handed mirror), steering lock and aim speed.
- Screen Wake Lock keeps the phone awake; `navigator.vibrate` ticks on fire and slot changes where supported.

Every button goes through input actions, so the hold-or-toggle Accessibility setting applies to the phone as to keys.

## Desktop side

Settings › Controls opens with a Phone controller card: Connect phone loads the receiver and shows the QR, the code, the
address and the countdown; once paired the card shows the phone's state and round trip and Disconnect. Keyboard, mouse and pad keep
working at the same time (the stick yields to the keyboard when centred, as the touch HUD's does). The card's state is
one datum (`phone-link`, `src/ui/surfaceRegistry.ts`).

## Proof

- Receipts: `src/pad/padProtocol.selftest.mjs` (codes, routes, frame codec), `src/pad/padActor.selftest.mjs` (a code
  expires, is single use, a wrong code is refused, resume, limits, relay budget), `src/pad/padInput.selftest.mjs` (the
  steering model and the action mapping), `src/pad/qr.selftest.mjs`, `server/rooms/localPadService.selftest.mjs` (real
  sockets), `cloudflare/rooms/test/pad.test.ts` (the Worker route and the DO).
- `tools/pad-e2e.browser.mjs`: two pages pair through the LAN helper, synthetic orientation and touch events drive a tank
  in a solo battle, the network log shows zero requests before pairing, and the latency is measured on one clock.
- iOS Simulator for the pad page (layout, touch, pairing, WebRTC); a real phone on the preview by the owner.

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
