# Appwrite Pro — Phase 0 setup checklist
#
# 1. Create a project at https://cloud.appwrite.io (Pro plan)
# 2. Project Settings → copy Project ID
# 3. Overview / Integrations → API Keys → Create key with scopes:
#    - databases.read, databases.write
#    - collections.read, collections.write
#    - attributes.read, attributes.write
#    - indexes.read, indexes.write
#    - documents.read, documents.write
#    - files.read, files.write
#    - buckets.read, buckets.write
# 4. Note your regional endpoint, e.g. https://nyc.cloud.appwrite.io/v1
# 5. Put values in .env.local (see .env.example):
#    APPWRITE_ENDPOINT=
#    APPWRITE_PROJECT_ID=
#    APPWRITE_API_KEY=
#    APPWRITE_DATABASE_ID=sn_crm
#    DATA_BACKEND=appwrite
# 6. Run: npm run appwrite:setup
# 7. Run: npm run appwrite:export && npm run appwrite:import
#
