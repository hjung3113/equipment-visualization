# Equipment primitives

25 synthetic, illustrative symbols from the v0.3 pack, re-rooted at their local origin. Not OEM drawings or validated robot kinematics. Labels belong to the consuming renderer. The centred viewBox encloses rect, circle, polygon and absolute M/L path geometry plus half its stroke width; robot blades are included. Original geometry and fallback colours are retained.

Inject these CSS custom properties through the consuming theme. Each occurrence retains its original hex fallback; a token override deliberately unifies that purpose.

| Token | Purpose | Original fallback(s) |
| --- | --- | --- |
| `--eqv-accent-fill` | Optical work zones and metrology fill | `#fff6e5`, `#fff9e7` |
| `--eqv-accent-stroke` | Thermal and optical detail outlines | `#bf9137`, `#c28d49` |
| `--eqv-detail-fill` | Interior stations, robot hubs and joints | `#648497`, `#bbdfe2`, `#e0ebf1`, `#f2faff`, `#f5f8ff`, `#f8fbfd`, `#f8fcff`, `#f8feff`, `#f8fffe`, `#fff`, `#fffefa` |
| `--eqv-detail-stroke` | Interior detail and joint outlines | `#489494`, `#4c9ea5`, `#4e9ca3`, `#526c81`, `#547388`, `#547e9a`, `#57899e`, `#5c7ca6`, `#72909a`, `#7290aa`, `#7790a1`, `#8299ab`, `#89a0aa`, `#8ea4b2` |
| `--eqv-handler-fill` | Robot body fill | `#f5faff` |
| `--eqv-handler-primary` | Primary illustrative arm/blade colour | `#0e808d` |
| `--eqv-handler-secondary` | Secondary illustrative arm/blade colour | `#867cbd` |
| `--eqv-handler-stroke` | Robot body outline | `#607c92` |
| `--eqv-module-fill` | Module body fill | `#d9ecec`, `#e7eefb`, `#edf3f7` |
| `--eqv-module-stroke` | Module body outline | `#0e808d`, `#526c81`, `#687a9f` |
| `--eqv-structure-fill` | Housing, EFEM and rail fill | `#dfe9f2`, `#f4f7fa` |
| `--eqv-structure-stroke` | Structural outlines | `#92a5b3` |

See [NOTICE](../NOTICE.md) for per-file origin and background references.
