/**
 * Prints one line of JSON with CPU, memory and GPU use, on macOS and Linux.
 * It runs through `sh -c`, so the mod needs no file path of its own and keeps
 * working when someone installs it under another folder name.
 *
 * macOS: `top` needs two samples one second apart, because the first sample
 * counts from boot and is always low. Memory used is counted the way Activity
 * Monitor counts it: app memory (anonymous minus purgeable) plus wired plus
 * compressed. The file cache is left out, or memory would always look full.
 * The GPU figure comes from the Apple Silicon graphics driver; on Intel Macs
 * it may be missing and shows as a dash.
 *
 * Linux: CPU from two reads of /proc/stat, memory from MemAvailable, and GPU
 * only when `nvidia-smi` exists.
 */
export const STATS_SCRIPT = [
  "if [ \"$(uname)\" = Darwin ]; then",
  "  idle=$(top -l 2 -n 0 -s 1 | awk '/^CPU usage/ { v = $7 } END { sub(\"%\", \"\", v); print v }')",
  "  total=$(sysctl -n hw.memsize)",
  "  used=$(vm_stat | awk -v total=\"$total\" '",
  "    /page size of/ { size = $8 }",
  "    /^Anonymous pages/ { anon = $3 }",
  "    /^Pages purgeable/ { purge = $3 }",
  "    /^Pages wired down/ { wired = $4 }",
  "    /^Pages occupied by compressor/ { comp = $5 }",
  "    END { printf \"%.0f\", (anon - purge + wired + comp) * size }')",
  "  gpu=$(ioreg -r -d 1 -c IOAccelerator 2>/dev/null | sed -n 's/.*\"Device Utilization %\"=\\([0-9]*\\).*/\\1/p' | head -1)",
  "else",
  "  read -r _ a b c d e f g h _ < /proc/stat",
  "  sleep 1",
  "  read -r _ A B C D E F G H _ < /proc/stat",
  "  busy=$(( (A + B + C + F + G + H) - (a + b + c + f + g + h) ))",
  "  all=$(( busy + (D + E) - (d + e) ))",
  "  idle=$(awk -v b=\"$busy\" -v t=\"$all\" 'BEGIN { if (t > 0) printf \"%.1f\", 100 - b * 100 / t; else print 100 }')",
  "  total=$(awk '/^MemTotal/ { print $2 * 1024 }' /proc/meminfo)",
  "  used=$(awk '/^MemTotal/ { t = $2 } /^MemAvailable/ { a = $2 } END { printf \"%.0f\", (t - a) * 1024 }' /proc/meminfo)",
  "  gpu=$(command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')",
  "fi",
  "[ -n \"$idle\" ] || idle=100",
  "[ -n \"$used\" ] || used=0",
  "[ -n \"$total\" ] || total=0",
  "[ -n \"$gpu\" ] || gpu=null",
  "printf '{\"cpu\":%s,\"memUsed\":%s,\"memTotal\":%s,\"gpu\":%s}\\n' \"$(awk -v i=\"$idle\" 'BEGIN { printf \"%.1f\", 100 - i }')\" \"$used\" \"$total\" \"$gpu\"",
].join("\n");
