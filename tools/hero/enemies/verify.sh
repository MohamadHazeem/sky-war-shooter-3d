#!/bin/sh
set -eu
# One heavy slot for the entire serial browser run; each script closes its own shell.
node tools/hero/enemies/turntables.mjs
node tools/hero/enemies/capture.mjs
node tools/hero/enemies/flight.mjs
