#!/usr/bin/env bash

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     pingme-cli Release Automation     ║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}✗ Error: Working directory is not clean${NC}"
    echo -e "${YELLOW}  Please commit or stash your changes first${NC}"
    git status -s
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}║ Current version: ${GREEN}${CURRENT_VERSION}${NC}"

# Ask for version bump type
echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}Select version bump type:${NC}"
echo "  1) patch  (1.2.0 → 1.2.1) - Bug fixes"
echo "  2) minor  (1.2.0 → 1.3.0) - New features"
echo "  3) major  (1.2.0 → 2.0.0) - Breaking changes"
read -p "Enter choice (1-3): " choice

case $choice in
    1) BUMP_TYPE="patch" ;;
    2) BUMP_TYPE="minor" ;;
    3) BUMP_TYPE="major" ;;
    *)
        echo -e "${RED}✗ Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║ Running pre-release checks...${NC}"

# Run tests
echo -e "${YELLOW}▶ Running tests...${NC}"
npm test
echo -e "${GREEN}✓ All tests passed${NC}"

# Run build
echo -e "${YELLOW}▶ Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build successful${NC}"

# Check for vulnerabilities
echo -e "${YELLOW}▶ Checking for vulnerabilities...${NC}"
npm audit
echo -e "${GREEN}✓ No vulnerabilities found${NC}"

# Bump version
echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}▶ Bumping version (${BUMP_TYPE})...${NC}"
npm version $BUMP_TYPE --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓ Version bumped: ${CURRENT_VERSION} → ${NEW_VERSION}${NC}"

# Git operations
echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}▶ Committing changes...${NC}"

git add package.json package-lock.json
git commit -m "chore: bump version to ${NEW_VERSION}

- Updated package.json
- Updated package-lock.json

[skip ci]"

echo -e "${GREEN}✓ Changes committed${NC}"

# Create git tag
echo -e "${YELLOW}▶ Creating git tag v${NEW_VERSION}...${NC}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}

See CHANGELOG.md for details."

echo -e "${GREEN}✓ Tag created${NC}"

# Summary
echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║ ${GREEN}Release ${NEW_VERSION} ready!${NC}"
echo -e "${BLUE}╠════════════════════════════════════════╣${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Review changes: ${BLUE}git show${NC}"
echo -e "  2. Push to origin: ${BLUE}git push origin main --tags${NC}"
echo -e "  3. Publish to npm: ${BLUE}npm publish${NC}"
echo -e "  4. Update Docker image (if applicable)"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
