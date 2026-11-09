#!/usr/bin/env python3
"""tools/audio/sfx-critic.py — the ear proxy for gun reports (gun-reports-269, owner 2026-11-04: "it still sounds like
guns instead of tank cannons").

A blind critic: Google's YAMNet AudioSet classifier (the MediaPipe float32 TFLite model, run locally with LiteRT; no
paid service) scores each sound on its event frames (those within 10 dB of the loudest, so a long rolling echo does not
dilute the blast it follows), and a verdict applies the pass rule below.

The rule's history, kept because each step was forced by evidence rather than by the takes it judged:
  v1 (Main's ruling): cannons rank Artillery fire / Boom / Explosion above Gunshot / Cap gun. The negative control (the
     2026-11-03 cracks the owner rejected) passed it: YAMNet fires Explosion beside Gunshot on a crack.
  v2: Artillery fire / Boom only. Every rejected crack failed, but YAMNet scarcely fires either class at all (never over
     0.33, on booms or cracks), so the pilot booms failed too, on noise.
  v3 (this): a boom is heard as an explosion far more than as a gunshot. The rejected cracks read Explosion 1.0-1.4x
     Gunshot; the pilot's booms 2-4x. Machine guns are judged as the burst the engine fires. Two classes were assigned
     wrongly in the first full run and are named here: a closed turret's report is muffled by armour whatever the
     weapon (`interior`, the cannon-interior rule, for autocannons and roof guns too), and a missile fired through a
     gun is that gun's low-pressure boom with its motor after it (`rocket-gun`). Two measurements were refined on the
     same run: a rocket's motor follows its launch blast and is quieter, so rockets are scored on the frames within
     20 dB of the loudest (the 10 dB window kept only the blast); and YAMNet fires Machine gun and Gunshot within a few
     per cent of each other on a real burst (0.58/0.60, 0.87/0.88), so a burst passes level within 5 % (the rejected
     bursts read 0.06 and 0.34 times).

  cannon           close and own reports of tank guns, howitzers, gun-launchers, the demolition gun, the AC-130's
                   howitzer: E = best of Explosion / Artillery fire / Boom is at least 0.1 and at least 2x the best of
                   Gunshot, gunfire / Cap gun.
  cannon-far       E (with Thunder / Rumble) at least 0.02 and 2x Gunshot / Cap gun.
  explosion        a blast that is no gun's report (world-sfx-269: a vehicle going up, a burnout, an APS intercept): the
                   cannon rule. The first light-vehicle prompt was heard as tools, steam and an engine.
  interior         a closed turret's report (any weapon's): E (with Thump, thud / Bang / Rumble) at least 0.02 and
                   2x Gunshot / Cap gun.
  autocannon       one round: E (with Machine gun) at least 0.1 and 1.2x Gunshot / Cap gun (heavier than a gunshot).
                   Its burst render is reported, not ruled: overlapping rounds read as rumble.
  mg               one round: never a toy (Machine gun / Fusillade / Gunshot / Explosion above Cap gun / Firecracker);
                   the burst render (--burst N:GAP at the gun's rate) ranks Machine gun level with Gunshot (within 5 %),
                   and at least 0.25.
  rocket           a launch, on its frames within 20 dB of the loudest: its motor (Whoosh, swoosh, swish / Hiss / Jet
                   engine) at least 0.05 and above Gunshot / Cap gun / Machine gun.
  rocket-salvo     the TOS-1A ripple: the same with Artillery fire among the motor's classes.
  rocket-gun       a missile fired through a gun: the cannon rule, and its motor (Whoosh / Hiss / Jet engine) at least
                   0.05.

Air Support's call-ins (air-support-270, 2026-11-05; written before the first take was generated):
  jet              a strike jet's engine loop heard from the ground: Jet engine / Aircraft / Aircraft engine / Fixed-wing
                   aircraft at least 0.1 and above every noise it could be mistaken for (Vacuum cleaner / Hair dryer /
                   Wind / Rain / Steam / White noise / Helicopter).
  gau8             the A-10's 30 mm rotary cannon burst: a gun (Machine gun / Fusillade / Gunshot / Artillery fire /
                   Explosion) at least 0.1 and above every motor or tool its buzz could be heard as (Chainsaw / Power tool /
                   Drill / Jackhammer / Motorcycle / Engine / Race car / Lawn mower / Buzz / Vacuum cleaner / Fart).
  incoming         a falling shell's or bomb's whistle: Whistle / Whistling / Whoosh at least 0.05 and above the blast it
                   must not yet be (Explosion / Boom / Artillery fire) and every toy or tune it could be (Music / Musical
                   instrument / Flute / Bird / Train whistle / Steam whistle / Siren).
  alarm            the targeted crew's warning in the hull: Alarm / Beep / Buzzer / Siren / Smoke detector / Car alarm /
                   Fire alarm / Civil defense siren at least 0.1 and above Music / Musical instrument / Speech / Bird /
                   Video game music.

Raw takes (.pcm) are the cache's 48 kHz stereo s16le; anything else is decoded by ffmpeg. A --burst N:GAP option
renders N copies GAP seconds apart (the engine's cyclic rate) before scoring.
"""
import json
import subprocess
import sys
import zipfile

import numpy as np

SR = 16000
FRAME = 15600  # 0.975 s, YAMNet's patch
HOP = 7680  # 0.48 s

POSITIVE = {
    'cannon': ['Explosion', 'Artillery fire', 'Boom'],
    'explosion': ['Explosion', 'Artillery fire', 'Boom'],
    'cannon-far': ['Explosion', 'Artillery fire', 'Boom', 'Thunder', 'Rumble'],
    'interior': ['Explosion', 'Artillery fire', 'Boom', 'Thump, thud', 'Bang', 'Rumble'],
    'rocket-gun': ['Explosion', 'Artillery fire', 'Boom'],
    'autocannon': ['Explosion', 'Artillery fire', 'Boom', 'Machine gun'],
    'autocannon-burst': ['Machine gun', 'Fusillade', 'Artillery fire', 'Boom', 'Explosion'],
    'mg': ['Machine gun', 'Fusillade', 'Gunshot, gunfire', 'Explosion'],
    'mg-burst': ['Machine gun'],
    'rocket': ['Whoosh, swoosh, swish', 'Hiss', 'Jet engine'],
    'rocket-salvo': ['Whoosh, swoosh, swish', 'Hiss', 'Jet engine', 'Artillery fire'],
    'jet': ['Jet engine', 'Aircraft', 'Aircraft engine', 'Fixed-wing aircraft, airplane'],
    'gau8': ['Machine gun', 'Fusillade', 'Gunshot, gunfire', 'Artillery fire', 'Explosion'],
    'incoming': ['Whistle', 'Whistling', 'Whoosh, swoosh, swish'],
    'alarm': ['Alarm', 'Beep, bleep', 'Buzzer', 'Siren', 'Smoke detector, smoke alarm', 'Car alarm', 'Fire alarm', 'Civil defense siren'],
}
NEGATIVE = {
    'cannon': ['Gunshot, gunfire', 'Cap gun'],
    'explosion': ['Gunshot, gunfire', 'Cap gun'],
    'cannon-far': ['Gunshot, gunfire', 'Cap gun'],
    'interior': ['Gunshot, gunfire', 'Cap gun'],
    'rocket-gun': ['Gunshot, gunfire', 'Cap gun'],
    'autocannon': ['Gunshot, gunfire', 'Cap gun'],
    'autocannon-burst': ['Gunshot, gunfire', 'Cap gun'],
    'mg': ['Cap gun', 'Firecracker'],
    'mg-burst': ['Gunshot, gunfire', 'Cap gun'],
    'rocket': ['Gunshot, gunfire', 'Cap gun', 'Machine gun'],
    'rocket-salvo': ['Gunshot, gunfire', 'Cap gun', 'Machine gun'],
    'jet': ['Vacuum cleaner', 'Hair dryer', 'Wind', 'Wind noise (microphone)', 'Rain', 'Steam', 'White noise', 'Helicopter'],
    'gau8': ['Chainsaw', 'Power tool', 'Drill', 'Jackhammer', 'Motorcycle', 'Engine', 'Race car, auto racing', 'Lawn mower', 'Buzz',
             'Vacuum cleaner', 'Fart'],
    'incoming': ['Explosion', 'Boom', 'Artillery fire', 'Music', 'Musical instrument', 'Flute', 'Bird', 'Train whistle', 'Steam whistle',
                 'Siren'],
    'alarm': ['Music', 'Musical instrument', 'Speech', 'Bird', 'Video game music'],
}
# The least score at which a class is heard at all, and how many times the gun-like class it must outrank.
FLOOR = {'cannon': 0.1, 'explosion': 0.1, 'cannon-far': 0.02, 'interior': 0.02, 'autocannon': 0.1, 'mg-burst': 0.25, 'rocket': 0.05, 'rocket-salvo': 0.05,
         'rocket-gun': 0.1, 'jet': 0.1, 'gau8': 0.1, 'incoming': 0.05, 'alarm': 0.1}
MARGIN = {'cannon': 2, 'explosion': 2, 'cannon-far': 2, 'interior': 2, 'autocannon': 1.2, 'mg-burst': 0.95, 'rocket-gun': 2}
# The event frames: within 10 dB of the loudest (a long echo must not dilute the blast), 20 dB for a rocket's motor.
WINDOW = {'rocket': 0.1, 'rocket-salvo': 0.1, 'rocket-gun': 0.1}
MOTOR = ['Whoosh, swoosh, swish', 'Hiss', 'Jet engine']
REPORT = sorted({label for group in (POSITIVE, NEGATIVE) for labels in group.values() for label in labels}
                | {'Thump, thud', 'Bang', 'Rumble', 'Thunder', 'Firecracker', 'Burst, pop'})


def decode(path):
    if path.endswith('.pcm'):
        cmd = ['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', path]
    else:
        cmd = ['ffmpeg', '-v', 'error', '-i', path]
    cmd += ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, check=True, capture_output=True).stdout, dtype=np.float32).copy()


def burst(wave, n, gap):
    step = int(gap * SR)
    out = np.zeros(step * (n - 1) + len(wave), dtype=np.float32)
    for i in range(n):
        out[i * step:i * step + len(wave)] += wave
    peak = np.max(np.abs(out)) or 1
    return out / peak * min(1, peak)


def frames(wave):
    if len(wave) < FRAME:
        wave = np.pad(wave, (0, FRAME - len(wave)))
    starts = range(0, len(wave) - FRAME + 1, HOP)
    return [wave[s:s + FRAME] for s in starts]


def main(argv):
    from ai_edge_litert.interpreter import Interpreter
    model = argv[argv.index('--model') + 1]
    klass = argv[argv.index('--class') + 1]
    spec = argv[argv.index('--burst') + 1] if '--burst' in argv else None
    skip = {i for i, a in enumerate(argv) if a in ('--model', '--class', '--burst')}
    files = [a for i, a in enumerate(argv) if i not in skip and i - 1 not in skip and not a.startswith('--')]
    labels = zipfile.ZipFile(model).read('yamnet_label_list.txt').decode().splitlines()
    index = {name: i for i, name in enumerate(labels)}
    interp = Interpreter(model_path=model)
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]['index']
    out = interp.get_output_details()[0]['index']
    rule = f'{klass}-burst' if spec and klass in ('mg', 'autocannon') else klass
    for path in files:
        wave = decode(path)
        if spec:
            n, gap = spec.split(':')
            wave = burst(wave, int(n), float(gap))
        chunks = frames(wave)
        energy = np.array([float(np.sqrt(np.mean(c * c)) + 1e-9) for c in chunks])
        keep = energy >= energy.max() * WINDOW.get(rule, 0.316)
        scores = []
        for c, k in zip(chunks, keep):
            if not k:
                continue
            interp.set_tensor(inp, c.astype(np.float32))
            interp.invoke()
            scores.append(np.array(interp.get_tensor(out)).reshape(-1))
        mean = np.mean(scores, axis=0)
        report = {name: round(float(mean[index[name]]), 4) for name in REPORT}
        pos = max(POSITIVE[rule], key=lambda n: mean[index[n]])
        neg = max(NEGATIVE[rule], key=lambda n: mean[index[n]])
        top = labels[int(np.argmax(mean))]
        verdict = {
            'file': path, 'class': rule,
            'pass': bool(mean[index[pos]] >= FLOOR.get(rule, 0)
                         and (mean[index[pos]] >= MARGIN[rule] * mean[index[neg]] if rule in MARGIN else mean[index[pos]] > mean[index[neg]])
                         and (rule != 'rocket-gun' or max(mean[index[n]] for n in MOTOR) >= 0.05)),
            'best': pos, 'bestScore': round(float(mean[index[pos]]), 4), 'against': neg,
            'againstScore': round(float(mean[index[neg]]), 4), 'top': top, 'scores': report,
        }
        print(json.dumps(verdict), flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
