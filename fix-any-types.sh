#!/bin/bash

# Fix common any types across the codebase

# Replace catch(e: any) with catch(e) and then cast
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/catch (e: any)/catch (e)/g' {} \;
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/catch (error: any)/catch (error)/g' {} \;

# Replace useState<any> with more specific types
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/useState<any>/useState<unknown>/g' {} \;

# Replace : any[] with : unknown[]
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/: any\[\]/: unknown[]/g' {} \;

# Replace (data: any) with (data: unknown) in common patterns
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/(data: any)/(data: unknown)/g' {} \;

# Replace Record<string, any> with Record<string, unknown>
find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/Record<string, any>/Record<string, unknown>/g' {} \;

echo "Fixed common 'any' type patterns. Manual review may still be needed for complex cases."