#!/bin/sh
# Vercel "Ignored Build Step": exit 0 skips the build, exit 1 builds. Skip only when nothing in
# this folder changed since the last deployed commit. Vercel's clone is shallow, so fetch that
# commit if it's missing; if it can't be found, build rather than fail the deploy.
P="$VERCEL_GIT_PREVIOUS_SHA"
[ -n "$P" ] || exit 1
git cat-file -e "$P^{commit}" 2>/dev/null || git fetch -q --depth=1 origin "$P" 2>/dev/null || exit 1
git diff --quiet "$P" HEAD ./ && exit 0
exit 1
