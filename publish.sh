#!/bin/bash

# Script to publish ngx-chessground to npm

# Exit on error
set -e

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Preparing to publish ngx-chessground to npm...${NC}"

# 1. Make sure git working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: Git working directory is not clean. Please commit or stash your changes.${NC}"
  exit 1
fi

# 2. Build the library with production configuration
echo -e "${GREEN}Building library for production...${NC}"
npm run build:lib:prod

# 3. Navigate to the dist folder
echo -e "${GREEN}Navigating to the distribution folder...${NC}"
cd dist/ngx-chessground

# 4. Publish to npm
echo -e "${YELLOW}Publishing to npm...${NC}"
echo -e "${YELLOW}If you need to login, please run 'npm login' first.${NC}"
echo -e "${YELLOW}Do you want to proceed with publishing? (y/n)${NC}"
read answer

if [ "$answer" != "${answer#[Yy]}" ]; then
  npm publish
  echo -e "${GREEN}Library published successfully!${NC}"
else
  echo -e "${RED}Publishing cancelled.${NC}"
fi

# 5. Return to the root directory
cd ../..

echo -e "${GREEN}Done!${NC}"
