#!/bin/bash
# SeekPeek Mobile — Flutter Setup Script for Mac Mini
# Run: bash ~/Documents/Claude/Projects/Superman/seekpeek_mobile/setup_flutter.sh

set -e
echo ""
echo "======================================"
echo "  SeekPeek Mobile — Flutter Setup"
echo "======================================"
echo ""

# Step 1: Check/install Homebrew
echo "[1/5] Checking Homebrew..."
if command -v brew &>/dev/null; then
    echo "  ✓ Homebrew already installed"
else
    echo "  Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for Apple Silicon Macs
    if [[ -f /opt/homebrew/bin/brew ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    echo "  ✓ Homebrew installed"
fi

# Step 2: Install Flutter via Homebrew
echo ""
echo "[2/5] Installing Flutter SDK..."
if command -v flutter &>/dev/null; then
    echo "  ✓ Flutter already installed"
    flutter --version
else
    brew install --cask flutter
    echo "  ✓ Flutter installed"
fi

# Step 3: Xcode Command Line Tools
echo ""
echo "[3/5] Checking Xcode Command Line Tools..."
if xcode-select -p &>/dev/null; then
    echo "  ✓ Xcode CLI tools already installed"
else
    echo "  Installing Xcode CLI tools (a popup may appear — click Install)..."
    xcode-select --install
    echo "  ⏳ Wait for the installation to finish, then re-run this script"
    exit 0
fi

# Step 4: Install CocoaPods (needed for iOS builds)
echo ""
echo "[4/5] Checking CocoaPods..."
if command -v pod &>/dev/null; then
    echo "  ✓ CocoaPods already installed"
else
    echo "  Installing CocoaPods..."
    brew install cocoapods
    echo "  ✓ CocoaPods installed"
fi

# Step 5: Run flutter doctor and pub get
echo ""
echo "[5/5] Running Flutter doctor & fetching dependencies..."
flutter doctor
echo ""
echo "--------------------------------------"
echo "  Fetching project dependencies..."
echo "--------------------------------------"
cd ~/Documents/Claude/Projects/Superman/seekpeek_mobile
flutter pub get

echo ""
echo "======================================"
echo "  ✓ Setup complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  cd ~/Documents/Claude/Projects/Superman/seekpeek_mobile"
echo "  flutter run              # Run on connected device/simulator"
echo "  flutter run -d chrome    # Run on Chrome (web)"
echo "  flutter run -d macos     # Run as macOS desktop app"
echo ""
echo "To open iOS Simulator:"
echo "  open -a Simulator"
echo "  flutter run              # Will auto-detect the simulator"
echo ""
