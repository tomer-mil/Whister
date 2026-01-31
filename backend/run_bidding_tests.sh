#!/bin/bash
# Run bidding integration tests
# Requires Redis running on localhost:6379

set -e

echo "Running bidding integration tests..."
echo "Make sure Redis is running: redis-server"
echo ""

# Run the Redis state tests specifically
python -m pytest tests/integration/test_bidding_flow.py::TestPassedPlayersRedisState -v

echo ""
echo "✅ All bidding logic tests passed!"
