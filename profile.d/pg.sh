export PG_HOST="127.0.0.1"
export PG_USER="martinnally"
export PG_PASSWORD=$(cat "$HERE/secrets/pg_password.txt")
export PG_DATABASE="permissions" 