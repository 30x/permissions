import requests
import psycopg2
import base64
import json

try:
    conn = psycopg2.connect("dbname='permissions' user='martinnally' host='localhost' password='martinnally'")
except:
    print 'I am unable to connect to the database'

with conn:
    with conn.cursor() as cur:
        cur.execute('DROP TABLE IF EXISTS permissions')
        cur.execute('DROP TABLE IF EXISTS teams')
        cur.execute('DROP TABLE IF EXISTS events')
        cur.execute('DROP TABLE IF EXISTS caches')
        cur.execute('CREATE TABLE permissions (subject text primary key, etag serial, data jsonb)')
        cur.execute('CREATE TABLE teams (id text primary key, etag serial, data jsonb)')
        cur.execute('CREATE TABLE IF NOT EXISTS events (index bigserial, topic text, eventtime bigint, data jsonb)')
        cur.execute('CREATE TABLE IF NOT EXISTS caches (ipaddress text primary key, registrationtime bigint);')

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

with open('token.txt') as f:
    TOKEN1 = f.read()
    USER1 = json.loads(b64_decode(TOKEN1.split('.')[1]))['user_id']

with open('token2.txt') as f:
    TOKEN2 = f.read()
    USER2 = json.loads(b64_decode(TOKEN2.split('.')[1]))['user_id']

with open('token3.txt') as f:
    TOKEN3 = f.read()
    USER3 = json.loads(b64_decode(TOKEN3.split('.')[1]))['user_id']

def main():
    
    permissions = {
    'isA': 'Permissions',
    'governs': 
        {'_self': 'http://apigee.com/o/acme',
        'updaters': [USER1],
        'readers': [USER1],
        'deleters': [USER1],
        'creators': [USER1]
        },
    'readers': [USER1],
    'deleters': [USER1],
    'updaters': [USER1],     
    'creators': [USER1]     
    }
    permissions_url = 'http://localhost:8080/permissions' 
    
    # Create permissions for Acme org (succeed)

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(permissions_url, headers=headers, json=permissions)
    if r.status_code == 201:
        print 'correctly created permissions'
        org_permissions = r.headers['Location'] 
    else:
        print 'failed to create permissions %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve resources shared with USER1

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    url = 'http://localhost:8080/resources-shared-with?%s' % USER1 
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        resources = r.json()
        if resources == ['http://apigee.com/o/acme']:
            print 'correctly retrieved resources-shared-with for %s' % USER1
        else:
            print 'retrieved resources-shared-with for %s but result is wrong %s' % (USER1, resources)
    else:
        print 'failed to retrieve resources-shared-with for %s %s %s' % (USER1, r.status_code, r.text)
        return
    
    # Retrieve allowed-actions for Acme org for USER1

    url = 'http://localhost:8080' + '/allowed-actions?resource=%s&user=%s' % ('http://apigee.com/o/acme', USER1)
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        actions = r.json()
        if all([item in actions for item in ['create', 'read', 'update', 'delete']]):
            print 'correctly returned allowed actions of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned actions of http://apigee.com/o/acme for USER1 %s' % actions
    else:
        print 'failed to return allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Create Acme Org Admins team

    team = {
        'isA': 'Team',
        'name': 'Acme Org admins',
        'permissions': {'governs': {'inheritsPermissionsOf': ['http://apigee.com/o/acme']}},
        'members': [USER1] 
        }
    url = 'http://localhost:8080' + '/teams' 
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        print 'correctly created team'
        ORG_ADMINS = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)
        return
    
    # Create Acme Business Users team

    team = {
        'isA': 'Team',
        'name': 'Acme Business Users',
        'permissions': {'governs': {'inheritsPermissionsOf': ['http://apigee.com/o/acme']}},
        'members': [USER2] 
        }
    url = 'http://localhost:8080' + '/teams' 
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        print 'correctly created team'
        BUSINESS_USERS = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)

    team = {
        'isA': 'Team',
        'name': 'Acme Ordinary Users',
        'permissions': {'governs': {'inheritsPermissionsOf': ['http://apigee.com/o/acme']}},
        'members': [USER3] 
        }
    url = 'http://localhost:8080' + '/teams' 
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.post(url, headers=headers, json=team)
    if r.status_code == 201:
        print 'correctly created team'
        ORDINARY_USERS = r.headers['location']
    else:
        print 'failed to create team %s %s - cannot continue' % (r.status_code, r.text)

    # Retrieve permissions for Acme org

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(org_permissions, headers=headers, json=permissions)
    if r.status_code == 200:
        server_permission = r.json()
        if all(item in server_permission.items() for item in permissions.items()):
            if ('Etag' in r.headers):
                ACME_ORG_IF_MATCH = r.headers['Etag']
                print 'correctly retrieved permissions'
            else:
                print 'failed to provide etag in create response'
        else:
            print 'retrieved permissions but comparison failed'
    else:
        print 'failed to retrieve permissions %s %s' % (r.status_code, r.text)
        return

    # Patch Acme org permissions to use team

    permissions_patch = {
    'governs': 
        {'_self': 'http://apigee.com/o/acme',
        'updaters': [ORG_ADMINS],
        'readers': [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS],
        'deleters': [ORG_ADMINS],
        'creators': [ORG_ADMINS]
        },
    'readers': [ORG_ADMINS],
    'deleters': [ORG_ADMINS],
    'updaters': [ORG_ADMINS]
    }

    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 400:
        print 'correctly refused to patch permissions without If-Match header' 
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return
    
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1, 'If-Match': ACME_ORG_IF_MATCH}
    r = requests.patch(org_permissions, headers=headers, json=permissions_patch)
    if r.status_code == 200:
        print 'correctly patched permissions' 
    else:
        print 'failed to patch permissions %s %s' % (r.status_code, r.text)
        return
    
    # Retrieve Acme org permissions

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(org_permissions, headers=headers, json=permissions)
    if r.status_code == 200:
        server_permission = r.json()
        if all(item in server_permission.items() for item in permissions_patch.items()):
            print 'correctly retrieved permissions'
        else:
            print 'retrieved permissions but comparison failed %s' % r.text
    else:
        print 'failed to retrieve permissions %s %s' % (r.status_code, r.text)
    
    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN2}
    r = requests.get(org_permissions, headers=headers, json=permissions)
    if r.status_code == 403:
        server_permission = r.json()
        print 'correctly refused to retrieve permissions for USER2'
    else:
        print 'failed to refuse permissions %s %s' % (r.status_code, r.text)
    
    # Retrieve Acme org heirs

    url = 'http://localhost:8080' + '/permissions-heirs?%s' % 'http://apigee.com/o/acme'
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        heirs = r.json()
        if [perm['_self'] for perm in heirs] == [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS]:
            print 'correctly returned heirs of http://apigee.com/o/acme after update of permissions to use team' 
        else:
            print 'incorrect heirs of http://apigee.com/o/acme %s' % heirs
    else:
        print 'failed to return heirs of http://apigee.com/o/acme %s %s' % (r.status_code, r.text)
        return

    # Retrieve allowed actions

    url = 'http://localhost:8080' + '/allowed-actions?resource=%s&user=%s' % ('http://apigee.com/o/acme', USER1)
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        actions = r.json()
        if all([item in actions for item in ['create', 'read', 'update', 'delete']]):
            print 'correctly returned allowed actions of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned actions of http://apigee.com/o/acme for USER1 %s' % actions
    else:
        print 'failed to return allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)

    # Retrieve resources shared with USER1

    headers = {'Accept': 'application/json','Authorization': 'BEARER %s' % TOKEN1}
    url = 'http://localhost:8080/resources-shared-with?%s' % USER1 
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
    
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    sharingSets = ['/appkeys', '/applications', '/deployments', 'devConnectUser', '/devPortalButton',]    
    for item in sharingSets:
        permissions = {
            'isA': 'Permissions',
            'governs': 
                {'_self': 'http://apigee.com/o/acme%s' % item,
                'inheritsPermissionsOf': ['http://apigee.com/o/acme']
                }
            }
        r = requests.post(permissions_url, headers=headers, json=permissions)
        if r.status_code == 201:
            print 'correctly created permission' 
        else:
            print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)

    sharingSets = ['/apiproducts', '/apps', '/axCustomReports', '/companies', '/developers', '/reports']    
    for item in sharingSets:
        permissions = {
            'isA': 'Permissions',
            'governs': 
                {'_self': 'http://apigee.com/o/acme%s' % item,
                'inheritsPermissionsOf': ['http://apigee.com/o/acme'],
                'updaters': [BUSINESS_USERS],
                'creators': [BUSINESS_USERS],
                'deleters': [BUSINESS_USERS]
                }
            }
        r = requests.post(permissions_url, headers=headers, json=permissions)
        if r.status_code == 201:
            print 'correctly created permission' 
        else:
            print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)

    sharingSets = ['/keyvaluemaps']    
    for item in sharingSets:
        permissions = {
            'isA': 'Permissions',
            'governs': 
                {'_self': 'http://apigee.com/o/acme%s' % item,
                'inheritsPermissionsOf': ['http://apigee.com/o/acme'],
                'updaters': [BUSINESS_USERS, ORDINARY_USERS],
                'creators': [BUSINESS_USERS, ORDINARY_USERS],
                'deleters': [BUSINESS_USERS, ORDINARY_USERS]
                }
            }
        r = requests.post(permissions_url, headers=headers, json=permissions)
        if r.status_code == 201:
            print 'correctly created permission' 
        else:
            print 'incorrectly rejected permission creation %s %s' % (r.status_code, r.text)

    # Retrieve allowed actions

    url = 'http://localhost:8080/users-who-can-access?%s' % 'http://apigee.com/o/acme/keyvaluemaps'
    headers = {'Accept': 'application/json', 'Authorization': 'BEARER %s' % TOKEN1}
    r = requests.get(url, headers=headers, json=permissions)
    if r.status_code == 200:
        users = r.json()
        if all([item in users for item in [ORG_ADMINS, BUSINESS_USERS, ORDINARY_USERS]]):
            print 'correctly returned allowed actions of http://apigee.com/o/acme for USER1 after update of permissions to use team' 
        else:
            print 'incorrect returned actions of http://apigee.com/o/acme for USER1 %s' % actions
    else:
        print 'failed to return allowed actions of http://apigee.com/o/acme for USER1 %s %s' % (r.status_code, r.text)


if __name__ == '__main__':
    main()