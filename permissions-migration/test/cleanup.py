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

TOKEN1 = env['CLIENTID_TOKEN']

def main():
    
    print 'sending requests to %s' % BASE_URL

    # GET permissions
    permissions_url = urljoin(BASE_URL, '/az-permissions?%s' % 'https://api.e2e.apigee.net/v1/o/usergrid-e2e')
    headers = {'Content-Type': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(permissions_url, headers=headers)
    if r.status_code == 200:
        org_permissions = r.json()
        print 'correctly got permissions of edge org' 
    else:
        print 'failed to get permissions of edge org status: %s text: %s' % (r.status_code, r.text)
        return

    abs_org_admins = urljoin(BASE_URL, org_permissions['_self']['govern'][0])
    for team_url in org_permissions['_metadata']['sharedWith']:
        abs_team_url = urljoin(BASE_URL, team_url)
        r = requests.delete(abs_team_url, headers=headers)
        if r.status_code == 200:
            print 'correctly deleted team %s' % abs_team_url 
        else:
            print 'failed to delete team: %s status: %s text: %s' % (abs_team_url, r.status_code, r.text)
            return

    r = requests.delete(permissions_url, headers=headers)
    if r.status_code == 200:
        print 'correctly deleted permissions %s' % permissions_url 
    else:
        print 'failed to delete permissions: %s status: %s text: %s' % (permissions_url, r.status_code, r.text)
        return

    return

if __name__ == '__main__':
    main()