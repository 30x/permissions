import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s:%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

TOKEN1 = env['APIGEE_TOKEN1']
USER1 = json.loads(b64_decode(TOKEN1.split('.')[1]))['user_id']

def main():
    
    print 'sending requests to %s' % BASE_URL

    migration_request = {
        'resource': 'https://api.e2e.apigee.net/v1/o/usergrid-e2e'
    }

    # POST re-migration-request ( success )
    permissions_re_migration_url = urljoin(BASE_URL, '/az-permissions-migration/re-migration-request')
    headers = {'Content-Type': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(permissions_re_migration_url, headers=headers, json=migration_request)
    if r.status_code == 200:
        print 'correctly re-migrated edge org'
    else:
        print 'failed to re-migrate edge org for resource %s %s %s' % (migration_request['resource'], r.status_code, r.text)
        return

    return


if __name__ == '__main__':
    main()