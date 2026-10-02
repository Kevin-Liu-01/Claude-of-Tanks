// tools/audio/sfx-catalog.mjs — the sound-effect design catalog: every
// generated asset, the ElevenLabs prompt it is generated from, how many
// playable variants ship, how many takes are generated to choose them from,
// and the mastering preset it is processed with.
//
// Prompt rules (ElevenLabs guidance + what survived the pilots):
//   - one concrete event per prompt; layering happens in the engine, not here;
//   - name the perspective (close exterior / interior / far away) and the
//     material, and end with the exclusions that keep layers separable;
//   - loops say "seamless loop" AND set loop:true; one-shots say "one-shot".
//
// Fields: id, group, prompt, dur (s), inf (prompt_influence), loop, variants
// (shipped), takes (generated; ≥ variants), proc (mastering preset in
// process-audio.mjs), ch ('mono' for every 3D emitter, 'stereo' for beds/UI).

const NO_MUSIC = 'no music, no voices';
const FIELD = 'High-quality professional field recording';

/**
 * Impacts need the same framing the gunshot pilots proved: an explicit "sound
 * effect" with a loud, hard attack. Applied to every punchy one-shot unless an
 * entry opts out (debris rain, collapses and other slow-onset events).
 */
function punchy(prompt) {
  return `Sound effect: ${prompt.replace(/^One-shot of /, '')} Very loud, with an immediate hard attack.`;
}

/** Shorthand for an entry. */
function sfx(id, group, prompt, dur, { inf = 0.45, loop = false, variants = 1, takes = variants, proc = 'oneshot', ch = 'mono', punch = proc === 'impact' } = {}) {
  const text = punch ? punchy(prompt) : prompt;
  return Object.freeze({ id, group, prompt: text, dur, inf: punch ? Math.max(inf, 0.6) : inf, loop, variants, takes, proc, ch });
}

// ------------------------------------------------------------ main guns ---
const CANNONS = [
  ['gun_90', '90 mm', 'sharp hard crack'],
  ['gun_105', '105 mm', 'hard ear-splitting crack'],
  ['gun_120', '120 mm smoothbore', 'violent ear-splitting crack'],
  ['gun_125', '125 mm smoothbore', 'violent ear-splitting crack with a heavier body'],
  ['gun_130', '130 mm', 'colossal crack and pressure wave'],
  ['gun_152', '152 mm heavy', 'colossal deep blast and pressure wave'],
];

const weapons = [
  ...CANNONS.map(([id, bore, crack]) => sfx(`${id}_close`, 'weapons',
    `One-shot of a single ${bore} tank main gun firing, recorded close outside the tank: supersonic muzzle blast with a ${crack}, deep concussive low-frequency punch, then a rolling outdoor echo tail. ${FIELD}, ${NO_MUSIC}.`,
    4, { inf: 0.55, variants: 3, takes: 4, proc: 'weapon-close' })),
  sfx('gun_far_light', 'weapons', `One-shot of a tank cannon fired about one kilometre away: muffled boom with a soft attack and a rolling thunder-like echo across open terrain, no crack. ${FIELD}, ${NO_MUSIC}.`, 4.5, { variants: 2, takes: 3, proc: 'weapon-far' }),
  sfx('gun_far_medium', 'weapons', `One-shot of a large-calibre tank gun fired far away, over a kilometre: deep heavy boom, low rumbling echo rolling across hills, no crack. ${FIELD}, ${NO_MUSIC}.`, 5, { variants: 2, takes: 3, proc: 'weapon-far' }),
  sfx('gun_far_heavy', 'weapons', `One-shot of a very heavy gun fired far in the distance: enormous low thud and long rolling thunder echo, no crack. ${FIELD}, ${NO_MUSIC}.`, 5.5, { variants: 2, takes: 3, proc: 'weapon-far' }),
  sfx('gun_interior_medium', 'weapons', `One-shot heard from inside a tank turret as its own 105 mm main gun fires: enormous muffled thump through the hull, steel resonance, recoil slam of the breech, no outside echo. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'weapon-close' }),
  sfx('gun_interior_large', 'weapons', `One-shot heard from inside a tank turret as its own 125 mm main gun fires: massive muffled concussion, steel hull ringing, heavy recoil slam of the breech block. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'weapon-close' }),
  sfx('gun_interior_heavy', 'weapons', `One-shot heard from inside a heavy armoured vehicle as its own huge gun fires: crushing muffled blast, deep hull boom, violent recoil slam. ${NO_MUSIC}.`, 2.8, { variants: 2, takes: 2, proc: 'weapon-close' }),
  sfx('tail_open', 'weapons', `One-shot echo tail only of a distant gunshot over open fields: no initial blast, a soft diffuse rolling reverberation decaying over four seconds. ${NO_MUSIC}.`, 4, { variants: 2, takes: 2, proc: 'tail' }),
  sfx('tail_urban', 'weapons', `One-shot echo tail only of a gunshot between concrete buildings in a ruined town: no initial blast, sharp slap-back echoes then a long low reverberant tail. ${NO_MUSIC}.`, 4, { variants: 2, takes: 2, proc: 'tail' }),
  sfx('tail_mountain', 'weapons', `One-shot echo tail only of a gunshot in a mountain valley: no initial blast, distinct delayed echoes bouncing off cliffs, long decay. ${NO_MUSIC}.`, 4.5, { variants: 2, takes: 2, proc: 'tail' }),
  sfx('tail_forest', 'weapons', `One-shot echo tail only of a gunshot in a dense forest: no initial blast, a short dense diffuse reverberation dying in the trees. ${NO_MUSIC}.`, 3.5, { variants: 2, takes: 2, proc: 'tail' }),
];

// ----------------------------------------------------------- autocannons ---
const AUTOCANNONS = [
  ['ac_20', '20 mm', 'very sharp snappy bang'],
  ['ac_25', '25 mm chain gun', 'sharp punchy bang'],
  ['ac_30', '30 mm', 'hard punchy bang'],
  ['ac_40', '40 mm', 'heavy punchy boom'],
  ['ac_50', '50 mm', 'heavy booming report'],
];

// Pilots (2026-10-02): short "one-shot of a single round" prompts at 0.6–1.4 s
// came back quiet and smeared; the "Gunshot sound effect … very loud … hard
// attack … One isolated shot." framing at ≥1.2 s gives a clean transient at
// full level. Mastering trims each to its own tail.
const autocannons = [
  ...AUTOCANNONS.map(([id, bore, report]) => sfx(`${id}_close`, 'weapons',
    `Gunshot sound effect: a single close-up ${bore} cannon shot from an armoured vehicle, extremely loud ${report} with a hard attack and a metallic mechanical clank, then an outdoor echo. One isolated shot.`,
    2, { inf: 0.75, variants: 4, takes: 5, proc: 'weapon-close' })),
  sfx('ac_far_light', 'weapons', `Gunshot sound effect: a single autocannon shot heard about 600 metres away, short dull thump with a quick outdoor echo. One isolated shot.`, 2, { inf: 0.7, variants: 3, takes: 3, proc: 'weapon-far' }),
  sfx('ac_far_heavy', 'weapons', `Gunshot sound effect: a single heavy autocannon shot heard far away, muffled thud with a rolling echo. One isolated shot.`, 2.2, { inf: 0.7, variants: 3, takes: 3, proc: 'weapon-far' }),
];

// -------------------------------------------------------- machine guns ---
const machineGuns = [
  sfx('mg_rifle_close', 'weapons', `Gunshot sound effect: a single close-up 7.62 mm machine gun shot, very loud sharp crack with an immediate hard attack and a short punchy body, then a brief outdoor echo. One isolated shot.`, 1.2, { inf: 0.75, variants: 4, takes: 6, proc: 'weapon-close' }),
  sfx('mg_heavy_close', 'weapons', `Gunshot sound effect: a single close-up .50 calibre heavy machine gun shot, very loud deep punchy blast with a hard attack, then a short outdoor echo. One isolated shot.`, 1.4, { inf: 0.75, variants: 4, takes: 6, proc: 'weapon-close' }),
  sfx('mg_far', 'weapons', `Gunshot sound effect: a single gunshot heard a few hundred metres away, small hollow pop with a short echo. One isolated shot.`, 1.2, { inf: 0.7, variants: 3, takes: 4, proc: 'weapon-far' }),
];

// ------------------------------------------------------------ launchers ---
const launchers = [
  sfx('atgm_launch', 'weapons', `One-shot of an anti-tank guided missile launching from a vehicle launcher: sharp ejection pop, then a roaring rocket motor ignition whoosh with hiss moving away. ${FIELD}, ${NO_MUSIC}.`, 3, { variants: 3, takes: 4, proc: 'weapon-close' }),
  sfx('missile_flight_loop', 'weapons', `Seamless loop of a guided missile rocket motor in flight: steady roaring hiss with a thin whistle, constant intensity. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('rocket_salvo', 'weapons', `One-shot of a heavy multiple rocket launcher salvo: rapid sequence of powerful rocket launches, roaring whooshes ripping away. ${FIELD}, ${NO_MUSIC}.`, 5, { variants: 2, takes: 2, proc: 'weapon-close' }),
  sfx('smoke_launcher', 'weapons', `One-shot of tank smoke grenade dischargers firing: a rapid volley of four hollow pops. ${FIELD}, ${NO_MUSIC}.`, 2, { variants: 2, takes: 3, proc: 'oneshot' }),
  sfx('smoke_burst', 'weapons', `One-shot of a smoke grenade bursting in the air: soft dull pop and a billowing hiss of smoke. ${FIELD}, ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 2, proc: 'oneshot' }),
];

// ------------------------------------------------- loading and mechanisms ---
const mechanisms = [
  sfx('breech_open', 'mechanism', `One-shot of a heavy tank gun breech block opening: steel sliding, solid metallic clack, close-mic inside the turret. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('breech_close', 'mechanism', `One-shot of a heavy tank gun breech slamming shut: loud satisfying steel clack, close-mic inside the turret. ${NO_MUSIC}.`, 1, { variants: 3, takes: 4, proc: 'foley' }),
  sfx('case_eject_brass', 'mechanism', `One-shot of a huge spent brass tank gun cartridge case dropped onto a steel turret floor: a heavy dull clang and a low rolling rumble, not tinkly. ${NO_MUSIC}.`, 1.6, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('case_eject_stub', 'mechanism', `One-shot of a spent tank round stub base ejected: dull metallic clunk and short rattle on steel. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('shell_grab', 'mechanism', `One-shot of a loader pulling a heavy tank shell out of a steel ready rack: metal scrape and clunk. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('shell_ram', 'mechanism', `One-shot of a heavy tank shell rammed into a gun breech: sliding metal and a solid thunk. ${NO_MUSIC}.`, 1, { variants: 3, takes: 4, proc: 'foley' }),
  sfx('autoloader_carousel', 'mechanism', `One-shot of a tank autoloader carousel rotating under the turret floor: electric motor whir with mechanical ratcheting, stopping with a clunk. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('autoloader_lift', 'mechanism', `One-shot of a tank autoloader lifting an ammunition cassette: short hydraulic whine and a heavy clunk. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('autoloader_chain_ram', 'mechanism', `One-shot of a chain rammer pushing a projectile into a gun: fast metallic chain rattle ending in a thud. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('bustle_index', 'mechanism', `One-shot of a turret bustle autoloader indexing a round: quick servo whir and mechanical clack. ${NO_MUSIC}.`, 1.3, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('ac_feed', 'mechanism', `One-shot of an autocannon ammunition belt feeding and the bolt cycling: crisp mechanical clatter. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('magazine_swap', 'mechanism', `One-shot of a heavy ammunition box latched into an autocannon feed: metallic clatter and a firm latch. ${NO_MUSIC}.`, 1.6, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('missile_tube_load', 'mechanism', `One-shot of a missile canister sliding into a launcher tube: hollow metal scrape and a locking latch. ${NO_MUSIC}.`, 1.6, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('latch_ready', 'mechanism', `One-shot of a heavy tank breech safety latch locking into place: a solid low metal clack with no ring. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
];

// --------------------------------------------------------------- flybys ---
const flybys = [
  sfx('shell_flyby_sabot', 'flyby', `One-shot of a supersonic tank shell passing very close overhead: sharp crack and a violent tearing whoosh. ${NO_MUSIC}.`, 1.5, { variants: 3, takes: 4, proc: 'oneshot' }),
  sfx('shell_flyby_he', 'flyby', `One-shot of a large shell passing overhead: deep rushing whoosh with a doppler pitch drop. ${NO_MUSIC}.`, 2, { variants: 2, takes: 3, proc: 'oneshot' }),
  sfx('bullet_crack', 'flyby', `Sound effect: a single supersonic bullet snapping past very close to the listener, one sharp loud crack with a tiny whizz. One isolated sound. ${NO_MUSIC}.`, 1, { inf: 0.7, variants: 4, takes: 5, proc: 'oneshot' }),
  sfx('missile_flyby', 'flyby', `One-shot of a rocket missile roaring past at close range with a doppler effect. ${NO_MUSIC}.`, 2.5, { variants: 1, takes: 2, proc: 'oneshot' }),
  sfx('shell_incoming', 'flyby', `One-shot of an artillery shell whistling down overhead before impact, descending pitch, no explosion. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 2, proc: 'oneshot' }),
];

// -------------------------------------------------------------- impacts ---
const impacts = [
  sfx('pen_heavy', 'impacts', `One-shot of a large armour-piercing tank round penetrating thick steel armour: massive metallic slam, tearing metal, spall debris rattling. ${NO_MUSIC}.`, 2.5, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('pen_light', 'impacts', `One-shot of an autocannon round punching through vehicle armour: sharp metallic crack and tearing. ${NO_MUSIC}.`, 1.5, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('pen_interior', 'impacts', `One-shot heard inside a tank as an enemy shell penetrates the hull: deafening bang, ringing steel, metal fragments ricocheting around the crew compartment. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ricochet_heavy', 'impacts', `One-shot of a tank shell ricocheting off sloped armour: loud metallic clang and a high whining ricochet flying away. ${NO_MUSIC}.`, 2, { variants: 4, takes: 5, proc: 'impact' }),
  sfx('ricochet_light', 'impacts', `Sound effect: a machine-gun round glancing off thick tank armour: a short hard dull whack and a brief low whir. ${NO_MUSIC}. Very loud, with an immediate hard attack.`, 1, { variants: 4, takes: 5, proc: 'impact' }),
  sfx('nonpen_heavy', 'impacts', `One-shot of a tank shell striking thick armour without penetrating: deep heavy metallic thud, dampened bell-like clang. ${NO_MUSIC}.`, 1.8, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('nonpen_interior', 'impacts', `One-shot heard from inside a tank as a heavy shell slams into the armour outside without penetrating: loud dull bong, hull rattling. ${NO_MUSIC}.`, 2, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('heat_impact', 'impacts', `One-shot of a shaped-charge warhead detonating on tank armour: sharp explosive crack and a hissing jet of molten metal. ${NO_MUSIC}.`, 2, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('he_armor', 'impacts', `One-shot of a high-explosive shell exploding against a tank hull: loud blast with shrapnel peppering steel. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'impact' }),
  // Distant armour hits, crossfaded in by range: what a crew hears of a round striking a tank hundreds of
  // metres away (the close banks above carry the detail up close).
  sfx('impact_far_pen', 'impacts', `Sound effect: a single tank shell punching through armour about 600 metres away, heard across an open battlefield: a sharp distant metallic crack over a heavy low thud, then a short outdoor echo. ${FIELD}, ${NO_MUSIC}.`, 2.5, { inf: 0.6, variants: 3, takes: 5, proc: 'weapon-far' }),
  sfx('impact_far_nonpen', 'impacts', `Sound effect: a single tank shell slamming into thick armour without getting through, about 600 metres away across open ground: a dull heavy distant metallic knock, then a short outdoor echo. ${FIELD}, ${NO_MUSIC}.`, 2.2, { inf: 0.6, variants: 3, takes: 5, proc: 'weapon-far' }),
  sfx('impact_far_ricochet', 'impacts', `Sound effect: a single tank shell glancing off armour about 600 metres away: a hard distant metallic clang and the faint fading whine of the deflected round, then a short outdoor echo. ${FIELD}, ${NO_MUSIC}.`, 2.5, { inf: 0.6, variants: 3, takes: 5, proc: 'weapon-far' }),
  sfx('era_det', 'impacts', `One-shot of an explosive reactive armour tile detonating: very sharp powerful bang and a metal plate flung away. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('bullet_armor', 'impacts', `Sound effect: one single heavy machine-gun bullet hitting thick tank armour: a short hard dull thwack with a brief spark, not a high ping. ${NO_MUSIC}. Very loud, with an immediate hard attack.`, 1, { inf: 0.7, variants: 4, takes: 5, proc: 'impact' }),
  sfx('bullet_dirt', 'impacts', `One-shot of one single bullet impact in dirt: short dull thud and puff. ${NO_MUSIC}.`, 1, { inf: 0.7, variants: 3, takes: 4, proc: 'impact' }),
  sfx('bullet_water', 'impacts', `One-shot of one single bullet hitting water: small sharp splash. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_dirt', 'impacts', `One-shot of a solid tank shell slamming into earth: heavy thump, clods of dirt raining down. ${NO_MUSIC}.`, 2, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('ground_rock', 'impacts', `One-shot of a shell striking rock: sharp crack and stone fragments scattering. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_sand', 'impacts', `One-shot of a shell hitting deep sand: soft heavy whump and a hiss of falling sand. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_snow', 'impacts', `One-shot of a shell hitting deep snow: muffled crunchy thud and snow spray. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_mud', 'impacts', `One-shot of a shell plunging into thick mud: wet heavy splat. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_concrete', 'impacts', `One-shot of a shell hitting a concrete wall: sharp crack and chunks of debris. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_wood', 'impacts', `One-shot of a shell smashing through timber: loud splintering crack. ${NO_MUSIC}.`, 1.6, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('ground_metal', 'impacts', `One-shot of a shell hitting a steel shipping container: loud hollow clang and crumpling metal. ${NO_MUSIC}.`, 1.8, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('water_big', 'impacts', `One-shot of a tank shell plunging into a lake: big heavy splash, the water column falling back. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('water_small', 'impacts', `One-shot of a small projectile splashing into water. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('expl_he_small', 'impacts', `One-shot of an autocannon high-explosive round exploding on the ground: sharp bang and a small spray of debris. ${NO_MUSIC}.`, 2, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('expl_he_medium', 'impacts', `One-shot of a tank high-explosive shell exploding on the ground nearby: powerful blast, dirt and debris raining down. ${FIELD}, ${NO_MUSIC}.`, 3.5, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('expl_he_large', 'impacts', `One-shot of a heavy artillery-size explosion: enormous blast, deep rumble, heavy debris falling. ${FIELD}, ${NO_MUSIC}.`, 5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('expl_far', 'impacts', `One-shot of an explosion far in the distance, about a kilometre: deep muffled boom with a rolling echo. ${FIELD}, ${NO_MUSIC}.`, 4, { variants: 2, takes: 3, proc: 'weapon-far' }),
  sfx('debris_dirt', 'impacts', `One-shot of dirt, gravel and small stones raining down onto the ground after an explosion. ${NO_MUSIC}.`, 3, { variants: 2, takes: 2, proc: 'impact', punch: false }),
];

// ----------------------------------------------------------- destruction ---
const destruction = [
  sfx('tank_explode', 'destruction', `One-shot of an armoured vehicle destroyed by an internal explosion: violent blast, metal tearing, a secondary explosion, debris falling. ${FIELD}, ${NO_MUSIC}.`, 5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('tank_explode_ammo', 'destruction', `One-shot of a tank's ammunition detonating: massive catastrophic explosion, roaring fireball, heavy steel debris crashing down. ${FIELD}, ${NO_MUSIC}.`, 6, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('turret_land', 'destruction', `One-shot of a heavy steel tank turret crashing onto the ground: enormous metallic crunch and thud. ${NO_MUSIC}.`, 2, { variants: 2, takes: 2, proc: 'impact' }),
  sfx('debris_metal', 'destruction', `One-shot of metal debris and shrapnel raining down onto hard ground after an explosion: clanks and rattles. ${NO_MUSIC}.`, 3, { variants: 2, takes: 2, proc: 'impact', punch: false }),
  sfx('cookoff_loop', 'destruction', `Seamless loop of ammunition cooking off inside a burning tank: irregular popping bangs over crackling fire. ${NO_MUSIC}.`, 8, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('wreck_fire_loop', 'destruction', `Seamless loop of a large vehicle fire: roaring flames, steady crackling and popping. ${NO_MUSIC}.`, 8, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('fire_small_loop', 'destruction', `Seamless loop of an engine compartment fire: hissing flames and crackling. ${NO_MUSIC}.`, 6, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('fire_ignite', 'destruction', `One-shot of fuel suddenly igniting: a whoosh into roaring flames. ${NO_MUSIC}.`, 2, { variants: 2, takes: 2, proc: 'impact', punch: false }),
  sfx('metal_creak', 'destruction', `One-shot of hot steel of a burnt-out tank creaking and ticking as it cools. ${NO_MUSIC}.`, 3, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('burnout_blast', 'destruction', `One-shot of a muffled internal explosion in a burning tank: deep heavy whump. ${NO_MUSIC}.`, 3.5, { variants: 1, takes: 2, proc: 'impact' }),
];

// ---------------------------------------------------------------- props ---
const props = [
  sfx('tree_snap', 'props', `One-shot of a tree trunk snapping as a tank pushes it over: loud wood crack and splintering. ${NO_MUSIC}.`, 1.5, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('tree_fall', 'props', `One-shot of a tree falling and crashing through branches onto the ground. ${NO_MUSIC}.`, 3, { variants: 2, takes: 2, proc: 'impact', punch: false }),
  sfx('fence_wood', 'props', `One-shot of a wooden fence smashed by a heavy vehicle: planks breaking and splintering. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('fence_metal', 'props', `One-shot of a metal fence crushed by a heavy vehicle: rattling, scraping and bending steel. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('wall_brick', 'props', `One-shot of a brick wall collapsing: crumbling bricks and dust. ${NO_MUSIC}.`, 3, { variants: 2, takes: 3, proc: 'impact', punch: false }),
  sfx('building_collapse', 'props', `One-shot of a small building collapsing: heavy crumbling masonry, cracking timber, rubble pouring down. ${NO_MUSIC}.`, 5, { variants: 2, takes: 2, proc: 'impact', punch: false }),
  sfx('car_crush', 'props', `One-shot of a tank crushing a car: metal crunching and glass shattering. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('glass_shatter', 'props', `One-shot of window glass shattering. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 2, proc: 'impact' }),
  sfx('container_crush', 'props', `One-shot of a steel shipping container being rammed and dented: hollow booming metal. ${NO_MUSIC}.`, 2, { variants: 1, takes: 2, proc: 'impact' }),
  sfx('crate_break', 'props', `One-shot of a wooden crate smashed to pieces. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 2, proc: 'impact' }),
  sfx('rubble_crunch', 'props', `One-shot of rubble and stones crunching under heavy steel tracks. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 3, proc: 'impact', punch: false }),
  sfx('hedgehog_clang', 'props', `One-shot of a steel anti-tank obstacle knocked over: heavy clanging steel beams. ${NO_MUSIC}.`, 1.5, { variants: 1, takes: 2, proc: 'impact' }),
  sfx('sandbag_thump', 'props', `One-shot of a stack of sandbags pushed over: heavy soft thumps. ${NO_MUSIC}.`, 1.5, { variants: 1, takes: 2, proc: 'impact' }),
  sfx('wire_snag', 'props', `One-shot of barbed wire dragged and snapping under a vehicle: metallic twangs and scrapes. ${NO_MUSIC}.`, 1.5, { variants: 1, takes: 2, proc: 'impact' }),
];

// ----------------------------------------------------------- collisions ---
const collisions = [
  sfx('ram_heavy', 'collisions', `One-shot of two heavy tanks colliding: massive steel impact and grinding metal. ${NO_MUSIC}.`, 2, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('ram_light', 'collisions', `One-shot of an armoured vehicle bumping into another: heavy metal thud. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('hit_rock', 'collisions', `One-shot of a tank hull hitting a large boulder: heavy dull thud and a scrape. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('hit_wall', 'collisions', `One-shot of a tank hitting a concrete wall: heavy impact and crumbling. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('scrape_loop', 'collisions', `Seamless loop of heavy steel scraping and grinding along stone. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
];

// ------------------------------------------------------ vehicle foley ---
const foley = [
  sfx('susp_bump', 'vehicle', `One-shot of a heavy tank's suspension hitting a bump: thud with torsion bar and road wheel rattle. ${NO_MUSIC}.`, 0.8, { variants: 3, takes: 4, proc: 'foley' }),
  sfx('susp_land', 'vehicle', `One-shot of a heavy tank landing hard after leaving the ground: massive thud, suspension slam, track rattle. ${NO_MUSIC}.`, 1.5, { variants: 3, takes: 4, proc: 'impact' }),
  sfx('susp_creak', 'vehicle', `One-shot of a heavy tracked vehicle's suspension creaking under load. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('water_enter', 'vehicle', `One-shot of a heavy armoured vehicle driving into deep water: big splash and wash. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'impact', punch: false }),
  sfx('water_wade_loop', 'vehicle', `Seamless loop of a tank fording through a river: sloshing, churning water around the hull. ${NO_MUSIC}.`, 6, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('mud_suck', 'vehicle', `One-shot of steel tracks pulling out of deep mud: wet sucking squelch. ${NO_MUSIC}.`, 1.5, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('gear_shift', 'vehicle', `One-shot of a heavy military vehicle transmission changing gear: solid mechanical clunk. ${NO_MUSIC}.`, 1, { variants: 3, takes: 4, proc: 'foley' }),
  sfx('brake_squeal', 'vehicle', `One-shot of a heavy tracked vehicle braking hard: metallic brake squeal and tracks skidding. ${NO_MUSIC}.`, 1.8, { variants: 3, takes: 4, proc: 'foley' }),
  sfx('brake_hiss', 'vehicle', `One-shot of a short hydraulic brake release hiss. ${NO_MUSIC}.`, 0.8, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('track_skid_loop', 'vehicle', `Seamless loop of locked steel tracks skidding and sliding across concrete: harsh scraping grind. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('track_squeal_loop', 'vehicle', `Seamless loop of tank tracks squealing and grinding during a sharp pivot turn: screeching steel links and scrubbing. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('track_break', 'vehicle', `One-shot of a tank track snapping: loud metallic snap and heavy track links clattering off the wheels. ${NO_MUSIC}.`, 2, { variants: 2, takes: 3, proc: 'impact' }),
  sfx('hydro_susp', 'vehicle', `One-shot of a hydropneumatic tank suspension adjusting: hydraulic pump whine and a pressurised hiss. ${NO_MUSIC}.`, 2, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('turret_electric_loop', 'vehicle', `Seamless loop of a modern tank's electric turret traverse drive: smooth steady electric motor whir with gear mesh. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('turret_hydraulic_loop', 'vehicle', `Seamless loop of a hydraulic tank turret traverse: hydraulic pump whine with a low gear rumble. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('turret_stop', 'vehicle', `One-shot of a tank turret stopping its traverse: short mechanical clunk. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('elevation_servo_loop', 'vehicle', `Seamless loop of a tank gun elevation servo motor: thin steady electric whine. ${NO_MUSIC}.`, 3, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('engine_knock_loop', 'vehicle', `Seamless loop of a damaged diesel engine knocking and misfiring: irregular clanks and sputtering. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('engine_stall', 'vehicle', `One-shot of a big diesel engine sputtering, coughing and dying. ${NO_MUSIC}.`, 2.5, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('jump_launch', 'vehicle', `One-shot of a powerful hydraulic boost: pressurised hiss and a heavy mechanical clunk. ${NO_MUSIC}.`, 1.5, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('self_right', 'vehicle', `One-shot of a heavy tank rolling back onto its tracks: metal crash, suspension bounce and rattling. ${NO_MUSIC}.`, 2.5, { variants: 1, takes: 2, proc: 'impact', punch: false }),
  sfx('hatch', 'vehicle', `One-shot of a heavy steel tank hatch closing: hinge creak and a solid clank. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 2, proc: 'foley' }),
  sfx('switch_toggle', 'vehicle', `One-shot of a heavy military toggle switch flipped, with a relay click. ${NO_MUSIC}.`, 0.8, { variants: 2, takes: 3, proc: 'foley' }),
];

// --------------------------------------------------------------- engines ---
// Four RPM bands per family, crossfaded and pitched by the engine model,
// plus start-up and shut-down. "no tracks" keeps the running gear separate.
const ENGINE_FAMILIES = {
  turbine_agt: {
    name: 'an M1 Abrams gas turbine tank engine',
    idle: 'idling: high-pitched jet-like whine, airy hiss, faint low hum, no diesel knock',
    low: 'at low power: rising jet turbine whine with a smooth rushing hiss',
    mid: 'at medium power: strong turbine whine and loud rushing exhaust',
    high: 'at full power: screaming jet turbine whine with an intense exhaust roar',
    start: 'starting up: electric starter whir, turbine spooling up into a high whine',
    stop: 'shutting down: turbine whine winding down to silence',
  },
  turbine_gtd: {
    name: 'a Soviet T-80 tank gas turbine engine',
    idle: 'idling: loud whistling turbine whine, rough airy roar, low rumble',
    low: 'at low power: harsh whistling turbine rising, rushing air',
    mid: 'at medium power: powerful howling turbine and exhaust roar',
    high: 'at full power: deafening howling turbine roar with a jet-like scream',
    start: 'starting up: starter whine and a turbine spooling into a loud howl',
    stop: 'shutting down: turbine howl spinning down to silence',
  },
  diesel_v12_soviet: {
    name: 'a Soviet T-72 tank V12 diesel engine',
    idle: 'idling: rough uneven rumbling, clattering exhaust, deep throbbing',
    low: 'at low revs under load: heavy chugging diesel rumble, loud clatter',
    mid: 'at medium revs: aggressive roaring diesel, rattling exhaust',
    high: 'at high revs under full load: loud raw roaring diesel with a hard rattle',
    start: 'starting up: starter grinding, the diesel coughing and catching into a rough idle with black smoke',
    stop: 'shutting down: the diesel shuddering and stopping',
  },
  diesel_two_stroke: {
    name: 'a two-stroke opposed-piston tank diesel engine',
    idle: 'idling: busy buzzing two-stroke diesel, high clattering hum',
    low: 'at low revs under load: hard buzzing howl, rattly exhaust',
    mid: 'at medium revs: screaming two-stroke diesel howl',
    high: 'at full power: piercing screaming two-stroke howl with a raspy exhaust',
    start: 'starting up: starter and a two-stroke diesel catching with a buzzing howl',
    stop: 'shutting down: the buzzing diesel winding down and stopping',
  },
  diesel_v12_modern: {
    name: 'a modern Leopard 2 tank V12 turbo-diesel engine',
    idle: 'idling: deep smooth powerful rumble, gentle turbo whistle, cooling fans',
    low: 'at low revs under load: deep growling turbo-diesel with rising turbo whine',
    mid: 'at medium revs: strong roaring turbo-diesel, turbo whistle, fans',
    high: 'at full power: thunderous roaring V12 turbo-diesel with a loud turbo whine',
    start: 'starting up: starter whine, the V12 firing into a deep smooth idle',
    stop: 'shutting down: the V12 rumbling down and stopping, turbo spinning down',
  },
  diesel_aircooled: {
    name: 'an air-cooled V12 tank diesel engine of an M60 Patton',
    idle: 'idling: loud rumbling diesel with a whooshing cooling fan roar',
    low: 'at low revs under load: chugging diesel and loud cooling fan whine',
    mid: 'at medium revs: roaring diesel with a howling cooling fan',
    high: 'at full power: loud roaring diesel with a screaming cooling fan',
    start: 'starting up: starter grinding and the diesel catching, cooling fan spinning up',
    stop: 'shutting down: diesel stopping and the cooling fan winding down',
  },
  diesel_ifv: {
    name: 'an infantry fighting vehicle V8 diesel engine',
    idle: 'idling: busy mid-pitched diesel rumble, light clatter',
    low: 'at low revs under load: punchy diesel growl rising',
    mid: 'at medium revs: energetic revving diesel roar',
    high: 'at high revs: high-revving loud diesel scream with turbo whine',
    start: 'starting up: starter and a diesel firing into a busy idle',
    stop: 'shutting down: the diesel stopping',
  },
  gasoline_v12: {
    name: 'a World War Two era V12 petrol tank engine',
    idle: 'idling: deep loping burbling V12 petrol rumble',
    low: 'at low revs under load: heavy throaty petrol V12 growl',
    mid: 'at medium revs: powerful throaty roaring V12',
    high: 'at full power: screaming roaring petrol V12, aero-engine like',
    start: 'starting up: starter cranking, the V12 petrol engine catching and burbling',
    stop: 'shutting down: the V12 coughing and stopping',
  },
};

const engines = Object.entries(ENGINE_FAMILIES).flatMap(([family, d]) => [
  ...['idle', 'low', 'mid', 'high'].map((band) => sfx(`engine_${family}_${band}`, 'engines',
    `Seamless loop of ${d.name} ${d[band]}. Constant engine speed, recorded close to the engine deck outside, no track noise, ${NO_MUSIC}.`,
    6, { inf: 0.5, loop: true, variants: 1, takes: 1, proc: 'loop' })),
  sfx(`engine_${family}_start`, 'engines', `One-shot of ${d.name} ${d.start}, recorded outside, no track noise, ${NO_MUSIC}.`, 5, { variants: 1, takes: 2, proc: 'foley' }),
  sfx(`engine_${family}_stop`, 'engines', `One-shot of ${d.name} ${d.stop}, recorded outside, no track noise, ${NO_MUSIC}.`, 4, { variants: 1, takes: 1, proc: 'foley' }),
]);

// ---------------------------------------------------------------- tracks ---
const TRACK_SURFACES = {
  earth: 'over packed dirt and grass',
  hard: 'over asphalt and concrete: bright metallic clatter and squeaks',
  sand: 'through soft sand: muffled crunching and hiss',
  snow: 'through crunchy snow: squeaky compacting crunch',
  mud: 'through wet mud: squelching, sucking and dripping',
};

const tracks = ['light', 'heavy'].flatMap((cls) => Object.entries(TRACK_SURFACES).flatMap(([surface, desc]) => {
  const vehicle = cls === 'light' ? 'a light armoured vehicle\'s steel tracks' : 'a heavy main battle tank\'s steel tracks';
  return [
    sfx(`tracks_${cls}_${surface}_slow`, 'tracks', `Seamless loop of ${vehicle} rolling slowly ${desc}: rhythmic clanking of individual track links, squeaking road wheels, no engine sound, ${NO_MUSIC}.`, 5, { inf: 0.5, loop: true, variants: 1, takes: 1, proc: 'loop' }),
    sfx(`tracks_${cls}_${surface}_fast`, 'tracks', `Seamless loop of ${vehicle} running fast ${desc}: rapid rattling track links and a rumbling roll, no engine sound, ${NO_MUSIC}.`, 5, { inf: 0.5, loop: true, variants: 1, takes: 1, proc: 'loop' }),
  ];
}));

// -------------------------------------------------------------- equipment ---
const equipment = [
  sfx('repair_kit', 'equipment', `One-shot of a tank crew doing a quick field repair: ratchet wrench, hammer strikes on steel, a tool dropped. ${NO_MUSIC}.`, 3, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('first_aid', 'equipment', `One-shot of a medical kit opened in a hurry: zipper, plastic wrapper torn, bandage ripped. ${NO_MUSIC}.`, 2.5, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('extinguisher', 'equipment', `One-shot of an automatic fire suppression system discharging in an engine compartment: sudden powerful pressurised gas blast and hiss. ${NO_MUSIC}.`, 2.5, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('ammo_select', 'equipment', `One-shot of a loader sliding a tank shell back into a steel rack and grabbing another: clunks and a scrape. ${NO_MUSIC}.`, 1.5, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('missile_mode', 'equipment', `One-shot of a tank fire-control system switched to missile mode: a heavy relay clack and a low servo whir. ${NO_MUSIC}.`, 1.2, { variants: 1, takes: 2, proc: 'ui' }),
];

// ------------------------------------------------------------- ambience ---
// Beds: one continuous stereo layer per environment family; maps combine a
// bed with an optional water/machinery layer and a set of positional spot
// sounds (src/audio/environmentScenes.ts owns the per-map recipe).
const AMBIENCE = {
  field: 'open grassland on a breezy day: soft wind through grass, distant songbirds, insects',
  steppe: 'a vast windswept steppe: steady wind through dry tall grass, larks high above, open emptiness',
  forest: 'a temperate deciduous forest: wind rustling leaves, creaking trunks, birdsong',
  pine: 'a pine forest: wind hissing through pine needles, creaking trunks, distant woodpecker',
  orchard: 'a sunny orchard: bees buzzing among fruit trees, songbirds, gentle breeze in leaves',
  coastal: 'a windy coast: waves breaking on rocks, gulls, sea wind',
  wetland: 'a marsh: frogs croaking, insects buzzing, reeds swaying, still water',
  jungle: 'a humid tropical jungle by day: dense insect drone, exotic birds calling, dripping leaves',
  mangrove: 'a mangrove swamp: water lapping between roots, frogs, buzzing insects, distant tropical birds',
  desert: 'a hot desert: dry gusting wind, hissing blown sand, desolate silence',
  oasis: 'a desert oasis: palm fronds rustling, a trickling spring, dry wind, distant desert birds',
  canyon: 'a deep rocky canyon: wind howling between cliffs, a distant river, falling pebbles',
  alpine: 'high mountains: strong cold wind gusts, distant snow sliding, sparse birds',
  polar: 'an arctic blizzard: howling icy wind and blowing snow',
  highwind: 'a high exposed chasm: strong buffeting wind, a long bridge creaking and humming in the gusts',
  volcanic: 'a volcanic caldera: deep geothermal rumble, hissing steam vents, crackling cooling rock',
  industrial: 'a ruined industrial town: wind through broken buildings, distant metal creaks and clanks, flapping sheeting',
  urban: 'a war-torn city: distant fires crackling, settling rubble, a far-off siren, wind in broken windows',
  railyard: 'a rail yard: distant freight wagons clanking, a far train horn, wind over steel rails, buzzing wires',
  foundry: 'an ironworks: deep machinery hum, distant rhythmic hammering, steam venting, metal clanging',
  mine: 'an open-pit mine: dry wind, distant conveyor clatter, heavy machinery rumbling far away',
  airfield: 'a military airfield: open wind, a distant jet engine idling, flags snapping, faint radio chatter tones',
  mars: 'a thin cold alien atmosphere on Mars: faint eerie low wind, desolate hollow silence',
  moon: 'the inside of a sealed armoured vehicle on the Moon: soft electrical hum, faint air recycler hiss, utter silence outside',
};

/** Water and machinery layers placed under a bed on the maps that have them. */
const LAYERS = {
  river: 'a fast river: rushing water over rocks, steady and broad',
  waterfall: 'a distant waterfall: deep constant roar of falling water',
  spillway: 'a dam spillway: powerful rushing torrent of water',
  surf: 'heavy surf: big waves rolling in and crashing on a beach',
  machinery: 'a large factory: steady low drone of machinery and ventilation',
};

const ambience = [
  ...Object.entries(AMBIENCE).map(([biome, desc]) => sfx(`amb_${biome}`, 'ambience',
    `Seamless loop of the ambience of ${desc}. Continuous, even intensity, wide stereo, no engines, no gunfire, ${NO_MUSIC}.`,
    20, { inf: 0.4, loop: true, variants: 1, takes: 1, proc: 'ambience', ch: 'stereo' })),
  sfx('amb_distant_battle', 'ambience', `Seamless loop of a distant battle far beyond the horizon: occasional muffled artillery booms, faint machine gun bursts, low rumble. ${NO_MUSIC}.`, 20, { loop: true, variants: 1, takes: 1, proc: 'ambience', ch: 'stereo' }),
  sfx('amb_garage', 'ambience', `Seamless loop of a large military vehicle hangar: low ventilation hum, distant mechanics working, occasional echoing clank. ${NO_MUSIC}.`, 16, { loop: true, variants: 1, takes: 1, proc: 'ambience', ch: 'stereo' }),
  sfx('distant_artillery', 'ambience', `One-shot of a distant artillery shell exploding many kilometres away: deep rolling rumble. ${NO_MUSIC}.`, 4, { variants: 3, takes: 3, proc: 'weapon-far' }),
  sfx('distant_flak', 'ambience', `One-shot of distant anti-aircraft flak bursts high in the sky: sharp muffled cracks. ${NO_MUSIC}.`, 2, { variants: 2, takes: 2, proc: 'weapon-far' }),
  sfx('distant_mg', 'ambience', `One-shot of a distant machine gun burst far away: rapid faint popping. ${NO_MUSIC}.`, 2.5, { variants: 3, takes: 3, proc: 'weapon-far' }),
  sfx('jet_flyover', 'ambience', `One-shot of a military jet flying over at low altitude: rising roar, passing overhead with a doppler shift, fading away. ${NO_MUSIC}.`, 7, { variants: 2, takes: 2, proc: 'oneshot', ch: 'stereo' }),
  sfx('heli_loop', 'ambience', `Seamless loop of a military helicopter hovering at a distance: steady thumping rotor blades and turbine whine. ${NO_MUSIC}.`, 6, { loop: true, variants: 1, takes: 1, proc: 'loop' }),
  sfx('garage_clank', 'ambience', `One-shot of a tool dropped on a concrete hangar floor with an echo. ${NO_MUSIC}.`, 1.5, { variants: 3, takes: 3, proc: 'foley' }),
  ...Object.entries(LAYERS).map(([layer, desc]) => sfx(`layer_${layer}`, 'ambience',
    `Seamless loop of ${desc}. Continuous, even intensity, no other sounds, ${NO_MUSIC}.`,
    12, { inf: 0.45, loop: true, variants: 1, takes: 1, proc: 'ambience', ch: 'stereo' })),
];

// ---------------------------------------------------------- spot sounds ---
// Short positional one-shots the environment director scatters around the
// listener (random bearing, 40–400 m) so a map never sounds like a loop.
const SPOTS = [
  ['songbird', 'a songbird singing a short phrase', 3, 3],
  ['crow', 'a crow cawing twice', 2, 2],
  ['lark', 'a skylark trilling high above', 3, 2],
  ['hawk', 'a hawk screeching in the sky', 2, 2],
  ['eagle', 'an eagle crying out over a valley', 2.5, 1],
  ['woodpecker', 'a woodpecker drumming on a tree trunk', 2, 2],
  ['gulls', 'seagulls crying overhead', 3, 2],
  ['geese', 'a flock of geese honking as they fly past', 3.5, 1],
  ['heron', 'a heron croaking harshly', 1.5, 1],
  ['tropical_bird', 'an exotic tropical bird calling', 2.5, 3],
  ['cicadas', 'a burst of cicadas buzzing then fading', 4, 2],
  ['frog', 'a large frog croaking', 1.5, 2],
  ['bees', 'bees buzzing past', 2.5, 1],
  ['dog', 'a dog barking in the distance', 2, 2],
  ['cowbell', 'distant cowbells and a cow lowing', 3, 1],
  ['foghorn', 'a ship foghorn sounding far away', 4, 1],
  ['buoy_bell', 'a buoy bell clanging in the swell', 3, 1],
  ['wave_crash', 'a big wave crashing on rocks', 3, 2],
  ['train_horn', 'a freight train horn sounding far away', 3.5, 2],
  ['wagon_clank', 'freight wagons bumping and clanking together', 2.5, 2],
  ['steam_hiss', 'a burst of steam hissing from a valve', 2, 2],
  ['crane_chain', 'a heavy crane chain rattling', 2.5, 1],
  ['forge_hammer', 'a distant heavy forge hammer striking metal twice', 2.5, 2],
  ['metal_groan', 'a large steel structure groaning in the wind', 3, 2],
  ['conveyor', 'a mine conveyor belt clattering', 3, 1],
  ['siren_far', 'a distant air-raid siren rising and falling', 5, 1],
  ['car_alarm', 'a car alarm going off far away', 3, 1],
  ['glass_fall', 'broken glass falling from a window onto pavement', 1.5, 2],
  ['debris_settle', 'loose rubble and bricks settling in a ruined building', 2, 2],
  ['rockfall', 'small rocks tumbling down a cliff', 2.5, 2],
  ['ice_crack', 'lake ice cracking with a deep twang', 2, 2],
  ['snow_slide', 'snow sliding off a branch and thumping down', 1.5, 1],
  ['wind_gust', 'a strong gust of wind whooshing past', 3, 3],
  ['windmill', 'an old windmill creaking as it turns', 3, 1],
  ['flag_flap', 'a flag snapping and flapping in strong wind', 3, 1],
  ['cable_hum', 'steel bridge cables humming and creaking in the wind', 3.5, 1],
  ['vent_hiss', 'a volcanic steam vent hissing loudly', 3, 2],
  ['geo_rumble', 'a deep geothermal rumble from underground', 3.5, 1],
  ['dust_devil', 'a dust devil whirling past', 3.5, 1],
  ['jet_taxi', 'a jet engine spooling up on a distant runway', 4, 1],
  ['fire_crackle', 'a building fire crackling and popping', 3, 2],
  ['radio_far', 'a distant military radio squawking with static', 2, 2],
];

const spots = SPOTS.map(([id, desc, dur, variants]) => sfx(`spot_${id}`, 'spots',
  `One-shot of ${desc}, outdoors at a distance, natural. ${NO_MUSIC}.`, dur, { variants, takes: variants, proc: 'spot' }));

// ------------------------------------------------------------ edge cases ---
const edgeCases = [
  sfx('dry_fire', 'edge', `One-shot of a tank gun firing circuit clicking on an empty breech: a dry metallic click with a dull electrical clunk, nothing fires. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('gun_limit', 'edge', `One-shot of a tank gun hitting its mechanical elevation stop: heavy dull steel clunk. ${NO_MUSIC}.`, 1, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('traverse_grind_loop', 'edge', `Seamless loop of a damaged tank turret ring grinding while turning: straining motor and scraping steel bearings. ${NO_MUSIC}.`, 3, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('rollover', 'edge', `One-shot of a heavy tank rolling over onto its side: tumbling crashing steel, loose equipment clattering. ${NO_MUSIC}.`, 3, { variants: 2, takes: 2, proc: 'impact', punch: false }),
  sfx('overturned_groan', 'edge', `One-shot of an overturned tank lying on its side: steel groaning under its own weight, road wheels spinning freely. ${NO_MUSIC}.`, 3, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('engine_flood', 'edge', `One-shot of a diesel engine choking as water floods the intake: gurgling bubbles, sputtering, dying. ${NO_MUSIC}.`, 3, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('bubbles_loop', 'edge', `Seamless loop of heavy bubbling as a vehicle sits submerged in deep water. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 1, proc: 'loop' }),
  sfx('hull_debris_patter', 'edge', `One-shot of dirt clods and small stones raining down onto a steel tank hull after a near miss. ${NO_MUSIC}.`, 2, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('scope_in', 'edge', `One-shot of a tank gunner pressing his face into the sight's rubber brow pad: soft leather contact and a low mechanical shutter clunk. ${NO_MUSIC}.`, 1, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('scope_out', 'edge', `One-shot of a tank gunner pulling back from the sight: a soft leather creak and a low mechanical clunk. ${NO_MUSIC}.`, 0.8, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('zoom_step', 'edge', `One-shot of a gun sight zoom lens changing magnification: quick mechanical ratchet click with a tiny motor. ${NO_MUSIC}.`, 0.8, { variants: 2, takes: 3, proc: 'foley' }),
  sfx('lock_on', 'edge', `One-shot of a tank fire-control system locking a target, heard through a crew headset: one short low muffled tone. ${NO_MUSIC}.`, 1, { variants: 1, takes: 2, proc: 'ui' }),
  sfx('lock_off', 'edge', `One-shot of a tank fire-control lock released, heard through a crew headset: one short low muffled falling tone. ${NO_MUSIC}.`, 0.8, { variants: 1, takes: 2, proc: 'ui' }),
  sfx('missile_warning', 'edge', `One-shot of a vehicle missile approach warning: rapid urgent electronic beeping. ${NO_MUSIC}.`, 2, { variants: 1, takes: 2, proc: 'ui' }),
  sfx('roof_gun_servo', 'edge', `One-shot of a remote weapon station powering up: servo whir and a bolt charging clack. ${NO_MUSIC}.`, 1.4, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('lights_on', 'edge', `One-shot of armoured vehicle headlights switched on: heavy switch click and a relay clunk with a faint electrical hum. ${NO_MUSIC}.`, 1, { variants: 1, takes: 2, proc: 'foley' }),
  sfx('killcam_in', 'edge', `One-shot cinematic slow-motion transition: deep reversed whoosh dropping in pitch into a heavy low thud. ${NO_MUSIC}.`, 2, { variants: 1, takes: 2, proc: 'ui', ch: 'stereo' }),
  sfx('killcam_out', 'edge', `One-shot cinematic time-speed-up transition: rising whoosh snapping back to normal speed. ${NO_MUSIC}.`, 1.5, { variants: 1, takes: 2, proc: 'ui', ch: 'stereo' }),
  sfx('spectate_switch', 'edge', `One-shot of a military camera feed switching: a short low static thump. ${NO_MUSIC}.`, 1, { variants: 1, takes: 2, proc: 'ui' }),
  sfx('interior_hum_loop', 'edge', `Seamless loop of the inside of a running tank: electrical hum, ventilation fans, muffled engine throb through the hull. ${NO_MUSIC}.`, 6, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('interior_rattle_loop', 'edge', `Seamless loop inside a moving tank: equipment rattling, steel creaking and vibrating as it drives over rough ground. ${NO_MUSIC}.`, 5, { loop: true, variants: 1, takes: 2, proc: 'loop' }),
  sfx('tinnitus', 'edge', `One-shot of ears ringing after a close explosion: a thin high-pitched ringing tone fading slowly, everything else muffled. ${NO_MUSIC}.`, 6, { variants: 1, takes: 2, proc: 'foley' }),
];

// ----------------------------------------------------------- radio net ---
// The intercom chain itself is real-time DSP (band-limit, drive, noise bed);
// these are the keyed elements that make it read as a radio.
const radio = [
  sfx('radio_key_in', 'radio', `One-shot of a military radio push-to-talk key: a short click followed by a brief burst of static. ${NO_MUSIC}.`, 0.6, { inf: 0.6, variants: 3, takes: 4, proc: 'radio' }),
  sfx('radio_key_out', 'radio', `One-shot of a military radio transmission ending: squelch tail, a soft chirp and a static hiss cutting off. ${NO_MUSIC}.`, 0.6, { inf: 0.6, variants: 3, takes: 4, proc: 'radio' }),
  sfx('radio_static_loop', 'radio', `Seamless loop of low military radio static and faint crackle under an open channel. ${NO_MUSIC}.`, 4, { loop: true, variants: 1, takes: 2, proc: 'radio' }),
  sfx('radio_interference', 'radio', `One-shot of a damaged radio: harsh crackling interference bursts and dropouts. ${NO_MUSIC}.`, 1.2, { variants: 2, takes: 3, proc: 'radio' }),
];

// ------------------------------------------------------------ interface ---
// A serious war game's interface is heavy hardware, not a jingle: steel
// latches, console switches, low brass. Nothing bright, chiming or beeping.
const UI = 'heavy military hardware sound for a serious war game interface, low and dull, short, no beeps, no chimes, no electronic tones';
const UI_BRASS = 'short grave military brass and drum accent for a serious war game, low register, no fanfare, no vocals';
const ui = [
  sfx('ui_click', 'ui', `One-shot ${UI}: a heavy armoured-vehicle console push button pressed, a short dull mechanical clunk with no ring.`, 0.5, { inf: 0.6, variants: 2, takes: 4, proc: 'ui' }),
  sfx('ui_hover', 'ui', `One-shot ${UI}: a very quiet soft cloth-muffled tap on steel.`, 0.5, { inf: 0.6, variants: 1, takes: 2, proc: 'ui' }),
  sfx('ui_toggle', 'ui', `One-shot ${UI}: a heavy military toggle switch thrown, a solid low mechanical clack.`, 0.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_back', 'ui', `One-shot ${UI}: a heavy steel latch released, a short low clunk.`, 0.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_confirm', 'ui', `One-shot ${UI}: a heavy steel bolt sliding home and locking, a firm low clunk.`, 0.8, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_error', 'ui', `One-shot ${UI}: a heavy lever hitting its mechanical stop, a short dull knock with a slight rattle.`, 0.7, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_tab', 'ui', `One-shot ${UI}: a heavy steel map drawer sliding shut, a short low scrape and thud.`, 0.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_tank_select', 'ui', `One-shot ${UI}: a heavy mechanical clunk with a low hydraulic hiss, a tank lifted into place.`, 1.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_deploy', 'ui', `One-shot ${UI}: a heavy steel tank hatch slammed shut, a deep booming clang in a large space.`, 2, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_countdown_tick', 'ui', `One-shot ${UI}: a single heavy mechanical clock escapement tick, low and dull.`, 0.6, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_countdown_go', 'ui', `One-shot ${UI_BRASS}: battle begins, a deep distant artillery thud and one short low horn blast.`, 1.6, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_capture_tick', 'ui', `One-shot ${UI}: a single low muffled relay click of an old field telephone.`, 0.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_objective_gain', 'ui', `One-shot ${UI_BRASS}: objective secured, one low solemn brass note over a deep timpani hit.`, 1.6, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_objective_loss', 'ui', `One-shot ${UI_BRASS}: objective lost, a low ominous brass swell with a muffled drum.`, 1.6, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_alert', 'ui', `One-shot ${UI}: two short heavy klaxon blasts inside a tank, low and muffled.`, 0.9, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_pickup', 'ui', `One-shot ${UI}: a heavy steel ammunition crate set down and latched, a dull clunk and a latch.`, 1, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_goal', 'ui', `One-shot ${UI_BRASS}: goal scored, a deep low horn blast with a heavy impact.`, 2, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_ball_hit', 'ui', `One-shot of a huge heavy ball struck by a tank: deep hollow boom.`, 0.8, { variants: 2, takes: 2, proc: 'impact' }),
  sfx('ui_respawn', 'ui', `One-shot ${UI}: a heavy steel bolt locking and a diesel engine catching, low and solid.`, 1.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_flag_taken', 'ui', `One-shot ${UI_BRASS}: flag taken, a tense low two-note brass stab.`, 1.2, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_flag_captured', 'ui', `One-shot ${UI_BRASS}: flag captured, a bold low brass hit with a deep drum.`, 1.8, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_flag_returned', 'ui', `One-shot ${UI_BRASS}: flag returned, one warm low brass note.`, 1.2, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_flag_dropped', 'ui', `One-shot ${UI_BRASS}: flag dropped, a short falling low brass note.`, 1, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_wave_clear', 'ui', `One-shot ${UI_BRASS}: wave cleared, a quiet low resolving brass chord.`, 1.6, { variants: 1, takes: 3, proc: 'ui', ch: 'stereo' }),
  sfx('ui_line_advance', 'ui', `One-shot ${UI_BRASS}: front line advanced, a deep marching snare roll into a heavy low drum hit.`, 1.5, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_score', 'ui', `One-shot ${UI}: a heavy mechanical tally counter clunking over once, low.`, 1, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_ready', 'ui', `One-shot ${UI}: a heavy breech lever locking, a firm low double clunk.`, 0.8, { variants: 1, takes: 3, proc: 'ui' }),
  sfx('ui_slider', 'ui', `One-shot ${UI}: one small heavy detent click of a steel dial, low and dull.`, 0.5, { variants: 1, takes: 3, proc: 'ui' }),
];

// -------------------------------------------------------------- stingers ---
// Grave war-film stings: low brass, timpani, restraint. No fanfares.
const STING = 'short grave cinematic war film sting, low brass and timpani, dark and serious, no fanfare, no vocals';
const stingers = [
  sfx('sting_garage', 'stingers', `One-shot ${STING}: a single low brass chord over a deep timpani hit, then silence.`, 5, { variants: 1, takes: 3, proc: 'sting', ch: 'stereo' }),
  sfx('sting_battle', 'stingers', `One-shot ${STING}: battle begins, a distant low war horn over one thunderous timpani hit.`, 4, { variants: 1, takes: 3, proc: 'sting', ch: 'stereo' }),
  sfx('sting_victory', 'stingers', `One-shot ${STING}: victory, a solemn low brass chord resolving over a soft timpani roll.`, 6, { variants: 1, takes: 3, proc: 'sting', ch: 'stereo' }),
  sfx('sting_defeat', 'stingers', `One-shot ${STING}: defeat, very low falling brass and a muffled drum, mournful.`, 6, { variants: 1, takes: 3, proc: 'sting', ch: 'stereo' }),
  sfx('sting_draw', 'stingers', `One-shot ${STING}: an unresolved ending, two flat low horn calls.`, 4, { variants: 1, takes: 3, proc: 'sting', ch: 'stereo' }),
  sfx('sting_wave', 'stingers', `One-shot ${STING}: an enemy wave approaching, low war drums building, no melody.`, 3, { variants: 1, takes: 3, proc: 'sting', ch: 'stereo' }),
];

export const SFX_CATALOG = Object.freeze([
  ...weapons, ...autocannons, ...machineGuns, ...launchers, ...mechanisms, ...flybys,
  ...impacts, ...destruction, ...props, ...collisions, ...foley, ...engines, ...tracks,
  ...equipment, ...ambience, ...spots, ...edgeCases, ...radio, ...ui, ...stingers,
]);

/** Generated seconds (credits ≈ 10 per second on the sound-effects model). */
export function catalogSeconds(entries = SFX_CATALOG) {
  return entries.reduce((sum, e) => sum + e.dur * e.takes, 0);
}

const ids = new Set();
for (const entry of SFX_CATALOG) {
  if (ids.has(entry.id)) throw new Error(`duplicate sfx id ${entry.id}`);
  ids.add(entry.id);
  if (entry.takes < entry.variants) throw new Error(`${entry.id}: takes < variants`);
  if (entry.dur < 0.5 || entry.dur > 30) throw new Error(`${entry.id}: duration out of range`);
}
