#!/bin/bash

# OWASP ZAP Security Scan Script
# This script runs ZAP baseline and/or active scans against the application
# Usage: ./scripts/run-zap-scan.sh [baseline|active|full]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCAN_TYPE="${1:-baseline}"
TARGET_URL="${2:-http://localhost:5000}"
REPORT_DIR="./zap_reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}OWASP ZAP Security Scan${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Target URL: ${YELLOW}$TARGET_URL${NC}"
echo -e "Scan Type:  ${YELLOW}$SCAN_TYPE${NC}"
echo -e "Report Dir: ${YELLOW}$REPORT_DIR${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    echo "Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Create report directory if it doesn't exist
mkdir -p "$REPORT_DIR"

# Function to run baseline scan
run_baseline_scan() {
    local report_file="$REPORT_DIR/zap_baseline_${TIMESTAMP}.html"
    
    echo -e "${YELLOW}📋 Running ZAP Baseline Scan...${NC}"
    echo "This is a passive scan that identifies common security issues."
    echo ""
    
    docker run --rm \
        -v "$(pwd)/$REPORT_DIR:/zap/reports" \
        owasp/zap2docker-stable zap-baseline.py \
        -t "$TARGET_URL" \
        -r "zap_baseline_${TIMESTAMP}.html" \
        -J "zap_baseline_${TIMESTAMP}.json" \
        || true
    
    echo ""
    echo -e "${GREEN}✅ Baseline scan complete!${NC}"
    echo -e "Report: ${YELLOW}$report_file${NC}"
}

# Function to run full active scan
run_active_scan() {
    local report_file="$REPORT_DIR/zap_active_${TIMESTAMP}.html"
    
    echo -e "${YELLOW}📋 Running ZAP Active Scan...${NC}"
    echo "This is an active scan that attempts to identify vulnerabilities."
    echo "WARNING: This may take 30+ minutes and generate test traffic."
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Scan cancelled."
        exit 0
    fi
    
    docker run --rm \
        -v "$(pwd)/$REPORT_DIR:/zap/reports" \
        owasp/zap2docker-stable zap-full-scan.py \
        -t "$TARGET_URL" \
        -r "zap_active_${TIMESTAMP}.html" \
        -J "zap_active_${TIMESTAMP}.json" \
        || true
    
    echo ""
    echo -e "${GREEN}✅ Active scan complete!${NC}"
    echo -e "Report: ${YELLOW}$report_file${NC}"
}

# Function to run both scans
run_full_scan() {
    run_baseline_scan
    echo ""
    run_active_scan
}

# Pull latest ZAP image
echo -e "${YELLOW}📥 Pulling latest OWASP ZAP Docker image...${NC}"
docker pull owasp/zap2docker-stable > /dev/null
echo -e "${GREEN}✅ Image ready${NC}"
echo ""

# Run appropriate scan based on argument
case "$SCAN_TYPE" in
    baseline)
        run_baseline_scan
        ;;
    active)
        run_active_scan
        ;;
    full)
        run_full_scan
        ;;
    *)
        echo -e "${RED}❌ Unknown scan type: $SCAN_TYPE${NC}"
        echo "Usage: ./scripts/run-zap-scan.sh [baseline|active|full]"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}🎉 Scan process completed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "📂 All reports are in: ${YELLOW}$REPORT_DIR${NC}"
echo ""
echo "To view reports:"
echo -e "  ${YELLOW}• Open ${REPORT_DIR}/zap_baseline_${TIMESTAMP}.html in your browser${NC}"
echo -e "  ${YELLOW}• Open ${REPORT_DIR}/zap_active_${TIMESTAMP}.html for active scan results${NC}"
echo ""
echo "Report includes:"
echo "  ✓ Security issues found (HIGH/MEDIUM/LOW)"
echo "  ✓ Issue descriptions and severity"
echo "  ✓ Affected URLs"
echo "  ✓ Remediation recommendations"
echo ""
