import requests
import base64
import json
from os import environ as env
from urlparse import urljoin
from timeit import default_timer as timer

PG_HOST = env['PG_HOST']
PG_USER = env['PG_USER']
PG_PASSWORD = env['PG_PASSWORD']
PG_DATABASE = env['PG_DATABASE']
EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s:%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'], env['EXTERNAL_SY_ROUTER_PORT']) if 'EXTERNAL_SY_ROUTER_PORT' in env else '%s://%s' % (EXTERNAL_SCHEME, env['EXTERNAL_SY_ROUTER_HOST'])

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

if 'APIGEE_TOKEN1' in env:
    TOKEN1 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN1 = f.read()
USER1_CLAIMS = json.loads(b64_decode(TOKEN1.split('.')[1]))      
USER1 = '%s#%s' % (USER1_CLAIMS['iss'], USER1_CLAIMS['sub'])
USER1_E = USER1.replace('#', '%23')

if 'APIGEE_TOKEN2' in env:
    TOKEN2 = env['APIGEE_TOKEN2']
else:
    with open('token2.txt') as f:
        TOKEN2 = f.read()
USER2_CLAIMS = json.loads(b64_decode(TOKEN2.split('.')[1]))      
USER2 = '%s#%s' % (USER2_CLAIMS['iss'], USER2_CLAIMS['sub'])
USER2_E = USER2.replace('#', '%23')

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
USER3_CLAIMS = json.loads(b64_decode(TOKEN3.split('.')[1]))      
USER3 = '%s#%s' % (USER3_CLAIMS['iss'], USER3_CLAIMS['sub'])
USER3_E = USER3.replace('#', '%23')

def main():
    
    # Get audit trail events for org

    org_url = 'http://apigee.com/o/acme'
    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    url = urljoin(BASE_URL, '/az-audit-events?scope=%s' % (org_url)) 
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        events = r.json()
        print 'correctly retrieved audit-events for %s on %s' % (USER1, org_url)
    else:
        print 'failed to retrieve audit-events for %s on %s status_code %s text %s' % (USER1, org_url, r.status_code, r.text)
        return
    
    # Get audit trail events for org

    developers_url = org_url + '/developers'
    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    url = urljoin(BASE_URL, '/az-audit-events?scope=%s' % (developers_url)) 
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        events = r.json()
        print 'correctly retrieved audit-events for %s on %s' % (USER1, developers_url)
        print json.dumps(events)
    else:
        print 'failed to retrieve audit-events for %s on %s status_code %s text %s' % (USER1, org_url, r.status_code, r.text)
        return
    
if __name__ == '__main__':
    main()