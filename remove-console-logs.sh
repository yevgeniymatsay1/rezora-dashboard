#!/bin/bash

# Remove console.log, console.error, console.warn statements from production code
# Exclude error handling files where console statements are intentional

find src -type f \( -name "*.tsx" -o -name "*.ts" \) \
  ! -path "*/errorHandler.ts" \
  ! -path "*/ErrorBoundary.tsx" \
  -exec sed -i '' '/console\.\(log\|error\|warn\|info\|debug\)/d' {} \;

echo "Console statements removed from production code"