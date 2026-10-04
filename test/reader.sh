export PRAGMA_URL='https://localhost:3443/api/reader/access'
export PRAGMA_READER_ID='3'
export PRAGMA_GATE_ID='2'
export PRAGMA_DIRECTION='ENTRY'
export PRAGMA_CA='tls/localhost.pem'
read -rsp 'uKuU3xVPT9VYYoO3QwOPgfwt9IgZJ3JM-dKKX7z7yKc' PRAGMA_TOKEN; echo
export PRAGMA_TOKEN
sudo -E python3 ~/Pragma/scl010.py
