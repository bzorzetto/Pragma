export PRAGMA_URL='https://localhost:3443/api/reader/access'
export PRAGMA_READER_ID='1'
export PRAGMA_GATE_ID='2'
export PRAGMA_DIRECTION='ENTRY'
export PRAGMA_CA='tls/localhost.pem'
read -rsp 'gk-7yY2jhOECeQH4uEAYw1HuIpLdqqnyB3tYzUbOtrU' PRAGMA_TOKEN; echo
export PRAGMA_TOKEN
sudo -E python3 ~/Pragma/test/scl010.py
