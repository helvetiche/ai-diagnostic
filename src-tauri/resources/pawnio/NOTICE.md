# PawnIO sensor modules

These binaries are unmodified signed modules from the official PawnIO.Modules
release **0.2.11**:

- `IntelMSR.bin`
- `AMDFamily17.bin`

Source and release:
<https://github.com/namazso/PawnIO.Modules/releases/tag/0.2.11>

License: GNU Lesser General Public License, version 2.1 or later. The full
license text is in `COPYING`. Windog does not modify these modules. The
corresponding source is available at the URL above.

The PawnIO kernel driver itself is not bundled. Windog loads these modules only
when the separately installed PawnIO driver is present. The driver installer is
available from <https://pawnio.eu>.
