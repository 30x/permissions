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
API_KEY = env.get('API_KEY')

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
USER3_CLAIMS = json.loads(b64_decode(TOKEN3.split('.')[1]))      
USER3 = '%s#%s' % (USER3_CLAIMS['iss'], USER3_CLAIMS['sub'])
USER3_E = USER3.replace('#', '%23')

if 'CLIENT_TOKEN' in env:
    CLIENT_TOKEN = env['CLIENT_TOKEN']
else:
    with open('client-token.txt') as f:
        CLIENT_TOKEN = f.read()
CLIENT_TOKEN_CLAIMS = json.loads(b64_decode(CLIENT_TOKEN.split('.')[1]))      
CLIENT_ID = '%s#%s' % (CLIENT_TOKEN_CLAIMS['iss'], CLIENT_TOKEN_CLAIMS['sub'])
CLIENT_ID_E = CLIENT_TOKEN.replace('#', '%23')

with open('client-token-scope-azread.txt') as f:
    CLIENT_TOKEN_SCOPE_AZREAD = f.read()

def get_headers(token):
    rslt = {'Accept': 'application/json'}
    if API_KEY:
        rslt['x-routing-api-key'] = API_KEY
    if token:
        rslt['Authorization'] = 'Bearer %s' % token
    return rslt

def get_headers_for_client(token):
    rslt = {'Accept': 'application/json'}
    if API_KEY:
        rslt['x-routing-api-key'] = API_KEY
    if token:
        rslt['X-Client-Authorization'] = 'Bearer %s' % token
    return rslt

def post_team_headers(token):
    rslt = get_headers(token)
    rslt['Content-Type'] = 'application/json'
    return rslt

def post_permissions_headers(token):
    rslt = get_headers(token)
    rslt['Content-Type'] = 'application/json'
    rslt['X-Client-Authorization'] = 'Bearer %s' % CLIENT_TOKEN
    return rslt

def patch_headers(token, if_match):
    rslt = get_headers(token)
    rslt['Content-Type'] = 'application/merge-patch+json'
    rslt['If-Match'] = if_match
    return rslt

def main():

    get_headers1 = get_headers(TOKEN1)
    r = requests.get(urljoin(BASE_URL, '/az-permissions?/') , headers=get_headers1)
    if r.status_code == 200:
        print 'correctly retrieved /az-permissions?/ etg: %s' % r.headers['Etag'] 
        slash_etag = r.headers['Etag'] 
    else:
        print 'failed to retrieve /az-permissions?/ %s %s' % (r.status_code, r.text)
        return

    permissions_patch = {"permissions":  {"read": [CLIENT_ID], "create": [CLIENT_ID]}}
    patch_headers1 = patch_headers(TOKEN1, slash_etag)
    r = requests.patch(urljoin(BASE_URL, '/az-permissions?/'), headers=patch_headers1, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched /az-permissions?/ ' 
    else:
        print 'failed to patch /az-permissions?/ %s %s' % (r.status_code, r.text)
        return
        
    org_url = 'http://apigee.com/o/acme'
    permissions = {
        '_subject': org_url,
        '_self': 
            {'update': [USER1],
            'read': [USER1],
            'delete': [USER1],
            'admin': [USER1],
            'govern': [USER1]
            },
        '_permissionsHeirs': {
            'add': [USER1],
            'read': [USER1],
            'remove': [USER1]
            },
        'test-data': True
        }
    print 'sending requests to %s' % BASE_URL 

    permissions_url = urljoin(BASE_URL, '/az-permissions') 
    
    # Create permissions for Acme org with USER1 (succeed)

    post_permissions_headers1 = post_permissions_headers(TOKEN1)
    r = requests.post(permissions_url, headers=post_permissions_headers1, json=permissions)
    if r.status_code == 201:
        org_permissions = urljoin(BASE_URL, r.headers['Location'])
        org_permissions_etag = r.headers['Etag'] 
        print 'correctly created permissions url: %s etag: %s' % (org_permissions, org_permissions_etag)
    else:
        print 'failed to create permissions url: %s status_code: %s text: %s' % (permissions_url, r.status_code, r.text)
        return
    
    # Get allowed-actions for USER1 on org

    get_headers1 = get_headers(TOKEN1)
    url = urljoin(BASE_URL, '/az-allowed-actions?resource=%s&user=%s' % (org_url ,USER1_E)) 
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        actions = r.json()
        if set(actions) == {'read', 'admin', 'delete', 'govern', 'update'}:
            print 'correctly retrieved allowed-actions for %s on %s' % (USER1, org_url)
        else:
            print 'retrieved allowed-actions for %s on %s but result is wrong %s' % (USER1, org_url, actions)
            return
    else:
        print 'failed to retrieve allowed-actions for %s on %s status_code %s text %s' % (USER1, org_url, r.status_code, r.text)
        return
    
    # Get allowed-actions for USER2 on org

    get_headers2 = get_headers(TOKEN2)
    url = urljoin(BASE_URL, '/az-allowed-actions?resource=%s&user=%s' % (org_url ,USER2_E)) 
    r = requests.get(url, headers=get_headers2)
    if r.status_code == 200:
        actions = r.json()
        if actions == []:
            print 'correctly retrieved allowed-actions for %s on %s' % (USER2, org_url)
        else:
            print 'retrieved allowed-actions for %s on %s but result is wrong %s' % (USER2, org_url, actions)
            return
    else:
        print 'failed to retrieve allowed-actions for %s on %s status_code %s text %s' % (USER1, org_url, r.status_code, r.text)
        return
    
    # Have USER2 ask for allowed-actions for USER1 on org

    url = urljoin(BASE_URL, '/az-allowed-actions?resource=%s&user=%s' % (org_url ,USER1_E)) 
    r = requests.get(url, headers=get_headers2)
    if r.status_code == 403:
        print 'correctly refused to let %s retrieve allowed-actions for %s on %s' % (USER2, USER1, org_url)
    else:
        print 'failed to retrieve %s for user %s status_code %s text %s' % (url, USER1, r.status_code, r.text)
        return
    
    # Ask if USER1 can delete acme org
    
    url = urljoin(BASE_URL, '/az-is-allowed?resource=%s&user=%s&action=delete' % (org_url ,USER1_E)) 
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        if (r.json() == True):
            print 'correctly retrieved is-allowed for %s to delete %s' % (USER1, org_url)
        else:
            print 'incorrect response to is-allowed for %s to delete %s %s' % (USER1, org_url, r.json())
            return
    else:
        print 'failed to retrieve %s for user %s status_code %s text %s' % (url, USER1, r.status_code, r.text)
        return
    
    # Ask if USER2 can delete acme org
    
    url = urljoin(BASE_URL, '/az-is-allowed?resource=%s&user=%s&action=delete' % (org_url ,USER2_E)) 
    r = requests.get(url, headers=get_headers2)
    if r.status_code == 200:
        if (r.json() == None):
            print 'correctly retrieved is-allowed for %s to delete %s' % (USER2, org_url)
        else:
            print 'incorrect response to is-allowed for %s to delete %s %s' % (USER2, org_url, r.json())
            return
    else:
        print 'failed to retrieve %s for user %s status_code %s text %s' % (url, USER1, r.status_code, r.text)
        return
    
    # get resources shared with USER1

    url = urljoin(BASE_URL, '/az-resources-shared-with?%s' % USER1_E) 
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        resources = r.json()
        if resources == ['http://apigee.com/o/acme']:
            print 'correctly retrieved resources-shared-with for %s at %s' % (USER1, r.headers['Content-Location'])
        else:
            print 'retrieved resources-shared-with for %s but result is wrong %s' % (USER1, resources)
            return
    else:
        print 'failed to retrieve %s for user %s status_code %s text %s' % (url, USER1, r.status_code, r.text)
        return
    
    # Create Acme Org Admins team

    team = {
        'isA': 'Team',
        'name': 'Acme Org admins',
        '_permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme'],'test-data': True},
        'members': [USER1],
        'test-data': True
        }
    url = urljoin(BASE_URL, '/az-teams') 
    post_team_headers1 = post_team_headers(TOKEN1)
    r = requests.post(url, headers=post_team_headers1, json=team)
    if r.status_code == 201:
        ORG_ADMINS = r.headers['location']
        print 'correctly created ORG_ADMINS team %s etag: %s' % (ORG_ADMINS, r.headers['Etag'])
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)
        return
    

    # Get Acme Org Admins accessible resources

    tmp_url = urljoin(BASE_URL, '/az-resources-accessible-by-team-members?%s' % (ORG_ADMINS)) 
    r = requests.get(tmp_url, headers=get_headers(TOKEN1))
    if r.status_code == 200:
        print 'correctly retrieved /az-resources-accessible-by-team-members ORG_ADMINS team %s' % (ORG_ADMINS)
    else:
        print 'failed to retrieve /az-resources-accessible-by-team-members team %s %s - cannot continue' % (r.status_code, r.text)
        return

    # Create Acme Business Users team

    team = {
        'isA': 'Team',
        'name': 'Acme Business Users',
        '_permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme'],'test-data': True},
        'members': [USER2],
        'test-data': True
        }

    r = requests.post(url, headers=post_team_headers1, json=team)
    if r.status_code == 201:
        print 'correctly created team %s etag: %s' % (r.headers['location'], r.headers['Etag'])
        BUSINESS_USERS = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)

    # Create Acme Ordinary Users team

    team = {
        'isA': 'Team',
        'name': 'Acme Ordinary Users',
        '_permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme'],'test-data': True},
        'members': [USER3],
        'test-data': True 
        }
    r = requests.post(url, headers=post_team_headers1, json=team)
    if r.status_code == 201:
        print 'correctly created team %s etag: %s' % (r.headers['location'], r.headers['Etag'])
        ORDINARY_USERS = r.headers['location']
        ORDINARY_USERS_ETAG = r.headers['etag']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)

    # Retrieve permissions for Acme org

    r = requests.get(org_permissions, headers=get_headers1)
    if r.status_code == 200:
        server_permissions = r.json()
        for key, value in permissions.iteritems():
            if key not in ['test-data', '_subject']:
                for n_key, n_value in value.iteritems():
                    if server_permissions[key][n_key] != n_value:
                        print 'retrieved permissions but comparison failed: key: %s n_key: %s n_value: %s server_permissions: %s' % (key, n_key, n_value, json.dumps(server_permissions, indent=2))
                        return
        if ('Etag' in r.headers):
            ACME_ORG_IF_MATCH = r.headers['Etag']
            print 'correctly retrieved permissions %s with etag %s' % (org_permissions, ACME_ORG_IF_MATCH)
        else:
            print 'failed to provide etag in create response'
    else:
        print 'failed to retrieve permissions %s %s' % (r.status_code, r.text)
        return
    
    permissions_patch = {
        '_subject': 'http://apigee.com/o/acme',
        '_self': { 
            'update': [ORG_ADMINS],
            'read': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
            'delete': [ORG_ADMINS],
            'admin': [ORG_ADMINS],
            'govern': [ORG_ADMINS]            
            },
        '_permissionsHeirs': {
            'add': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
            'read': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
            'remove': [ORG_ADMINS]
            },
        'test-data': True
        }

    # patch http://acme.org/o/acme permissions (fail)

    r = requests.patch(org_permissions, headers=get_headers1, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions without If-Match header' 
    else:
        print 'failed to refuse to patch permissions without If-Match header %s %s' % (r.status_code, r.text)
        return
    
    # patch http://acme.org/o/acme permissions to use teams instead of USER1 (succeed)

    patch_headers1 = patch_headers(TOKEN1, ACME_ORG_IF_MATCH)
    r = requests.patch(org_permissions, headers=patch_headers1, json=permissions_patch)
    if r.status_code == 200:
        ACME_ORG_IF_MATCH = r.headers['Etag']
        print 'correctly patched permissions %s etag: %s' %(org_permissions, ACME_ORG_IF_MATCH)
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve Acme org permissions

    r = requests.get(org_permissions, headers=get_headers1)
    if r.status_code == 200:
        server_permissions = r.json()
        for key, value in permissions_patch.iteritems():
            if key not in ['test-data', '_subject']:
                for n_key, n_value in value.iteritems():
                    if server_permissions[key][n_key] != n_value:
                        print 'retrieved permissions but comparison failed. keys: %s %s server value: %s\n patch value: %s\n server_permissions: %s\n patch: %s' % \
                            (key, n_key, server_permissions[key][n_key], n_value, json.dumps(server_permissions, indent=2),  json.dumps(permissions_patch, indent=2))
                        return
        print 'correctly retrieved permissions'
    else:
        print 'failed to retrieve permissions %s %s' % (r.status_code, r.text)
        return
    
    r = requests.get(org_permissions, headers=get_headers2)
    if r.status_code == 403:
        server_permissions = r.json()
        print 'correctly refused to retrieve permissions for USER2'
    else:
        print 'failed to refuse permissions %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve Acme org heirs

    url = urljoin(BASE_URL, '/az-permissions-heirs?%s' % 'http://apigee.com/o/acme')
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        heirs = r.json()
        if set(heirs['contents']) == {ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS}:
            print 'correctly returned heirs of http://apigee.com/o/acme after update of permissions to use team' 
        else:
            print 'incorrect heirs of http://apigee.com/o/acme %s expected: %s' % (heirs, {ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS})
    else:
        print 'failed to return heirs of http://apigee.com/o/acme %s %s' % (r.status_code, r.text)
        return

    # Retrieve allowed actions

    url = urljoin(BASE_URL, '/az-allowed-actions?resource=%s&user=%s' % ('http://apigee.com/o/acme', USER1_E))
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        actions = r.json()
        if all([item in actions for item in ['read', 'update', 'delete']]):
            print 'correctly returned allowed actions of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned actions of http://apigee.com/o/acme for USER1 %s' % actions
    else:
        print 'failed to return allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Retrieve resources shared with USER1

    url = urljoin(BASE_URL, '/az-resources-shared-with?%s' % USER1_E) 
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        resources = r.json()
        if resources == ['http://apigee.com/o/acme']:
            print 'correctly retrieved resources-shared-with for %s after update of permissions to use team' % USER1
        else:
            print 'retrieved resources-shared-with for %s but result is wrong %s' % (USER1, resources)
            return
    else:
        print 'failed to retrieve resources-shared-with for %s %s %s' % (USER1, r.status_code, r.text)
        return
    
    sharingSets = ['/appkeys', '/applications', '/deployments', 'devConnectUser', '/devPortalButton',]    
    for item in sharingSets:
        permissions = {
            '_subject': 'http://apigee.com/o/acme%s' % item,
            '_inheritsPermissionsOf': ['http://apigee.com/o/acme'],
            'test-data': True
            }
        r = requests.post(permissions_url, headers=post_permissions_headers1, json=permissions)
        if r.status_code == 201:
            print 'correctly created permissions %s' % r.headers['Location'] 
        else:
            print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)

    sharingSets = ['/apiproducts', '/apps', '/axCustomReports', '/companies', '/developers', '/reports']    
    for item in sharingSets:
        permissions = {
            '_subject': 'http://apigee.com/o/acme%s' % item,
            '_inheritsPermissionsOf': ['http://apigee.com/o/acme'],
            '_self': 
                {'add': [BUSINESS_USERS],
                'remove': [BUSINESS_USERS]
                },
            'test-data': True
            }
        r = requests.post(permissions_url, headers=post_permissions_headers1, json=permissions)
        if r.status_code == 201:
            print 'correctly created permissions %s' % r.headers['Location']
        else:
            print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)

    permissions = {
        '_subject': 'http://apigee.com/o/acme/keyvaluemaps',
        '_inheritsPermissionsOf': ['http://apigee.com/o/acme'],    
        '_self': 
            {'add': [BUSINESS_USERS, ORDINARY_USERS],
            'remove': [BUSINESS_USERS, ORDINARY_USERS]
            },
        'test-data': True
        }

    r = requests.post(permissions_url, headers=post_permissions_headers1, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions %s' % r.headers['Location'] 
        etag = r.headers['Etag']
        keyvaluemaps_url = urljoin(BASE_URL, r.headers['Location'])
    else:
        print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)
        return

    # Retrieve allowed actions

    url = urljoin(BASE_URL, '/az-users-who-can-access?%s' % 'http://apigee.com/o/acme/keyvaluemaps')
    r = requests.get(url, headers=get_headers1)
    if r.status_code == 200:
        users = r.json()
        if all([item in users for item in [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS]]):
            print 'correctly returned users-who-can-access of http://apigee.com/o/acme/keyvaluemaps for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned users-who-can-access of http://apigee.com/o/acme/keyvaluemaps for USER1 %s' % actions
            return
    else:
        print 'failed to return users-who-can-access of http://apigee.com/o/acme/keyvaluemaps for USER1 %s %s' % (r.status_code, r.text)

    permissions_patch = {'_inheritsPermissionsOf': ['http://apigee.com/o/acme/developers']}

    patch_headers1 = patch_headers(TOKEN1, etag)
    r = requests.patch(keyvaluemaps_url, headers=patch_headers1, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched permissions of %s' % keyvaluemaps_url
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return

    permissions_patch = {'_inheritsPermissionsOf': ['http://apigee.com/o/acme']}

    # patch http://acme.org/o/acme permissions (fail)

    patch_headers1['If-Match'] = ACME_ORG_IF_MATCH
    r = requests.patch(org_permissions, headers=patch_headers1, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions that inherit from self %s' % r.text 
    else:
        print 'failed to refuse to patch permissions that inherit from self %s %s' % (r.status_code, r.text)
        return
    
    permissions_patch = {'_inheritsPermissionsOf': ['http://apigee.com/o/acme/keyvaluemaps']}

    # patch http://acme.org/o/acme permissions (fail)

    r = requests.patch(org_permissions, headers=patch_headers1, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions with inheritance cycle %s' % r.text 
    else:
        print 'failed to refuse to patch permissions with inheritance cycle %s %s' % (r.status_code, r.text)
        return

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme

    url = urljoin(BASE_URL, '/az-is-allowed?resource=%s&user=%s&action=%s' % ('http://apigee.com/o/acme', USER1_E, 'read'))
    start = timer()
    r = requests.get(url, headers=get_headers1)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed of http://apigee.com/o/acme for USER1 after update of permissions to use team. Elapsed time = %sms' % ((end-start) * 1000) 
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme for USER1 %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Retrieve is-allowed for CLIENT_TOKEN_SCOPE_AZREAD on http://apigee.com/o/acme FOR USER1

    url = urljoin(BASE_URL, '/az-is-allowed?resource=%s&user=%s&action=%s' % ('http://apigee.com/o/acme', USER1_E, 'read'))
    start = timer()
    r = requests.get(url, headers=get_headers_for_client(CLIENT_TOKEN_SCOPE_AZREAD))
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed of http://apigee.com/o/acme for USER1 using client token with az.read scope. Elapsed time = %sms' % ((end-start) * 1000)
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme for USER1 using client token with az.read scope %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme for USER1 using client token with az.read scope %s %s' % (r.status_code, r.text)

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme/keyvaluemaps

    url = urljoin(BASE_URL, '/az-is-allowed?resource=%s&user=%s&action=%s' % ('http://apigee.com/o/acme/keyvaluemaps', USER1_E, 'read'))
    start = timer()
    r = requests.get(url, headers=get_headers1)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed of http://apigee.com/o/acme/keyvaluemaps for USER1 after update of permissions to use team. Elapsed time = %sms' % ((end-start) * 1000) 
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme/keyvaluemaps for USER1 %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme/keyvaluemaps for USER1 %s %s' % (r.status_code, r.text)

    # Patch permissions for http://apigee.com/o/acme to add keyvaluemaps property

    patch = {'keyvaluemaps': {'read': [USER2], 'update': [USER1]}}
    patch_headers1['If-Match'] = ACME_ORG_IF_MATCH
    r = requests.patch(org_permissions, headers=patch_headers1, json=patch)
    if r.status_code == 200:
        org_permissions_etag = r.headers['Etag'] 
        print 'correctly patched permissions of %s' % keyvaluemaps_url
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-is-allowed?resource=http://apigee.com/o/acme&user=%s&action=read&property=keyvaluemaps' % (USER2_E))
    start = timer()
    r = requests.get(url, headers=get_headers2)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed (%s) of http://apigee.com/o/acme property: keyvaluemaps for USER2 after update of permissions to use property. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme property: keyvaluemaps for USER2 %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme property: keyvaluemaps for USER2 %s %s' % (r.status_code, r.text)

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-is-allowed?resource=http://apigee.com/o/acme&user=%s&action=read&property=keyvaluemaps' % (USER2_E))
    start = timer()
    r = requests.get(url, headers=get_headers2)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed (%s) of http://apigee.com/o/acme property: keyvaluemaps for USER2 after update of permissions to use property. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme property: keyvaluemaps for USER2 %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme property: keyvaluemaps for USER2 %s %s' % (r.status_code, r.text)

    # Retrieve is-allowed for USER3 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-is-allowed?resource=http://apigee.com/o/acme&user=%s&action=read&property=keyvaluemaps' % (USER3_E))
    get_headers3 = get_headers(TOKEN3)
    start = timer()
    r = requests.get(url, headers=get_headers3)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if not answer:
            print 'correctly returned is-allowed (%s) of http://apigee.com/o/acme property: keyvaluemaps for USER3 after update of permissions to use property. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme property: keyvaluemaps for USER3 %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme property: keyvaluemaps for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    # patch Ordinary_users team to add role permissions for user 3 to read http://apigee.com/o/acme/keyvaluemaps

    patch = {'roles': {'http://apigee.com/o/acme': {'/keyvaluemaps': ['read']}}}
    patch_headers1['If-Match'] = ORDINARY_USERS_ETAG
    r = requests.patch(urljoin(BASE_URL, ORDINARY_USERS), headers=patch_headers1, json=patch)
    if r.status_code == 200:
        ORDINARY_USERS_ETAG = r.headers['Etag'] 
        print 'correctly patched Ordinary Users team to add role'
    else:
        print 'failed to patch Ordinary Users team %s %s' % (r.status_code, r.text)
        return

    # Retrieve is-allowed for USER3 on http://apigee.com/o/acme/keyvaluemaps

    url = urljoin(BASE_URL, '/az-is-allowed?resource=http://apigee.com/o/acme/keyvaluemaps&user=%s&action=read' % (USER3_E))
    start = timer()
    r = requests.get(url, headers=get_headers3)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed (%s) of http://apigee.com/o/acme/keyvaluemaps for USER3 after update of role. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme/keyvaluemaps for USER3 %s' % answer
            return
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme/keyvaluemaps for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    # Retrieve allowed-actions for USER3 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-allowed-actions?resource=http://apigee.com/o/acme/keyvaluemaps&user=%s&action=read' % (USER3_E))
    start = timer()
    r = requests.get(url, headers=get_headers3)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if 'read' in answer:
            print 'correctly returned allowed-actions (%s) of http://apigee.com/o/acme/keyvaluemaps for USER3 after update of role. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned allowed-action of http://apigee.com/o/acme/keyvaluemaps for USER3 %s' % answer
            return
    else:
        print 'failed to return allowed-actions of http://apigee.com/o/acme/keyvaluemaps for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    # patch Ordinary_users team to add role permissions for user 3 to read http://apigee.com/o/acme/keyvaluemaps

    patch = {'roles': {'http://apigee.com/o/acme': {'/environments/*': ['read']}}}
    patch_headers1['If-Match'] = ORDINARY_USERS_ETAG
    r = requests.patch(urljoin(BASE_URL, ORDINARY_USERS), headers=patch_headers1, json=patch)
    if r.status_code == 200:
        ORDINARY_USERS_ETAG = r.headers['Etag'] 
        print 'correctly patched Ordinary Users team %s' % ORDINARY_USERS
    else:
        print 'failed to patch Ordinary Users team %s %s' % (r.status_code, r.text)
        return

    # Retrieve is-allowed for USER3 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-is-allowed?resource=http://apigee.com/o/acme/environments/test&user=%s&action=read' % (USER3_E))
    start = timer()
    r = requests.get(url, headers=get_headers3)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed (%s) of http://apigee.com/o/acme/environments/test for USER3 after update of role. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme/environments/test for USER3 %s' % answer
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme/environments/test for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    # Retrieve are-any-allowed for USER3 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-are-any-allowed?resource=http://apigee.com/o/acme/environments/test&resource=http://apigee.com/o/acme&user=%s&action=read' % (USER3_E))
    start = timer()
    r = requests.get(url, headers=get_headers3)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned are-any-allowed (%s) of http://apigee.com/o/acme/environments/test & http://apigee.com/o/acme for USER3 after update of role. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned are-any-allowed of http://apigee.com/o/acme/environments/test & http://apigee.com/o/acme for USER3 %s' % answer
    else:
        print 'failed to return are-any-allowed actions of http://apigee.com/o/acme/environments/test & http://apigee.com/o/acme for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    # POST are-any-allowed for USER3 on http://apigee.com/o/acme for property keyvaluemaps

    body = {
        'resource': ['http://apigee.com/o/acme/environments/test', 'http://apigee.com/o/acme'],
        'user': USER3,
        'action': 'read' 
    }
    url = urljoin(BASE_URL, '/az-are-any-allowed')
    post_team_headers3 = post_team_headers(TOKEN3)
    start = timer()
    r = requests.post(url, headers=post_team_headers3, json=body)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if answer == True:
            print 'correctly POSTed are-any-allowed (%s) of http://apigee.com/o/acme/environments/test & http://apigee.com/o/acme for USER3 after update of role. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned from POST to are-any-allowed of http://apigee.com/o/acme/environments/test & http://apigee.com/o/acme for USER3 %s' % answer
    else:
        print 'failed to return POST to are-any-allowed actions of http://apigee.com/o/acme/environments/test & http://apigee.com/o/acme for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    # Retrieve allowed-actions for USER3 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/az-allowed-actions?resource=http://apigee.com/o/acme/environments/test&user=%s&action=read&base=http://apigee.com/o/acme&path=/environments/test' % (USER3_E))
    start = timer()
    r = requests.get(url, headers=get_headers3)
    end = timer()
    if r.status_code == 200:
        answer = r.json()
        if 'read' in answer:
            print 'correctly returned allowed-actions (%s) of http://apigee.com/o/acme/environments/test for USER3 after update of role. Elapsed time = %sms' % (answer, ((end-start) * 1000))
        else:
            print 'incorrect returned allowed-actions of http://apigee.com/o/acme/environments/test for USER3 %s' % answer
    else:
        print 'failed to return allowed-actions of http://apigee.com/o/acme/environments/test for USER3 status_code: %s text: %s' % (r.status_code, r.text)

    print 'finished test suite'
if __name__ == '__main__':
    main()