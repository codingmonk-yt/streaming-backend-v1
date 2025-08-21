#!/bin/bash

# Section API Test Script
# This script provides examples of how to interact with the Sections API using cURL

# Configuration
API_URL="http://localhost:5000/api/sections"
AUTH_TOKEN="your-auth-token-here"

# Colors for terminal output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===== Sections API Test Script =====${NC}\n"

# 1. Get All Sections
echo -e "${BLUE}1. Getting all sections...${NC}"
curl -s -X GET "$API_URL" | json_pp
echo -e "\n"

# 2. Get Sections with filtering
echo -e "${BLUE}2. Getting Live TV sections...${NC}"
curl -s -X GET "$API_URL?contentType=Live%20TV" | json_pp
echo -e "\n"

# 3. Create a new section
echo -e "${BLUE}3. Creating a new section...${NC}"
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "sectionId": "documentary",
    "title": "Documentaries",
    "description": "Educational documentaries and shows",
    "contentType": "Live TV",
    "sortOrder": 5,
    "backdropImage": "https://example.com/images/documentary.jpg",
    "active": true
  }' | json_pp
echo -e "\n"

# Save the ID of the newly created section for future operations
SECTION_ID=$(curl -s -X GET "$API_URL?contentType=Live%20TV" | grep -o '"_id":"[^"]*' | grep -o '[^"]*$' | head -1)
echo -e "${GREEN}Using section ID: $SECTION_ID for update and delete operations${NC}\n"

# 4. Update a section
echo -e "${BLUE}4. Updating the section...${NC}"
curl -s -X PUT "$API_URL/$SECTION_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "title": "Updated Documentaries",
    "description": "Updated educational documentaries and shows",
    "backdropImage": "https://example.com/images/updated-documentary.jpg"
  }' | json_pp
echo -e "\n"

# 5. Delete a section
echo -e "${BLUE}5. Deleting the section...${NC}"
curl -s -X DELETE "$API_URL/$SECTION_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" | json_pp
echo -e "\n"

echo -e "${GREEN}===== Test Script Completed =====${NC}"
