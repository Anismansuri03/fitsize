#!/bin/sh
# Start the preview server, wait until it answers, run the given test, then stop the server.
cd /home/claude/fitsize
npx astro preview --port 4321 --host 127.0.0.1 > /tmp/preview.log 2>&1 &
SERVER=$!
i=0
until curl -s -o /dev/null http://127.0.0.1:4321/ ; do
  i=$((i+1)); [ $i -gt 40 ] && echo "server did not start" && kill $SERVER 2>/dev/null && exit 1
  sleep 0.5
done
echo "server up after ~$((i/2))s"
cd tests/e2e
python3 -u "$@"
CODE=$?
kill $SERVER 2>/dev/null
exit $CODE
