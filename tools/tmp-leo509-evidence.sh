#!/bin/zsh
# leo-509 evidence: before/after crops through the old revolution gap sightlines
set -e
cd /Users/kevinliu/claude-of-tanks
B=shots/leo-509/before
A=shots/leo-509/final/leo2_revolution
O=shots/leo-509/evidence
mkdir -p $O
# G1: rest view-rear corridor pockets (x145-163 y305-319 + x611-638)
python3 tools/tmp-leo509-crop.py $B/leo2_revolution/view-rear.png       $O/g1-rear-before.png 100 260 260 360 3
python3 tools/tmp-leo509-crop.py $A/view-rear.png                      $O/g1-rear-after.png  100 260 260 360 3
python3 tools/tmp-leo509-crop.py $B/leo2_revolution/view-rear.png       $O/g1b-rearL-before.png 580 260 700 360 3
python3 tools/tmp-leo509-crop.py $A/view-rear.png                      $O/g1b-rearL-after.png  580 260 700 360 3
# G2: rest view-top tail slits (x278-280 / x487-489, y74-175)
python3 tools/tmp-leo509-crop.py $B/leo2_revolution/view-top.png        $O/g2-top-before.png 240 50 530 240 2
python3 tools/tmp-leo509-crop.py $A/view-top.png                       $O/g2-top-after.png  240 50 530 240 2
# G3: yaw90 close-roof corner pocket (x122-143 y171-198)
python3 tools/tmp-leo509-crop.py $B/leo2_revolution-yaw90/close-roof.png $O/g3-yaw90roof-before.png 60 110 260 260 3
python3 tools/tmp-leo509-crop.py ${A}-yaw90/close-roof.png              $O/g3-yaw90roof-after.png  60 110 260 260 3
# G4: yaw45 view-rearright bustle lattice (x543-578 y340-362)
python3 tools/tmp-leo509-crop.py $B/leo2_revolution-yaw45/view-rearright.png $O/g4-yaw45rr-before.png 480 300 640 400 3
python3 tools/tmp-leo509-crop.py ${A}-yaw45/view-rearright.png              $O/g4-yaw45rr-after.png  480 300 640 400 3
# G5: rest view-rearleft under-rack band (x154-174 y339-363)
python3 tools/tmp-leo509-crop.py $B/leo2_revolution/view-rearleft.png   $O/g5-rl-before.png 120 280 320 400 3
python3 tools/tmp-leo509-crop.py $A/view-rearleft.png                  $O/g5-rl-after.png  120 280 320 400 3
# G6: yaw45 view-front under-RWS air (x272-318 y269-278)
python3 tools/tmp-leo509-crop.py $B/leo2_revolution-yaw45/view-front.png $O/g6-yaw45front-before.png 230 230 370 320 4
python3 tools/tmp-leo509-crop.py ${A}-yaw45/view-front.png              $O/g6-yaw45front-after.png  230 230 370 320 4
echo EVIDENCE-DONE
