#!/bin/zsh
# Lane tool (envelope-honesty-264): icons.zsh with the batches read from a file when the hold starts (one id list a line;
# lines already rendered are listed in <file>.done), so a ticket queued early renders whatever is merged by then.
#   .qa-dev/envelope/icons-file.zsh <log> <ids-file>
setopt NO_BG_NICE
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264}
LOG=$1; F=$2
touch $F.done
batches=()
while IFS= read -r line; do [ -n "$line" ] && ! grep -qxF "$line" $F.done && batches+=("$line"); done < $F
echo "== icons-file: ${#batches[@]} batch(es) from $F $(date +%T)" >> $LOG
[ ${#batches[@]} -eq 0 ] && exit 0
.qa-dev/envelope/icons.zsh $LOG "${batches[@]}"
rc=$?
[ $rc -eq 0 ] && for b in "${batches[@]}"; do echo "$b" >> $F.done; done
# the asset gate for the ids just rendered (manifest rows, hashes, technical labels, muzzle bores)
all=${(j:,:)batches}
echo "-- tank-assets-check $all $(date +%T)" >> $LOG
perl -e 'alarm 1200; exec @ARGV' node --max-old-space-size=4096 tools/tank-assets-check.mjs --ids=$all >> $LOG 2>&1
echo "-- tank-assets-check rc=$? $(date +%T)" >> $LOG
exit $rc
