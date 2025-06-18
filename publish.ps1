# Script to publish ngx-chessground to npm

# Functions for colored output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    } else {
        $input | Write-Output
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Green($text) { Write-ColorOutput Green $text }
function Write-Yellow($text) { Write-ColorOutput Yellow $text }
function Write-Red($text) { Write-ColorOutput Red $text }

Write-Yellow "Preparing to publish ngx-chessground to npm..."

# 1. Make sure git working directory is clean
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Red "Error: Git working directory is not clean. Please commit or stash your changes."
    exit 1
}

# 2. Build the library with production configuration
Write-Green "Building library for production..."
npm run build:lib:prod

# 3. Check for success
if ($LASTEXITCODE -ne 0) {
    Write-Red "Error: Build failed. Please fix the issues and try again."
    exit 1
}

# 4. Navigate to the dist folder
Write-Green "Navigating to the distribution folder..."
Push-Location -Path "dist/ngx-chessground"

# 5. Publish to npm
Write-Yellow "Publishing to npm..."
Write-Yellow "If you need to login, please run 'npm login' first."
$answer = Read-Host "Do you want to proceed with publishing? (y/n)"

if ($answer -match "^[Yy]") {
    npm publish
    if ($LASTEXITCODE -eq 0) {
        Write-Green "Library published successfully!"
    } else {
        Write-Red "Error: Publishing failed."
    }
} else {
    Write-Red "Publishing cancelled."
}

# 6. Return to the root directory
Pop-Location

Write-Green "Done!"
