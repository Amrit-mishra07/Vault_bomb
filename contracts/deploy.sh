#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
  source .env
fi

if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY environment variable is not set."
  echo "Please create a .env file in the contracts directory with PRIVATE_KEY=your_key"
  exit 1
fi

echo "Checking Stylus project..."
cargo stylus check

echo "Deploying Stylus contract to Arbitrum Sepolia..."
cargo stylus deploy --private-key $PRIVATE_KEY

echo "Deployment complete!"
echo "To export the ABI for the frontend, run:"
echo "cargo stylus export-abi"
