#!/bin/sh
cd /home/claude/fitsize
echo "### unit tests"; npm test 2>&1 | grep -E "^# (tests|pass|fail)"
for t in t_compress_image.py t_compress_pdf.py t_pdf_fallback.py t_all_tools.py t_ed_tools.py t_ed_extra.py t_new_tools.py t_fonts.py t_launch.py; do
  echo; echo "### $t"
  tests/e2e/run_with_server.sh $t || { echo "!!! $t FAILED"; exit 1; }
done
echo; echo "### ALL SUITES PASSED"
