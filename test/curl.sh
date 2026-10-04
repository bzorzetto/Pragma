curl --cacert /etc/pragma/tls/reader-api.crt \
-k \
-X POST https://localhost:3443/api/reader/access \
-H "Authorization: Bearer uKuU3xVPT9VYYoO3QwOPgfwt9IgZJ3JM-dKKX7z7yKc" \
-H "Content-Type: application/json" \
-d '{"readerId":3,"tag":"CC220576","gateId":2,"direction":"ENTRY"}'
