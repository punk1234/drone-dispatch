#!/bin/bash
# Runs inside LocalStack on startup via /etc/localstack/init/ready.d/
# Creates the S3 bucket and configures lifecycle rules for orphan cleanup

BUCKET=${AWS_S3_BUCKET:-drone-dispatch-uploads}

echo "Creating S3 bucket: $BUCKET"
awslocal s3 mb s3://$BUCKET

# Public read so stored imageUrls are directly accessible without signed read URLs
awslocal s3api put-bucket-acl \
  --bucket $BUCKET \
  --acl public-read

# Lifecycle policy — auto-delete unconfirmed pending uploads after 24 hours.
# Objects under medications/pending/ that are NOT tagged confirmed=true are
# treated as orphaned (client got a pre-signed URL but never created a medication)
# and are cleaned up automatically.
awslocal s3api put-bucket-lifecycle-configuration \
  --bucket $BUCKET \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "delete-orphaned-pending-uploads",
        "Status": "Enabled",
        "Filter": {
          "Prefix": "medications/pending/"
        },
        "Expiration": {
          "Days": 1
        }
      }
    ]
  }'

echo "✅ Bucket '$BUCKET' created with lifecycle policy for orphan cleanup"
