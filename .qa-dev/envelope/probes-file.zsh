#!/bin/zsh
# Lane tool (envelope-honesty-264): inside one render hold, the release gate's browser fleet probes for the ids listed in
# a file when the hold starts (comma lists, one a line; done lines in <file>.done): module-visual-align (anatomy against
# the drawn build), presentation centering, track duplicates, muzzle bores.
#   .qa-dev/envelope/probes-file.zsh <log> <ids-file>
setopt NO_BG_NICE
cd ${ROOT:-$HOME/cot-lanes/envelope-honesty-264}
LOG=$1; F=$2; touch $F.done
ids=(); while IFS= read -r line; do [ -n "$line" ] && ! grep -qxF "$line" $F.done && ids+=("$line"); done < $F
echo "== probes hold taken $(date +%T): ${#ids[@]} line(s)" >> $LOG
[ ${#ids[@]} -eq 0 ] && exit 0
all=${(j:,:)ids}
for step in "module-visual-align-probe --gate" "presentation-centering --check" "track-duplicate-audit" "muzzle-bore-probe"; do
  tool=${step%% *}; args=${step#$tool}
  echo "-- $tool $(date +%T)" >> $LOG
  perl -e 'alarm 1200; exec @ARGV' node --max-old-space-size=4096 tools/$tool.mjs --ids=$all ${=args} >> $LOG 2>&1
  echo "-- $tool rc=$? $(date +%T)" >> $LOG
done
for l in "${ids[@]}"; do echo "$l" >> $F.done; done
echo "== PROBES-DONE $(date +%T)" >> $LOG
