# Claude profiles usage for Herdr

A Herdr mod for people who run Claude Code with more than one profile, for
example a work and a personal account through `CLAUDE_CONFIG_DIR`. It finds
every profile by itself and shows the plan limits of each one in one popup,
next to the CPU, memory and GPU load of your computer. It follows your Herdr
theme, light or dark.

![Usage popup in light and dark](preview.png)

## What it does

- **Every profile, with no setup.** It looks for `~/.claude` and every
  `~/.claude-<name>` folder in your home folder and shows one card for each
  profile that is signed in. You do not list your accounts anywhere.
- **Works with the macOS keychain.** On macOS, Claude Code keeps each sign-in
  in the keychain, under a different item for each config folder. The mod
  finds the right item for every profile. On Linux it reads
  `.credentials.json` in each folder.
- **Keeps working when the usage endpoint is busy.** The endpoint answers
  "too many requests" when it is asked often. With the optional status line
  snippet in `RECIPE.md`, each running Claude Code session hands its limits to
  the mod, and the popup shows those instead of an error.
- **Computer load in the same place.** CPU, memory and GPU, refreshed every
  4 seconds while the popup is open. Nothing runs while it is closed.
- Bigger plans first (team above pro). Profiles with an expired sign-in show a
  short note and go last.

## How it differs from herdr-quota

[Lakris2407/herdr-quota](https://github.com/Lakris2407/herdr-quota) is the
closest mod, and it is the better choice for many people. Pick by what you need:

| | herdr-claude-profiles-usage | herdr-quota |
|---|---|---|
| Several Claude profiles | Finds each `~/.claude*` folder and shows one card per profile | Reads the sign-in of the default environment through `quota-axi` |
| macOS keychain | Reads each profile's own keychain item | Through `quota-axi` |
| Other providers | Claude only | Claude, Codex and more |
| Extra install | None | `npm install -g quota-axi` |
| Where it shows | A popup you open from a button or a key | A status bar block and a popup, with pace hints |
| Remote machines | Local machine only | Follows the selected space's machine |
| CPU, memory, GPU | In the same popup | A separate optional mod |

If you use one Claude account plus Codex or other agents, use herdr-quota. If
you switch between several Claude profiles, this mod shows all of them at once.

## Install

Ask the agent in Herdr to add this mod from the repo URL, or copy it yourself:

```sh
git clone https://github.com/akhilnalliboina/herdr-claude-profiles-usage
cp -R herdr-claude-profiles-usage/usage ~/.config/herdr-app/mods/usage
herdr-app check ~/.config/herdr-app/mods/usage
```

Open it with `herdr-app do mod.open '{"name":"usage"}'`, or add a button to your
tab bar mod that calls:

```js
openOverlay({ mod: "usage", kind: "popup", width: 380, height: 560, props: { popup: true } });
```

`RECIPE.md` describes the mod in full, including the optional status line snippet.

## What it reads and sends

- Your Claude Code sign-in, from `~/.claude*/.credentials.json` or the macOS
  keychain. The token goes only to `api.anthropic.com`. The mod never stores,
  logs or renews it, because renewing would sign Claude Code out.
- CPU, memory and GPU through `top`, `vm_stat`, `sysctl` and `ioreg` on macOS,
  or `/proc` and `nvidia-smi` on Linux. None of them need root.

The usage endpoint is the one Claude Code itself uses. It is not a public API
and may change.

## License

MIT
