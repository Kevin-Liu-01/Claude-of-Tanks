#!/bin/zsh
# rcpt-one.zsh <root> <outdir> <file>: one receipt at nice 15, its log and a summary line
ROOT=$1; OUT=$2; F=$3
name=${F//\//__}
start=$(date +%s)
( cd $ROOT && COT_SELFTEST_CACHE=0 nice -n 15 node $F > $OUT/$name.log 2>&1 < /dev/null ); rc=$?
echo "$F rc=$rc $(( $(date +%s) - start ))s" >> $OUT/summary.txt
