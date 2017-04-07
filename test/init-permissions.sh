export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="3200"
export EXTERNAL_SCHEME="http"

export SYS_GOVS_IDS=`python get-user-ids.py`
echo $SYS_GOVS_IDS
python init-permissions.py
