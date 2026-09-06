# vendor

`ffmpeg.js` and `814.ffmpeg.js` are @ffmpeg/ffmpeg 0.12.15 (MIT), copied here
verbatim from jsdelivr.

They are served from our own origin on purpose. ffmpeg.wasm starts its worker
with `new Worker()`, and a worker script cannot be constructed from a
cross-origin URL — loading the library straight off a CDN fails with
"Script at https://cdn.jsdelivr.net/... cannot be accessed from origin".
Passing a blob URL instead breaks webpack's module resolution inside the chunk.
Serving these two files (7.6 KB together) from the same origin sidesteps both.

The heavy part, `ffmpeg-core.wasm` (~32 MB), still comes from the CDN — it is
fetched with `fetch()` and handed over as a blob, which has no such restriction.
