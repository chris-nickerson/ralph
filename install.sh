#!/usr/bin/env bash
set -euo pipefail

REPO="chris-nickerson/ralph"
BRANCH="main"
INSTALL_DIR="$HOME/.ralph"
BIN_DIR="$HOME/.local/bin"

echo "Installing ralph..."

# Download tarball from GitHub
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "https://github.com/${REPO}/archive/${BRANCH}.tar.gz" | tar -xz -C "$TMP_DIR"

SRC_DIR="$TMP_DIR/ralph-${BRANCH}"

# Install to ~/.ralph/
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/prompts"
cp "$SRC_DIR/ralph.sh" "$INSTALL_DIR/ralph.sh"
cp "$SRC_DIR/prompts/"*.md "$INSTALL_DIR/prompts/"
chmod +x "$INSTALL_DIR/ralph.sh"

# Symlink to ~/.local/bin/ralph
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/ralph.sh" "$BIN_DIR/ralph"

echo "Installed to $INSTALL_DIR"
echo "Linked $BIN_DIR/ralph -> $INSTALL_DIR/ralph.sh"

# Check PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo ""
  echo "Note: $BIN_DIR is not on your PATH."
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc):"
  echo ""
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
