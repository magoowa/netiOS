#!/bin/zsh
# Double-click in Finder: hands a Netia GO session from a browser on this Mac to netiOS on a webOS 4 TV (experimental).
exec "${0:A:h}/install-netios.command" --import-session "$@"
