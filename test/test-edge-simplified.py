import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

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
    
    permissions = {
        '_subject': 'http://apigee.com/o/acme',
        '_permissions': 
            {'read': [USER1],
            'update': [USER1]
            },     
        '_self': 
            {'update': [USER1],
            'read': [USER1],
            'delete': [USER1]
            },
        '_permissionsHeirs': {
            'add': [USER1],
            'read': [USER1],
            'remove': [USER1]
            },
        'test-data': True
        }
    print 'sending requests to %s' % BASE_URL 

    permissions_url = urljoin(BASE_URL, '/permissions') 
    
    # Create permissions for Acme org with USER1 (succeed)

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(permissions_url, headers=headers, json=permissions)
    if r.status_code == 201:
        org_permissions = urljoin(BASE_URL, r.headers['Location'])
        org_permissions_etag = r.headers['Etag'] 
        print 'correctly created permissions url: %s etag: %s' % (org_permissions, org_permissions_etag)
    else:
        print 'failed to create permissions url: %s status_code: %s text: %s' % (permissions_url, r.status_code, r.text)
        return
    
    # Retrieve resources shared with USER1

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    url = urljoin(BASE_URL, '/resources-shared-with?%s' % USER1_E) 
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        resources = r.json()
        if resources == ['http://apigee.com/o/acme']:
            print 'correctly retrieved resources-shared-with for %s at %s' % (USER1, r.headers['Content-Location'])
        else:
            print 'retrieved resources-shared-with for %s but result is wrong %s' % (USER1, resources)
    else:
        print 'failed to retrieve %s for user %s status_code %s text %s' % (url, USER1, r.status_code, r.text)
        return
    
    # Retrieve allowed-actions for Acme org for USER1

    url = urljoin(BASE_URL, '/allowed-actions?resource=%s&user=%s' % ('http://apigee.com/o/acme', USER1_E))
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        actions = r.json()
        if all([item in actions for item in ['read', 'update', 'delete']]):
            print 'correctly returned allowed actions of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned actions of http://apigee.com/o/acme for USER1 %s' % actions
    else:
        print 'failed to return allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Create Acme Org Admins team

    team = {
        'isA': 'Team',
        'name': 'Acme Org admins',
        'permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme'],'test-data': True},
        'members': [USER1],
        'test-data': True
        }
    url = urljoin(BASE_URL, '/teams') 
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        ORG_ADMINS = r.headers['location']
        print 'correctly created ORG_ADMINS team %s etag: %s' % (ORG_ADMINS, r.headers['Etag'])
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)
        return
    
    # Create Acme Business Users team

    team = {
        'isA': 'Team',
        'name': 'Acme Business Users',
        'permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme'],'test-data': True},
        'members': [USER2],
        'test-data': True
        }
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        print 'correctly created team %s etag: %s' % (r.headers['location'], r.headers['Etag'])
        BUSINESS_USERS = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)

    # Create Acme Ordinary Users team

    team = {
        'isA': 'Team',
        'name': 'Acme Ordinary Users',
        'permissions': {'_inheritsPermissionsOf': ['http://apigee.com/o/acme'],'test-data': True},
        'members': [USER3],
        'test-data': True 
        }
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        print 'correctly created team %s etag: %s' % (r.headers['location'], r.headers['Etag'])
        ORDINARY_USERS = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)

    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(org_permissions, headers=headers)
    if r.status_code == 200:
        server_permissions = r.json()
        for key, value in permissions.iteritems():
            if key not in ['test-data', '_subject']:
                for n_key, n_value in value.iteritems():
                    if server_permissions[key][n_key] != n_value:
                        print 'retrieved permissions but comparison failed: %s' % json.dumps(server_permissions, indent=2)
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
            '_permissions': {
            'read': [ORG_ADMINS],
            'delete': [ORG_ADMINS],
            'update': [ORG_ADMINS]
            },
        '_self': { 
            'update': [ORG_ADMINS],
            'read': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
            'delete': [ORG_ADMINS]
            },
        '_permissionsHeirs': {
            'add': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
            'read': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
            'remove': [ORG_ADMINS]
            },
        'test-data': True
        }

    # patch http://acme.org/o/acme permissions (fail)

    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions without If-Match header' 
    else:
        print 'failed to refuse to patch permissions without If-Match header %s %s' % (r.status_code, r.text)
        return
    
    # patch http://acme.org/o/acme permissions to use teams instead of USER1 (succeed)

    headers = {'Content-Type': 'application/merge-patch+json', 'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1, 'If-Match': ACME_ORG_IF_MATCH}
    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 200:
        ACME_ORG_IF_MATCH = r.headers['Etag']
        print 'correctly patched permissions %s etag: %s' %(org_permissions, ACME_ORG_IF_MATCH)
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve Acme org permissions

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(org_permissions, headers=headers, json=permissions)
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
    
    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN2}
    r = requests.get(org_permissions, headers=headers, json=permissions)
    if r.status_code == 403:
        server_permissions = r.json()
        print 'correctly refused to retrieve permissions for USER2'
    else:
        print 'failed to refuse permissions %s %s' % (r.status_code, r.text)
    
    # Retrieve Acme org heirs

    url = urljoin(BASE_URL, '/permissions-heirs?%s' % 'http://apigee.com/o/acme')
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        heirs = r.json()
        if set(heirs) == {ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS}:
            print 'correctly returned heirs of http://apigee.com/o/acme after update of permissions to use team' 
        else:
            print 'incorrect heirs of http://apigee.com/o/acme %s expected: %s' % (heirs, {ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS})
    else:
        print 'failed to return heirs of http://apigee.com/o/acme %s %s' % (r.status_code, r.text)
        return

    # Retrieve allowed actions

    url = urljoin(BASE_URL, '/allowed-actions?resource=%s&user=%s' % ('http://apigee.com/o/acme', USER1_E))
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        actions = r.json()
        if all([item in actions for item in ['read', 'update', 'delete']]):
            print 'correctly returned allowed actions of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned actions of http://apigee.com/o/acme for USER1 %s' % actions
    else:
        print 'failed to return allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Retrieve resources shared with USER1

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    url = urljoin(BASE_URL, '/resources-shared-with?%s' % USER1_E) 
    r = requests.get(url, headers=headers, json=permissions)
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
    
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    sharingSets = ['/appkeys', '/applications', '/deployments', 'devConnectUser', '/devPortalButton',]    
    for item in sharingSets:
        permissions = {
            '_subject': 'http://apigee.com/o/acme%s' % item,
            '_inheritsPermissionsOf': ['http://apigee.com/o/acme'],
            'test-data': True
            }
        r = requests.post(permissions_url, headers=headers, json=permissions)
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
        r = requests.post(permissions_url, headers=headers, json=permissions)
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

    r = requests.post(permissions_url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions %s' % r.headers['Location'] 
        etag = r.headers['Etag']
        keyvaluemaps_url = urljoin(BASE_URL, r.headers['Location'])
    else:
        print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)

    # Retrieve allowed actions

    url = urljoin(BASE_URL, '/users-who-can-access?%s' % 'http://apigee.com/o/acme/keyvaluemaps')
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        users = r.json()
        if all([item in users for item in [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS]]):
            print 'correctly returned users-who-can-access of http://apigee.com/o/acme/keyvaluemaps for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned users-who-can-access of http://apigee.com/o/acme/keyvaluemaps for USER1 %s' % actions
    else:
        print 'failed to return users-who-can-access of http://apigee.com/o/acme/keyvaluemaps for USER1 %s %s' % (r.status_code, r.text)

    permissions_patch = {'_inheritsPermissionsOf': ['http://apigee.com/o/acme/developers']}

    patch_headers = {'If-Match': etag}
    patch_headers.update(headers)
    patch_headers['Content-Type'] = 'application/merge-patch+json'
    r = requests.patch(keyvaluemaps_url, headers=patch_headers, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched permissions of %s' % keyvaluemaps_url
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return

    permissions_patch = {'_inheritsPermissionsOf': ['http://apigee.com/o/acme']}

    # patch http://acme.org/o/acme permissions (fail)

    headers = {'Accept': 'application/json', 'Content-type': 'application/merge-patch+json', 'Authorization': 'Bearer %s' % TOKEN1, 'If-Match': ACME_ORG_IF_MATCH}
    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions that inherit from self %s' % r.text 
    else:
        print 'failed to refuse to patch permissions that inherit from self %s %s' % (r.status_code, r.text)
        return
    
    permissions_patch = {'_inheritsPermissionsOf': ['http://apigee.com/o/acme/keyvaluemaps']}

    # patch http://acme.org/o/acme permissions (fail)

    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions with inheritance cycle %s' % r.text 
    else:
        print 'failed to refuse to patch permissions with inheritance cycle %s %s' % (r.status_code, r.text)
        return

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme

    url = urljoin(BASE_URL, '/is-allowed?resource=%s&user=%s&action=%s' % ('http://apigee.com/o/acme', USER1_E, 'read'))
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme for USER1 %s' % answer
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme/keyvaluemaps

    url = urljoin(BASE_URL, '/is-allowed?resource=%s&user=%s&action=%s' % ('http://apigee.com/o/acme/keyvaluemaps', USER1_E, 'read'))
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed of http://apigee.com/o/acme/keyvaluemaps for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme/keyvaluemaps for USER1 %s' % answer
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme/keyvaluemaps for USER1 %s %s' % (r.status_code, r.text)

    # Patch permissions for http://apigee.com/o/acme/keyvaluemaps to add keyvaluemaps property

    patch = {'keyvaluemaps': {'read': [USER2], 'update': [USER1]}}
    patch_headers = {'If-Match': ACME_ORG_IF_MATCH}
    patch_headers.update(headers)
    patch_headers['Content-Type'] = 'application/merge-patch+json'
    r = requests.patch(org_permissions, headers=patch_headers, json=patch)
    if r.status_code == 200:
        org_permissions_etag = r.headers['Etag'] 
        print 'correctly patched permissions of %s' % keyvaluemaps_url
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return

    # Retrieve is-allowed for USER1 on http://apigee.com/o/acme for property keyvaluemaps

    url = urljoin(BASE_URL, '/is-allowed?resource=http://apigee.com/o/acme&user=%s&action=read&property=keyvaluemaps' % (USER2_E))
    headers = {'Accept': 'application/json', 'Authorization': 'Bearer %s' % TOKEN2}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        answer = r.json()
        if answer:
            print 'correctly returned is-allowed of http://apigee.com/o/acme property: keyvaluemaps for USER2 after update of permissions to use property' 
        else:
            print 'incorrect returned is-allowed of http://apigee.com/o/acme property: keyvaluemaps for USER2 %s' % answer
    else:
        print 'failed to return is-allowed actions of http://apigee.com/o/acme property: keyvaluemaps for USER2 %s %s' % (r.status_code, r.text)



if __name__ == '__main__':
    main()