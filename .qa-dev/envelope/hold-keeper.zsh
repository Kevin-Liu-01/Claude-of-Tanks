#!/bin/zsh
# Lane tool (envelope-honesty-264): keep a file-driven render hold queued. When its lockrun exits before the hold ran
# (a 4 h acquire timeout), start it again under the same place key, which keeps the queue stamp. Stops once <log> shows
# the done marker.
#   hold-keeper.zsh <place> <script> <log> <ids-file> <done-marker>
setopt NO_BG_NICE
cd $HOME/cot-lanes/envelope-honesty-264
PLACE=$1; SCRIPT=$2; LOG=$3; F=$4; DONE=$5
while ! grep -q "$DONE" $LOG 2>/dev/null; do
  if ! pgrep -f "lockrun.mjs --place=$PLACE " > /dev/null; then
    echo "[keeper $(date +%T)] (re)queue $PLACE" >> $LOG.keeper
    perl -e 'alarm 36000; exec @ARGV' node .qa-dev/envelope/lockrun.mjs --place=$PLACE -- /bin/zsh $SCRIPT $LOG $F >> $LOG.keeper 2>&1 &
  fi
  sleep 60
done
echo "[keeper $(date +%T)] done" >> $LOG.keeper
