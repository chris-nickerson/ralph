#!/usr/bin/env bash
set -euo pipefail

REPO="chris-nickerson/ralph"
BRANCH="main"
INSTALL_DIR="$HOME/.ralph"
BIN_DIR="$HOME/.local/bin"

echo "Installing ralph..."

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required (>= 20). Install it from https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >= 20 required (found v$(node -v))" >&2
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "Error: npm is required." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "https://github.com/${REPO}/archive/${BRANCH}.tar.gz" | tar -xz -C "$TMP_DIR"

SRC_DIR="$TMP_DIR/ralph-${BRANCH}"

echo "Installing dependencies..."
(cd "$SRC_DIR" && npm install --ignore-scripts 2>&1 | tail -1)

echo "Building..."
(cd "$SRC_DIR" && npm run build 2>&1 | tail -1)

if [ ! -f "$SRC_DIR/dist/cli.js" ]; then
  echo "Error: Build failed — dist/cli.js not found" >&2
  exit 1
fi

(cd "$SRC_DIR" && npm prune --omit=dev 2>&1 | tail -1)

STAGE_DIR=$(mktemp -d "$HOME/.ralph-install-XXXXXX")
cp -r "$SRC_DIR/dist" "$STAGE_DIR/dist"
cp -r "$SRC_DIR/prompts" "$STAGE_DIR/prompts"
cp "$SRC_DIR/package.json" "$STAGE_DIR/package.json"
cp -r "$SRC_DIR/node_modules" "$STAGE_DIR/node_modules"
chmod +x "$STAGE_DIR/dist/cli.js"

rm -rf "$INSTALL_DIR"
mv "$STAGE_DIR" "$INSTALL_DIR"

mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/dist/cli.js" "$BIN_DIR/ralph"

echo "Installed to $INSTALL_DIR"
echo "Linked $BIN_DIR/ralph -> $INSTALL_DIR/dist/cli.js"

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo ""
  echo "Note: $BIN_DIR is not on your PATH."
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc):"
  echo ""
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
