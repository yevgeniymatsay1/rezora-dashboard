#!/bin/bash
# Setup Bedrock Knowledge Base - Run this after OpenSearch collection is ACTIVE

set -e

echo "================================"
echo "Bedrock Knowledge Base Setup"
echo "================================"
echo ""

# Load saved values
BUCKET_NAME=$(cat /tmp/bucket_name.txt)
COLLECTION_NAME=$(cat /tmp/collection_name.txt)
COLLECTION_ARN=$(cat /tmp/collection_arn.txt)
ROLE_ARN=$(cat /tmp/role_arn.txt)

echo "Checking OpenSearch collection status..."
STATUS=$(aws opensearchserverless batch-get-collection \
  --names "$COLLECTION_NAME" \
  --region us-east-1 \
  --query 'collectionDetails[0].status' \
  --output text)

if [ "$STATUS" != "ACTIVE" ]; then
  echo "❌ Collection is not yet ACTIVE (current status: $STATUS)"
  echo "Please wait a few more minutes and run this script again."
  exit 1
fi

echo "✓ Collection is ACTIVE"
echo ""

# Get collection endpoint
COLLECTION_ENDPOINT=$(aws opensearchserverless batch-get-collection \
  --names "$COLLECTION_NAME" \
  --region us-east-1 \
  --query 'collectionDetails[0].collectionEndpoint' \
  --output text)

echo "Collection Endpoint: $COLLECTION_ENDPOINT"
echo ""

# Create data access policy for the role
echo "Creating data access policy..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/data-access-policy.json << EOF
[
  {
    "Rules": [
      {
        "ResourceType": "index",
        "Resource": [
          "index/$COLLECTION_NAME/*"
        ],
        "Permission": [
          "aoss:CreateIndex",
          "aoss:DeleteIndex",
          "aoss:UpdateIndex",
          "aoss:DescribeIndex",
          "aoss:ReadDocument",
          "aoss:WriteDocument"
        ]
      },
      {
        "ResourceType": "collection",
        "Resource": [
          "collection/$COLLECTION_NAME"
        ],
        "Permission": [
          "aoss:CreateCollectionItems"
        ]
      }
    ],
    "Principal": [
      "$ROLE_ARN",
      "arn:aws:iam::$ACCOUNT_ID:root"
    ]
  }
]
EOF

aws opensearchserverless create-access-policy \
  --name "${COLLECTION_NAME}-access" \
  --type data \
  --policy file:///tmp/data-access-policy.json \
  --region us-east-1 2>&1 | grep -E "(name|type)" || echo "✓ Access policy created or already exists"

echo ""
echo "Creating Bedrock Knowledge Base..."

# Create Knowledge Base
KB_NAME="prompt-factory-kb"

aws bedrock-agent create-knowledge-base \
  --name "$KB_NAME" \
  --description "Knowledge Base for AI Prompt Factory - RAG powered learning" \
  --role-arn "$ROLE_ARN" \
  --knowledge-base-configuration '{
    "type": "VECTOR",
    "vectorKnowledgeBaseConfiguration": {
      "embeddingModelArn": "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"
    }
  }' \
  --storage-configuration "{
    \"type\": \"OPENSEARCH_SERVERLESS\",
    \"opensearchServerlessConfiguration\": {
      \"collectionArn\": \"$COLLECTION_ARN\",
      \"vectorIndexName\": \"bedrock-kb-index\",
      \"fieldMapping\": {
        \"vectorField\": \"bedrock-kb-vector\",
        \"textField\": \"AMAZON_BEDROCK_TEXT_CHUNK\",
        \"metadataField\": \"AMAZON_BEDROCK_METADATA\"
      }
    }
  }" \
  --region us-east-1 \
  --output json > /tmp/kb_final_output.json

if [ $? -eq 0 ]; then
  KB_ID=$(cat /tmp/kb_final_output.json | jq -r '.knowledgeBase.knowledgeBaseId')
  KB_ARN=$(cat /tmp/kb_final_output.json | jq -r '.knowledgeBase.knowledgeBaseArn')

  echo "✓ Knowledge Base created successfully!"
  echo ""
  echo "Knowledge Base ID: $KB_ID"
  echo "Knowledge Base ARN: $KB_ARN"
  echo ""

  # Save values
  echo "$KB_ID" > /tmp/kb_id.txt
  echo "$KB_ARN" > /tmp/kb_arn.txt

  echo "Creating S3 data source..."

  # Create data source
  aws bedrock-agent create-data-source \
    --knowledge-base-id "$KB_ID" \
    --name "s3-patterns-source" \
    --description "S3 bucket containing learning patterns and examples" \
    --data-source-configuration "{
      \"type\": \"S3\",
      \"s3Configuration\": {
        \"bucketArn\": \"arn:aws:s3:::$BUCKET_NAME\",
        \"inclusionPrefixes\": [\"prompt-factory-kb/\"]
      }
    }" \
    --region us-east-1 \
    --output json > /tmp/datasource_output.json

  if [ $? -eq 0 ]; then
    DS_ID=$(cat /tmp/datasource_output.json | jq -r '.dataSource.dataSourceId')
    echo "✓ Data source created: $DS_ID"
    echo ""

    # Start ingestion job
    echo "Starting initial ingestion job..."
    aws bedrock-agent start-ingestion-job \
      --knowledge-base-id "$KB_ID" \
      --data-source-id "$DS_ID" \
      --region us-east-1

    echo "✓ Ingestion job started"
  fi

  echo ""
  echo "================================"
  echo "✅ Setup Complete!"
  echo "================================"
  echo ""
  echo "Environment Variables to add to Supabase:"
  echo ""
  echo "BEDROCK_KB_ID=$KB_ID"
  echo "S3_BUCKET_NAME=$BUCKET_NAME"
  echo "S3_KB_PREFIX=prompt-factory-kb"
  echo ""
  echo "Run these commands to set them:"
  echo ""
  echo "supabase secrets set BEDROCK_KB_ID=$KB_ID"
  echo "supabase secrets set S3_BUCKET_NAME=$BUCKET_NAME"
  echo "supabase secrets set S3_KB_PREFIX=prompt-factory-kb"
  echo ""
else
  echo "❌ Failed to create Knowledge Base"
  cat /tmp/kb_final_output.json
  exit 1
fi
