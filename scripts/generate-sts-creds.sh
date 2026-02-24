#!/usr/bin/env bash
#
# Generate temporary AWS STS credentials from IAM access keys
# and write them to the .env file.
#
# Usage:
#   ./scripts/generate-sts-creds.sh <ACCESS_KEY_ID> <SECRET_ACCESS_KEY> [DURATION_SECONDS]
#
# Duration defaults to 3600 (1 hour).
# Requires the AWS CLI to be installed.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <AWS_ACCESS_KEY_ID> <AWS_SECRET_ACCESS_KEY> [DURATION_SECONDS]"
  exit 1
fi

IAM_ACCESS_KEY="$1"
IAM_SECRET_KEY="$2"
DURATION="${3:-3600}"
ENV_FILE="${ENV_FILE:-.env}"

# Check for AWS CLI
if ! command -v aws &> /dev/null; then
  echo "Error: AWS CLI is not installed. Install it from https://aws.amazon.com/cli/"
  exit 1
fi

echo "Requesting STS session token (duration: ${DURATION}s)..."

STS_OUTPUT=$(AWS_ACCESS_KEY_ID="$IAM_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$IAM_SECRET_KEY" \
  aws sts get-session-token \
    --duration-seconds "$DURATION" \
    --output json)

ACCESS_KEY=$(echo "$STS_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Credentials']['AccessKeyId'])")
SECRET_KEY=$(echo "$STS_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Credentials']['SecretAccessKey'])")
SESSION_TOKEN=$(echo "$STS_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Credentials']['SessionToken'])")
EXPIRATION=$(echo "$STS_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Credentials']['Expiration'])")

echo "STS credentials generated. Expires: $EXPIRATION"

# Create .env from example if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  if [ -f .env.example ]; then
    cp .env.example "$ENV_FILE"
    echo "Created $ENV_FILE from .env.example"
  else
    touch "$ENV_FILE"
  fi
fi

# Update or append each credential in .env
update_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # Use a temp file for portable in-place edit
    sed "s|^${key}=.*|${key}=${value}|" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

update_env "AWS_ACCESS_KEY_ID" "$ACCESS_KEY" "$ENV_FILE"
update_env "AWS_SECRET_ACCESS_KEY" "$SECRET_KEY" "$ENV_FILE"
update_env "AWS_SESSION_TOKEN" "$SESSION_TOKEN" "$ENV_FILE"

echo "Updated $ENV_FILE with STS credentials."
